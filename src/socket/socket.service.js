const { Server } = require('socket.io');

class SocketService {
  constructor() {
    this.io = null;
    this.activeConnections = new Map(); // userId -> socketId
    this.partnerRooms = new Map(); // partnerId -> roomName
    this.customerRooms = new Map(); // customerId -> roomName
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*", // In production, replace with your app URLs
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'] // Fallback to polling if websocket fails
    });

    this.setupEventHandlers();
    console.log('✅ Socket.io server initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // ==================== AUTHENTICATION ====================
      socket.on('authenticate', (data) => {
        try {
          const { userId, userType, token } = data;
          
          if (!userId || !userType) {
            socket.emit('auth_error', { message: 'Missing user data' });
            return;
          }

          // Store connection
          this.activeConnections.set(userId, socket.id);
          
          // Join user-specific room for private messages
          const userRoom = `${userType}_${userId}`;
          socket.join(userRoom);
          
          // Store room mapping
          if (userType === 'partner') {
            this.partnerRooms.set(userId, userRoom);
            console.log(`🟢 Partner ${userId} connected to room ${userRoom}`);
          } else if (userType === 'customer') {
            this.customerRooms.set(userId, userRoom);
            console.log(`🔵 Customer ${userId} connected to room ${userRoom}`);
          }

          socket.emit('authenticated', { 
            success: true, 
            message: 'Authentication successful',
            socketId: socket.id 
          });

        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // ==================== PARTNER LOCATION UPDATES ====================
      socket.on('partner_location_update', (data) => {
        try {
          const { partnerId, latitude, longitude, bearing, speed, requestId } = data;
          
          if (!partnerId || !latitude || !longitude) {
            console.log('Invalid location data');
            return;
          }

          console.log(`📍 Partner ${partnerId} location: ${latitude}, ${longitude}`);
          
          // Broadcast to all customers tracking this partner
          // In real scenario, only broadcast to customers with active request
          socket.broadcast.emit('partner_location', {
            partnerId,
            latitude,
            longitude,
            bearing,
            speed,
            requestId,
            timestamp: Date.now()
          });

        } catch (error) {
          console.error('Location update error:', error);
        }
      });

      // ==================== REQUEST UPDATES ====================
      socket.on('request_status_update', (data) => {
        try {
          const { requestId, status, customerId, partnerId, message } = data;
          
          console.log(`📋 Request ${requestId} status: ${status}`);
          
          // Notify customer about request status change
          if (customerId && this.customerRooms.has(customerId)) {
            const customerRoom = this.customerRooms.get(customerId);
            this.io.to(customerRoom).emit('request_update', {
              requestId,
              status,
              message,
              partnerId,
              timestamp: Date.now()
            });
          }

          // Notify partner if needed
          if (partnerId && this.partnerRooms.has(partnerId)) {
            const partnerRoom = this.partnerRooms.get(partnerId);
            this.io.to(partnerRoom).emit('request_update', {
              requestId,
              status,
              message,
              customerId,
              timestamp: Date.now()
            });
          }

        } catch (error) {
          console.error('Request update error:', error);
        }
      });

      // ==================== PAYMENT UPDATES ====================
      socket.on('payment_update', (data) => {
        try {
          const { requestId, status, customerId, partnerId, amount, method } = data;
          
          console.log(`💰 Payment update for request ${requestId}: ${status}`);
          
          // Notify both customer and partner
          if (customerId && this.customerRooms.has(customerId)) {
            const customerRoom = this.customerRooms.get(customerId);
            this.io.to(customerRoom).emit('payment_status', {
              requestId,
              status,
              amount,
              method,
              timestamp: Date.now()
            });
          }

          if (partnerId && this.partnerRooms.has(partnerId)) {
            const partnerRoom = this.partnerRooms.get(partnerId);
            this.io.to(partnerRoom).emit('payment_status', {
              requestId,
              status,
              amount,
              method,
              timestamp: Date.now()
            });
          }

        } catch (error) {
          console.error('Payment update error:', error);
        }
      });

      // ==================== DISCONNECTION ====================
      socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
        
        // Remove from active connections
        for (const [userId, socketId] of this.activeConnections.entries()) {
          if (socketId === socket.id) {
            this.activeConnections.delete(userId);
            
            // Remove from room mappings
            if (this.partnerRooms.has(userId)) {
              this.partnerRooms.delete(userId);
              console.log(`🔴 Partner ${userId} disconnected`);
            } else if (this.customerRooms.has(userId)) {
              this.customerRooms.delete(userId);
              console.log(`🔵 Customer ${userId} disconnected`);
            }
            
            break;
          }
        }
      });

      // ==================== ERROR HANDLING ====================
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });
  }

  // ==================== UTILITY METHODS ====================
  
  // Send notification to specific customer
  notifyCustomer(customerId, event, data) {
    if (this.customerRooms.has(customerId)) {
      const room = this.customerRooms.get(customerId);
      this.io.to(room).emit(event, data);
      return true;
    }
    return false;
  }

  // Send notification to specific partner
  notifyPartner(partnerId, event, data) {
    if (this.partnerRooms.has(partnerId)) {
      const room = this.partnerRooms.get(partnerId);
      this.io.to(room).emit(event, data);
      return true;
    }
    return false;
  }

  // Broadcast to all partners
  broadcastToPartners(event, data) {
    this.io.emit(`partners_${event}`, data);
  }

  // Broadcast to all customers
  broadcastToCustomers(event, data) {
    this.io.emit(`customers_${event}`, data);
  }

  // Get online partners count
  getOnlinePartnersCount() {
    return this.partnerRooms.size;
  }

  // Get online customers count
  getOnlineCustomersCount() {
    return this.customerRooms.size;
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.activeConnections.has(userId);
  }
}

module.exports = new SocketService();
