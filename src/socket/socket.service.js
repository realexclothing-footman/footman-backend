const { Server } = require('socket.io');
const Request = require('../models/Request');
const User = require('../models/User');

class SocketService {
  constructor() {
    this.io = null;

    // userId -> { socketId, userType, latitude, longitude, bearing, status }
    this.activeConnections = new Map();

    // socketId -> { userId, userType }
    this.socketIndex = new Map();

    // requestId -> { customerId, partnerId }
    this.requestIndex = new Map();

    // Store all online footmen with their locations
    this.onlineFootmen = new Map(); // partnerId -> { latitude, longitude, bearing, status }
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket'],
    });

    this.setupEventHandlers();
    console.log('✅ Real-time System Initialized (WebSocket only)');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // ---------------- AUTH ----------------
      socket.on('authenticate', async (data) => {
        try {
          const { userId, userType, latitude, longitude } = data || {};
          
          // Validate userId and userType
          if (!userId || !userType) {
            console.log(`❌ Authentication failed: Missing userId or userType from socket ${socket.id}`);
            socket.emit('auth_error', { 
              success: false, 
              message: 'Missing userId or userType' 
            });
            return;
          }

          if (userId === 'null' || userId === 'undefined') {
            console.log(`❌ Authentication failed: Invalid userId string "${userId}" from socket ${socket.id}`);
            socket.emit('auth_error', { 
              success: false, 
              message: 'Invalid userId format' 
            });
            return;
          }

          const uid = userId.toString();

          // Store connection with location if provided (for customers)
          this.activeConnections.set(uid, { 
            socketId: socket.id, 
            userType,
            latitude: latitude || null,
            longitude: longitude || null,
            connectedAt: Date.now()
          });
          this.socketIndex.set(socket.id, { userId: uid, userType });

          // Join user-specific room
          socket.join(`${userType}_${uid}`);
          
          // Join admin room if admin
          if (userType === 'admin') {
            socket.join('admin_room');
          }

          // If customer connects, send them list of nearby footmen (within 1KM)
          if (userType === 'customer' && latitude && longitude) {
            this.sendNearbyFootmenToCustomer(socket, latitude, longitude);
          }

          // If partner connects, broadcast to nearby customers that they are online
          if (userType === 'partner') {
            this.broadcastPartnerOnline(uid);
          }

          socket.emit('authenticated', { success: true });
          console.log(`✅ ${userType.toUpperCase()} ${uid} connected from socket ${socket.id}`);

          if (userType === 'customer') {
            await this.sendPendingUpdatesToCustomer(uid, socket);
          }
        } catch (err) {
          console.error('❌ Socket authenticate error:', err);
          socket.emit('auth_error', { 
            success: false, 
            message: 'Server error during authentication' 
          });
        }
      });

      // ---------------- PARTNER LOCATION UPDATE ----------------
      socket.on('partner_location_update', async (data) => {
        try {
          const { partnerId, latitude, longitude, bearing, speed, id, status } = data || {};
          
          if (!partnerId) {
            console.log(`❌ partner_location_update: Missing partnerId from socket ${socket.id}`);
            return;
          }

          if (partnerId === 'null' || partnerId === 'undefined') {
            console.log(`❌ partner_location_update: Invalid partnerId "${partnerId}" from socket ${socket.id}`);
            return;
          }

          if (latitude == null || longitude == null) {
            console.log(`❌ partner_location_update: Missing location data from partner ${partnerId}`);
            return;
          }

          const pId = partnerId.toString();
          const requestId = id ? id.toString() : null;

          // Store partner's latest location
          const partnerInfo = this.onlineFootmen.get(pId) || {};
          this.onlineFootmen.set(pId, {
            latitude,
            longitude,
            bearing: bearing || 0,
            speed: speed || 0,
            status: status || 'available',
            lastUpdate: Date.now()
          });

          console.log(`📍 Location update from partner ${pId}`);

          // Broadcast location to nearby customers only
          if (status !== 'busy') {
            const locationData = {
              type: 'partner_location',
              partnerId: pId,
              latitude,
              longitude,
              bearing: bearing || 0,
              speed: speed || 0,
              status: status || 'available',
              timestamp: Date.now(),
            };
            
            // Send to customers within 1KM
            this.sendToNearbyCustomers(pId, latitude, longitude, 'partner_location', locationData);
          }

          // Also send to specific request room if part of active request
          if (requestId) {
            const locationData = {
              partnerId: pId,
              latitude,
              longitude,
              bearing: bearing || 0,
              speed: speed || 0,
              requestId,
              timestamp: Date.now(),
            };

            this.io.to(`request_${requestId}`).emit('partner_location', locationData);

            const cached = this.requestIndex.get(requestId);
            if (cached?.customerId) {
              this.notifyCustomer(cached.customerId, 'partner_location', locationData);
            } else {
              const req = await Request.findOne({
                where: { id: requestId },
                attributes: ['customer_id', 'assigned_footman_id'],
              });
              if (req?.customer_id) {
                const cId = req.customer_id.toString();
                this.requestIndex.set(requestId, {
                  customerId: cId,
                  partnerId: req?.assigned_footman_id ? req.assigned_footman_id.toString() : pId,
                });
                this.notifyCustomer(cId, 'partner_location', locationData);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error in partner_location_update:', error);
        }
      });

      // ---------------- CUSTOMER LOCATION UPDATE ----------------
      socket.on('customer_location_update', async (data) => {
        try {
          const { customerId, latitude, longitude } = data || {};
          
          if (!customerId) return;
          
          const cId = customerId.toString();
          
          // Update customer location in active connections
          const customerInfo = this.activeConnections.get(cId);
          if (customerInfo) {
            customerInfo.latitude = latitude;
            customerInfo.longitude = longitude;
            this.activeConnections.set(cId, customerInfo);
          }
          
          // Send updated nearby footmen to this customer
          if (latitude && longitude) {
            this.sendNearbyFootmenToCustomerById(cId, latitude, longitude);
          }
        } catch (error) {
          console.error('❌ Error in customer_location_update:', error);
        }
      });

      // ---------------- PARTNER STATUS UPDATE ----------------
      socket.on('partner_status_update', async (data) => {
        try {
          const { partnerId, status } = data || {};
          if (!partnerId) return;

          const pId = partnerId.toString();
          
          // Update partner status
          const partnerInfo = this.onlineFootmen.get(pId) || {};
          partnerInfo.status = status;
          this.onlineFootmen.set(pId, partnerInfo);

          // Broadcast status change to nearby customers
          if (partnerInfo.latitude && partnerInfo.longitude) {
            this.sendToNearbyCustomers(pId, partnerInfo.latitude, partnerInfo.longitude, 'partner_status_changed', {
              partnerId: pId,
              status: status,
              timestamp: Date.now()
            });
          }

          console.log(`🔄 Partner ${pId} status changed to ${status}`);
        } catch (error) {
          console.error('❌ Error in partner_status_update:', error);
        }
      });

      // ---------------- PARTNER ENTERPRISE EVENTS ----------------
      socket.on('partner_profile_updated', async (data) => {
        try {
          const { partner_id, profile_image_url, updated_at } = data || {};
          if (!partner_id) return;
          
          const partnerId = partner_id.toString();
          
          this.notifyPartner(partnerId, 'profile_updated', {
            partner_id: partnerId,
            profile_image_url: profile_image_url,
            updated_at: updated_at || new Date()
          });
          
          console.log(`📸 Profile updated event for partner ${partnerId}`);
        } catch (error) {
          console.error('❌ Error in partner_profile_updated:', error);
        }
      });

      socket.on('partner_wallet_updated', async (data) => {
        try {
          const { partner_id, amount, type, new_balance } = data || {};
          if (!partner_id) return;
          
          const partnerId = partner_id.toString();
          
          this.notifyPartner(partnerId, 'wallet_updated', {
            partner_id: partnerId,
            amount: amount,
            type: type || 'earning',
            new_balance: new_balance,
            timestamp: new Date()
          });
          
          console.log(`💰 Wallet updated for partner ${partnerId}: ${type} ${amount}`);
        } catch (error) {
          console.error('❌ Error in partner_wallet_updated:', error);
        }
      });

      socket.on('partner_verification_updated', async (data) => {
        try {
          const { partner_id, verification_type, status } = data || {};
          if (!partner_id || !verification_type) return;
          
          const partnerId = partner_id.toString();
          
          this.notifyPartner(partnerId, 'verification_updated', {
            partner_id: partnerId,
            verification_type: verification_type,
            status: status,
            timestamp: new Date()
          });
          
          this.io.to('admin_room').emit('verification_status_changed', {
            partner_id: partnerId,
            verification_type: verification_type,
            status: status,
            updated_by: 'admin',
            timestamp: new Date()
          });
          
          console.log(`✅ Verification updated for partner ${partnerId}: ${verification_type} = ${status}`);
        } catch (error) {
          console.error('❌ Error in partner_verification_updated:', error);
        }
      });

      socket.on('partner_status_changed', async (data) => {
        try {
          const { partner_id, status_type, new_status, reason } = data || {};
          if (!partner_id || !status_type) return;
          
          const partnerId = partner_id.toString();
          
          this.notifyPartner(partnerId, 'partner_status_changed', {
            partner_id: partnerId,
            status_type: status_type,
            new_status: new_status,
            reason: reason || '',
            timestamp: new Date(),
            updated_by: 'admin'
          });
          
          console.log(`🔄 Partner status changed for ${partnerId}: ${status_type} = ${new_status}`);
        } catch (error) {
          console.error('❌ Error in partner_status_changed:', error);
        }
      });

      // ---------------- REQUEST STATUS ----------------
      socket.on('request_status_update', async (data) => {
        try {
          const { id, status, customerId, partnerId } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          let targetCustomerId = customerId ? customerId.toString() : null;
          let targetPartnerId = partnerId ? partnerId.toString() : null;

          const cached = this.requestIndex.get(requestId);
          if (!targetCustomerId && cached?.customerId) targetCustomerId = cached.customerId;
          if (!targetPartnerId && cached?.partnerId) targetPartnerId = cached.partnerId;

          let partnerName = null;
          let partnerPhone = null;

          if (!targetCustomerId || !targetPartnerId || status === 'accepted_by_partner' || status === 'ongoing') {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'assigned_footman_id', 'request_status'],
              include: [
                {
                  association: 'footman',
                  attributes: ['id', 'full_name', 'phone'],
                },
              ],
            });

            if (!targetCustomerId && req?.customer_id) targetCustomerId = req.customer_id.toString();

            if (!targetPartnerId) {
              if (req?.footman?.id) targetPartnerId = req.footman.id.toString();
              else if (req?.assigned_footman_id) targetPartnerId = req.assigned_footman_id.toString();
            }

            if (req?.footman) {
              partnerName = req.footman.full_name || null;
              partnerPhone = req.footman.phone || null;
            }

            this.requestIndex.set(requestId, {
              customerId: targetCustomerId || cached?.customerId || null,
              partnerId: targetPartnerId || cached?.partnerId || null,
            });
          }

          if (!targetCustomerId) {
            console.error(`❌ request_status_update: customer not found for request ${requestId}`);
            return;
          }

          // Update partner status based on request status
          if (targetPartnerId) {
            if (status === 'accepted_by_partner' || status === 'ongoing') {
              // Partner is busy
              const partnerInfo = this.onlineFootmen.get(targetPartnerId);
              if (partnerInfo) {
                partnerInfo.status = 'busy';
                this.onlineFootmen.set(targetPartnerId, partnerInfo);
                
                // Notify nearby customers that partner is now busy
                if (partnerInfo.latitude && partnerInfo.longitude) {
                  this.sendToNearbyCustomers(targetPartnerId, partnerInfo.latitude, partnerInfo.longitude, 'partner_status_changed', {
                    partnerId: targetPartnerId,
                    status: 'busy',
                    timestamp: Date.now()
                  });
                }
              }
            } else if (status === 'completed' || status === 'cancelled') {
              // Partner becomes available again
              const partnerInfo = this.onlineFootmen.get(targetPartnerId);
              if (partnerInfo) {
                partnerInfo.status = 'available';
                this.onlineFootmen.set(targetPartnerId, partnerInfo);
                
                // Notify nearby customers that partner is available again
                if (partnerInfo.latitude && partnerInfo.longitude) {
                  this.sendToNearbyCustomers(targetPartnerId, partnerInfo.latitude, partnerInfo.longitude, 'partner_status_changed', {
                    partnerId: targetPartnerId,
                    status: 'available',
                    timestamp: Date.now()
                  });
                }
              }
            }
          }

          const searchingStates = new Set(['searching', 'searching_after_forward']);
          const shouldClearPartner = searchingStates.has(status);

          const payload = {
            requestId,
            status,
            partnerId: shouldClearPartner ? null : (targetPartnerId || null),
            partnerName: shouldClearPartner ? null : (partnerName || null),
            partnerPhone: shouldClearPartner ? null : (partnerPhone || null),
            timestamp: Date.now(),
          };

          this.notifyCustomer(targetCustomerId, 'request_update', payload);
          this.io.to(`request_${requestId}`).emit('request_update', payload);

          console.log(`📋 Status forwarded: ${status} req=${requestId} -> customer=${targetCustomerId}`);
        } catch (error) {
          console.error('❌ Error in request_status_update:', error);
        }
      });

      // ---------------- TRACKING SETUP ----------------
      socket.on('setup_tracking', async (data) => {
        try {
          const { id, customerId, partnerId } = data || {};
          const requestId = id ? id.toString() : null;

          if (!requestId || !customerId || !partnerId) return;

          const cId = customerId.toString();
          const pId = partnerId.toString();

          this.requestIndex.set(requestId, { customerId: cId, partnerId: pId });

          socket.join(`request_${requestId}`);

          const cConn = this.activeConnections.get(cId);
          const pConn = this.activeConnections.get(pId);

          if (cConn?.socketId && this.io.sockets.sockets.get(cConn.socketId)) {
            this.io.sockets.sockets.get(cConn.socketId).join(`request_${requestId}`);
          }
          if (pConn?.socketId && this.io.sockets.sockets.get(pConn.socketId)) {
            this.io.sockets.sockets.get(pConn.socketId).join(`request_${requestId}`);
          }

          const trackingData = {
            requestId,
            customerId: cId,
            partnerId: pId,
            timestamp: Date.now(),
          };

          this.notifyCustomer(cId, 'tracking_started', trackingData);
          this.notifyPartner(pId, 'tracking_started', trackingData);
          this.io.to(`request_${requestId}`).emit('tracking_started', trackingData);

          console.log(`📍 Tracking started: req=${requestId} customer=${cId} partner=${pId}`);
        } catch (error) {
          console.error('❌ Error in setup_tracking:', error);
        }
      });

      // ---------------- PAYMENT SELECTION ----------------
      socket.on('payment_update', async (data) => {
        try {
          const { id, status, method } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          let cached = this.requestIndex.get(requestId);

          if (!cached?.customerId || !cached?.partnerId) {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'assigned_footman_id'],
            });

            cached = {
              customerId: req?.customer_id ? req.customer_id.toString() : cached?.customerId || null,
              partnerId: req?.assigned_footman_id ? req.assigned_footman_id.toString() : cached?.partnerId || null,
            };
            this.requestIndex.set(requestId, cached);
          }

          const payload = {
            requestId,
            status,
            method,
            timestamp: Date.now(),
          };

          if (status === 'selected') {
            if (cached?.customerId) this.notifyCustomer(cached.customerId, 'payment_selected', payload);
            if (cached?.partnerId) this.notifyPartner(cached.partnerId, 'payment_selected', payload);
            this.io.to(`request_${requestId}`).emit('payment_selected', payload);
            console.log(`💰 Payment selected forwarded: ${method} req=${requestId}`);
          }
        } catch (error) {
          console.error('❌ Error in payment_update:', error);
        }
      });

      // ---------------- PAYMENT CONFIRMATION ----------------
      socket.on('payment_confirmation', async (data) => {
        try {
          const { id, status, method } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          let cached = this.requestIndex.get(requestId);

          if (!cached?.customerId || !cached?.partnerId) {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'assigned_footman_id'],
            });

            cached = {
              customerId: req?.customer_id ? req.customer_id.toString() : cached?.customerId || null,
              partnerId: req?.assigned_footman_id ? req.assigned_footman_id.toString() : cached?.partnerId || null,
            };
            this.requestIndex.set(requestId, cached);
          }

          const payload = {
            requestId,
            status,
            method,
            timestamp: Date.now(),
          };

          if (cached?.customerId) this.notifyCustomer(cached.customerId, 'payment_status', payload);
          if (cached?.partnerId) this.notifyPartner(cached.partnerId, 'payment_status', payload);

          this.io.to(`request_${requestId}`).emit('payment_status', payload);

          console.log(`✅ Payment confirmation forwarded req=${requestId} status=${status}`);
        } catch (error) {
          console.error('❌ Error in payment_confirmation:', error);
        }
      });

      // ---------------- DISCONNECT ----------------
      socket.on('disconnect', () => {
        const info = this.socketIndex.get(socket.id);
        if (info) {
          const { userId, userType } = info;
          
          // If partner disconnects, remove from online footmen and notify nearby customers
          if (userType === 'partner') {
            const partnerInfo = this.onlineFootmen.get(userId);
            if (partnerInfo && partnerInfo.latitude && partnerInfo.longitude) {
              this.sendToNearbyCustomers(userId, partnerInfo.latitude, partnerInfo.longitude, 'footman_offline', {
                partnerId: userId,
                timestamp: Date.now()
              });
            }
            this.onlineFootmen.delete(userId);
          }
          
          this.socketIndex.delete(socket.id);
          this.activeConnections.delete(userId);
          console.log(`🔌 ${userType.toUpperCase()} ${userId} disconnected from socket ${socket.id}`);
        } else {
          console.log(`🔌 Unknown socket disconnected: ${socket.id}`);
        }
      });
    });

    // Create a room for all customers (for broadcasting to all)
    this.io.on('connection', (socket) => {
      socket.on('authenticate', (data) => {
        if (data?.userType === 'customer') {
          socket.join('customers');
        }
      });
    });
  }

  // Calculate distance between two coordinates in KM using Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  // Send message to all customers within 1KM of a partner
  sendToNearbyCustomers(partnerId, partnerLat, partnerLng, event, data) {
    const customers = [];
    
    // Find all customers within 1KM
    this.activeConnections.forEach((conn, userId) => {
      if (conn.userType === 'customer' && conn.latitude && conn.longitude) {
        const distance = this.calculateDistance(
          partnerLat, partnerLng,
          conn.latitude, conn.longitude
        );
        
        if (distance <= 1.0) { // Within 1KM
          customers.push(userId);
          this.notifyCustomer(userId, event, data);
        }
      }
    });
    
    if (customers.length > 0) {
      console.log(`📢 ${event} sent to ${customers.length} nearby customers from partner ${partnerId}`);
    }
  }

  // Send list of nearby footmen to a customer (within 1KM)
  sendNearbyFootmenToCustomer(socket, customerLat, customerLng) {
    const nearbyFootmen = [];
    
    this.onlineFootmen.forEach((data, partnerId) => {
      const distance = this.calculateDistance(
        customerLat, customerLng,
        data.latitude, data.longitude
      );
      
      if (distance <= 1.0) { // Within 1KM
        nearbyFootmen.push({
          id: partnerId,
          latitude: data.latitude,
          longitude: data.longitude,
          bearing: data.bearing || 0,
          status: data.status || 'available'
        });
      }
    });

    console.log(`📋 Sending ${nearbyFootmen.length} nearby footmen to customer`);

    socket.emit('initial_footmen', {
      footmen: nearbyFootmen,
      timestamp: Date.now()
    });
  }

  // Send list of nearby footmen to a customer by ID
  sendNearbyFootmenToCustomerById(customerId, customerLat, customerLng) {
    const nearbyFootmen = [];
    
    this.onlineFootmen.forEach((data, partnerId) => {
      const distance = this.calculateDistance(
        customerLat, customerLng,
        data.latitude, data.longitude
      );
      
      if (distance <= 1.0) { // Within 1KM
        nearbyFootmen.push({
          id: partnerId,
          latitude: data.latitude,
          longitude: data.longitude,
          bearing: data.bearing || 0,
          status: data.status || 'available'
        });
      }
    });

    console.log(`📋 Updating customer ${customerId} with ${nearbyFootmen.length} nearby footmen`);

    this.notifyCustomer(customerId, 'nearby_footmen_update', {
      footmen: nearbyFootmen,
      timestamp: Date.now()
    });
  }

  // When customer reconnects, push active request states
  async sendPendingUpdatesToCustomer(customerId, socket) {
    try {
      const activeRequests = await Request.findAll({
        where: {
          customer_id: customerId,
          request_status: ['accepted_by_partner', 'ongoing'],
        },
        include: [
          {
            association: 'footman',
            attributes: ['id', 'full_name', 'phone'],
          },
        ],
      });

      for (const req of activeRequests) {
        const requestId = req.id.toString();
        const cId = req.customer_id ? req.customer_id.toString() : customerId.toString();
        const pId = req.footman?.id
          ? req.footman.id.toString()
          : (req.assigned_footman_id ? req.assigned_footman_id.toString() : null);

        this.requestIndex.set(requestId, { customerId: cId, partnerId: pId });

        socket.emit('request_update', {
          requestId,
          status: req.request_status,
          partnerId: req.footman?.id ? req.footman.id.toString() : (pId || null),
          partnerName: req.footman?.full_name || null,
          partnerPhone: req.footman?.phone || null,
          timestamp: Date.now(),
        });

        console.log(`🔄 Pending update sent: req=${requestId} -> customer=${customerId}`);
      }
    } catch (error) {
      console.error('❌ Error sending pending updates:', error);
    }
  }

  // Helper method to notify customer
  notifyCustomer(userId, event, data) {
    if (!this.io) return false;
    const uid = userId.toString();
    this.io.to(`customer_${uid}`).emit(event, data);
    return true;
  }

  // Helper method to notify partner
  notifyPartner(userId, event, data) {
    if (!this.io) return false;
    const uid = userId.toString();
    this.io.to(`partner_${uid}`).emit(event, data);
    return true;
  }

  // Helper method to emit to all admins
  emitToAdmins(event, data) {
    if (!this.io) return false;
    this.io.to('admin_room').emit(event, data);
    return true;
  }

  // Helper method to emit to specific partner
  emitToPartner(partnerId, event, data) {
    return this.notifyPartner(partnerId, event, data);
  }
}

module.exports = new SocketService();
