const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  request_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'requests',
      key: 'id'
    },
    comment: 'Reference to the request'
  },
  partner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Reference to the partner (User)'
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Reference to the customer (User)'
  },
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Payment method: cash, bkash, nagad'
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Total job amount (50 or 100 BDT)'
  },
  commission: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Company commission (10% - 5 or 10 BDT)'
  },
  partner_share: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Partner earnings after commission (45 or 90 BDT)'
  },
  // Digital payment tracking
  company_received: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'For digital: Company received payment from customer'
  },
  company_received_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When company received digital payment'
  },
  partner_paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'For digital: Partner received their share'
  },
  partner_paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When partner received digital payment'
  },
  // Cash payment tracking
  cash_collected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'For cash: Partner collected cash from customer'
  },
  cash_collected_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When partner collected cash'
  },
  cash_settled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'For cash: Commission paid to company'
  },
  cash_settled_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When cash commission was paid'
  },
  cash_settlement_method: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'How cash commission was paid: bkash, nagad'
  },
  transaction_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Digital transaction reference number'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Any transaction notes'
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
  tableName: 'transactions',
  timestamps: false,
  indexes: [
    {
      fields: ['partner_id']
    },
    {
      fields: ['request_id']
    },
    {
      fields: ['payment_method']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

// Instance method to mark digital payment received by company
Transaction.prototype.markCompanyReceived = async function(reference) {
  this.company_received = true;
  this.company_received_at = new Date();
  this.transaction_reference = reference;
  this.status = 'completed';
  return this.save();
};

// Instance method to mark partner paid for digital payment
Transaction.prototype.markPartnerPaid = async function() {
  this.partner_paid = true;
  this.partner_paid_at = new Date();
  return this.save();
};

// Instance method to mark cash collected
Transaction.prototype.markCashCollected = async function() {
  this.cash_collected = true;
  this.cash_collected_at = new Date();
  return this.save();
};

// Instance method to mark cash commission settled
Transaction.prototype.markCashSettled = async function(method) {
  this.cash_settled = true;
  this.cash_settled_at = new Date();
  this.cash_settlement_method = method;
  return this.save();
};

// Static method to get partner's transaction summary
Transaction.getPartnerSummary = async function(partnerId) {
  const result = await this.findAll({
    where: { partner_id: partnerId },
    attributes: [
      'payment_method',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total_amount')), 'total'],
      [sequelize.fn('SUM', sequelize.col('commission')), 'commission'],
      [sequelize.fn('SUM', sequelize.col('partner_share')), 'partner_share']
    ],
    group: ['payment_method']
  });
  
  return result;
};

module.exports = Transaction;
