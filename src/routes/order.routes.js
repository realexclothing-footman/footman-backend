const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Customer routes
router.post('/', authMiddleware, orderController.createOrder);
router.get('/', authMiddleware, orderController.getCustomerOrders);
router.get('/:id', authMiddleware, orderController.getOrderDetails);
router.put('/:id/cancel', authMiddleware, orderController.cancelOrder);

// Delivery boy routes
router.put('/:id/status', authMiddleware, orderController.updateOrderStatus);

module.exports = router;
