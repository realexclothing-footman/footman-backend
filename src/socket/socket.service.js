const { Server } = require('socket.io');

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
      transports: ['websocket'] // PURE WEBSOCKET ONLY. NO POLLING.
    });

    this.setupEventHandlers();
    console.log('✅ Pure WebSocket Server Initialized (Polling Disabled)');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      
      socket.on('authenticate', (data) => {
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
          console.log(`✅ ${userType.toUpperCase()} ${uid} connected via WebSocket`);
        } catch (err) {
          console.error('Socket Auth Error:', err);
        }
      });

      socket.on('request_status_update', (data) => {
        const { requestId, status, customerId } = data;
        if (!requestId || !status) return;

        // "APPLE TO APPLE" FIX: Sending 'id' to match Mobile App
        const payload = {
          id: requestId,
          status,
          timestamp: Date.now()
        };

        if (customerId) {
          this.notifyCustomer(customerId, 'request_update', payload);
        }
      });

      socket.on('disconnect', () => {
        for (const [userId, conn] of this.activeConnections.entries()) {
          if (conn.socketId === socket.id) {
            this.activeConnections.delete(userId);
            break;
          }
        }
      });
    });
  }

  // CONTROLLER HELPERS (Fixes the TypeError)
  notifyUser(userId, event, data) {
    const uid = userId.toString();
    const conn = this.activeConnections.get(uid);
    if (conn) {
      this.io.to(`${conn.userType}_${uid}`).emit(event, data);
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
