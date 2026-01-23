const { Server } = require('socket.io');

class SocketService {
  constructor() {
    this.io = null;
    this.activeConnections = new Map(); // userId -> {socketId, userType, rooms}
    this.trackingSessions = new Map(); // requestId -> {customerId, partnerId, partnerPositions[]}
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket'],
      pingInterval: 25000,
      pingTimeout: 20000
    });

    this.setupEventHandlers();
    console.log('✅ Smart Socket.io server initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 New connection: ${socket.id}`);

      // ==================== AUTHENTICATION ====================
      socket.on('authenticate', (data) => {
        try {
          const { userId, userType } = data;
          
          if (!userId || !userType) {
            socket.emit('auth_error', { message: 'Missing user data' });
            return;
          }

          // Store connection
          this.activeConnections.set(userId, {
            socketId: socket.id,
            userType: userType,
            rooms: new Set()
          });

          // Join user-specific room
          const userRoom = `${userType}_${userId}`;
          socket.join(userRoom);
          this.activeConnections.get(userId).rooms.add(userRoom);

          socket.emit('authenticated', { 
            success: true, 
            socketId: socket.id,
            userId: userId
          });

          console.log(`✅ ${userType.toUpperCase()} ${userId} authenticated`);

        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // ==================== SMART PARTNER LOCATION UPDATES ====================
      socket.on('partner_location_update', (data) {
        try {
          const { partnerId, latitude, longitude, bearing, speed, requestId, timestamp } = data;
          
          if (!partnerId || !latitude || !longitude) {
            return;
          }

          const locationData = {
            partnerId,
            latitude,
            longitude,
            bearing: bearing || 0,
            speed: speed || 0,
            requestId,
            timestamp: timestamp || Date.now()
          };

          // Store tracking session if requestId exists
          if (requestId) {
            if (!this.trackingSessions.has(requestId)) {
              this.trackingSessions.set(requestId, {
                customerId: null,
                partnerId: partnerId,
                partnerPositions: []
              });
            }
            
            const session = this.trackingSessions.get(requestId);
            session.partnerPositions.push(locationData);
            
            // Keep only last 100 positions for trail
            if (session.partnerPositions.length > 100) {
              session.partnerPositions.shift();
            }
            
            // Send to customer if exists
            if (session.customerId && this.activeConnections.has(session.customerId)) {
              const customerConn = this.activeConnections.get(session.customerId);
              this.io.to(`${customerConn.userType}_${session.customerId}`).emit('partner_location', locationData);
              
              // Also send the trail for smooth rendering
              if (session.partnerPositions.length > 1) {
                this.io.to(`${customerConn.userType}_${session.customerId}`).emit('partner_trail', {
                  requestId,
                  positions: session.partnerPositions
                });
              }
            }
          } else {
            // Partner is online but not on a job - send to all customers in range
            socket.broadcast.emit('available_partner_location', locationData);
          }

        } catch (error) {
          console.error('Location update error:', error);
        }
      });

      // ==================== REQUEST TRACKING SETUP ====================
      socket.on('setup_tracking', (data) => {
        try {
          const { requestId, customerId, partnerId } = data;
          
          if (!requestId || !customerId || !partnerId) {
            return;
          }

          console.log(`📱 Setting up tracking for request ${requestId}: customer ${customerId}, partner ${partnerId}`);

          // Create or update tracking session
          this.trackingSessions.set(requestId, {
            customerId,
            partnerId,
            partnerPositions: [],
            startedAt: Date.now()
          });

          // Notify both parties
          if (this.activeConnections.has(customerId)) {
            const customerConn = this.activeConnections.get(customerId);
            this.io.to(`${customerConn.userType}_${customerId}`).emit('tracking_started', {
              requestId,
              partnerId
            });
          }

          if (this.activeConnections.has(partnerId)) {
            const partnerConn = this.activeConnections.get(partnerId);
            this.io.to(`${partnerConn.userType}_${partnerId}`).emit('tracking_started', {
              requestId,
              customerId
            });
          }

        } catch (error) {
          console.error('Tracking setup error:', error);
        }
      });

      // ==================== REQUEST UPDATES ====================
      socket.on('request_status_update', (data) => {
        try {
          const { requestId, status, customerId, partnerId, message } = data;
          
          console.log(`📋 Request ${requestId} status: ${status}`);
          
          // Update tracking session if job starts
          if (status === 'ongoing' && requestId) {
            if (this.trackingSessions.has(requestId)) {
              this.trackingSessions.get(requestId).startedAt = Date.now();
            } else {
              this.trackingSessions.set(requestId, {
                customerId,
                partnerId,
                partnerPositions: [],
                startedAt: Date.now()
              });
            }
          }

          // Notify customer
          if (customerId && this.activeConnections.has(customerId)) {
            const customerConn = this.activeConnections.get(customerId);
            this.io.to(`${customerConn.userType}_${customerId}`).emit('request_update', {
              requestId,
              status,
              message,
              partnerId,
              timestamp: Date.now()
            });
          }

          // Notify partner
          if (partnerId && this.activeConnections.has(partnerId)) {
            const partnerConn = this.activeConnections.get(partnerId);
            this.io.to(`${partnerConn.userType}_${partnerId}`).emit('request_update', {
              requestId,
              status,
              message,
              customerId,
              timestamp: Date.now()
            });
          }

          // Clean up if job completed
          if (status === 'completed' && requestId) {
            this.trackingSessions.delete(requestId);
          }

        } catch (error) {
          console.error('Request update error:', error);
        }
      });

      // ==================== GET TRACKING DATA ====================
      socket.on('get_tracking_data', (data) => {
        try {
          const { requestId } = data;
          
          if (!requestId) {
            socket.emit('tracking_data_error', { message: 'Missing requestId' });
            return;
          }

          const session = this.trackingSessions.get(requestId);
          if (!session) {
            socket.emit('tracking_data', { requestId, positions: [] });
            return;
          }

          socket.emit('tracking_data', {
            requestId,
            positions: session.partnerPositions,
            startedAt: session.startedAt
          });

        } catch (error) {
          console.error('Get tracking data error:', error);
          socket.emit('tracking_data_error', { message: 'Failed to get tracking data' });
        }
      });

      // ==================== DISCONNECTION ====================
      socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
        
        // Find user by socketId and clean up
        for (const [userId, conn] of this.activeConnections.entries()) {
          if (conn.socketId === socket.id) {
            this.activeConnections.delete(userId);
            console.log(`🔴 ${conn.userType.toUpperCase()} ${userId} disconnected`);
            
            // Clean up any tracking sessions
            for (const [requestId, session] of this.trackingSessions.entries()) {
              if (session.partnerId === userId || session.customerId === userId) {
                this.trackingSessions.delete(requestId);
                console.log(`🧹 Cleared tracking session ${requestId}`);
              }
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
  
  // Join tracking room
  joinTrackingRoom(socket, requestId) {
    if (!requestId) return false;
    
    const roomName = `tracking_${requestId}`;
    socket.join(roomName);
    
    const userId = this.getUserIdBySocketId(socket.id);
    if (userId && this.activeConnections.has(userId)) {
      this.activeConnections.get(userId).rooms.add(roomName);
    }
    
    return true;
  }

  // Leave tracking room
  leaveTrackingRoom(socket, requestId) {
    if (!requestId) return false;
    
    const roomName = `tracking_${requestId}`;
    socket.leave(roomName);
    
    const userId = this.getUserIdBySocketId(socket.id);
    if (userId && this.activeConnections.has(userId)) {
      this.activeConnections.get(userId).rooms.delete(roomName);
    }
    
    return true;
  }

  // Get user ID by socket ID
  getUserIdBySocketId(socketId) {
    for (const [userId, conn] of this.activeConnections.entries()) {
      if (conn.socketId === socketId) {
        return userId;
      }
    }
    return null;
  }

  // Send notification to specific user
  notifyUser(userId, event, data) {
    if (this.activeConnections.has(userId)) {
      const conn = this.activeConnections.get(userId);
      this.io.to(`${conn.userType}_${userId}`).emit(event, data);
      return true;
    }
    return false;
  }

  // FIXED: Add notifyCustomer function (request.controller.js calls this)
  notifyCustomer(userId, event, data) {
    return this.notifyUser(userId, event, data);
  }

  // FIXED: Add notifyPartner function (request.controller.js calls this)
  notifyPartner(userId, event, data) {
    return this.notifyUser(userId, event, data);
  }

  // Broadcast to all users of specific type
  broadcastToUserType(userType, event, data) {
    for (const [userId, conn] of this.activeConnections.entries()) {
      if (conn.userType === userType) {
        this.io.to(`${userType}_${userId}`).emit(event, data);
      }
    }
  }

  // Get online partners
  getOnlinePartners() {
    const partners = [];
    for (const [userId, conn] of this.activeConnections.entries()) {
      if (conn.userType === 'partner') {
        partners.push(userId);
      }
    }
    return partners;
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.activeConnections.has(userId);
  }

  // Get active tracking sessions
  getActiveTrackingSessions() {
    return Array.from(this.trackingSessions.entries());
  }
}

module.exports = new SocketService();
