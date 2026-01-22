const { Op, Sequelize } = require('sequelize');
const User = require('../models/User');
const Order = require('../models/Order');
const Request = require('../models/Request');
const sequelize = require('../models').sequelize;

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
    // Get total counts from USERS table
    const totalCustomers = await User.count({ where: { user_type: 'customer' } });
    const totalDeliveryBoys = await User.count({ where: { user_type: 'delivery' } });
    
    // Get total requests count
    const totalRequests = await Request.count();
    
    // Get today's requests
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRequests = await Request.count({
      where: {
        created_at: {
          [Op.gte]: today
        }
      }
    });

    // Calculate REAL revenue from requests
    const completedRequests = await Request.findAll({
      where: { request_status: 'completed' },
      attributes: ['base_price', 'commission']
    });
    
    // Calculate totals
    let totalRevenue = 0;
    let totalCommission = 0;
    let partnerEarnings = 0;
    
    completedRequests.forEach(request => {
      const revenue = parseFloat(request.base_price) || 0;
      const commission = parseFloat(request.commission) || 0;
      totalRevenue += revenue;
      totalCommission += commission;
      partnerEarnings += (revenue - commission);
    });

    // Get payment method breakdown (simplified for now)
    const paymentMethods = await Request.findAll({
      where: { request_status: 'completed' },
      attributes: ['customer_selected_payment'],
      raw: true
    });
    
    const paymentBreakdown = {};
    paymentMethods.forEach(payment => {
      const method = payment.customer_selected_payment || 'unknown';
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + 1;
    });

    // Get request status breakdown
    const statusCounts = await Request.findAll({
      attributes: ['request_status'],
      group: ['request_status'],
      raw: true
    });

    const statusBreakdown = {};
    for (const status of statusCounts) {
      const count = await Request.count({
        where: { request_status: status.request_status }
      });
      statusBreakdown[status.request_status] = count;
    }

    res.status(200).json({
      success: true,
      data: {
        stats: {
          total_customers: totalCustomers,
          total_delivery_boys: totalDeliveryBoys,
          total_requests: totalRequests,
          today_requests: todayRequests,
          total_revenue: totalRevenue,
          total_commission: totalCommission,
          partner_earnings: partnerEarnings,
          payment_breakdown: paymentBreakdown,
          status_breakdown: statusBreakdown
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

// Get revenue data grouped by date (for charts)
exports.getRevenueTimeSeries = async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    
    switch(period) {
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }
    
    // Format dates for database query
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Query to get completed requests grouped by date
    const revenueByDate = await Request.findAll({
      where: {
        request_status: 'completed',
        created_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
        [Sequelize.fn('SUM', Sequelize.col('base_price')), 'daily_revenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'request_count']
      ],
      group: [Sequelize.fn('DATE', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('DATE', Sequelize.col('created_at')), 'ASC']],
      raw: true
    });
    
    // Format response
    const formattedData = revenueByDate.map(item => ({
      date: item.date,
      revenue: parseFloat(item.daily_revenue) || 0,
      requests: parseInt(item.request_count) || 0
    }));
    
    res.status(200).json({
      success: true,
      data: {
        period,
        start_date: startDateStr,
        end_date: endDateStr,
        revenue_data: formattedData,
        total_revenue: formattedData.reduce((sum, item) => sum + item.revenue, 0),
        total_requests: formattedData.reduce((sum, item) => sum + item.requests, 0)
      }
    });
    
  } catch (error) {
    console.error('Get revenue time series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue time series',
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
      success: false,
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

exports.getAllRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) {
      where.request_status = status;
    }

    const { count, rows: requests } = await Request.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'customer',
          attributes: ['id', 'full_name', 'phone', 'email']
        },
        {
          model: User,
          as: 'footman',
          attributes: ['id', 'full_name', 'phone', 'is_online']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    // Calculate totals ONLY from completed requests
    const completedRequests = requests.filter(req => req.request_status === "completed");
    const totalRevenue = completedRequests.reduce((sum, req) => sum + parseFloat(req.base_price || 0), 0);
    const totalCommission = completedRequests.reduce((sum, req) => sum + parseFloat(req.commission || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        requests,
        totals: {
          total_requests: count,
          total_revenue: totalRevenue,
          total_commission: totalCommission,
          partner_earnings: totalRevenue - totalCommission
        },
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
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
