const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Database
const { testConnection } = require('./config/database');

// Routes
const authRoutes = require('./routes/auth.routes');
const requestRoutes = require('./routes/request.routes'); // NEW
const deliveryRoutes = require('./routes/delivery.routes');
const adminRoutes = require('./routes/admin.routes');
const testRoutes = require('./routes/test.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/api/v1/uploads/profiles', express.static('uploads/users/profiles'));
app.use('/api/v1/uploads/nid', express.static('uploads/users/nid'));
// Serve APK downloads
app.use('/downloads', express.static('uploads/downloads'));
// Serve HTML files from current directory
app.use(express.static("."));
// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'FootMan API',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Documentation
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'Welcome to FOOTMAN API',
    version: 'v2.0.0',
    description: 'Ultra-simple local help service',
    endpoints: {
      auth: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        profile: 'GET /api/v1/auth/profile'
      },
      requests: {
        help: 'POST /api/v1/requests/help (Send location only)',
        my_requests: 'GET /api/v1/requests/my',
        nearby_footmen: 'GET /api/v1/requests/nearby/footmen',
        cancel: 'PUT /api/v1/requests/:id/cancel'
      },
      footman: {
        available_requests: 'GET /api/v1/requests/available/requests',
        accept_request: 'POST /api/v1/requests/:id/accept',
        reject_request: 'POST /api/v1/requests/:id/reject',
        my_active: 'GET /api/v1/requests/footman/active',
        update_status: 'PUT /api/v1/requests/:id/status',
        earnings: 'GET /api/v1/requests/footman/earnings'
      },
      delivery: {
        online_status: 'POST /api/v1/delivery/online-status',
        location: 'POST /api/v1/delivery/location',
        stats: 'GET /api/v1/delivery/stats'
      },
      admin: {
        dashboard: 'GET /api/v1/admin/dashboard',
        users: 'GET /api/v1/admin/users',
        requests: 'GET /api/v1/admin/requests'
      },
      health: 'GET /health'
    },
    pricing: {
      "≤0.5KM": "50 BDT (Footman earns: 45 BDT after 10% commission)",
      "≤1KM": "100 BDT (Footman earns: 90 BDT after 10% commission)",
      note: "Fixed pricing based on distance from user to Footman"
    }
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/requests', requestRoutes); // NEW - Simple request system
app.use('/api/v1/delivery', deliveryRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/test', testRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.url}`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});


module.exports = app;
// Download endpoint for APK files
