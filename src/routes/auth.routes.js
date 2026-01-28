const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { uploadRegistration, uploadProfileImage } = require('../middleware/upload.middleware');

// Public routes
router.post('/register', uploadRegistration, authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);
router.put('/profile', authMiddleware, authController.updateProfile);
router.put('/change-password', authMiddleware, authController.changePassword);
router.post('/update-fcm-token', authMiddleware, authController.updateFcmToken);

module.exports = router;
