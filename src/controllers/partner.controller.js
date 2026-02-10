const { User, Request, Transaction, sequelize } = require('../models');
const { Op } = require('sequelize');
const { uploadProfileImage, uploadToCloudinary, getFileUrl, deleteFile } = require('../middleware/upload.middleware');
const socketService = require('../socket/socket.service');

/**
 * 1. PARTNER DASHBOARD ENDPOINT
 * GET /api/v1/partner/dashboard
 */
exports.getPartnerDashboard = async (req, res) => {
  try {
    const partnerId = req.user.id;
    
    // Get partner user data
    const partner = await User.findByPk(partnerId, {
      attributes: [
        'id', 'full_name', 'email', 'phone', 'profile_image_url',
        'is_online', 'last_online_at', 'latitude', 'longitude', 'last_location_update',
        'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
        'nid_verified', 'photo_verified',
        'rating', 'total_completed_jobs', 'created_at',
        // Payment fields
        'bkash_number', 'nagad_number',
        'cash_commission_due', 'cash_settlement_threshold',
        'is_payment_blocked', 'payment_blocked_at', 'last_cash_settlement_date',
        // New commission deadline fields
        'commission_deadline', 'last_commission_alert', 'payment_block_reason'
      ]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check commission deadline (auto-block if expired)
    await partner.checkCommissionDeadline();
    
    // Get commission status
    const commissionStatus = partner.getCommissionStatus();

    // Calculate wallet data
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    // Get completed requests in last 7 days for wallet calculation
    const completedRequests = await Request.findAll({
      where: {
        assigned_footman_id: partnerId,
        request_status: 'completed',
        completed_at: { [Op.gte]: sevenDaysAgo }
      },
      attributes: ['id', 'footman_earnings', 'completed_at']
    });

    const weeklyEarnings = completedRequests.reduce((sum, req) => sum + (parseFloat(req.footman_earnings) || 0), 0);
    
    // Get last deposit (last completed request with earnings)
    const lastRequest = await Request.findOne({
      where: {
        assigned_footman_id: partnerId,
        request_status: 'completed',
        footman_earnings: { [Op.gt]: 0 }
      },
      order: [['completed_at', 'DESC']],
      attributes: ['completed_at', 'footman_earnings']
    });

    // Calculate performance metrics
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const todayRequests = await Request.count({
      where: {
        assigned_footman_id: partnerId,
        request_status: 'completed',
        completed_at: { [Op.gte]: startOfDay }
      }
    });

    const totalRequests = await Request.count({
      where: {
        assigned_footman_id: partnerId
      }
    });

    const cancelledRequests = await Request.count({
      where: {
        assigned_footman_id: partnerId,
        request_status: 'cancelled'
      }
    });

    // Calculate average job completion time
    const completedJobs = await Request.findAll({
      where: {
        assigned_footman_id: partnerId,
        request_status: 'completed',
        accepted_at: { [Op.not]: null },
        completed_at: { [Op.not]: null }
      },
      attributes: ['accepted_at', 'completed_at']
    });

    let avgJobTime = 0;
    if (completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((sum, job) => {
        const duration = new Date(job.completed_at) - new Date(job.accepted_at);
        return sum + (duration / 60000); // Convert to minutes
      }, 0);
      avgJobTime = totalTime / completedJobs.length;
    }

    // Calculate cancel rate
    const cancelRate = totalRequests > 0 
      ? (cancelledRequests / totalRequests) * 100 
      : 0;

    // Get transaction summary for payment data
    const transactionSummary = await Transaction.getPartnerSummary(partnerId);
    
    // Calculate payment breakdown - MAINTAIN ORDER: cash, bkash, nagad
    let cashEarnings = 0;
    let bkashEarnings = 0;
    let nagadEarnings = 0;
    let totalCommission = 0;
    
    transactionSummary.forEach(item => {
      if (item.payment_method === 'cash') {
        cashEarnings += parseFloat(item.partner_share || 0);
        totalCommission += parseFloat(item.commission || 0);
      } else if (item.payment_method === 'bkash') {
        bkashEarnings += parseFloat(item.partner_share || 0);
      } else if (item.payment_method === 'nagad') {
        nagadEarnings += parseFloat(item.partner_share || 0);
      }
    });

    const digitalEarnings = bkashEarnings + nagadEarnings;

    // Prepare response matching your frontend expectations
    const dashboardData = {
      profile: {
        user_data: {
          id: partner.id,
          full_name: partner.full_name,
          email: partner.email,
          phone: partner.phone,
          profile_image_url: partner.profile_image_url,
          rating: partner.rating,
          total_completed_jobs: partner.total_completed_jobs
        },
        is_online: partner.is_online,
        emergency_contact: partner.emergency_contact_name 
          ? `${partner.emergency_contact_name} (${partner.emergency_contact_relationship}): ${partner.emergency_contact_phone}`
          : null
      },
      wallet: {
        cash_in_hand: parseFloat(weeklyEarnings.toFixed(2)),
        pending_settlement: 0,
        last_deposit: lastRequest ? {
          amount: lastRequest.footman_earnings,
          date: lastRequest.completed_at
        } : null,
        weekly_payout: parseFloat(weeklyEarnings.toFixed(2))
      },
      payment: {
        methods: {
          cash: true, // ALWAYS FIRST: Cash is always enabled
          bkash: partner.bkash_number,
          nagad: partner.nagad_number
        },
        summary: {
          // ORDER: cash first, then digital breakdown
          cash_earnings: parseFloat(cashEarnings.toFixed(2)),
          bkash_earnings: parseFloat(bkashEarnings.toFixed(2)),
          nagad_earnings: parseFloat(nagadEarnings.toFixed(2)),
          digital_earnings: parseFloat(digitalEarnings.toFixed(2)),
          total_commission: parseFloat(totalCommission.toFixed(2)),
          cash_commission_due: parseFloat(partner.cash_commission_due || 0),
          settlement_threshold: parseFloat(partner.cash_settlement_threshold || 50),
          is_payment_blocked: partner.is_payment_blocked || false,
          blocked_since: partner.payment_blocked_at,
          last_settlement: partner.last_cash_settlement_date
        },
        // New commission status fields
        commission_status: {
          commission_due: commissionStatus.commission_due,
          threshold: commissionStatus.threshold,
          is_payment_blocked: commissionStatus.is_payment_blocked,
          blocked_at: commissionStatus.blocked_at,
          deadline: commissionStatus.deadline,
          last_alert: commissionStatus.last_alert,
          time_remaining: commissionStatus.time_remaining,
          hours_remaining: commissionStatus.hours_remaining,
          minutes_remaining: commissionStatus.minutes_remaining,
          is_urgent: commissionStatus.is_urgent,
          reason: commissionStatus.reason,
          can_accept_requests: commissionStatus.can_accept_requests,
          needs_payment: commissionStatus.needs_payment
        }
      },
      verification: {
        nid_verified: partner.nid_verified || false,
        photo_verified: partner.photo_verified || false
      },
      performance: {
        today_jobs: todayRequests,
        weekly_earnings: parseFloat(weeklyEarnings.toFixed(2)),
        cancel_rate: parseFloat(cancelRate.toFixed(2)),
        avg_job_time: parseFloat(avgJobTime.toFixed(2))
      },
      tracking_status: {
        is_tracking: !!(partner.latitude && partner.longitude),
        last_gps_timestamp: partner.last_location_update,
        last_location_sent: partner.last_location_update,
        socket_publish_success: true
      },
      device_status: {
        app_version: req.headers['app-version'] || '2.0.0'
      }
    };

    return res.json({
      success: true,
      message: 'Partner dashboard data retrieved successfully',
      data: dashboardData
    });
  } catch (error) {
    console.error('Get partner dashboard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 2. PROFILE PHOTO UPLOAD WITH CLOUDINARY
 * POST /api/v1/partner/profile/photo
 */
exports.uploadProfilePhoto = (req, res) => {
  // Use the upload middleware
  uploadProfileImage(req, res, async function(err) {
    try {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      const partnerId = req.user.id;
      
      // Delete old profile photo if exists
      const partner = await User.findByPk(partnerId, {
        attributes: ['profile_image_url']
      });
      
      if (partner && partner.profile_image_url) {
        try {
          await deleteFile(partner.profile_image_url);
          console.log(`✅ Deleted old profile photo for partner ${partnerId}`);
        } catch (deleteError) {
          console.error('Failed to delete old photo:', deleteError);
          // Continue with upload even if delete fails
        }
      }
      
      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(req.file, 'profile', partnerId);
      
      if (!uploadResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image to cloud storage'
        });
      }
      
      // Get file URL
      const fileUrl = getFileUrl(uploadResult, 'profile');
      
      // Update user profile image URL
      await User.update(
        { profile_image_url: fileUrl },
        { where: { id: partnerId } }
      );

      // Get updated user
      const updatedUser = await User.findByPk(partnerId, {
        attributes: ['id', 'full_name', 'profile_image_url', 'photo_verified']
      });

      // Emit WebSocket event for profile update
      if (socketService && socketService.notifyPartner) {
        socketService.notifyPartner(partnerId, 'profile_updated', {
          userId: partnerId,
          profile_image_url: fileUrl,
          updated_at: new Date()
        });
        
        // Also emit to admins if needed
        socketService.io.to('admin_room').emit('partner_profile_updated', {
          partner_id: partnerId,
          profile_image_url: fileUrl,
          updated_at: new Date()
        });
      }

      return res.json({
        success: true,
        message: 'Profile photo uploaded successfully to cloud storage',
        data: {
          photo_url: fileUrl,
          user: {
            id: updatedUser.id,
            full_name: updatedUser.full_name,
            profile_image_url: updatedUser.profile_image_url,
            photo_verified: updatedUser.photo_verified
          }
        }
      });
    } catch (error) {
      console.error('Upload profile photo error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload profile photo',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
};

/**
 * 3. PANIC BUTTON ENDPOINT
 * POST /api/v1/partner/panic
 */
exports.triggerPanicButton = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { latitude, longitude, reason } = req.body;

    // Get partner details
    const partner = await User.findByPk(partnerId, {
      attributes: [
        'id', 'full_name', 'phone', 'latitude', 'longitude',
        'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'
      ]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Use provided location or partner's last known location
    const panicLocation = {
      latitude: latitude || partner.latitude,
      longitude: longitude || partner.longitude,
      timestamp: new Date()
    };

    // Create panic log entry (you should create a PanicLog model later)
    const panicData = {
      partner_id: partnerId,
      latitude: panicLocation.latitude,
      longitude: panicLocation.longitude,
      reason: reason || 'Emergency SOS activated',
      timestamp: panicLocation.timestamp,
      status: 'active'
    };

    console.log('🚨 PANIC BUTTON ACTIVATED:', {
      partner: partner.full_name,
      phone: partner.phone,
      location: panicLocation,
      timestamp: panicLocation.timestamp.toISOString(),
      reason: reason || 'Emergency SOS'
    });

    // Emit WebSocket event to admin
    if (socketService && socketService.io) {
      // Emit to all admins
      socketService.io.to('admin_room').emit('partner_panic', {
        type: 'partner_panic',
        partner_id: partnerId,
        partner_name: partner.full_name,
        partner_phone: partner.phone,
        location: panicLocation,
        reason: reason || 'Emergency SOS button pressed',
        timestamp: panicLocation.timestamp,
        emergency_contact: {
          name: partner.emergency_contact_name,
          phone: partner.emergency_contact_phone,
          relationship: partner.emergency_contact_relationship
        }
      });

      // Also emit to partner for confirmation
      socketService.notifyPartner(partnerId, 'panic_alert_sent', {
        alert_id: Date.now().toString(),
        timestamp: panicLocation.timestamp,
        status: 'alert_sent_to_admin'
      });
    }

    // TODO: Implement SMS/Email notifications to admin

    return res.json({
      success: true,
      message: 'Emergency alert sent successfully',
      data: {
        alert_id: Date.now().toString(),
        timestamp: panicLocation.timestamp,
        location: panicLocation,
        status: 'alert_sent',
        emergency_contact_notified: false // Set to true when you implement SMS/Email
      }
    });
  } catch (error) {
    console.error('Panic button error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send emergency alert',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 4. UPDATE ONLINE STATUS (enhanced version)
 * POST /api/v1/partner/online-status
 */
exports.updateOnlineStatus = async (req, res) => {
  try {
    const { is_online } = req.body;
    const partnerId = req.user.id;

    if (typeof is_online !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_online must be a boolean (true/false)'
      });
    }

    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Update online status and timestamp
    const updateData = { 
      is_online,
      last_online_at: is_online ? new Date() : partner.last_online_at
    };
    
    await partner.update(updateData);

    // Emit WebSocket event for status change
    if (socketService && socketService.io) {
      socketService.io.to('admin_room').emit('partner_status_changed', {
        partner_id: partnerId,
        partner_name: partner.full_name,
        is_online: is_online,
        timestamp: new Date()
      });

      socketService.notifyPartner(partnerId, 'status_updated', {
        is_online: is_online,
        timestamp: new Date()
      });
    }

    return res.json({
      success: true,
      message: is_online ? 'You are now online' : 'You are now offline',
      data: {
        is_online: partner.is_online,
        last_online_at: partner.last_online_at
      }
    });
  } catch (error) {
    console.error('Update online status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update online status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 5. GET PARTNER STATISTICS
 * GET /api/v1/partner/stats
 */
exports.getPartnerStatistics = async (req, res) => {
  try {
    const partnerId = req.user.id;

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7);

    // Get statistics using Sequelize aggregations
    const [todayStats, weeklyStats, allTimeStats] = await Promise.all([
      Request.findOne({
        where: {
          assigned_footman_id: partnerId,
          request_status: 'completed',
          completed_at: { [Op.gte]: startOfDay }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'jobs'],
          [sequelize.fn('SUM', sequelize.col('footman_earnings')), 'earnings']
        ],
        raw: true
      }),
      
      Request.findOne({
        where: {
          assigned_footman_id: partnerId,
          request_status: 'completed',
          completed_at: { [Op.gte]: startOfWeek }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'jobs'],
          [sequelize.fn('SUM', sequelize.col('footman_earnings')), 'earnings']
        ],
        raw: true
      }),
      
      Request.findOne({
        where: {
          assigned_footman_id: partnerId,
          request_status: 'completed'
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'jobs'],
          [sequelize.fn('SUM', sequelize.col('footman_earnings')), 'earnings']
        ],
        raw: true
      })
    ]);

    return res.json({
      success: true,
      data: {
        today: {
          jobs: parseInt(todayStats?.jobs || 0),
          earnings: parseFloat(todayStats?.earnings || 0)
        },
        weekly: {
          jobs: parseInt(weeklyStats?.jobs || 0),
          earnings: parseFloat(weeklyStats?.earnings || 0)
        },
        all_time: {
          jobs: parseInt(allTimeStats?.jobs || 0),
          earnings: parseFloat(allTimeStats?.earnings || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get partner statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 6. GET PAYMENT METHODS
 * GET /api/v1/partner/payment-methods
 */
exports.getPaymentMethods = async (req, res) => {
  try {
    const partnerId = req.user.id;
    
    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check commission deadline (auto-block if expired)
    const deadlineStatus = await partner.checkCommissionDeadline();
    
    // Get commission status
    const commissionStatus = partner.getCommissionStatus();

    return res.json({
      success: true,
      data: {
        methods: {
          cash: true, // ALWAYS FIRST: Cash is always enabled
          bkash: partner.bkash_number,
          nagad: partner.nagad_number
        },
        cash_settlement: {
          commission_due: parseFloat(partner.cash_commission_due || 0),
          settlement_threshold: parseFloat(partner.cash_settlement_threshold || 50),
          is_blocked: partner.is_payment_blocked || false,
          blocked_since: partner.payment_blocked_at,
          last_settlement: partner.last_cash_settlement_date
        },
        commission_status: commissionStatus
      }
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 7. UPDATE PAYMENT METHODS
 * POST /api/v1/partner/payment-methods
 */
exports.updatePaymentMethods = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { bkash_number, nagad_number } = req.body;

    // Validate inputs
    const updates = {};
    
    if (bkash_number !== undefined) {
      if (bkash_number && !/^01[3-9]\d{8}$/.test(bkash_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Bkash number format. Must be 11 digits starting with 01'
        });
      }
      updates.bkash_number = bkash_number || null;
    }
    
    if (nagad_number !== undefined) {
      if (nagad_number && !/^01[3-9]\d{8}$/.test(nagad_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Nagad number format. Must be 11 digits starting with 01'
        });
      }
      updates.nagad_number = nagad_number || null;
    }

    // Update partner
    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    await partner.update(updates);

    return res.json({
      success: true,
      message: 'Payment methods updated successfully',
      data: {
        methods: {
          cash: true, // Cash is always enabled, always first
          bkash: partner.bkash_number,
          nagad: partner.nagad_number
        }
      }
    });
  } catch (error) {
    console.error('Update payment methods error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update payment methods',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 8. GET TRANSACTION HISTORY
 * GET /api/v1/partner/transactions
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { page = 1, limit = 20, payment_method } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    const where = { partner_id: partnerId };
    if (payment_method) {
      where.payment_method = payment_method;
    }

    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where,
      order: [
        // ORDER BY: cash first, then bkash, then nagad
        sequelize.literal("CASE payment_method WHEN 'cash' THEN 1 WHEN 'bkash' THEN 2 WHEN 'nagad' THEN 3 ELSE 4 END"),
        ['created_at', 'DESC']
      ],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate totals
    const totals = await Transaction.findOne({
      where: { partner_id: partnerId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_count'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
        [sequelize.fn('SUM', sequelize.col('commission')), 'total_commission'],
        [sequelize.fn('SUM', sequelize.col('partner_share')), 'total_earnings']
      ],
      raw: true
    });

    return res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        },
        totals: {
          total_count: parseInt(totals?.total_count || 0),
          total_amount: parseFloat(totals?.total_amount || 0),
          total_commission: parseFloat(totals?.total_commission || 0),
          total_earnings: parseFloat(totals?.total_earnings || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 9. PAY CASH COMMISSION (UPDATED WITH PAYMENT NUMBER)
 * POST /api/v1/partner/cash-settlement/pay
 */
exports.payCashCommission = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { amount, payment_method, payment_number } = req.body;

    // Validate inputs
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    if (!payment_method || !['bkash', 'nagad'].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Payment method must be bkash or nagad'
      });
    }

    // Validate payment number if provided (can be ANY valid Bangladeshi number)
    if (payment_number && !/^01[3-9]\d{8}$/.test(payment_number)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment number format. Must be 11 digits starting with 01'
      });
    }

    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const commissionDue = parseFloat(partner.cash_commission_due || 0);
    const paymentAmount = parseFloat(amount);

    // Check if commission due meets threshold (50 BDT)
    if (commissionDue < partner.cash_settlement_threshold) {
      return res.status(400).json({
        success: false,
        message: `Commission due (${commissionDue}) is below threshold (${partner.cash_settlement_threshold}). No payment required.`
      });
    }

    // Check if payment is valid
    if (paymentAmount > commissionDue) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (${paymentAmount}) cannot exceed commission due (${commissionDue})`
      });
    }

    // Check minimum payment (at least threshold amount or full amount if less)
    const minimumPayment = Math.min(partner.cash_settlement_threshold, commissionDue);
    if (paymentAmount < minimumPayment) {
      return res.status(400).json({
        success: false,
        message: `Minimum payment required: ${minimumPayment} BDT (settlement threshold)`
      });
    }

    // Update partner commission using the new method with payment number
    await partner.payCashCommission(paymentAmount, payment_method, payment_number);

    // Check commission deadline after payment
    const deadlineStatus = await partner.checkCommissionDeadline();

    // Create settlement transaction record with payment number
    const settlement = await Transaction.create({
      partner_id: partnerId,
      customer_id: 0, // System payment
      request_id: 0, // No specific request
      payment_method: payment_method,
      payment_number: payment_number || null, // Store the payment number used
      total_amount: paymentAmount,
      commission: paymentAmount,
      partner_share: 0, // Partner pays, doesn't receive
      cash_settled: true,
      cash_settled_at: new Date(),
      cash_settlement_method: payment_method,
      status: 'completed',
      notes: `Cash commission settlement via ${payment_method}${payment_number ? ` to ${payment_number}` : ''}`
    });

    // Get updated commission status
    const commissionStatus = partner.getCommissionStatus();

    // Emit WebSocket event for real-time update
    if (socketService && socketService.notifyPartner) {
      socketService.notifyPartner(partnerId, 'cash_settlement_paid', {
        amount: paymentAmount,
        method: payment_method,
        payment_number: payment_number,
        new_balance: partner.cash_commission_due,
        is_unblocked: !partner.is_payment_blocked,
        timestamp: new Date()
      });
    }

    return res.json({
      success: true,
      message: paymentAmount >= commissionDue 
        ? 'Cash commission fully paid! Account is now unblocked.' 
        : 'Cash commission partially paid.',
      data: {
        payment: {
          amount: paymentAmount,
          method: payment_method,
          payment_number: payment_number,
          reference: settlement.id
        },
        commission: {
          previous_due: commissionDue,
          paid: paymentAmount,
          new_due: partner.cash_commission_due,
          is_blocked: partner.is_payment_blocked,
          can_accept_requests: commissionStatus.can_accept_requests
        },
        deadline_status: deadlineStatus,
        settlement: settlement
      }
    });
  } catch (error) {
    console.error('Pay cash commission error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process cash commission payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 10. GET CASH COMMISSION STATUS
 * GET /api/v1/partner/cash-settlement/status
 */
exports.getCashCommissionStatus = async (req, res) => {
  try {
    const partnerId = req.user.id;

    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check and update deadline status
    const deadlineStatus = await partner.checkCommissionDeadline();
    
    // Get commission status
    const commissionStatus = partner.getCommissionStatus();

    return res.json({
      success: true,
      data: {
        commission: {
          due: commissionStatus.commission_due,
          threshold: commissionStatus.threshold,
          needs_payment: commissionStatus.needs_payment,
          last_settlement: partner.last_cash_settlement_date
        },
        deadline: {
          deadline: commissionStatus.deadline,
          last_alert: commissionStatus.last_alert,
          time_remaining: commissionStatus.time_remaining,
          hours_remaining: commissionStatus.hours_remaining,
          minutes_remaining: commissionStatus.minutes_remaining,
          is_urgent: commissionStatus.is_urgent
        },
        account: {
          is_blocked: commissionStatus.is_payment_blocked,
          blocked_at: commissionStatus.blocked_at,
          blocked_reason: commissionStatus.reason,
          can_accept_requests: commissionStatus.can_accept_requests
        },
        payment_methods: {
          bkash: partner.bkash_number,
          nagad: partner.nagad_number,
          has_digital: !!(partner.bkash_number || partner.nagad_number)
        }
      }
    });
  } catch (error) {
    console.error('Get cash commission status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch cash commission status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 11. SEND OTP FOR PAYMENT METHOD VERIFICATION
 * POST /api/v1/partner/verify/send-otp
 */
exports.sendPaymentMethodOtp = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { phone_number, payment_type } = req.body; // payment_type: 'bkash' or 'nagad'

    // Validate inputs
    if (!phone_number || !payment_type) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and payment type are required'
      });
    }

    if (!['bkash', 'nagad'].includes(payment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Payment type must be bkash or nagad'
      });
    }

    // Validate Bangladeshi phone number
    if (!/^01[3-9]\d{8}$/.test(phone_number)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Must be 11 digits starting with 01'
      });
    }

    // Get partner to check if number already exists
    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check if number is already registered to another partner
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { bkash_number: phone_number },
          { nagad_number: phone_number }
        ],
        id: { [Op.ne]: partnerId }
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already registered to another partner'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set OTP expiry (5 minutes from now)
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    
    // Store OTP in database (we can use reset_password_otp fields temporarily)
    await partner.update({
      reset_password_otp: otp,
      reset_password_expires: otpExpiry
    });

    // TODO: Implement actual SMS sending service
    // For now, log the OTP (in production, send via SMS gateway)
    console.log(`📱 OTP for ${payment_type} verification (${phone_number}): ${otp}`);
    console.log(`⏰ OTP expires at: ${otpExpiry}`);

    // In production, use an SMS service like:
    // await sendSms(phone_number, `Your FOOTMAN ${payment_type.toUpperCase()} verification OTP is: ${otp}`);

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phone_number: phone_number,
        payment_type: payment_type,
        expires_in: 300, // 5 minutes in seconds
        // NOTE: In development, we return OTP for testing
        // Remove this in production
        otp: process.env.NODE_ENV === 'development' ? otp : undefined
      }
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 12. VERIFY OTP FOR PAYMENT METHOD
 * POST /api/v1/partner/verify/verify-otp
 */
exports.verifyPaymentMethodOtp = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { phone_number, payment_type, otp } = req.body;

    // Validate inputs
    if (!phone_number || !payment_type || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, payment type and OTP are required'
      });
    }

    if (!['bkash', 'nagad'].includes(payment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Payment type must be bkash or nagad'
      });
    }

    if (otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 6 digits'
      });
    }

    // Get partner
    const partner = await User.findByPk(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Check OTP
    const storedOtp = partner.reset_password_otp;
    const otpExpiry = partner.reset_password_expires;

    if (!storedOtp || !otpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'No OTP request found. Please request a new OTP.'
      });
    }

    // Check if OTP expired
    if (new Date() > new Date(otpExpiry)) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Verify OTP (case-insensitive for safety)
    if (storedOtp.toString() !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // OTP verified successfully - update payment method
    const updates = {};
    if (payment_type === 'bkash') {
      updates.bkash_number = phone_number;
    } else if (payment_type === 'nagad') {
      updates.nagad_number = phone_number;
    }

    // Clear OTP after successful verification
    updates.reset_password_otp = null;
    updates.reset_password_expires = null;

    await partner.update(updates);

    // Emit WebSocket event for real-time update
    if (socketService && socketService.notifyPartner) {
      socketService.notifyPartner(partnerId, 'payment_method_verified', {
        payment_type: payment_type,
        phone_number: phone_number,
        timestamp: new Date()
      });
    }

    return res.json({
      success: true,
      message: `${payment_type.toUpperCase()} number verified successfully`,
      data: {
        payment_type: payment_type,
        phone_number: phone_number,
        verified_at: new Date()
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
