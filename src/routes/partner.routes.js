const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partner.controller');
const authMiddleware = require('../middleware/auth.middleware');

// ==================== PARTNER ENTERPRISE ENDPOINTS ====================

// 1. PARTNER DASHBOARD - Get complete partner data
router.get('/dashboard', authMiddleware, partnerController.getPartnerDashboard);

// 2. PROFILE PHOTO UPLOAD - Upload/update profile photo
router.post('/profile/photo', authMiddleware, partnerController.uploadProfilePhoto);

// 3. PANIC BUTTON - Emergency SOS alert
router.post('/panic', authMiddleware, partnerController.triggerPanicButton);

// 4. ONLINE STATUS UPDATE - Enhanced version with WebSocket events
router.post('/online-status', authMiddleware, partnerController.updateOnlineStatus);

// 5. PARTNER STATISTICS - Detailed earnings and job stats
router.get('/stats', authMiddleware, partnerController.getPartnerStatistics);

// ==================== PAYMENT MANAGEMENT ENDPOINTS ====================

// 6. GET PAYMENT METHODS - Get partner's payment setup
router.get('/payment-methods', authMiddleware, partnerController.getPaymentMethods);

// 7. UPDATE PAYMENT METHODS - Add/update Bkash/Nagad numbers
router.post('/payment-methods', authMiddleware, partnerController.updatePaymentMethods);

// 8. GET TRANSACTION HISTORY - Earnings and payment history
router.get('/transactions', authMiddleware, partnerController.getTransactionHistory);

// 9. PAY CASH COMMISSION - Pay cash commission via digital
router.post('/cash-settlement/pay', authMiddleware, partnerController.payCashCommission);

module.exports = router;
