const { User, Request, sequelize } = require('../models');
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
        'nid_verified', 'vehicle_docs_verified', 'photo_verified',
        'rating', 'total_completed_jobs', 'created_at'
      ]
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

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
        pending_settlement: 0, // You can implement wallet table later
        last_deposit: lastRequest ? {
          amount: lastRequest.footman_earnings,
          date: lastRequest.completed_at
        } : null,
        weekly_payout: parseFloat(weeklyEarnings.toFixed(2))
      },
      verification: {
        nid_verified: partner.nid_verified || false,
        vehicle_docs_verified: partner.vehicle_docs_verified || false,
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
