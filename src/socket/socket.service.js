const { Server } = require('socket.io');

class SocketService {
  constructor() {
    this.io = null;
    this.activeConnections = new Map();
    this.trackingSessions = new Map();
    this.partnerThrottle = new Map();
    this.backgroundPartners = new Map();
    
    this.THROTTLE_INTERVAL = 3000;
    this.BACKGROUND_PING_INTERVAL = 30000;
    this.POSITION_HISTORY_LIMIT = 500;
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingInterval: 25000,
      pingTimeout: 60000,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true
      }
    });

    this.setupEventHandlers();
    this.startCleanupInterval();
    console.log('✅ Enhanced Real-time Socket.io server initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 New connection: ${socket.id}`);

      socket.on('authenticate', (data) => {
        try {
          const { userId, userType, deviceId, appVersion } = data;
          if (!userId || !userType) {
            socket.emit('auth_error', { message: 'Missing user data' });
            return;
          }

          this.activeConnections.set(userId, {
            socketId: socket.id,
            userType: userType,
            rooms: new Set(),
            deviceId: deviceId || 'unknown',
            appVersion: appVersion || '1.0',
            lastPing: Date.now(),
            connectionTime: Date.now(),
            isBackground: false
          });

          const userRoom = `${userType}_${userId}`;
          socket.join(userRoom);
          this.activeConnections.get(userId).rooms.add(userRoom);
          socket.join(`${userType}s_online`);

          socket.emit('authenticated', { 
            success: true, 
            socketId: socket.id,
            userId: userId,
            serverTime: Date.now(),
            throttleInterval: this.THROTTLE_INTERVAL
          });

          console.log(`✅ ${userType.toUpperCase()} ${userId} authenticated`);
          this.sendPendingUpdates(userId, socket);
        } catch (error) {
          console.error('Authentication error:', error);
        }
      });

      socket.on('request_status_update', (data) => {
        try {
          const { requestId, status, message, customerId } = data;
          if (!requestId || !status) return;

          console.log(`📋 Status Update: ID ${requestId} -> ${status}`);

          const payload = {
            id: requestId, // FIXED: Now sending 'id' to match Mobile App
            status,
            message,
            timestamp: Date.now()
          };

          if (customerId && this.activeConnections.has(customerId)) {
            const customerConn = this.activeConnections.get(customerId);
            this.io.to(`${customerConn.userType}_${customerId}`).emit('request_update', payload);
          }

          const trackingRoom = `tracking_${requestId}`;
          if (this.io.sockets.adapter.rooms.has(trackingRoom)) {
            this.io.to(trackingRoom).emit('request_update', payload);
          }
        } catch (error) {
          console.error('Request status update error:', error);
        }
      });

      socket.on('disconnect', (reason) => {
        for (const [userId, conn] of this.activeConnections.entries()) {
          if (conn.socketId === socket.id) {
            conn.socketId = null;
            conn.lastPing = Date.now();
            console.log(`🔴 ${conn.userType} ${userId} disconnected`);
            break;
          }
        }
      });
    });
  }

  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [userId, conn] of this.activeConnections.entries()) {
        if (now - conn.lastPing > 300000) {
          this.activeConnections.delete(userId);
        }
      }
    }, 60000);
  }

  sendPendingUpdates(userId, socket) {}
  notifyUser(userId, event, data) {
    if (this.activeConnections.has(userId)) {
      const conn = this.activeConnections.get(userId);
      this.io.to(`${conn.userType}_${userId}`).emit(event, data);
      return true;
    }
    return false;
  }
}

module.exports = new SocketService();
