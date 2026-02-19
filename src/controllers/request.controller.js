const Request = require('../models/Request');
const FootmanService = require('../services/footman.service');
const MatchingService = require('../services/matching.service');
const socketService = require('../socket/socket.service');
const firebaseService = require('../services/firebase.service');
const RequestRejection = require('../models/RequestRejection');
const { Op } = require('sequelize');

// ==================== CUSTOMER REQUEST CONTROLLERS ====================

/**
 * 1. CREATE HELP REQUEST - BROADCAST TO ALL NEARBY PARTNERS
 * IDEAL BEHAVIOR:
 * - When app is FOREGROUND: WebSocket updates UI (no notification)
 * - When app is BACKGROUND/CLOSED: Firebase sends notification
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

    // Get ALL nearby footmen (not just the nearest)
    const nearbyFootmen = await MatchingService.findNearbyFootmen(lat, lng, 1, 10);
    
    if (!nearbyFootmen || nearbyFootmen.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No footmen available within 1KM radius'
      });
    }

    // Calculate price based on nearest footman distance
    const nearestDistance = parseFloat(nearbyFootmen[0].distance_km);
    const PricingService = require('../services/pricing.service');
    const price = PricingService.calculatePrice(nearestDistance);
    
    // Prepare commission breakdown
    const CommissionService = require('../services/commission.service');
    const commission = CommissionService.calculateCommission(price.basePrice);

    // Create request in database (initially no assigned footman)
    const request = await Request.create({
      request_number: Request.generateRequestNumber(),
      customer_id,
      pickup_lat: lat,
      pickup_lng: lng,
      nearest_footman_id: null, // Will be assigned when partner accepts
      distance_km: nearestDistance,
      base_price: price.basePrice,
      commission: commission.commission,
      footman_earnings: commission.footmanEarnings,
      request_status: 'searching',
      price_tier: price.priceTier
    });

    // Emit WebSocket event for request creation to customer
    socketService.notifyCustomer(customer_id, 'request_created', {
      requestId: request.id,
      status: 'searching',
      message: 'Request sent to nearby Footmen',
      timestamp: Date.now()
    });

    // BROADCAST TO ALL NEARBY PARTNERS - IDEAL BEHAVIOR
    // WebSocket for foreground apps (real-time UI updates)
    // Firebase for background/closed apps (push notifications)
    const broadcastData = {
      requestId: request.id,
      customerId: customer_id,
      distance: nearestDistance,
      price: price.basePrice,
      pickupLocation: { lat, lng },
      timestamp: Date.now()
    };

    // Send to each nearby footman
    const notifiedPartners = [];
    for (const footman of nearbyFootmen) {
      try {
        // WebSocket notification (for foreground apps - real-time UI update)
        socketService.notifyPartner(footman.id.toString(), 'new_request', broadcastData);
        
        // Firebase push notification (for background/closed apps)
        await firebaseService.sendNotificationToUser(
          footman.id,
          firebaseService.NotificationTemplates.newRequest(
            nearestDistance,
            price.basePrice
          ),
          {
            type: 'new_request',
            request_id: request.id.toString(),
            distance: nearestDistance.toString(),
            price: price.basePrice.toString(),
            customer_id: customer_id.toString(),
            timestamp: Date.now().toString()
          }
        );
        
        notifiedPartners.push({
          id: footman.id,
          name: footman.full_name,
          distance: footman.distance_km
        });
        
        console.log(`📢 Notified partner ${footman.id} (${footman.full_name}) - WebSocket + Firebase`);
        
      } catch (error) {
        console.error(`❌ Failed to notify partner ${footman.id}:`, error.message);
      }
    }

    console.log(`📢 Request ${request.id} broadcasted to ${notifiedPartners.length} nearby partners`);

    res.status(201).json({
      success: true,
      message: `Help request sent to ${notifiedPartners.length} nearby Footmen`,
      data: {
        request: {
          ...request.toJSON(),
          nearby_footmen: nearbyFootmen.map(f => ({
            id: f.id,
            name: f.full_name,
            distance: f.distance_km
          })),
          price: price,
          commission: commission
        },
        notifications_sent: notifiedPartners.length,
        broadcast_details: {
          radius_km: 1,
          max_partners: 10,
          actual_notified: notifiedPartners.length
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

      // Send Firebase notification to partner
      try {
        await firebaseService.sendNotificationToUser(
          request.footman_id,
          firebaseService.NotificationTemplates.requestCancelled(),
          {
            type: 'request_cancelled',
            request_id: request.id.toString(),
            customer_id: customer_id.toString(),
            timestamp: Date.now().toString()
          }
        );
        console.log(`📤 Cancellation notification sent to partner ${request.footman_id}`);
      } catch (firebaseError) {
        console.error('❌ Firebase cancellation notification failed:', firebaseError.message);
      }
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
 * FIXED: PARTNER FORWARD REQUEST FUNCTION
 * When partner forwards request, they are blocked from that customer for 10 minutes
 * Request goes back to searching status
 * Customer can cancel if they want
 */
exports.forwardRequest = async (req, res) => {
  try {
    const partner_id = req.user.id;
    const { id } = req.params;  // Get request_id from URL params, not body

    console.log(`=== FORWARD REQUEST: Partner ${partner_id} forwarding request ${id} ===`);

    // Find the FULL request object with all fields
    const request = await Request.findOne({
      where: { id: id }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check if partner has accepted this request
    if (request.request_status !== 'accepted_by_partner' || request.footman_id !== partner_id) {
      return res.status(400).json({
        success: false,
        message: 'You can only forward requests you have accepted'
      });
    }

    // Check if this partner has already forwarded this request recently
    const existingForward = await RequestRejection.findOne({
      where: {
        request_id: id,
        assigned_footman_id: partner_id,
        reason: 'forward'
      }
    });

    if (existingForward) {
      return res.status(400).json({
        success: false,
        message: 'You have already forwarded this request'
      });
    }

    // Create rejection record with 'forward' reason
    await RequestRejection.create({
      request_id: id,
      assigned_footman_id: partner_id,
      reason: 'forward',
      notes: 'Partner forwarded request to others'
    });

    console.log(`✅ Partner ${partner_id} blocked from request ${id} for 10 minutes`);

    // Update request status back to 'searching'
    await request.update({
      request_status: 'searching',
      footman_id: null,
      nearest_footman_id: null,
      updated_at: new Date()
    });

    // Notify customer via WebSocket - use same event as rejectRequest
    socketService.notifyCustomer(request.customer_id.toString(), 'request_update', {
      id: request.id,
      status: 'searching',
      message: 'Footman forwarded your request. Searching for another Footman...'
    });

    console.log(`✅ Partner ${partner_id} forwarded request ${id}. Status changed to searching. Customer notified.`);

    res.json({
      success: true,
      message: 'Request forwarded successfully',
      data: {
        request_id: request.id,
        customer_id: request.customer_id,
        blocked_duration_minutes: 10
      }
    });

  } catch (error) {
    console.error('Forward request error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to forward request'
    });
  }
};

/**
 * 6. GET PAYMENT STATUS FOR CUSTOMER
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
 * 7. SELECT PAYMENT METHOD
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

    // Notify partner via WebSocket
    if (request.footman_id) {
      socketService.notifyPartner(request.footman_id.toString(), 'customer_payment_selected', {
        requestId: request.id,
        paymentMethod: payment_method,
        timestamp: Date.now()
      });
    }

    // Send Firebase notification to partner
    if (request.footman_id) {
      try {
        await firebaseService.sendNotificationToUser(
          request.footman_id,
          firebaseService.NotificationTemplates.paymentSelected(payment_method),
          {
            type: 'payment_selected',
            request_id: request.id.toString(),
            method: payment_method,
            timestamp: Date.now().toString()
          }
        );
        console.log(`📤 Payment selection notification sent to partner ${request.footman_id}`);
      } catch (firebaseError) {
        console.error('❌ Firebase payment notification failed:', firebaseError.message);
      }
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
 * 8. CHECK IF NEED TO SHOW PAYMENT SCREEN
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
    socketService.io.emit('partner_location', {
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
        where: { id: request_id, assigned_footman_id: partner_id },
        attributes: ['customer_id']
      });

      if (request && request.customer_id) {
        socketService.notifyCustomer(request.customer_id.toString(), 'partner_location', {
          partnerId: partner_id,
          latitude,
          longitude,
          bearing: bearing || 0,
          speed: speed || 0,
          requestId: request.id,
          timestamp: Date.now()
        });

        // Send Firebase notification to customer for location update
        try {
          await firebaseService.sendNotificationToUser(
            request.customer_id,
            { title: '📍 Footman Location', body: 'Your footman is on the way' },
            {
              type: 'partner_location',
              request_id: request_id.toString(),
              partner_id: partner_id.toString(),
              latitude: latitude.toString(),
              longitude: longitude.toString(),
              bearing: (bearing || 0).toString(),
              timestamp: Date.now().toString()
            }
          );
        } catch (firebaseError) {
          console.error('❌ Firebase location notification failed:', firebaseError.message);
        }
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
      where: { id: request_id, assigned_footman_id: partner_id },
      include: [
        {
          association: 'footman',
          attributes: ['id', 'full_name', 'phone']
        },
        {
          association: 'customer',
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

    // If partner accepts, update the footman_id in request
    if (status === 'accepted_by_partner' && !request.footman_id) {
      await request.update({
        assigned_footman_id: partner_id,
        nearest_assigned_footman_id: partner_id
      });
    }

    // Emit WebSocket event for status change
    socketService.notifyCustomer(request.customer_id.toString(), 'request_update', {
      requestId: request.id,
      status: status,
      message: message || `Request status changed to ${status}`,
      partnerId: partner_id,
      partnerName: request.footman?.full_name || 'Footman',
      timestamp: Date.now()
    });

    // Send Firebase notification based on status
    try {
      let notification;
      let notificationType;
      
      switch (status) {
        case 'accepted_by_partner':
          notification = firebaseService.NotificationTemplates.requestAccepted(
            request.footman?.full_name || 'A Footman'
          );
          notificationType = 'request_accepted';
          break;
          
        case 'ongoing':
          notification = firebaseService.NotificationTemplates.jobStarted(
            request.footman?.full_name || 'Footman'
          );
          notificationType = 'job_started';
          break;
          
        case 'completed':
          notification = firebaseService.NotificationTemplates.jobCompleted();
          notificationType = 'job_completed';
          // Also send payment waiting notification to partner
          if (request.footman_id) {
            await firebaseService.sendNotificationToUser(
              request.footman_id,
              firebaseService.NotificationTemplates.paymentWaiting(),
              {
                type: 'payment_waiting',
                request_id: request_id.toString(),
                customer_id: request.customer_id.toString(),
                timestamp: Date.now().toString()
              }
            );
          }
          break;
      }
      
      if (notification && notificationType) {
        await firebaseService.sendNotificationToUser(
          request.customer_id,
          notification,
          {
            type: notificationType,
            request_id: request_id.toString(),
            partner_id: partner_id.toString(),
            partner_name: request.footman?.full_name || 'Footman',
            timestamp: Date.now().toString()
          }
        );
        console.log(`📤 ${notificationType} notification sent to customer ${request.customer_id}`);
      }
    } catch (firebaseError) {
      console.error('❌ Firebase status notification failed:', firebaseError.message);
    }

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
 * 11. GET REQUEST DETAILS FOR PARTNER (includes customer ID for tracking)
 */
exports.getRequestDetailsForPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const partner_id = req.user.id;

    const request = await Request.findOne({
      where: { 
        id, 
        assigned_footman_id: partner_id 
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

/**
 * 12. GET PAYMENT STATUS FOR PARTNER
 * This allows partners to check if customer selected a payment method
 * even when partner app was closed
 */
exports.getPartnerPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const partner_id = req.user.id;

    const request = await Request.findOne({
      where: { 
        id, 
        assigned_footman_id: partner_id 
      },
      attributes: [
        'id', 'request_number', 'request_status', 'payment_flow_state',
        'customer_selected_payment', 'partner_confirmed_at', 'payment_lock',
        'base_price', 'distance_km', 'completed_at', 'updated_at'
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        customer_selected_payment: request.customer_selected_payment,
        partner_confirmed_at: request.partner_confirmed_at,
        payment_lock: request.payment_lock,
        payment_flow_state: request.payment_flow_state
      }
    });

  } catch (error) {
    console.error('Get partner payment status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * 13. SAVE TRAIL SCREENSHOT URL
 * Called when customer app uploads trail screenshot to Cloudinary after job completion
 */
exports.saveTrailScreenshot = async (req, res) => {
  try {
    const { id } = req.params;
    const { trail_image_url } = req.body;
    const customer_id = req.user.id;

    if (!trail_image_url) {
      return res.status(400).json({
        success: false,
        message: 'Trail image URL is required'
      });
    }

    // Find request and verify it belongs to this customer
    const request = await Request.findOne({
      where: { 
        id, 
        customer_id 
      }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or unauthorized'
      });
    }

    // Save the trail image URL to the request
    await request.update({
      trail_image_url: trail_image_url,
      updated_at: new Date()
    });

    console.log(`✅ Trail screenshot saved for request ${id}: ${trail_image_url}`);

    res.json({
      success: true,
      message: 'Trail screenshot saved successfully',
      data: {
        request_id: request.id,
        trail_image_url: trail_image_url
      }
    });

  } catch (error) {
    console.error('Save trail screenshot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save trail screenshot'
    });
  }
};
