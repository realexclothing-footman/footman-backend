const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');
const Request = require('./Request');

const RequestRejection = sequelize.define('RequestRejection', {
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
    }
  },
  footman_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  reason: {
    type: DataTypes.ENUM('forward', 'busy', 'too_far', 'other'),
    defaultValue: 'forward'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'request_rejections',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['request_id', 'footman_id'],
      name: 'unique_rejection_per_footman'
    },
    {
      fields: ['footman_id'],
      name: 'idx_footman_rejections'
    },
    {
      fields: ['request_id'],
      name: 'idx_request_rejections'
    },
    {
      fields: ['created_at'],
      name: 'idx_rejection_time'
    }
  ]
});

// Define associations
RequestRejection.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });
RequestRejection.belongsTo(User, { foreignKey: 'footman_id', as: 'footman' });

// Instance method to check if rejection is recent (within X minutes)
RequestRejection.prototype.isRecent = function(minutes = 10) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  return this.created_at > cutoff;
};

// Static method to get recent rejections for a request
RequestRejection.getRecentRejections = async function(requestId, minutes = 10) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  
  return await RequestRejection.findAll({
    where: {
      request_id: requestId,
      created_at: { [sequelize.Op.gt]: cutoff }
    },
    include: [
      {
        model: User,
        as: 'footman',
        attributes: ['id', 'full_name']
      }
    ]
  });
};

// Static method to create rejection record
RequestRejection.createRejection = async function(requestId, footmanId, reason = 'forward', notes = null) {
  try {
    // Use upsert to prevent duplicates
    const [rejection, created] = await RequestRejection.upsert({
      request_id: requestId,
      footman_id: footmanId,
      reason: reason,
      notes: notes,
      created_at: new Date()
    }, {
      returning: true
    });
    
    return { rejection, created };
  } catch (error) {
    console.error('Error creating rejection record:', error);
    throw error;
  }
};

// Static method to cleanup old rejections (older than 24 hours)
RequestRejection.cleanupOldRejections = async function(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const deletedCount = await RequestRejection.destroy({
    where: {
      created_at: { [sequelize.Op.lt]: cutoff }
    }
  });
  
  console.log(`Cleaned up ${deletedCount} old rejection records`);
  return deletedCount;
};

module.exports = RequestRejection;
