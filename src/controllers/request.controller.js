const Request = require('../models/Request');
const FootmanService = require('../services/footman.service');
const socketService = require('../socket/socket.service');

// ==================== CUSTOMER REQUEST CONTROLLERS ====================

/**
 * 1. CREATE HELP REQUEST
 */
exports.createRequest = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const { latitude, longitude, pickup_latitude, pickup_longitude } = req.body;

    console.log("=== CREATE REQUEST API CALLED ===");
    console.log("Customer ID:", customer_id);
    console.log("Request Body:", req.body);

    const lat = latitude || pickup_latitude;
    const lng = longitude || pickup_longitude;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    // Create help request
    const result = await FootmanService.createHelpRequest(
      customer_id, lat, lng
    );

    // Save to database
    const request = await Request.create({
      request_number: Request.generateRequestNumber(),
      customer_id,
      pickup_lat: lat,
      pickup_lng: lng,
      nearest_footman_id: result.request.nearest_footman_id,
      distance_km: result.request.distance_km,
      base_price: result.request.price_breakdown.basePrice,
      commission: result.request.commission_breakdown.commission,
      footman_earnings: result.request.commission_breakdown.footmanEarnings,
      request_status: 'searching',
      price_tier: result.request.price_breakdown.priceTier
    });

    // Emit WebSocket event for request creation
    socketService.notifyCustomer(customer_id, 'request_created', {
      requestId: request.id,
      status: 'searching',
      message: 'Request sent to nearest Footman',
      timestamp: Date.now()
    });

    // Notify the assigned partner if online
    if (result.footman && result.footman.id) {
      socketService.notifyPartner(result.footman.id.toString(), 'new_request', {
        requestId: request.id,
        customerId: customer_id,
        distance: result.request.distance_km,
        price: result.request.price_breakdown.basePrice,
        timestamp: Date.now()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Help request sent! Nearest Footman notified.',
      data: {
        request: {
          ...request.toJSON(),
          footman: result.footman,
          price: result.request.price_breakdown,
          commission: result.request.commission_breakdown
        }
      }
    });

  } catch (error) {
    console.error('Create request error:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      retry: true
    });
  }
};

/**
 * 2. GET CUSTOMER ACTIVE REQUESTS
 */
exports.getMyRequests = async (req, res) => {
  try {
    const customer_id = req.user.id;

    const requests = await Request.findAll({
      where: { customer_id },
      order: [['created_at', 'DESC']],
      include: [
        {
          association: 'footman',
          attributes: ['id', 'full_name', 'phone', 'rating', 'latitude', 'longitude']
        }
      ]
    });

    res.json({
      success: true,
      data: { requests }
    });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch requests'
    });
  }
};

/**
 * 3. GET REQUEST DETAILS
 */
exports.getRequestDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const customer_id = req.user.id;

    const request = await Request.findOne({
      where: { id, customer_id },
      include: [
        {
          association: 'footman',
          attributes: ['id', 'full_name', 'phone', 'rating', 'latitude', 'longitude']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    res.json({
      success: true,
      data: { request }
    });
  } catch (error) {
    console.error('Request details error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch request details'
    });
  }
};

/**
 * 4. CANCEL REQUEST
 */
exports.cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const customer_id = req.user.id;

    const request = await Request.findOne({
      where: { 
        id, 
        customer_id,
        request_status: ['searching', 'accepted']
      }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or cannot be cancelled'
      });
    }

    await request.update({
      request_status: 'cancelled',
      cancelled_at: new Date()
    });

    // Emit WebSocket event for cancellation
    socketService.notifyCustomer(customer_id, 'request_cancelled', {
      requestId: request.id,
      status: 'cancelled',
      message: 'Request cancelled successfully',
      timestamp: Date.now()
    });

    // Notify partner if assigned
    if (request.footman_id) {
      socketService.notifyPartner(request.footman_id.toString(), 'request_cancelled', {
        requestId: request.id,
        customerId: customer_id,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: 'Request cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to cancel request'
    });
  }
};

/**
 * 5. GET NEARBY FOOTMEN FOR MAP
 */
exports.getNearbyFootmen = async (req, res) => {
  try {
    const { latitude, longitude, radius_km = 1 } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    const footmenData = await FootmanService.getNearbyFootmenForMap(
      parseFloat(latitude),
      parseFloat(longitude),
      parseInt(radius_km)
    );

    res.json({
      success: true,
      data: footmenData
    });
  } catch (error) {
    console.error('Get nearby footmen error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to find nearby Footmen'
    });
  }
};

/**
 * NEW 6. GET PAYMENT STATUS FOR CUSTOMER
 */
exports.getCustomerPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const customer_id = req.user.id;

    const request = await Request.findOne({
      where: { id, customer_id },
      attributes: [
        'id', 'request_number', 'request_status', 'payment_flow_state',
        'customer_selected_payment', 'partner_confirmed_at', 'payment_lock',
        'base_price', 'distance_km', 'completed_at', 'updated_at'
      ],
      include: [
        {
          association: 'footman',
          attributes: ['id', 'full_name', 'phone']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    res.json({
      success: true,
      data: {
        request: request.toJSON(),
        payment_info: {
          payment_flow_state: request.payment_flow_state,
          customer_selected_payment: request.customer_selected_payment,
          partner_confirmed: !!request.partner_confirmed_at,
          payment_lock: request.payment_lock,
          show_payment_screen: request.payment_flow_state === 'waiting_payment' ||
                              request.payment_flow_state === 'payment_selected'
        }
      }
    });

  } catch (error) {
    console.error('Get customer payment status error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch payment status'
    });
  }
};

/**
 * NEW 7. SELECT PAYMENT METHOD
 */
exports.selectPaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;
    const customer_id = req.user.id;

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
        customer_id,
        request_status: 'completed',
        payment_flow_state: 'waiting_payment',
        customer_selected_payment: null,
        payment_lock: true
      }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Payment selection not available. Check if job is completed.'
      });
    }

    // Customer selects payment method
    await request.update({
      customer_selected_payment: payment_method,
      payment_flow_state: 'payment_selected'
    });

    // Emit WebSocket event for payment selection
    socketService.notifyCustomer(customer_id, 'payment_selected', {
      requestId: request.id,
      paymentMethod: payment_method,
      timestamp: Date.now()
    });

    // Notify partner
    if (request.footman_id) {
      socketService.notifyPartner(request.footman_id.toString(), 'customer_payment_selected', {
        requestId: request.id,
        paymentMethod: payment_method,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: `Payment method selected: ${payment_method.toUpperCase()}`,
      data: {
        request_id: request.id,
        payment_method: payment_method,
        next_step: 'Footman will confirm when payment is received'
      }
    });

  } catch (error) {
    console.error('Select payment method error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to select payment method'
    });
  }
};

/**
 * NEW 8. CHECK IF NEED TO SHOW PAYMENT SCREEN
 */
exports.checkPaymentScreen = async (req, res) => {
  try {
    const customer_id = req.user.id;

    // Find any request that needs payment screen
    const request = await Request.findOne({
      where: {
        customer_id,
        request_status: 'completed',
        payment_flow_state: ['waiting_payment', 'payment_selected'],
        payment_lock: true
      },
      order: [['completed_at', 'DESC']],
      attributes: [
        'id', 'request_number', 'base_price', 'distance_km',
        'payment_flow_state', 'customer_selected_payment',
        'partner_confirmed_at', 'payment_lock', 'completed_at'
      ],
      include: [
        {
          association: 'footman',
          attributes: ['id', 'full_name', 'phone']
        }
      ]
    });

    if (!request) {
      return res.json({
        success: true,
        data: {
          show_payment_screen: false,
          message: 'No pending payments'
        }
      });
    }

    res.json({
      success: true,
      data: {
        show_payment_screen: true,
        request: request.toJSON(),
        payment_info: {
          needs_payment: request.payment_flow_state === 'waiting_payment',
          payment_selected: request.customer_selected_payment,
          partner_confirmed: !!request.partner_confirmed_at,
          payment_flow_state: request.payment_flow_state
        }
      }
    });

  } catch (error) {
    console.error('Check payment screen error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
};

/**
 * 9. EMIT PARTNER LOCATION UPDATE (For WebSocket)
 * This should be called by partner app when location changes
 */
exports.emitPartnerLocation = async (req, res) => {
  try {
    const partner_id = req.user.id;
    const { latitude, longitude, bearing, speed, request_id } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    // Emit WebSocket event for partner location
    socketService.io.emit('partner_location_update', {
      partnerId: partner_id,
      latitude,
      longitude,
      bearing: bearing || 0,
      speed: speed || 0,
      requestId: request_id,
      timestamp: Date.now()
    });

    // Also notify specific customer if request_id is provided
    if (request_id) {
      const request = await Request.findOne({
        where: { id: request_id, footman_id: partner_id },
        attributes: ['customer_id']
      });

      if (request && request.customer_id) {
        socketService.notifyCustomer(request.customer_id.toString(), 'partner_location', {
          partnerId: partner_id,
          latitude,
          longitude,
          bearing: bearing || 0,
          speed: speed || 0,
          requestId: request_id,
          timestamp: Date.now()
        });
      }
    }

    res.json({
      success: true,
      message: 'Location update broadcasted',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Emit partner location error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to broadcast location'
    });
  }
};

/**
 * 10. UPDATE REQUEST STATUS WITH WEBSOCKET NOTIFICATION
 */
exports.updateRequestStatus = async (req, res) => {
  try {
    const partner_id = req.user.id;
    const { request_id, status, message } = req.body;

    const request = await Request.findOne({
      where: { id: request_id, footman_id: partner_id },
      include: [
        {
          association: 'footman',
          attributes: ['id', 'full_name', 'phone']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or unauthorized'
      });
    }

    // Update request status
    await request.update({
      request_status: status,
      updated_at: new Date()
    });

    // Emit WebSocket event for status change
    socketService.notifyCustomer(request.customer_id.toString(), 'request_status_update', {
      requestId: request_id,
      status: status,
      message: message || `Request status changed to ${status}`,
      partnerId: partner_id,
      partnerName: request.footman?.full_name || 'Footman',
      timestamp: Date.now()
    });

    res.json({
      success: true,
      message: `Request status updated to ${status}`,
      data: { request }
    });

  } catch (error) {
    console.error('Update request status error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update request status'
    });
  }
};

/**
 * NEW 11. GET REQUEST DETAILS FOR PARTNER (includes customer ID for tracking)
 */
exports.getRequestDetailsForPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const partner_id = req.user.id;

    const request = await Request.findOne({
      where: { 
        id, 
        footman_id: partner_id 
      },
      attributes: [
        'id', 'request_number', 'request_status', 'customer_id',
        'pickup_lat', 'pickup_lng', 'distance_km', 'base_price',
        'footman_earnings', 'payment_flow_state', 'customer_selected_payment',
        'partner_confirmed_at', 'payment_lock', 'created_at', 'completed_at'
      ],
      include: [
        {
          association: 'customer',
          attributes: ['id', 'full_name', 'phone', 'latitude', 'longitude']
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or unauthorized'
      });
    }

    res.json({
      success: true,
      data: { request }
    });
  } catch (error) {
    console.error('Get request details for partner error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch request details'
    });
  }
};
