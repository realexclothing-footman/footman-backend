const express = require('express');
const router = express.Router();
const requestController = require('../controllers/request.controller');
const footmanController = require('../controllers/footman.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ==================== CUSTOMER ROUTES ====================
router.post('/help', authMiddleware, requestController.createRequest);
router.get('/my', authMiddleware, requestController.getMyRequests);
router.get('/payment/check', authMiddleware, requestController.checkPaymentScreen);
router.get('/nearby/footmen', authMiddleware, requestController.getNearbyFootmen);
router.get('/:id', authMiddleware, requestController.getRequestDetails);
router.put('/:id/cancel', authMiddleware, requestController.cancelRequest);
router.get('/:id/payment/status', authMiddleware, requestController.getCustomerPaymentStatus);
router.post('/:id/payment/select', authMiddleware, requestController.selectPaymentMethod);

// ==================== FOOTMAN ROUTES ====================
router.get('/available/requests', authMiddleware, footmanController.getAvailableRequests);
router.post('/:id/accept', authMiddleware, footmanController.acceptRequest);
router.post('/:id/reject', authMiddleware, footmanController.rejectRequest);
router.post('/:id/forward', authMiddleware, requestController.forwardRequest);
router.get('/footman/active', authMiddleware, footmanController.getMyActiveRequests);
router.put('/:id/status', authMiddleware, footmanController.updateRequestStatus);
router.post('/:id/payment/confirm', authMiddleware, footmanController.confirmPaymentReceived);

// ==================== PARTNER PAYMENT STATUS ROUTE ====================
router.get('/:id/payment/partner-status', authMiddleware, requestController.getPartnerPaymentStatus);

// ==================== WEBSOCKET & PARTNER DETAILS ====================
router.post('/partner/location', authMiddleware, requestController.emitPartnerLocation);
router.post('/:id/status/ws', authMiddleware, requestController.updateRequestStatus);
router.get('/partner/:id', authMiddleware, requestController.getRequestDetailsForPartner);

module.exports = router;
