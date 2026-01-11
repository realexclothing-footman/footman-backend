const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getFileUrl } = require('../middleware/upload.middleware');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      phone: user.phone,
      user_type: user.user_type,
      is_active: user.is_active
    },
    process.env.JWT_SECRET || 'footman-secret-key',
    { expiresIn: '30d' }
  );
};

// ==================== AUTH CONTROLLERS ====================

/**
 * 1. REGISTER USER
 */
exports.register = async (req, res) => {
  try {
    const { 
      phone, 
      email = '',  // Default to empty string
      full_name, 
      password, 
      user_type = 'customer',
      nid_number,
      address,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { phone } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this phone number'
      });
    }

    // For delivery partners, require all fields
    if (user_type === 'delivery') {
      const requiredFields = [
        { field: nid_number, name: 'NID number' },
        { field: address, name: 'Address' },
        { field: emergency_contact_name, name: 'Emergency contact name' },
        { field: emergency_contact_phone, name: 'Emergency contact phone' },
        { field: emergency_contact_relationship, name: 'Emergency contact relationship' }
      ];

      for (const required of requiredFields) {
        if (!required.field) {
          return res.status(400).json({
            success: false,
            message: `${required.name} is required for delivery partners`
          });
        }
      }
    }

    // Create new user
    const userData = {
      phone,
      full_name,
      password_hash: await bcrypt.hash(password, 10),
      user_type
    };

    // Add email only if provided
    if (email && email.trim() !== '') {
      userData.email = email.trim();
    }

    // Add partner-specific fields
    if (user_type === 'delivery') {
      userData.nid_number = nid_number;
      userData.address = address;
      userData.emergency_contact_name = emergency_contact_name;
      userData.emergency_contact_phone = emergency_contact_phone;
      userData.emergency_contact_relationship = emergency_contact_relationship;
      // Delivery partners need admin approval
      userData.is_active = false;
      
      // Handle image uploads for delivery partners
      if (req.files) {
        if (req.files['profile_image'] && req.files['profile_image'][0]) {
          userData.profile_image_url = getFileUrl(req, req.files['profile_image'][0].filename, 'profile');
        }
        
        if (req.files['nid_front_image'] && req.files['nid_front_image'][0]) {
          userData.nid_front_image_url = getFileUrl(req, req.files['nid_front_image'][0].filename, 'nid');
        }
        
        if (req.files['nid_back_image'] && req.files['nid_back_image'][0]) {
          userData.nid_back_image_url = getFileUrl(req, req.files['nid_back_image'][0].filename, 'nid');
        }
      }
    }

    const user = await User.create(userData);

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password_hash;

    res.status(201).json({
      success: true,
      message: user_type === 'delivery' 
        ? 'Registration successful! Wait for admin approval.' 
        : 'Registration successful!',
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    res.status(400).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

/**
 * 2. LOGIN USER
 */
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    // Check if account is active (for delivery partners)
    if (user.user_type === 'delivery' && !user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account pending admin approval'
      });
    }

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * 3. GET USER PROFILE
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};
