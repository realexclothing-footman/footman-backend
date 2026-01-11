const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/delivery.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ==================== FOOTMAN (PARTNER) APP ROUTES ====================

// 1. Online/Offline Status
router.post('/online-status', authMiddleware, deliveryController.toggleOnlineStatus);

// 2. Location Updates (Real-time)
router.post('/location', authMiddleware, deliveryController.updateLocation);

// 3. Available Orders (within 1KM radius)
router.get('/orders/available', authMiddleware, deliveryController.getAvailableOrders);

// 4. Accept Order
router.post('/orders/:id/accept', authMiddleware, deliveryController.acceptOrder);

// 5. Footman's Active Orders
router.get('/orders/my', authMiddleware, deliveryController.getMyOrders);

// 6. Update Order Status (pickup, deliver, complete)
router.put('/orders/:id/status', authMiddleware, deliveryController.updateOrderStatus);

// 7. Footman Stats & Earnings
router.get('/stats', authMiddleware, deliveryController.getFootmanStats);

module.exports = router;
