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
      transports: ['websocket']
    });

    this.setupEventHandlers();
    console.log('✅ Real-time System Initialized (Standardized on ID)');
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
          console.log(`✅ ${userType.toUpperCase()} ${uid} connected`);
        } catch (err) {
          console.error('Socket Auth Error:', err);
        }
      });

      socket.on('request_status_update', (data) => {
        const { id, status, customerId } = data;
        if (!id || !status) return;

        const payload = {
          id: id,
          status: status,
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

  notifyUser(userId, event, data) {
    if (this.io) {
      const uid = userId.toString();
      // Broadly emit to the room created during auth
      this.io.to(`customer_${uid}`).to(`delivery_${uid}`).emit(event, data);
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
