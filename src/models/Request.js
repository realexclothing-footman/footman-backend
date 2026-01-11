const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');

const Request = sequelize.define('Request', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  request_number: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  assigned_footman_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  pickup_lat: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  pickup_lng: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  distance_km: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Distance to nearest Footman'
  },
  base_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '50 BDT for ≤0.5KM, 100 BDT for 1KM'
  },
  commission: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '10% platform commission'
  },
  footman_earnings: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'What Footman earns after commission'
  },
  request_status: {
    type: DataTypes.ENUM('searching', 'accepted', 'accepted_by_partner', 'ongoing', 'completed', 'cancelled'),
    defaultValue: 'searching'
  },
  payment_flow_state: {
    type: DataTypes.ENUM('waiting_payment', 'payment_selected', 'payment_confirmed', 'fully_completed'),
    allowNull: true
  },
  customer_selected_payment: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  partner_confirmed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  payment_lock: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  accepted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
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
  tableName: 'requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Define associations
Request.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });
Request.belongsTo(User, { foreignKey: 'assigned_footman_id', as: 'footman' });

// Generate unique request number
Request.generateRequestNumber = function() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `FR${timestamp}${random}`;
};

module.exports = Request;
