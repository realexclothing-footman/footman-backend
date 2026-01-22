const express = require('express');
const router = express.Router();
const requestController = require('../controllers/request.controller');
const footmanController = require('../controllers/footman.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ==================== CUSTOMER ROUTES ====================

// Create help request (simple - just location)
router.post('/help', authMiddleware, requestController.createRequest);

// Get my requests
router.get('/my', authMiddleware, requestController.getMyRequests);

// Get request details
router.get('/:id', authMiddleware, requestController.getRequestDetails);

// Cancel request
router.put('/:id/cancel', authMiddleware, requestController.cancelRequest);

// Get nearby Footmen for map
router.get('/nearby/footmen', authMiddleware, requestController.getNearbyFootmen);

// NEW: Check if need to show payment screen (when app opens)
router.get('/payment/check', authMiddleware, requestController.checkPaymentScreen);

// NEW: Get payment status for customer
router.get('/:id/payment/status', authMiddleware, requestController.getCustomerPaymentStatus);

// NEW: Select payment method
router.post('/:id/payment/select', authMiddleware, requestController.selectPaymentMethod);

// ==================== FOOTMAN ROUTES ====================

// Get available requests (within 1KM)
router.get('/available/requests', authMiddleware, footmanController.getAvailableRequests);

// Accept request
router.post('/:id/accept', authMiddleware, footmanController.acceptRequest);

// Reject request
router.post('/:id/reject', authMiddleware, footmanController.rejectRequest);

// Get Footman's active requests
router.get('/footman/active', authMiddleware, footmanController.getMyActiveRequests);

// Update request status
router.put('/:id/status', authMiddleware, footmanController.updateRequestStatus);

// NEW: Get payment status for footman
router.get('/:id/payment/partner-status', authMiddleware, footmanController.getPaymentStatus);

// NEW: Confirm payment received
router.post('/:id/payment/confirm', authMiddleware, footmanController.confirmPaymentReceived);

// Get Footman earnings
router.get('/footman/earnings', authMiddleware, footmanController.getFootmanEarnings);

// NEW: Cleanup old rejections (admin only - can be called via cron)
router.delete('/cleanup/rejections', authMiddleware, footmanController.cleanupOldRejections);

// ==================== WEBSOCKET SUPPORT ROUTES ====================

// Partner location update (emits WebSocket event)
router.post('/partner/location', authMiddleware, requestController.emitPartnerLocation);

// Update request status with WebSocket notification
router.post('/:id/status/ws', authMiddleware, requestController.updateRequestStatus);

module.exports = router;
