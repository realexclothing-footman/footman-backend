const { Op } = require('sequelize');
const User = require('../models/User');
const Order = require('../models/Order');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || user.user_type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Get total counts
    const totalCustomers = await User.count({ where: { user_type: 'customer' } });
    const totalDeliveryBoys = await User.count({ where: { user_type: 'delivery' } });
    const totalOrders = await Order.count();
    
    // Get today's orders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = await Order.count({
      where: {
        created_at: {
          [Op.gte]: today
        }
      }
    });

    // Get revenue (simplified - in real app, sum actual payments)
    const completedOrders = await Order.count({
      where: { order_status: 'delivered' }
    });
    
    const estimatedRevenue = completedOrders * 30; // Assuming 30 BDT service charge per order

    res.status(200).json({
      success: true,
      data: {
        stats: {
          total_customers: totalCustomers,
          total_delivery_boys: totalDeliveryBoys,
          total_orders: totalOrders,
          today_orders: todayOrders,
          estimated_revenue: estimatedRevenue
        }
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { user_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (user_type) {
      where.user_type = user_type;
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) {
      where.order_status = status;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'customer',
          attributes: ['id', 'full_name', 'phone']
        },
        {
          model: User,
          as: 'delivery_boy',
          attributes: ['id', 'full_name', 'phone']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.is_active = is_active;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status } = req.body;

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.order_status = order_status;
    
    // Update timestamps if needed
    if (order_status === 'accepted' && !order.accepted_at) {
      order.accepted_at = new Date();
    } else if (order_status === 'picked_up' && !order.picked_up_at) {
      order.picked_up_at = new Date();
    } else if (order_status === 'delivered' && !order.delivered_at) {
      order.delivered_at = new Date();
    }
    
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message
    });
  }
};

// Apply admin middleware to all routes
exports.isAdmin = isAdmin;
