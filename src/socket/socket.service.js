const { Server } = require('socket.io');

class SocketService {
  constructor() {
    this.io = null;
    this.activeConnections = new Map(); // userId -> {socketId, userType, rooms, lastPing}
    this.trackingSessions = new Map(); // requestId -> {customerId, partnerId, partnerPositions[], lastUpdate}
    this.partnerThrottle = new Map(); // partnerId -> lastSentTime
    this.backgroundPartners = new Map(); // partnerId -> {lastLocation, appState}
    
    // Constants
    this.THROTTLE_INTERVAL = 3000; // 3 seconds for GPS updates
    this.BACKGROUND_PING_INTERVAL = 30000; // 30 seconds for background keepalive
    this.POSITION_HISTORY_LIMIT = 500; // Store up to 500 positions for smooth trail
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'], // Support both for reliability
      pingInterval: 25000,
      pingTimeout: 60000, // Longer timeout for background
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes recovery
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

      // ==================== ENHANCED AUTHENTICATION ====================
      socket.on('authenticate', (data) => {
        try {
          const { userId, userType, deviceId, appVersion } = data;
          
          if (!userId || !userType) {
            socket.emit('auth_error', { message: 'Missing user data' });
            return;
          }

          // Store enhanced connection info
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

          // Join user-specific room
          const userRoom = `${userType}_${userId}`;
          socket.join(userRoom);
          this.activeConnections.get(userId).rooms.add(userRoom);

          // Join global room for broadcasts
          socket.join(`${userType}s_online`);

          socket.emit('authenticated', { 
            success: true, 
            socketId: socket.id,
            userId: userId,
            serverTime: Date.now(),
            throttleInterval: this.THROTTLE_INTERVAL
          });

          console.log(`✅ ${userType.toUpperCase()} ${userId} authenticated (${deviceId || 'no-device'})`);

          // Send any pending location updates if reconnecting
          this.sendPendingUpdates(userId, socket);

        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // ==================== REQUEST STATUS UPDATES ====================
      socket.on('request_status_update', (data) => {
        try {
          const { requestId, status, message, customerId } = data;
          
          if (!requestId || !status) {
            return;
          }

          console.log(`📋 Request status update: ${requestId} -> ${status}`);

          // Forward to customer if customerId provided
          if (customerId && this.activeConnections.has(customerId)) {
            const customerConn = this.activeConnections.get(customerId);
            this.io.to(`${customerConn.userType}_${customerId}`).emit('request_update', {
              requestId,
              status,
              message,
              timestamp: Date.now()
            });
            console.log(`📤 Status update sent to customer: ${customerId}`);
          }

          // Also broadcast to tracking room if exists
          const trackingRoom = `tracking_${requestId}`;
          if (this.io.sockets.adapter.rooms.has(trackingRoom)) {
            this.io.to(trackingRoom).emit('request_update', {
              requestId,
              status,
              message,
              timestamp: Date.now()
            });
          }

        } catch (error) {
          console.error('Request status update error:', error);
        }
      });

      // ==================== PAYMENT UPDATES ====================
      socket.on('payment_status', (data) => {
        try {
          const { requestId, status, method } = data;
          
          if (!requestId || !status) {
            return;
          }

          console.log(`💰 Payment status: ${requestId} -> ${status} (${method || 'no-method'})`);

          // Find tracking session to get customer and partner IDs
          const session = this.trackingSessions.get(requestId);
          if (session) {
            // Notify customer
            if (session.customerId && this.activeConnections.has(session.customerId)) {
              const customerConn = this.activeConnections.get(session.customerId);
              this.io.to(`${customerConn.userType}_${session.customerId}`).emit('payment_status', {
                requestId,
                status,
                method,
                timestamp: Date.now()
              });
            }

            // Notify partner
            if (session.partnerId && this.activeConnections.has(session.partnerId)) {
              const partnerConn = this.activeConnections.get(session.partnerId);
              this.io.to(`${partnerConn.userType}_${session.partnerId}`).emit('payment_status', {
                requestId,
                status,
                method,
                timestamp: Date.now()
              });
            }
          }

        } catch (error) {
          console.error('Payment status update error:', error);
        }
      });

      // ==================== PAYMENT CONFIRMATION ====================
      socket.on('payment_confirmation', (data) => {
        try {
          const { requestId, status, amount, method } = data;
          
          if (!requestId || !status) {
            return;
          }

          console.log(`✅ Payment confirmation: ${requestId} -> ${status} (${method || 'no-method'})`);

          // Find tracking session to get customer and partner IDs
          const session = this.trackingSessions.get(requestId);
          if (session) {
            // Notify customer
            if (session.customerId && this.activeConnections.has(session.customerId)) {
              const customerConn = this.activeConnections.get(session.customerId);
              this.io.to(`${customerConn.userType}_${session.customerId}`).emit('payment_confirmation', {
                requestId,
                status,
                amount,
                method,
                timestamp: Date.now()
              });
            }

            // Notify partner
            if (session.partnerId && this.activeConnections.has(session.partnerId)) {
              const partnerConn = this.activeConnections.get(session.partnerId);
              this.io.to(`${partnerConn.userType}_${session.partnerId}`).emit('payment_confirmation', {
                requestId,
                status,
                amount,
                method,
                timestamp: Date.now()
              });
            }
          }

        } catch (error) {
          console.error('Payment confirmation error:', error);
        }
      });

      // ==================== APP STATE UPDATES (BACKGROUND/FOREGROUND) ====================
      socket.on('app_state_change', (data) => {
        try {
          const { userId, state } = data; // state: 'background', 'foreground', 'terminated'
          
          if (!userId || !this.activeConnections.has(userId)) {
            return;
          }

          const conn = this.activeConnections.get(userId);
          conn.isBackground = state === 'background';
          conn.lastPing = Date.now();

          console.log(`📱 ${conn.userType.toUpperCase()} ${userId} app state: ${state}`);

          if (state === 'background' && conn.userType === 'partner') {
            // Partner went to background - setup background tracking
            this.backgroundPartners.set(userId, {
              lastLocation: null,
              appState: 'background',
              lastUpdate: Date.now()
            });
          } else if (state === 'foreground' && conn.userType === 'partner') {
            // Partner came to foreground
            this.backgroundPartners.delete(userId);
          }

        } catch (error) {
          console.error('App state change error:', error);
        }
      });

      // ==================== ENHANCED PARTNER LOCATION UPDATES WITH THROTTLING ====================
      socket.on('partner_location_update', (data) => {
        try {
          const { partnerId, latitude, longitude, bearing, speed, accuracy, requestId, timestamp, isBackground } = data;
          
          if (!partnerId || !latitude || !longitude) {
            return;
          }

          // Throttle check - only send every 3 seconds
          const now = Date.now();
          const lastSent = this.partnerThrottle.get(partnerId) || 0;
          
          if (now - lastSent < this.THROTTLE_INTERVAL && !isBackground) {
            // Still throttle background but less strictly
            return;
          }

          const locationData = {
            partnerId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            bearing: bearing || 0,
            speed: speed || 0,
            accuracy: accuracy || 10,
            requestId,
            timestamp: timestamp || now,
            isBackground: isBackground || false
          };

          // Update throttle timestamp
          this.partnerThrottle.set(partnerId, now);

          // Update connection last ping
          if (this.activeConnections.has(partnerId)) {
            this.activeConnections.get(partnerId).lastPing = Date.now();
          }

          // Store in background tracking if applicable
          if (isBackground && this.activeConnections.has(partnerId)) {
            const conn = this.activeConnections.get(partnerId);
            conn.isBackground = true;
            
            this.backgroundPartners.set(partnerId, {
              lastLocation: locationData,
              appState: 'background',
              lastUpdate: now
            });
          }

          // Store tracking session if requestId exists
          if (requestId) {
            if (!this.trackingSessions.has(requestId)) {
              this.trackingSessions.set(requestId, {
                customerId: null,
                partnerId: partnerId,
                partnerPositions: [],
                lastUpdate: now,
                startedAt: now
              });
            }
            
            const session = this.trackingSessions.get(requestId);
            session.partnerPositions.push(locationData);
            session.lastUpdate = now;
            
            // Keep optimized position history for smooth trail
            if (session.partnerPositions.length > this.POSITION_HISTORY_LIMIT) {
              // Keep every other position after limit for memory optimization
              session.partnerPositions = session.partnerPositions.filter((_, index) => index % 2 === 0);
            }
            
            // Send to customer if exists
            if (session.customerId && this.activeConnections.has(session.customerId)) {
              const customerConn = this.activeConnections.get(session.customerId);
              
              // Send real-time location
              this.io.to(`${customerConn.userType}_${session.customerId}`).emit('partner_location', locationData);
              
              // Send trail updates less frequently for performance
              if (session.partnerPositions.length > 1 && now % 5000 < 100) { // Every ~5 seconds
                this.io.to(`${customerConn.userType}_${session.customerId}`).emit('partner_trail', {
                  requestId,
                  positions: session.partnerPositions,
                  isSmooth: true
                });
              }
            }
          } else {
            // Partner is online but not on a job
            this.io.emit('available_partner_location', locationData);
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

          console.log(`📱 Setting up real-time tracking for request ${requestId}`);

          // Create tracking session
          const session = {
            customerId,
            partnerId,
            partnerPositions: [],
            lastUpdate: Date.now(),
            startedAt: Date.now(),
            smoothInterpolation: true // Enable smooth movement
          };

          this.trackingSessions.set(requestId, session);

          // Join tracking room
          const trackingRoom = `tracking_${requestId}`;
          
          if (this.activeConnections.has(customerId)) {
            const customerConn = this.activeConnections.get(customerId);
            socket.join(trackingRoom);
            customerConn.rooms.add(trackingRoom);
          }

          if (this.activeConnections.has(partnerId)) {
            const partnerConn = this.activeConnections.get(partnerId);
            socket.join(trackingRoom);
            partnerConn.rooms.add(trackingRoom);
          }

          // Notify both parties
          this.io.to(trackingRoom).emit('tracking_started', {
            requestId,
            customerId,
            partnerId,
            serverTime: Date.now(),
            features: {
              smoothInterpolation: true,
              realtimeTrail: true,
              backgroundTracking: true
            }
          });

        } catch (error) {
          console.error('Tracking setup error:', error);
        }
      });

      socket.on('setup_customer_tracking', (data) => {
        try {
          const { requestId, partnerId } = data;
          
          if (!requestId || !partnerId) {
            return;
          }

          console.log(`📱 Setting up customer tracking for request ${requestId}`);

          // Update tracking session with partner ID
          if (this.trackingSessions.has(requestId)) {
            const session = this.trackingSessions.get(requestId);
            session.partnerId = partnerId;
            session.lastUpdate = Date.now();
            
            console.log(`✅ Customer tracking updated with partner: ${partnerId}`);
          }

        } catch (error) {
          console.error('Customer tracking setup error:', error);
        }
      });

      // ==================== GET ENHANCED TRACKING DATA ====================
      socket.on('get_tracking_data', (data) => {
        try {
          const { requestId, includeTrail = true } = data;
          
          if (!requestId) {
            socket.emit('tracking_data_error', { message: 'Missing requestId' });
            return;
          }

          const session = this.trackingSessions.get(requestId);
          if (!session) {
            socket.emit('tracking_data', { 
              requestId, 
              positions: [],
              features: {
                smoothInterpolation: false,
                realtimeTrail: false
              }
            });
            return;
          }

          const response = {
            requestId,
            positions: includeTrail ? session.partnerPositions : [],
            startedAt: session.startedAt,
            lastUpdate: session.lastUpdate,
            features: {
              smoothInterpolation: session.smoothInterpolation,
              realtimeTrail: true,
              backgroundTracking: this.backgroundPartners.has(session.partnerId)
            }
          };

          socket.emit('tracking_data', response);

        } catch (error) {
          console.error('Get tracking data error:', error);
          socket.emit('tracking_data_error', { message: 'Failed to get tracking data' });
        }
      });

      // ==================== SMOOTH INTERPOLATION REQUEST ====================
      socket.on('request_interpolation', (data) => {
        try {
          const { requestId, positions } = data;
          
          if (!requestId || !positions || !Array.isArray(positions)) {
            return;
          }

          const session = this.trackingSessions.get(requestId);
          if (!session) {
            return;
          }

          // Calculate interpolated positions for smooth movement
          const interpolated = this.interpolatePositions(positions);
          
          socket.emit('interpolated_positions', {
            requestId,
            positions: interpolated,
            timestamp: Date.now()
          });

        } catch (error) {
          console.error('Interpolation error:', error);
        }
      });

      // ==================== PING/KEEPALIVE ====================
      socket.on('ping', (data) => {
        try {
          const { userId } = data;
          if (userId && this.activeConnections.has(userId)) {
            this.activeConnections.get(userId).lastPing = Date.now();
          }
          socket.emit('pong', { serverTime: Date.now() });
        } catch (error) {
          // Silent fail for ping/pong
        }
      });

      // ==================== DISCONNECTION WITH RECOVERY ====================
      socket.on('disconnect', (reason) => {
        console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
        
        // Find user by socketId
        for (const [userId, conn] of this.activeConnections.entries()) {
          if (conn.socketId === socket.id) {
            
            // Mark as disconnected but keep in memory for recovery
            conn.socketId = null;
            conn.lastPing = Date.now();
            
            console.log(`🔴 ${conn.userType.toUpperCase()} ${userId} disconnected (${reason})`);
            
            // If partner, keep background tracking alive
            if (conn.userType === 'partner' && this.backgroundPartners.has(userId)) {
              console.log(`📱 Partner ${userId} in background, keeping tracking alive`);
            }
            
            break;
          }
        }
      });

      // ==================== ERROR HANDLING ====================
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });

      // ==================== RECONNECTION ====================
      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔁 Reconnection attempt ${attemptNumber} for ${socket.id}`);
      });
    });
  }

  // ==================== UTILITY METHODS ====================

  startCleanupInterval() {
    // Clean up stale connections every minute
    setInterval(() => {
      const now = Date.now();
      const staleTimeout = 5 * 60 * 1000; // 5 minutes
      const backgroundTimeout = 10 * 60 * 1000; // 10 minutes for background

      // Clean stale active connections
      for (const [userId, conn] of this.activeConnections.entries()) {
        if (now - conn.lastPing > (conn.isBackground ? backgroundTimeout : staleTimeout)) {
          console.log(`🧹 Cleaning stale connection: ${conn.userType} ${userId}`);
          this.activeConnections.delete(userId);
          
          // Clean tracking sessions
          for (const [requestId, session] of this.trackingSessions.entries()) {
            if (session.partnerId === userId || session.customerId === userId) {
              this.trackingSessions.delete(requestId);
            }
          }
          
          // Clean background tracking
          this.backgroundPartners.delete(userId);
        }
      }

      // Clean old tracking sessions (completed more than 1 hour ago)
      for (const [requestId, session] of this.trackingSessions.entries()) {
        if (now - session.lastUpdate > 60 * 60 * 1000) { // 1 hour
          this.trackingSessions.delete(requestId);
        }
      }

    }, 60000); // Run every minute
  }

  sendPendingUpdates(userId, socket) {
    // Find any tracking sessions for this user
    for (const [requestId, session] of this.trackingSessions.entries()) {
      if (session.customerId === userId || session.partnerId === userId) {
        // Send recent positions if reconnecting
        if (session.partnerPositions.length > 0) {
          const recentPositions = session.partnerPositions.slice(-10); // Last 10 positions
          socket.emit('recovery_data', {
            requestId,
            positions: recentPositions,
            lastUpdate: session.lastUpdate
          });
        }
      }
    }
  }

  interpolatePositions(positions) {
    if (positions.length < 2) return positions;
    
    const interpolated = [];
    
    for (let i = 0; i < positions.length - 1; i++) {
      const current = positions[i];
      const next = positions[i + 1];
      
      // Add current position
      interpolated.push(current);
      
      // Interpolate 2 points between current and next for smooth movement
      for (let j = 1; j <= 2; j++) {
        const fraction = j / 3;
        interpolated.push({
          latitude: current.latitude + (next.latitude - current.latitude) * fraction,
          longitude: current.longitude + (next.longitude - current.longitude) * fraction,
          bearing: current.bearing,
          timestamp: current.timestamp + (next.timestamp - current.timestamp) * fraction
        });
      }
    }
    
    // Add last position
    interpolated.push(positions[positions.length - 1]);
    
    return interpolated;
  }

  // ==================== PUBLIC API (for controllers) ====================

  notifyUser(userId, event, data) {
    if (this.activeConnections.has(userId)) {
      const conn = this.activeConnections.get(userId);
      if (conn.socketId) {
        this.io.to(`${conn.userType}_${userId}`).emit(event, data);
        return true;
      }
    }
    return false;
  }

  notifyCustomer(userId, event, data) {
    return this.notifyUser(userId, event, data);
  }

  notifyPartner(userId, event, data) {
    return this.notifyUser(userId, event, data);
  }

  broadcastToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  isUserOnline(userId) {
    const conn = this.activeConnections.get(userId);
    return conn && conn.socketId !== null;
  }

  getPartnerLocation(partnerId) {
    if (this.backgroundPartners.has(partnerId)) {
      return this.backgroundPartners.get(partnerId).lastLocation;
    }
    return null;
  }

  // Get active tracking session for a request
  getTrackingSession(requestId) {
    return this.trackingSessions.get(requestId);
  }

  // Force location update (for testing)
  forceLocationUpdate(partnerId, location) {
    const conn = this.activeConnections.get(partnerId);
    if (conn) {
      this.io.to(`${conn.userType}_${partnerId}`).emit('force_location_update', location);
      return true;
    }
    return false;
  }
}

module.exports = new SocketService();
