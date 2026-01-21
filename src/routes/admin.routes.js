const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminController.isAdmin);

// Admin routes
router.get('/dashboard', adminController.getDashboardStats);
router.get('/revenue-timeseries', adminController.getRevenueTimeSeries);
router.get('/online-partners', adminController.getOnlinePartners);
router.get('/users', adminController.getAllUsers);
router.get('/orders', adminController.getAllOrders);
router.get('/requests', adminController.getAllRequests);
router.get('/documents', adminController.getPartnerDocuments);
router.put('/users/:id/status', adminController.updateUserStatus);
router.put('/orders/:id/status', adminController.updateOrderStatus);

module.exports = router;
