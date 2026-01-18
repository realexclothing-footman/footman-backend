const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  full_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  user_type: {
    type: DataTypes.ENUM('customer', 'delivery', 'admin'),
    defaultValue: 'customer'
  },
  
  // Partner registration fields
  nid_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'NID number for delivery partners'
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Address for delivery partners'
  },
  
  // Emergency contact fields
  emergency_contact_name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Emergency contact person name'
  },
  emergency_contact_phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Emergency contact phone number'
  },
  emergency_contact_relationship: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Relationship with emergency contact'
  },
  
  // Profile image
  profile_image_url: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL to profile image'
  },
  nid_front_image_url: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL to NID front image'
  },
  nid_back_image_url: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL to NID back image'
  },
  
  // FOOTMAN SPECIFIC FIELDS
  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'For Footmen: online/offline status'
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
    comment: 'Current latitude for Footmen'
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
    comment: 'Current longitude for Footmen'
  },
  last_location_update: {
    type: DataTypes.DATE,
    allowNull: true
  },
  
  // STATS & RATINGS
  total_completed_jobs: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 5.0,
    validate: {
      min: 0,
      max: 5
    }
  },
  
  // FORGOT PASSWORD OTP FIELDS
  reset_password_otp: {
    type: DataTypes.STRING(6),
    allowNull: true,
    comment: 'OTP for password reset'
  },
  reset_password_expires: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'OTP expiry time'
  },
  
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'en'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'users',
  timestamps: false,
  hooks: {
    beforeCreate: async (user) => {
      if (user.user_type === 'delivery') {
        user.is_active = false; // Delivery partners need admin approval
      }
    }
  }
});

// Instance method to update location
User.prototype.updateLocation = async function(latitude, longitude) {
  this.latitude = latitude;
  this.longitude = longitude;
  this.last_location_update = new Date();
  return this.save();
};

// Instance method to set online status
User.prototype.setOnlineStatus = async function(isOnline) {
  this.is_online = isOnline;
  return this.save();
};

module.exports = User;
