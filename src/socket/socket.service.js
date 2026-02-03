const { Server } = require('socket.io');
const Request = require('../models/Request');

class SocketService {
  constructor() {
    this.io = null;

    // userId -> { socketId, userType }
    this.activeConnections = new Map();

    // socketId -> { userId, userType }
    this.socketIndex = new Map();

    // requestId -> { customerId, partnerId }
    this.requestIndex = new Map();
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
      // ---------------- AUTH ----------------
      socket.on('authenticate', async (data) => {
        try {
          const { userId, userType } = data || {};
          if (!userId || !userType) return;

          const uid = userId.toString();

          this.activeConnections.set(uid, { socketId: socket.id, userType });
          this.socketIndex.set(socket.id, { userId: uid, userType });

          socket.join(`${userType}_${uid}`);

          socket.emit('authenticated', { success: true });
          console.log(`✅ ${userType.toUpperCase()} ${uid} connected`);

          if (userType === 'customer') {
            await this.sendPendingUpdatesToCustomer(uid, socket);
          }
        } catch (err) {
          console.error('❌ Socket authenticate error:', err);
        }
      });

      // ---------------- REQUEST STATUS ----------------
      // partner emits: { id, status, customerId?, partnerId? }
      socket.on('request_status_update', async (data) => {
        try {
          const { id, status, customerId, partnerId } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          // Resolve customerId (payload -> cache -> DB)
          let targetCustomerId = customerId ? customerId.toString() : null;

          const cached = this.requestIndex.get(requestId);
          if (!targetCustomerId && cached?.customerId) targetCustomerId = cached.customerId;

          // Resolve partnerId (payload -> cache -> DB)
          let targetPartnerId = partnerId ? partnerId.toString() : null;
          if (!targetPartnerId && cached?.partnerId) targetPartnerId = cached.partnerId;

          // Pull DB once (also to get partner name/phone for instant UI)
          let partnerName = null;
          let partnerPhone = null;

          if (!targetCustomerId || !targetPartnerId || status === 'accepted_by_partner' || status === 'ongoing') {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'footman_id', 'request_status'],
              include: [
                {
                  association: 'footman',
                  attributes: ['id', 'full_name', 'phone'],
                },
              ],
            });

            if (!targetCustomerId && req?.customer_id) targetCustomerId = req.customer_id.toString();

            // partner id from include OR footman_id
            if (!targetPartnerId) {
              if (req?.footman?.id) targetPartnerId = req.footman.id.toString();
              else if (req?.footman_id) targetPartnerId = req.footman_id.toString();
            }

            // name/phone (only if available)
            if (req?.footman) {
              partnerName = req.footman.full_name || null;
              partnerPhone = req.footman.phone || null;
            }

            // warm cache
            this.requestIndex.set(requestId, {
              customerId: targetCustomerId || cached?.customerId || null,
              partnerId: targetPartnerId || cached?.partnerId || null,
            });
          }

          if (!targetCustomerId) {
            console.error(`❌ request_status_update: customer not found for request ${requestId}`);
            return;
          }

          // For searching states, we intentionally clear partner info
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

          // customer app listens: 'request_update'
          this.notifyCustomer(targetCustomerId, 'request_update', payload);

          // request room (if joined)
          this.io.to(`request_${requestId}`).emit('request_update', payload);

          console.log(`📋 Status forwarded: ${status} req=${requestId} -> customer=${targetCustomerId}`);
        } catch (error) {
          console.error('❌ Error in request_status_update:', error);
        }
      });

      // ---------------- TRACKING SETUP ----------------
      // customer or partner emits: { id, customerId, partnerId }
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

      // ---------------- PARTNER LOCATION ----------------
      // partner emits: { partnerId, latitude, longitude, bearing, speed, id: requestId }
      socket.on('partner_location_update', async (data) => {
        try {
          const { partnerId, latitude, longitude, bearing, speed, id } = data || {};
          if (!partnerId || latitude == null || longitude == null) return;

          const pId = partnerId.toString();
          const requestId = id ? id.toString() : null;

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
                attributes: ['customer_id', 'footman_id'],
              });
              if (req?.customer_id) {
                const cId = req.customer_id.toString();
                this.requestIndex.set(requestId, {
                  customerId: cId,
                  partnerId: req?.footman_id ? req.footman_id.toString() : pId,
                });
                this.notifyCustomer(cId, 'partner_location', locationData);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error in partner_location_update:', error);
        }
      });

      // ---------------- PAYMENT SELECTION ----------------
      // customer emits: { id: requestId, status:'selected', method:'cash|bkash|nagad' }
      socket.on('payment_update', async (data) => {
        try {
          const { id, status, method } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          let cached = this.requestIndex.get(requestId);

          if (!cached?.customerId || !cached?.partnerId) {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'footman_id'],
            });

            cached = {
              customerId: req?.customer_id ? req.customer_id.toString() : cached?.customerId || null,
              partnerId: req?.footman_id ? req.footman_id.toString() : cached?.partnerId || null,
            };
            this.requestIndex.set(requestId, cached);
          }

          const payload = {
            requestId,
            status,
            method,
            timestamp: Date.now(),
          };

          // both apps listen: 'payment_selected'
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
      // partner emits: { id: requestId, status:'confirmed', method, amount }
      socket.on('payment_confirmation', async (data) => {
        try {
          const { id, status, method } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          let cached = this.requestIndex.get(requestId);

          if (!cached?.customerId || !cached?.partnerId) {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'footman_id'],
            });

            cached = {
              customerId: req?.customer_id ? req.customer_id.toString() : cached?.customerId || null,
              partnerId: req?.footman_id ? req.footman_id.toString() : cached?.partnerId || null,
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
          this.socketIndex.delete(socket.id);
          this.activeConnections.delete(userId);
          console.log(`🔌 ${userType.toUpperCase()} ${userId} disconnected`);
        }
      });
    });
  }

  // When customer reconnects, push active request states (no polling needed)
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
          : (req.footman_id ? req.footman_id.toString() : null);

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

  notifyCustomer(userId, event, data) {
    if (!this.io) return false;
    const uid = userId.toString();
    this.io.to(`customer_${uid}`).emit(event, data);
    return true;
  }

  notifyPartner(userId, event, data) {
    if (!this.io) return false;
    const uid = userId.toString();
    this.io.to(`partner_${uid}`).emit(event, data);
    return true;
  }
}

module.exports = new SocketService();
