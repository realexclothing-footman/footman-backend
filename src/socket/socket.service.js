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
    // (keeps routing fast; DB is still used as fallback)
    this.requestIndex = new Map();
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      // WebSocket only (no HTTP polling)
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

          // personal room
          socket.join(`${userType}_${uid}`);

          socket.emit('authenticated', { success: true });
          console.log(`✅ ${userType.toUpperCase()} ${uid} connected`);

          // if customer reconnects, push pending updates
          if (userType === 'customer') {
            await this.sendPendingUpdatesToCustomer(uid, socket);
          }
        } catch (err) {
          console.error('❌ Socket authenticate error:', err);
        }
      });

      // ---------------- REQUEST STATUS ----------------
      // partner emits: { id, status, customerId? }
      socket.on('request_status_update', async (data) => {
        try {
          const { id, status, customerId } = data || {};
          if (!id || !status) return;

          const requestId = id.toString();

          // Resolve customerId (prefer payload -> cache -> DB)
          let targetCustomerId = customerId ? customerId.toString() : null;

          const cached = this.requestIndex.get(requestId);
          if (!targetCustomerId && cached?.customerId) targetCustomerId = cached.customerId;

          if (!targetCustomerId) {
            const req = await Request.findOne({
              where: { id: requestId },
              attributes: ['customer_id', 'footman_id'],
            });

            if (req?.customer_id) targetCustomerId = req.customer_id.toString();

            // keep cache warm
            this.requestIndex.set(requestId, {
              customerId: req?.customer_id ? req.customer_id.toString() : cached?.customerId || null,
              partnerId: req?.footman_id ? req.footman_id.toString() : cached?.partnerId || null,
            });
          }

          if (!targetCustomerId) {
            console.error(`❌ request_status_update: customer not found for request ${requestId}`);
            return;
          }

          const payload = {
            requestId,
            status,
            timestamp: Date.now(),
          };

          // customer app listens: 'request_update'
          this.notifyCustomer(targetCustomerId, 'request_update', payload);

          // also send into request room if joined
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

          // cache routing for this request
          this.requestIndex.set(requestId, { customerId: cId, partnerId: pId });

          // join sender socket to request room
          socket.join(`request_${requestId}`);

          // if other side is connected, force-join them too
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

          // both apps listen: 'tracking_started'
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

          // If request room exists, broadcast there (fast + no DB)
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

            // customer app listens: 'partner_location'
            this.io.to(`request_${requestId}`).emit('partner_location', locationData);

            // also direct-to-customer if we know them
            const cached = this.requestIndex.get(requestId);
            if (cached?.customerId) {
              this.notifyCustomer(cached.customerId, 'partner_location', locationData);
            } else {
              // fallback DB once to warm cache
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

          // resolve both sides
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

          // customer listens: 'payment_status'
          if (cached?.customerId) this.notifyCustomer(cached.customerId, 'payment_status', payload);

          // partner also listens: 'payment_status' (your partner app uses this too)
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
        // warm cache for routing + tracking
        const requestId = req.id.toString();
        const cId = req.customer_id ? req.customer_id.toString() : customerId.toString();
        const pId = req.footman?.id ? req.footman.id.toString() : (req.footman_id ? req.footman_id.toString() : null);

        this.requestIndex.set(requestId, { customerId: cId, partnerId: pId });

        socket.emit('request_update', {
          requestId,
          status: req.request_status,
          partnerId: req.footman?.id,
          partnerName: req.footman?.full_name,
          timestamp: Date.now(),
        });

        console.log(`🔄 Pending update sent: req=${requestId} -> customer=${customerId}`);
      }
    } catch (error) {
      console.error('❌ Error sending pending updates:', error);
    }
  }

  // ---- targeted emits ----
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
