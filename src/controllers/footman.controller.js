const Request = require('../models/Request');
const User = require('../models/User');
const RequestRejection = require('../models/RequestRejection');
const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

// ==================== FOOTMAN (PARTNER) CONTROLLERS ====================

/**
 * 1. GET AVAILABLE REQUESTS (within 1KM) - UPDATED with rejection tracking
 */
exports.getAvailableRequests = async (req, res) => {
  try {
    const footman_id = req.user.id;

    // Check if user is a Footman
    const user = await User.findByPk(footman_id);
    if (user.user_type !== 'delivery') {
      return res.status(403).json({
        success: false,
        message: 'Only Footmen can access this'
      });
    }

    if (!user.is_online) {
      return res.status(400).json({
        success: false,
        message: 'You must be online to see requests'
      });
    }

    // Get requests in 'searching' status
    const requests = await Request.findAll({
      where: {
        request_status: 'searching',
        assigned_footman_id: null
      },
      include: [
        {
          association: 'customer',
          attributes: ['id', 'full_name', 'phone']
        }
      ],
      order: [['created_at', 'ASC']]
    });

    // Filter by distance (within 1KM of Footman) AND not recently rejected
    const nearbyRequests = [];
    
    for (const request of requests) {
      if (!user.latitude || !user.longitude || !request.pickup_lat || !request.pickup_lng) {
        continue;
      }
      
      // Calculate distance
      const distance = this._calculateDistance(
        user.latitude, user.longitude,
        request.pickup_lat, request.pickup_lng
      );
      
      // Check if within 1KM radius
      if (distance > 1) {
        continue;
      }
      
      // NEW: Check if this footman recently rejected this request (last 10 minutes)
      const recentRejection = await RequestRejection.findOne({
        where: {
          request_id: request.id,
          footman_id: footman_id,
          created_at: {
            [Op.gt]: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes
          }
        }
      });
      
      // If recently rejected, skip this request
      if (recentRejection) {
        console.log(`Footman ${footman_id} recently rejected request ${request.id}, skipping...`);
        continue;
      }
      
      request.distance_km = distance;
      nearbyRequests.push(request);
    }

    // Sort by nearest first
    nearbyRequests.sort((a, b) => a.distance_km - b.distance_km);

    // Format response with CORRECT PRICING LOGIC
    const formattedRequests = nearbyRequests.map(request => {
      const reqData = request.toJSON();
      
      // CORRECT PRICING: 0-0.5KM = ৳50, 0.5-1KM = ৳100
      const distance = request.distance_km;
      const isWithin500Meters = distance <= 0.5;
      const price = isWithin500Meters ? 50 : 100;
      const priceDisplay = isWithin500Meters ? '৳50' : '৳100';
      const priceTier = isWithin500Meters ? '0.5KM (৳50)' : '1KM (৳100)';
      
      // Calculate footman earnings (90% of price, 10% commission)
      const commissionRate = 0.10; // 10% commission
      const footmanEarnings = price * (1 - commissionRate);
      
      return {
        ...reqData,
        distance_km: distance.toFixed(2),
        price_tier: priceTier,
        display_price: priceDisplay,
        actual_price: price,
        footman_earnings: footmanEarnings,
        commission: price * commissionRate
      };
    });

    res.json({
      success: true,
      data: {
        footman_location: {
          latitude: user.latitude,
          longitude: user.longitude
        },
        requests: formattedRequests,
        count: formattedRequests.length,
        radius_km: 1,
        pricing_info: {
          '0_0.5_km': '৳50 (Footman earns: ৳45 after 10% commission)',
          '0.5_1_km': '৳100 (Footman earns: ৳90 after 10% commission)',
          max_radius: '1KM'
        },
        note: formattedRequests.length === 0 ? 'No requests available within 1KM that you haven\'t recently rejected' : null
      }
    });

  } catch (error) {
    console.error('Get available requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: error.message
    });
  }
};

/**
 * 2. ACCEPT REQUEST
 */
exports.acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const footman_id = req.user.id;

    // Check if user is a Footman
    const user = await User.findByPk(footman_id);
    if (user.user_type !== 'delivery') {
      return res.status(403).json({
        success: false,
        message: 'Only Footmen can accept requests'
      });
    }

    // Find request
    const request = await Request.findByPk(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check if request is available
    if (request.request_status !== 'searching' || request.assigned_footman_id) {
      return res.status(400).json({
        success: false,
        message: 'Request is not available'
      });
    }

    // Check distance (MAX 1KM)
    if (user.latitude && user.longitude) {
      const distance = this._calculateDistance(
        user.latitude, user.longitude,
        request.pickup_lat, request.pickup_lng
      );
      
      if (distance > 1) {
        return res.status(400).json({
          success: false,
          message: 'You are outside 1KM service radius'
        });
      }
    }

    // Calculate price based on distance
    let footmanEarnings = 0;
    let commission = 0;
    if (user.latitude && user.longitude && request.pickup_lat && request.pickup_lng) {
      const distance = this._calculateDistance(
        user.latitude, user.longitude,
        request.pickup_lat, request.pickup_lng
      );
      
      const price = distance <= 0.5 ? 50 : 100;
      const commissionRate = 0.10;
      footmanEarnings = price * (1 - commissionRate);
      commission = price * commissionRate;
    }

    // Clean up any rejection records
    await RequestRejection.destroy({
      where: {
        request_id: id,
        footman_id: footman_id
      }
    });

    // Accept request with calculated earnings
    await request.update({
      assigned_footman_id: footman_id,
      request_status: 'accepted_by_partner',
      accepted_at: new Date(),
      footman_earnings: footmanEarnings,
      commission: commission,
      base_price: footmanEarnings + commission
    });

    res.json({
      success: true,
      message: 'Request accepted! Go help the customer.',
      data: { request }
    });

  } catch (error) {
    console.error('Accept request error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to accept request',
      error: error.message
    });
  }
};

/**
 * 3. REJECT REQUEST
 */
exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const footman_id = req.user.id;

    const request = await Request.findByPk(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    let message = 'Request rejected. Next Footman will be notified.';
    let rejectionReason = 'forward';
    
    if (request.request_status === 'searching') {
      await RequestRejection.createRejection(id, footman_id, 'busy');
      message = 'Request rejected. Next Footman will be notified.';
    }
    else if (request.request_status === 'accepted_by_partner' && 
             request.assigned_footman_id === footman_id) {
      
      await RequestRejection.createRejection(id, footman_id, 'forward');
      
      await request.update({
        request_status: 'searching',
        assigned_footman_id: null,
        accepted_at: null
      });
      
      message = 'Request forwarded to next Footman. You are now available for new requests.';
      rejectionReason = 'forward';
    }
    else if (request.assigned_footman_id !== footman_id) {
      return res.status(403).json({
        success: false,
        message: 'This request is not assigned to you'
      });
    }
    else {
      return res.status(400).json({
        success: false,
        message: `Cannot reject request with status: ${request.request_status}`
      });
    }

    res.json({
      success: true,
      message: message,
      data: {
        rejection_reason: rejectionReason,
        rejection_timeout_minutes: 10,
        note: 'You will not see this request again for 10 minutes'
      }
    });

  } catch (error) {
    console.error('Reject request error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to reject request'
    });
  }
};

/**
 * 4. GET FOOTMAN'S ACTIVE REQUESTS
 */
exports.getMyActiveRequests = async (req, res) => {
  try {
    const footman_id = req.user.id;

    const requests = await Request.findAll({
      where: {
        assigned_footman_id: footman_id,
        request_status: ['accepted_by_partner', 'ongoing']
      },
      include: [
        {
          association: 'customer',
          attributes: ['id', 'full_name', 'phone']
        }
      ],
      order: [['accepted_at', 'DESC']]
    });

    res.json({
      success: true,
      data: { requests }
    });
  } catch (error) {
    console.error('Get active requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your requests'
    });
  }
};

/**
 * 5. UPDATE REQUEST STATUS (ongoing, completed) - UPDATED for payment flow
 */
exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const footman_id = req.user.id;

    // Validate status
    const validStatuses = ['ongoing', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be: ${validStatuses.join(', ')}`
      });
    }

    // Find request
    const request = await Request.findOne({
      where: {
        id,
        assigned_footman_id: footman_id
      }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or not assigned to you'
      });
    }

    // VALIDATE STATUS TRANSITIONS
    const currentStatus = request.request_status;
    
    // Check if payment flow is locked
    if (request.payment_lock) {
      return res.status(400).json({
        success: false,
        message: 'Request is locked in payment flow. Cannot change status.',
        payment_flow_state: request.payment_flow_state
      });
    }

    // UPDATE LOGIC
    const updateData = { request_status: status };
    
    if (status === 'ongoing') {
      // Only allow if current status is 'accepted_by_partner'
      if (currentStatus !== 'accepted_by_partner') {
        return res.status(400).json({
          success: false,
          message: `Cannot start job from ${currentStatus} status`
        });
      }
    }
    else if (status === 'completed') {
      // Only allow if current status is 'ongoing'
      if (currentStatus !== 'ongoing') {
        return res.status(400).json({
          success: false,
          message: `Cannot complete job from ${currentStatus} status`
        });
      }
      
      // Set completed time
      updateData.completed_at = new Date();
      
      // START PAYMENT FLOW: Set payment flow state and lock
      updateData.payment_flow_state = 'waiting_payment';
      updateData.payment_lock = true;
      
      // Update Footman stats
      await User.increment('total_completed_jobs', {
        where: { id: footman_id }
      });
    }

    await request.update(updateData);

    // Prepare response based on status
    let responseMessage = `Request marked as ${status}`;
    if (status === 'completed') {
      responseMessage = 'Job completed! Waiting for customer payment...';
    }

    res.json({
      success: true,
      message: responseMessage,
      data: { 
        request,
        payment_flow_state: request.payment_flow_state,
        payment_lock: request.payment_lock
      }
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update status'
    });
  }
};

/**
 * NEW 6. GET PAYMENT STATUS FOR REQUEST
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const footman_id = req.user.id;

    const request = await Request.findOne({
      where: {
        id,
        assigned_footman_id: footman_id
      },
      attributes: [
        'id', 'request_number', 'request_status', 'payment_flow_state',
        'customer_selected_payment', 'partner_confirmed_at', 'payment_lock',
        'base_price', 'footman_earnings', 'distance_km',
        'completed_at', 'updated_at'
      ],
      include: [
        {
          association: 'customer',
          attributes: ['id', 'full_name', 'phone']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or not assigned to you'
      });
    }

    res.json({
      success: true,
      data: {
        request: request.toJSON(),
        payment_info: {
          customer_selected: request.customer_selected_payment,
          payment_flow_state: request.payment_flow_state,
          partner_confirmed: !!request.partner_confirmed_at,
          payment_lock: request.payment_lock,
          can_confirm_payment: request.customer_selected_payment && 
                               request.payment_flow_state === 'payment_selected' &&
                               !request.partner_confirmed_at
        }
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch payment status'
    });
  }
};

/**
 * NEW 7. CONFIRM PAYMENT RECEIVED
 */
exports.confirmPaymentReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;
    const footman_id = req.user.id;

    // Validate payment method
    const validMethods = ['cash', 'bkash', 'nagad'];
    if (!validMethods.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Must be: ${validMethods.join(', ')}`
      });
    }

    const request = await Request.findOne({
      where: {
        id,
        assigned_footman_id: footman_id,
        payment_flow_state: 'payment_selected',
        customer_selected_payment: payment_method,
        partner_confirmed_at: null
      }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Payment confirmation not available. Check if customer has selected payment method.'
      });
    }

    // Confirm payment received
    await request.update({
      partner_confirmed_at: new Date(),
      payment_flow_state: 'payment_confirmed'
    });

    // After 2 seconds, mark as fully completed and unlock
    setTimeout(async () => {
      try {
        await request.update({
          payment_flow_state: 'fully_completed',
          payment_lock: false
        });
        console.log(`Request ${id} marked as fully_completed and unlocked`);
      } catch (error) {
        console.error('Error marking request as fully_completed:', error);
      }
    }, 2000);

    res.json({
      success: true,
      message: 'Payment confirmed! Thank you for completing the job.',
      data: {
        request_id: request.id,
        payment_method: payment_method,
        confirmed_at: new Date(),
        next_step: 'Returning to home screen...'
      }
    });

  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to confirm payment'
    });
  }
};

/**
 * 8. GET FOOTMAN EARNINGS
 */
exports.getFootmanEarnings = async (req, res) => {
  try {
    const footman_id = req.user.id;

    const user = await User.findByPk(footman_id);
    if (user.user_type !== 'delivery') {
      return res.status(403).json({
        success: false,
        message: 'Only Footmen can access earnings'
      });
    }

    const earningsResult = await Request.findOne({
      where: {
        assigned_footman_id: footman_id,
        request_status: 'completed'
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_jobs'],
        [sequelize.fn('SUM', sequelize.col('footman_earnings')), 'total_earnings'],
        [sequelize.fn('SUM', sequelize.col('commission')), 'total_commission']
      ],
      raw: true
    });

    const totalJobs = parseInt(earningsResult?.total_jobs || 0);
    const totalEarnings = parseFloat(earningsResult?.total_earnings || 0);
    const totalCommission = parseFloat(earningsResult?.total_commission || 0);

    res.json({
      success: true,
      data: {
        profile: {
          name: user.full_name,
          rating: user.rating,
          total_completed_jobs: user.total_completed_jobs,
          is_online: user.is_online
        },
        earnings: {
          total_jobs: totalJobs,
          total_earnings: totalEarnings,
          total_commission: totalCommission,
          net_earnings: totalEarnings
        },
        pricing_tiers: {
          '0_0.5_km': '৳50 (Footman earns: ৳45 after 10% commission)',
          '0.5_1_km': '৳100 (Footman earns: ৳90 after 10% commission)',
          max_radius: '1KM'
        }
      }
    });

  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings'
    });
  }
};

// Helper: Calculate distance
exports._calculateDistance = function(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Cleanup old rejections
 */
exports.cleanupOldRejections = async (req, res) => {
  try {
    const deletedCount = await RequestRejection.cleanupOldRejections(24);
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old rejection records`,
      data: { deleted_count: deletedCount }
    });
  } catch (error) {
    console.error('Cleanup rejections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup old rejections'
    });
  }
};
