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
    
    // Get pending approvals count (NEW - only partners with is_active=false AND no rejection reason)
    const pendingApprovals = await User.count({ 
      where: { 
        user_type: 'delivery',
        is_active: false,
        rejection_reason: null
      } 
    });
    
    // Get rejected partners count (NEW)
    const rejectedPartners = await User.count({ 
      where: { 
        user_type: 'delivery',
        is_active: false,
        rejection_reason: { [Op.ne]: null }
      } 
    });
    
    // Get online partners count
    const onlinePartners = await User.count({ 
      where: { 
        user_type: 'delivery',
        is_online: true 
      } 
    });
    
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

    // Calculate REAL revenue from ALL completed requests
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

    // Get payment method breakdown
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
          pending_approvals: pendingApprovals, // NEW: Only true pending
          rejected_partners: rejectedPartners, // NEW: Rejected count
          online_partners: onlinePartners,
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

// Get online partners with GPS locations
exports.getOnlinePartners = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: partners } = await User.findAndCountAll({
      where: {
        user_type: 'delivery',
        is_online: true,
        latitude: { [Op.not]: null },
        longitude: { [Op.not]: null }
      },
      attributes: ['id', 'full_name', 'phone', 'latitude', 'longitude', 
                   'last_location_update', 'is_online', 'rating', 
                   'total_completed_jobs', 'created_at', 'profile_image_url',
                   'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['last_location_update', 'DESC']]
    });

    // Get active jobs for each partner
    const partnersWithJobs = await Promise.all(
      partners.map(async (partner) => {
        const activeJobs = await Request.count({
          where: {
            assigned_footman_id: partner.id,
            request_status: { [Op.in]: ['searching', 'accepted', 'accepted_by_partner', 'ongoing'] }
          }
        });

        return {
          id: partner.id,
          full_name: partner.full_name,
          phone: partner.phone,
          latitude: partner.latitude,
          longitude: partner.longitude,
          last_location_update: partner.last_location_update,
          is_online: partner.is_online,
          rating: partner.rating,
          total_completed_jobs: partner.total_completed_jobs,
          created_at: partner.created_at,
          profile_image_url: partner.profile_image_url,
          emergency_contact_name: partner.emergency_contact_name,
          emergency_contact_phone: partner.emergency_contact_phone,
          emergency_contact_relationship: partner.emergency_contact_relationship,
          active_jobs: activeJobs,
          location_age: partner.last_location_update 
            ? Math.floor((new Date() - new Date(partner.last_location_update)) / 60000)
            : null
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        partners: partnersWithJobs,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get online partners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch online partners',
      error: error.message
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { user_type, status, is_online, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    
    // User type filter
    if (user_type) {
      where.user_type = user_type;
    }
    
    // Status filter (is_active) - UPDATED: differentiate pending vs rejected
    if (status === 'active') {
      where.is_active = true;
    } else if (status === 'inactive') {
      where.is_active = false;
    } else if (status === 'pending') {
      where.user_type = 'delivery';
      where.is_active = false;
      where.rejection_reason = null;
    } else if (status === 'rejected') {
      where.user_type = 'delivery';
      where.is_active = false;
      where.rejection_reason = { [Op.ne]: null };
    }
    
    // Online status filter
    if (is_online === 'true') {
      where.is_online = true;
    } else if (is_online === 'false') {
      where.is_online = false;
    }
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: ['id', 'full_name', 'phone', 'email', 'user_type', 'is_active', 'is_online',
                   'nid_number', 'profile_image_url', 'nid_front_image_url', 'nid_back_image_url',
                   'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
                   'latitude', 'longitude', 'last_location_update', 'rating', 'total_completed_jobs',
                   'rejection_reason', 'rejected_at', 'rejected_by', // NEW: include rejection fields
                   'created_at', 'updated_at'],
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

// ==================== NEW: APPROVE PARTNER ENDPOINT ====================
exports.approvePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const partner = await User.findByPk(id);
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    if (partner.user_type !== 'delivery') {
      return res.status(400).json({
        success: false,
        message: 'User is not a delivery partner'
      });
    }

    // Approve the partner
    await partner.approvePartner(adminId);

    // TODO: Send notification to partner
    // - Push notification via FCM
    // - SMS notification
    // - Email notification

    res.status(200).json({
      success: true,
      message: 'Partner approved successfully',
      data: {
        id: partner.id,
        full_name: partner.full_name,
        phone: partner.phone,
        is_active: partner.is_active,
        approved_at: new Date()
      }
    });
  } catch (error) {
    console.error('Approve partner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve partner',
      error: error.message
    });
  }
};

// ==================== NEW: REJECT PARTNER ENDPOINT ====================
exports.rejectPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    // Validate reason
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const partner = await User.findByPk(id);
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    if (partner.user_type !== 'delivery') {
      return res.status(400).json({
        success: false,
        message: 'User is not a delivery partner'
      });
    }

    // Reject the partner with reason
    await partner.rejectPartner(reason, adminId);

    // TODO: Send rejection notification to partner
    // - Push notification via FCM
    // - SMS notification with reason
    // - Email notification with reason

    res.status(200).json({
      success: true,
      message: 'Partner rejected successfully',
      data: {
        id: partner.id,
        full_name: partner.full_name,
        phone: partner.phone,
        is_active: partner.is_active,
        rejection_reason: partner.rejection_reason,
        rejected_at: partner.rejected_at
      }
    });
  } catch (error) {
    console.error('Reject partner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject partner',
      error: error.message
    });
  }
};

// ==================== NEW: GET PENDING APPROVALS ====================
exports.getPendingApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: partners } = await User.findAndCountAll({
      where: {
        user_type: 'delivery',
        is_active: false,
        rejection_reason: null
      },
      attributes: ['id', 'full_name', 'phone', 'email', 'nid_number', 'address',
                   'profile_image_url', 'nid_front_image_url', 'nid_back_image_url',
                   'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
                   'created_at'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: {
        partners,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending approvals',
      error: error.message
    });
  }
};

// ==================== NEW: GET REJECTED PARTNERS ====================
exports.getRejectedPartners = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: partners } = await User.findAndCountAll({
      where: {
        user_type: 'delivery',
        is_active: false,
        rejection_reason: { [Op.ne]: null }
      },
      attributes: ['id', 'full_name', 'phone', 'email', 'nid_number',
                   'rejection_reason', 'rejected_at', 'rejected_by',
                   'created_at'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['rejected_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        partners,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get rejected partners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rejected partners',
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

exports.getAllRequests = async (req, res) => {
  try {
    const { status, date_range, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    
    // Status filter - ONLY USE EXISTING STATUSES
    if (status && ['searching', 'accepted', 'accepted_by_partner', 'ongoing', 'completed', 'cancelled'].includes(status)) {
      where.request_status = status;
    }
    
    // Date range filter
    if (date_range) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (date_range === 'today') {
        where.created_at = { [Op.gte]: today };
      } else if (date_range === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        where.created_at = { [Op.gte]: weekAgo };
      } else if (date_range === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        where.created_at = { [Op.gte]: monthAgo };
      }
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

    // Calculate totals from ALL completed requests
    const completedRequestsAll = await Request.findAll({
      where: { request_status: 'completed' },
      attributes: ['base_price', 'commission']
    });
    
    const totalRevenue = completedRequestsAll.reduce((sum, req) => sum + parseFloat(req.base_price || 0), 0);
    const totalCommission = completedRequestsAll.reduce((sum, req) => sum + parseFloat(req.commission || 0), 0);

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

// Get documents with pagination and filters - UPDATED
exports.getPartnerDocuments = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {
      user_type: 'delivery'
    };
    
    // Status filter - UPDATED: differentiate pending vs rejected
    if (status === 'verified') {
      where.is_active = true;
    } else if (status === 'pending') {
      where.is_active = false;
      where.rejection_reason = null;
    } else if (status === 'rejected') {
      where.is_active = false;
      where.rejection_reason = { [Op.ne]: null };
    }
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { nid_number: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: partners } = await User.findAndCountAll({
      where,
      attributes: ['id', 'full_name', 'phone', 'nid_number', 'is_active', 
                   'profile_image_url', 'nid_front_image_url', 'nid_back_image_url',
                   'rejection_reason', 'rejected_at', // NEW: include rejection fields
                   'created_at', 'emergency_contact_name', 'emergency_contact_phone', 
                   'emergency_contact_relationship', 'address'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    // Format response for documents view
    const documents = partners.map(partner => {
      const docs = [];
      
      if (partner.profile_image_url && partner.profile_image_url !== 'null') {
        docs.push({
          type: 'profile',
          title: 'Profile Photo',
          url: partner.profile_image_url,
          verified: partner.is_active
        });
      }
      
      if (partner.nid_front_image_url && partner.nid_front_image_url !== 'null') {
        docs.push({
          type: 'nid_front',
          title: 'NID Front',
          url: partner.nid_front_image_url,
          verified: partner.is_active
        });
      }
      
      if (partner.nid_back_image_url && partner.nid_back_image_url !== 'null') {
        docs.push({
          type: 'nid_back',
          title: 'NID Back',
          url: partner.nid_back_image_url,
          verified: partner.is_active
        });
      }
      
      return {
        partner: {
          id: partner.id,
          name: partner.full_name,
          phone: partner.phone,
          nid: partner.nid_number,
          address: partner.address,
          status: partner.is_active ? 'verified' : (partner.rejection_reason ? 'rejected' : 'pending'),
          rejection_reason: partner.rejection_reason,
          rejected_at: partner.rejected_at,
          joined: partner.created_at,
          emergency_contact_name: partner.emergency_contact_name,
          emergency_contact_phone: partner.emergency_contact_phone,
          emergency_contact_relationship: partner.emergency_contact_relationship
        },
        documents: docs,
        total_docs: docs.length
      };
    });

    res.status(200).json({
      success: true,
      data: {
        documents,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get partner documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch partner documents',
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
