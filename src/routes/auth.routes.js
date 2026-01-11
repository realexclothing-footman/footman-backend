const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { uploadRegistration, uploadProfileImage } = require('../middleware/upload.middleware');

// Public routes

// Registration with optional file uploads
router.post('/register', uploadRegistration, authController.register);

router.post('/login', authController.login);

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
