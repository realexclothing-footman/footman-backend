const Request = require('../models/Request');
const FootmanService = require('../services/footman.service');

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
    console.log("Headers auth:", req.headers.authorization ? "Present" : "Missing");

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
