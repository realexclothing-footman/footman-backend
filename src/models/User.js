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
  
  // VERIFICATION FIELDS - UPDATED: REMOVED VEHICLE DOCS
  nid_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'NID verification status for partners'
  },
  photo_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Profile photo verification status'
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
  last_online_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time the partner was online'
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
  
  // FIREBASE FCM TOKEN FOR PUSH NOTIFICATIONS
  fcm_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Firebase Cloud Messaging token for push notifications'
  },
  fcm_token_updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When FCM token was last updated'
  },
  
  // PAYMENT SYSTEM FIELDS
  bkash_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Bkash number for digital payments'
  },
  nagad_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Nagad number for digital payments'
  },
  cash_commission_due: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: 'Cash commission owed to company'
  },
  cash_settlement_threshold: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 50.00,
    comment: 'Amount when cash commission alert triggers'
  },
  
  // CASH COMMISSION DEADLINE FIELDS (NEW)
  commission_deadline: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '24-hour deadline to pay commission when threshold reached'
  },
  last_commission_alert: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When last commission alert was sent'
  },
  payment_block_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for payment block (e.g., "Unpaid cash commission")'
  },
  
  last_cash_settlement_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time cash commission was paid'
  },
  is_payment_blocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Blocked for not paying cash commission'
  },
  payment_blocked_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When payment was blocked'
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

// ==================== INSTANCE METHODS ====================

// Update location
User.prototype.updateLocation = async function(latitude, longitude) {
  this.latitude = latitude;
  this.longitude = longitude;
  this.last_location_update = new Date();
  return this.save();
};

// Set online status
User.prototype.setOnlineStatus = async function(isOnline) {
  this.is_online = isOnline;
  if (isOnline) {
    this.last_online_at = new Date();
  }
  return this.save();
};

// Update FCM token
User.prototype.updateFcmToken = async function(fcmToken) {
  this.fcm_token = fcmToken;
  this.fcm_token_updated_at = new Date();
  return this.save();
};

// Update verification status
User.prototype.updateVerification = async function(type, status) {
  const verificationTypes = ['nid_verified', 'photo_verified'];
  if (verificationTypes.includes(type)) {
    this[type] = status;
    return this.save();
  }
  throw new Error(`Invalid verification type: ${type}`);
};

// ==================== CASH COMMISSION METHODS ====================

// Add cash commission
User.prototype.addCashCommission = async function(amount) {
  const oldDue = parseFloat(this.cash_commission_due);
  const newDue = oldDue + parseFloat(amount);
  
  this.cash_commission_due = newDue;
  
  // Check if threshold reached for the first time
  if (newDue >= this.cash_settlement_threshold && oldDue < this.cash_settlement_threshold) {
    // Set 24-hour deadline
    this.commission_deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.last_commission_alert = new Date();
    this.payment_block_reason = `Cash commission due: ৳${newDue.toFixed(2)} (Threshold: ৳${this.cash_settlement_threshold})`;
  }
  
  return this.save();
};

// Pay cash commission with payment number
User.prototype.payCashCommission = async function(amount, paymentMethod, paymentNumber = null) {
  const paymentAmount = parseFloat(amount);
  
  if (paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }
  
  if (paymentAmount > this.cash_commission_due) {
    throw new Error(`Payment amount (${paymentAmount}) exceeds commission due (${this.cash_commission_due})`);
  }
  
  // Reduce commission
  this.cash_commission_due = Math.max(0, this.cash_commission_due - paymentAmount);
  this.last_cash_settlement_date = new Date();
  
  // Reset deadline if commission is paid
  if (this.cash_commission_due < this.cash_settlement_threshold) {
    this.commission_deadline = null;
    this.last_commission_alert = null;
    this.payment_block_reason = null;
  }
  
  // Unblock if commission is below threshold
  if (this.cash_commission_due < this.cash_settlement_threshold && this.is_payment_blocked) {
    this.is_payment_blocked = false;
    this.payment_blocked_at = null;
  }
  
  return this.save();
};

// Check commission deadline and block if expired
User.prototype.checkCommissionDeadline = async function() {
  if (!this.commission_deadline || this.is_payment_blocked) {
    return {
      is_blocked: this.is_payment_blocked,
      deadline: this.commission_deadline,
      reason: this.payment_block_reason
    };
  }
  
  const now = new Date();
  const deadline = new Date(this.commission_deadline);
  
  // If deadline passed, block account
  if (now > deadline && !this.is_payment_blocked) {
    this.is_payment_blocked = true;
    this.payment_blocked_at = now;
    this.payment_block_reason = `Commission not paid within 24 hours. Due: ৳${this.cash_commission_due.toFixed(2)}`;
    await this.save();
  }
  
  return {
    is_blocked: this.is_payment_blocked,
    deadline: this.commission_deadline,
    time_remaining: deadline - now,
    reason: this.payment_block_reason
  };
};

// Get commission status for frontend
User.prototype.getCommissionStatus = function() {
  const now = new Date();
  const deadline = this.commission_deadline ? new Date(this.commission_deadline) : null;
  
  let time_remaining = null;
  let hours_remaining = null;
  let minutes_remaining = null;
  let is_urgent = false;
  
  if (deadline) {
    time_remaining = deadline - now;
    hours_remaining = Math.floor(time_remaining / (1000 * 60 * 60));
    minutes_remaining = Math.floor((time_remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    // Mark as urgent if less than 6 hours remaining
    is_urgent = hours_remaining < 6;
  }
  
  return {
    commission_due: parseFloat(this.cash_commission_due),
    threshold: parseFloat(this.cash_settlement_threshold),
    is_payment_blocked: this.is_payment_blocked,
    blocked_at: this.payment_blocked_at,
    deadline: this.commission_deadline,
    last_alert: this.last_commission_alert,
    time_remaining: time_remaining,
    hours_remaining: hours_remaining,
    minutes_remaining: minutes_remaining,
    is_urgent: is_urgent,
    reason: this.payment_block_reason,
    can_accept_requests: !this.is_payment_blocked && this.is_active,
    needs_payment: this.cash_commission_due >= this.cash_settlement_threshold
  };
};

// Update payment methods
User.prototype.updatePaymentMethods = async function(bkashNumber, nagadNumber) {
  if (bkashNumber !== undefined) this.bkash_number = bkashNumber;
  if (nagadNumber !== undefined) this.nagad_number = nagadNumber;
  
  return this.save();
};

module.exports = User;
