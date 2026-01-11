const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_number: {
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
    },
    comment: 'Replaces delivery_boy_id for clarity'
  },
  store_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  store_address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  items_description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  estimated_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  actual_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  
  // COMMISSION FIELDS
  commission_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: 'Platform commission (10% of estimated_amount)'
  },
  footman_earnings: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: 'What Footman actually earns after commission'
  },
  
  service_charge: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 30.00
  },
  tip_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  payment_method: {
    type: DataTypes.ENUM('cash', 'bkash', 'nagad', 'rocket', 'card', 'upay'),
    defaultValue: 'cash'
  },
  payment_status: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    defaultValue: 'pending'
  },
  
  // UPDATED STATUS FOR FOOTMAN FLOW
  order_status: {
    type: DataTypes.ENUM('pending', 'searching', 'accepted', 'picked_up', 'delivered', 'completed', 'cancelled'),
    defaultValue: 'pending',
    comment: 'searching = looking for Footman, accepted = Footman accepted'
  },
  
  delivery_instructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  pickup_lat: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  pickup_lng: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  delivery_lat: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  delivery_lng: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  accepted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  picked_up_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  delivered_at: {
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
  tableName: 'orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Define associations
Order.belongsTo(User, { foreignKey: 'customer_id', as: 'customer' });
Order.belongsTo(User, { foreignKey: 'assigned_footman_id', as: 'footman' });

// Generate unique order number
Order.generateOrderNumber = function() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `FM${timestamp}${random}`;
};

module.exports = Order;
