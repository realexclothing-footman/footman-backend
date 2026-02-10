const Request = require('../models/Request');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const RequestRejection = require('../models/RequestRejection');
const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const socketService = require('../socket/socket.service');

// ==================== FOOTMAN (PARTNER) CONTROLLERS ====================

exports.getAvailableRequests = async (req, res) => {
  try {
    const footman_id = req.user.id;
    const user = await User.findByPk(footman_id);
    if (user.user_type !== 'delivery') {
      return res.status(403).json({ success: false, message: 'Only Footmen can access this' });
    }
    if (!user.is_online) {
      return res.status(400).json({ success: false, message: 'You must be online to see requests' });
    }

    const requests = await Request.findAll({
      where: { request_status: 'searching', assigned_footman_id: null },
      include: [{ association: 'customer', attributes: ['id', 'full_name', 'phone'] }],
      order: [['created_at', 'ASC']]
    });

    const nearbyRequests = [];
    for (const request of requests) {
      if (!user.latitude || !user.longitude || !request.pickup_lat || !request.pickup_lng) continue;
      const distance = this._calculateDistance(user.latitude, user.longitude, request.pickup_lat, request.pickup_lng);
      if (distance > 1) continue;
      
      // Get customer ID from request object
      const customerId = request.customer_id || (request.customer ? request.customer.id : null);
      if (!customerId) continue;
      
      // Check BOTH: same request OR same customer rejection within 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentRejection = await RequestRejection.findOne({
        where: {
          footman_id: footman_id,
          created_at: { [Op.gt]: tenMinutesAgo },
          [Op.or]: [
            { request_id: request.id },
            { customer_id: customerId }
          ]
        }
      });
      
      if (recentRejection) continue;
      
      request.distance_km = distance;
      nearbyRequests.push(request);
    }

    const formattedRequests = nearbyRequests.map(request => {
      const distance = request.distance_km;
      const price = distance <= 0.5 ? 50 : 100;
      return {
        ...request.toJSON(),
        distance_km: distance.toFixed(2),
        actual_price: price,
        footman_earnings: price * 0.9,
        commission: price * 0.1
      };
    });

    res.json({ success: true, data: { requests: formattedRequests } });
  } catch (error) {
    console.error('Error in getAvailableRequests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch requests' });
  }
};

exports.acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const footman_id = req.user.id;
    const user = await User.findByPk(footman_id);
    const request = await Request.findByPk(id);

    if (!request || request.request_status !== 'searching') {
      return res.status(400).json({ success: false, message: 'Request no longer available' });
    }

    const distance = this._calculateDistance(user.latitude, user.longitude, request.pickup_lat, request.pickup_lng);
    const price = distance <= 0.5 ? 50 : 100;

    await request.update({
      assigned_footman_id: footman_id,
      request_status: 'accepted_by_partner',
      accepted_at: new Date(),
      footman_earnings: price * 0.9,
      commission: price * 0.1,
      base_price: price
    });

    socketService.notifyCustomer(request.customer_id, 'request_update', {
      requestId: request.id,
      status: 'accepted_by_partner',
      partnerId: user.id,
      partnerName: user.full_name,
      partnerPhone: user.phone,
      timestamp: Date.now()
    });

    res.json({ success: true, message: 'Accepted!', data: { request } });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Failed to accept' });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const footman_id = req.user.id;
    const request = await Request.findByPk(id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });

    if (request.request_status === 'searching') {
      await RequestRejection.createRejection(id, request.customer_id, footman_id, 'busy');
    } else if (request.request_status === 'accepted_by_partner' && request.assigned_footman_id === footman_id) {
      await RequestRejection.createRejection(id, request.customer_id, footman_id, 'forward');
      await request.update({ request_status: 'searching', assigned_footman_id: null, accepted_at: null });
      
      socketService.notifyCustomer(request.customer_id, 'request_update', {
        requestId: request.id,
        status: 'searching',
        partnerId: null,
        partnerName: null,
        partnerPhone: null,
        timestamp: Date.now()
      });
      
      console.log(`✅ Partner ${footman_id} forwarded request ${id}. Status changed to searching.`);
    }
    res.json({ success: true, message: 'Rejected' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(400).json({ success: false, message: 'Reject failed' });
  }
};

exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const footman_id = req.user.id;

    const request = await Request.findOne({ 
      where: { id, assigned_footman_id: footman_id },
      include: [
        {
          association: 'customer',
          attributes: ['id', 'full_name', 'phone']
        }
      ]
    });
    
    if (!request || request.payment_lock) {
      return res.status(400).json({ success: false, message: 'Request not found or payment locked' });
    }

    const updateData = { request_status: status };
    
    // ============ SYSTEM FIX FOR ALL PARTNERS ============
    if (status === 'completed') {
      updateData.completed_at = new Date();
      updateData.payment_flow_state = 'waiting_payment';
      updateData.payment_lock = true;
      
      // Get payment method (customer selected or default cash)
      const paymentMethod = request.customer_selected_payment || 'cash';
      const totalAmount = parseFloat(request.base_price || 0);
      const commission = parseFloat(request.commission || 0);
      const partnerShare = parseFloat(request.footman_earnings || 0);
      
      // ============ 1. CREATE TRANSACTION (FOR ALL PARTNERS) ============
      await Transaction.create({
        partner_id: footman_id,
        customer_id: request.customer_id,
        request_id: request.id,
        payment_method: paymentMethod,
        total_amount: totalAmount,
        commission: commission,
        partner_share: partnerShare,
        status: 'completed',
        notes: `Job #${request.request_number} completed. Payment: ${paymentMethod}`,
        created_at: new Date()
      });
      
      console.log(`✅ TRANSACTION CREATED: Partner ${footman_id}, Request ${request.id}, ${paymentMethod}, Amount: ${totalAmount}, Partner share: ${partnerShare}`);
      
      // ============ 2. UPDATE CASH COMMISSION FOR CASH PAYMENTS (ALL PARTNERS) ============
      if (paymentMethod === 'cash') {
        const partner = await User.findByPk(footman_id);
        if (partner) {
          const currentCommissionDue = parseFloat(partner.cash_commission_due || 0);
          const newCommissionDue = currentCommissionDue + commission;
          
          await partner.update({
            cash_commission_due: newCommissionDue,
            last_commission_alert: new Date()
          });
          
          console.log(`✅ CASH COMMISSION UPDATED: Partner ${footman_id}, ${currentCommissionDue} → ${newCommissionDue}`);
          
          // Auto-check commission deadline
          await partner.checkCommissionDeadline();
        }
      }
      
      // ============ 3. UPDATE PARTNER STATS (ALL PARTNERS) ============
      await User.increment('total_completed_jobs', { where: { id: footman_id } });
      
      // Update total earnings in user table
      const partner = await User.findByPk(footman_id);
      if (partner) {
        const currentEarnings = parseFloat(partner.total_earnings || 0);
        await partner.update({
          total_earnings: currentEarnings + partnerShare
        });
        console.log(`✅ EARNINGS UPDATED: Partner ${footman_id}, Earnings: ${currentEarnings} → ${currentEarnings + partnerShare}`);
      }
    }

    await request.update(updateData);

    socketService.notifyCustomer(request.customer_id, 'request_update', {
      requestId: request.id,
      status: status,
      partnerId: request.assigned_footman_id,
      payment_flow_state: request.payment_flow_state,
      timestamp: Date.now()
    });

    res.json({ success: true, data: { request } });
  } catch (error) {
    console.error('Update request status error:', error);
    res.status(400).json({ success: false, message: 'Update failed' });
  }
};

exports.confirmPaymentReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;
    const footman_id = req.user.id;

    const request = await Request.findOne({ 
      where: { id, assigned_footman_id: footman_id, payment_flow_state: 'payment_selected' } 
    });
    if (!request) return res.status(404).json({ success: false, message: 'Payment not ready' });

    await request.update({
      partner_confirmed_at: new Date(),
      payment_flow_state: 'payment_confirmed'
    });

    socketService.notifyCustomer(request.customer_id, 'request_update', {
      requestId: request.id,
      status: 'completed',
      payment_flow_state: 'payment_confirmed',
      timestamp: Date.now()
    });

    setTimeout(async () => {
      await request.update({ payment_flow_state: 'fully_completed', payment_lock: false });
      socketService.notifyCustomer(request.customer_id, 'request_update', {
        requestId: request.id,
        status: 'completed',
        payment_flow_state: 'fully_completed',
        timestamp: Date.now()
      });
    }, 2000);

    res.json({ success: true, message: 'Payment confirmed!' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Confirm failed' });
  }
};

exports.getMyActiveRequests = async (req, res) => {
  try {
    const requests = await Request.findAll({
      where: { assigned_footman_id: req.user.id, request_status: ['accepted_by_partner', 'ongoing'] },
      include: [{ association: 'customer', attributes: ['id', 'full_name', 'phone'] }]
    });
    res.json({ success: true, data: { requests } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Fetch failed' });
  }
};

exports._calculateDistance = function(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};
