const { Server } = require('socket.io');
const Request = require('../models/Request');

class SocketService {
  constructor() {
    this.io = null;
    this.activeConnections = new Map(); // userId -> {socketId, userType}
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket']
    });

    this.setupEventHandlers();
    console.log('✅ Real-time System Initialized (Standardized on ID)');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      
      socket.on('authenticate', async (data) => {
        try {
          const { userId, userType } = data;
          if (!userId || !userType) return;

          const uid = userId.toString();
          this.activeConnections.set(uid, {
            socketId: socket.id,
            userType: userType
          });

          socket.join(`${userType}_${uid}`);
          socket.emit('authenticated', { success: true });
          console.log(`✅ ${userType.toUpperCase()} ${uid} connected`);
          
          // Send any pending updates for this user
          if (userType === 'customer') {
            await this.sendPendingUpdatesToCustomer(uid, socket);
          }
        } catch (err) {
          console.error('Socket Auth Error:', err);
        }
      });

      // ========== REQUEST STATUS UPDATES ==========
      socket.on('request_status_update', async (data) => {
        try {
          const { id, status, customerId } = data;
          if (!id || !status) return;

          // If customerId not provided, look it up from database
          let targetCustomerId = customerId;
          if (!targetCustomerId) {
            const request = await Request.findOne({
              where: { id },
              attributes: ['customer_id']
            });
            if (request) {
              targetCustomerId = request.customer_id.toString();
            }
          }

          if (targetCustomerId) {
            const payload = {
              requestId: id,
              status: status,
              timestamp: Date.now()
            };
            
            this.notifyCustomer(targetCustomerId, 'request_update', payload);
            console.log(`📋 Status update forwarded: ${status} for request ${id} to customer ${targetCustomerId}`);
          } else {
            console.error(`❌ Could not find customer for request ${id}`);
          }
        } catch (error) {
          console.error('❌ Error in request_status_update:', error);
        }
      });

      // ========== PARTNER LOCATION UPDATES ==========
      socket.on('partner_location_update', async (data) => {
        try {
          const { partnerId, latitude, longitude, bearing, speed, id: requestId } = data;
          
          if (!partnerId || !latitude || !longitude) return;

          // Find customer ID for this request
          let customerId = null;
          if (requestId) {
            const request = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id']
            });
            if (request) {
              customerId = request.customer_id.toString();
            }
          }

          if (customerId) {
            const locationData = {
              partnerId: partnerId,
              latitude: latitude,
              longitude: longitude,
              bearing: bearing || 0,
              speed: speed || 0,
              requestId: requestId,
              timestamp: Date.now()
            };
            
            this.notifyCustomer(customerId, 'partner_location', locationData);
            console.log(`📍 Partner ${partnerId} location forwarded to customer ${customerId}`);
          }
        } catch (error) {
          console.error('❌ Error in partner_location_update:', error);
        }
      });

      // ========== PAYMENT UPDATES ==========
      socket.on('payment_update', async (data) => {
        try {
          const { id: requestId, status, method } = data;
          if (!requestId || !status) return;

          // Find request to get customer and partner IDs
          const request = await Request.findOne({
            where: { id: requestId },
            attributes: ['customer_id', 'footman_id']
          });

          if (request) {
            const customerId = request.customer_id?.toString();
            const partnerId = request.footman_id?.toString();

            const paymentData = {
              requestId: requestId,
              status: status,
              method: method,
              timestamp: Date.now()
            };

            // Notify customer about payment selection
            if (customerId && status === 'selected') {
              this.notifyCustomer(customerId, 'payment_selected', paymentData);
              console.log(`💰 Payment selection ${method} forwarded to customer ${customerId}`);
            }

            // Notify partner about payment selection
            if (partnerId && status === 'selected') {
              this.notifyPartner(partnerId, 'payment_selected', paymentData);
              console.log(`💰 Payment selection ${method} forwarded to partner ${partnerId}`);
            }
          }
        } catch (error) {
          console.error('❌ Error in payment_update:', error);
        }
      });

      // ========== PAYMENT CONFIRMATION ==========
      socket.on('payment_confirmation', async (data) => {
        try {
          const { id: requestId, status, method } = data;
          if (!requestId || !status) return;

          // Find request to get customer ID
          const request = await Request.findOne({
            where: { id: requestId },
            attributes: ['customer_id']
          });

          if (request && request.customer_id) {
            const customerId = request.customer_id.toString();
            
            const paymentData = {
              requestId: requestId,
              status: status,
              method: method,
              timestamp: Date.now()
            };

            this.notifyCustomer(customerId, 'payment_status', paymentData);
            console.log(`✅ Payment confirmation forwarded to customer ${customerId}`);
          }
        } catch (error) {
          console.error('❌ Error in payment_confirmation:', error);
        }
      });

      // ========== TRACKING SETUP ==========
      socket.on('setup_tracking', (data) => {
        try {
          const { id: requestId, customerId, partnerId } = data;
          
          if (customerId && partnerId) {
            const trackingData = {
              requestId: requestId,
              customerId: customerId,
              partnerId: partnerId,
              timestamp: Date.now()
            };

            // Notify customer that tracking has started
            this.notifyCustomer(customerId, 'tracking_started', trackingData);
            console.log(`📍 Tracking setup for request ${requestId} between customer ${customerId} and partner ${partnerId}`);
          }
        } catch (error) {
          console.error('❌ Error in setup_tracking:', error);
        }
      });

      socket.on('disconnect', () => {
        for (const [userId, conn] of this.activeConnections.entries()) {
          if (conn.socketId === socket.id) {
            this.activeConnections.delete(userId);
            console.log(`🔌 ${conn.userType.toUpperCase()} ${userId} disconnected`);
            break;
          }
        }
      });
    });
  }

  // Send any pending updates when customer reconnects
  async sendPendingUpdatesToCustomer(customerId, socket) {
    try {
      // Find active requests for this customer
      const activeRequests = await Request.findAll({
        where: { 
          customer_id: customerId,
          request_status: ['accepted_by_partner', 'ongoing']
        },
        include: [
          {
            association: 'footman',
            attributes: ['id', 'full_name', 'phone']
          }
        ]
      });

      for (const request of activeRequests) {
        // Send current request status
        socket.emit('request_update', {
          requestId: request.id,
          status: request.request_status,
          partnerId: request.footman?.id,
          partnerName: request.footman?.full_name,
          timestamp: Date.now()
        });

        console.log(`🔄 Sent pending status for request ${request.id} to reconnected customer ${customerId}`);
      }
    } catch (error) {
      console.error('❌ Error sending pending updates:', error);
    }
  }

  notifyUser(userId, event, data) {
    if (this.io) {
      const uid = userId.toString();
      // Emit to the specific room created during auth
      this.io.to(`customer_${uid}`).to(`partner_${uid}`).to(`delivery_${uid}`).emit(event, data);
      return true;
    }
    return false;
  }

  notifyCustomer(userId, event, data) {
    return this.notifyUser(userId, event, data);
  }

  notifyPartner(userId, event, data) {
    return this.notifyUser(userId, event, data);
  }
}

module.exports = new SocketService();
