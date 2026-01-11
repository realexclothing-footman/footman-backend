const { User, Order, OrderItem, Transaction } = require('../models');
const MatchingService = require('../services/matching.service');
const PricingService = require('../services/pricing.service');
const { Op } = require('sequelize');

/**
 * 1. GO ONLINE/OFFLINE
 */
exports.toggleOnlineStatus = async (req, res) => {
  try {
    const { is_online } = req.body;
    const user_id = req.user.id;

    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update online status
    await user.update({ is_online });

    return res.json({
      success: true,
      message: is_online ? 'You are now online' : 'You are now offline',
      data: {
        is_online: user.is_online
      }
    });
  } catch (error) {
    console.error('Toggle online status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * 2. UPDATE LOCATION
 */
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const user_id = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update location
    await user.update({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      last_location_update: new Date()
    });

    return res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        latitude: user.latitude,
        longitude: user.longitude
      }
    });
  } catch (error) {
    console.error('Update location error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * 3. GET AVAILABLE ORDERS (WITHIN 1KM RADIUS)
 */
exports.getAvailableOrders = async (req, res) => {
  try {
    const footman_id = req.user.id;

    // Check if user is a Footman and online
    const user = await User.findByPk(footman_id);
    if (user.user_type !== 'delivery') {
      return res.status(403).json({
        success: false,
        message: 'Only Footmen can access this endpoint'
      });
    }

    if (!user.is_online) {
      return res.status(400).json({
        success: false,
        message: 'You must be online to see available orders'
      });
    }

    // Get Footman's current location
    if (!user.latitude || !user.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location not set. Please update your location first.'
      });
    }

    // Find orders in 'searching' status (looking for Footmen)
    const orders = await Order.findAll({
      where: {
        order_status: 'searching',
        assigned_footman_id: null
      },
      include: [
        {
          model: User,
          as: 'customer',
          attributes: ['id', 'full_name', 'phone']
        }
      ],
      order: [['created_at', 'ASC']]
    });

    // Filter orders within 1KM radius
    const nearbyOrders = orders.filter(order => {
      if (!order.pickup_lat || !order.pickup_lng) return false;
      
      const distance = MatchingService.calculateDistance(
        user.latitude, user.longitude,
        order.pickup_lat, order.pickup_lng
      );
      
      order.distance_km = distance;
      return distance <= 1; // 1KM radius
    });

    // Sort by nearest first
    nearbyOrders.sort((a, b) => a.distance_km - b.distance_km);

    // Format response
    const formattedOrders = nearbyOrders.map(order => ({
      id: order.id,
      order_number: order.order_number,
      customer_name: order.customer?.full_name || 'Customer',
      customer_phone: order.customer?.phone,
      pickup_address: order.pickup_address,
      delivery_address: order.delivery_address,
      items_description: order.items_description,
      estimated_amount: order.estimated_amount,
      delivery_instructions: order.delivery_instructions,
      payment_method: order.payment_method,
      distance_km: parseFloat(order.distance_km).toFixed(2),
      created_at: order.created_at,
      pricing: order.pricing_details ? JSON.parse(order.pricing_details) : null
    }));

    return res.json({
      success: true,
      message: `Found ${formattedOrders.length} available orders within 1KM`,
      data: {
        orders: formattedOrders
      }
    });
  } catch (error) {
    console.error('Get available orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * 4. ACCEPT ORDER
 */
exports.acceptOrder = async (req, res) => {
  try {
    const order_id = req.params.id;
    const footman_id = req.user.id;

    const order = await Order.findByPk(order_id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.order_status !== 'searching') {
      return res.status(400).json({
        success: false,
        message: 'This order is no longer available'
      });
    }

    if (order.assigned_footman_id) {
      return res.status(400).json({
        success: false,
        message: 'This order has already been accepted'
      });
    }

    // Check if Footman is within 1KM radius
    const user = await User.findByPk(footman_id);
    if (!user.latitude || !user.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Please update your location first'
      });
    }

    const distance = MatchingService.calculateDistance(
      user.latitude, user.longitude,
      order.pickup_lat, order.pickup_lng
    );

    if (distance > 1) {
      return res.status(400).json({
        success: false,
        message: `You are ${distance.toFixed(2)}KM away. Must be within 1KM to accept.`
      });
    }

    // Update order
    await order.update({
      order_status: 'accepted',
      assigned_footman_id: footman_id,
      accepted_at: new Date()
    });

    // Update Footman's stats
    await user.update({
      total_completed_jobs: (user.total_completed_jobs || 0) + 1
    });

    return res.json({
      success: true,
      message: 'Order accepted successfully',
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
          order_status: order.order_status,
          assigned_footman_id: order.assigned_footman_id,
          accepted_at: order.accepted_at
        }
      }
    });
  } catch (error) {
    console.error('Accept order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * 5. GET FOOTMAN'S ACTIVE ORDERS
 */
exports.getMyOrders = async (req, res) => {
  try {
    const footman_id = req.user.id;

    // Check if user is a Footman
    const user = await User.findByPk(footman_id);
    if (user.user_type !== 'delivery') {
      return res.status(403).json({
        success: false,
        message: 'Only Footmen can access this endpoint'
      });
    }

    // Get Footman's orders (accepted, picked_up, delivered but not completed)
    const orders = await Order.findAll({
      where: {
        assigned_footman_id: footman_id,
        order_status: ['accepted', 'picked_up', 'delivered']
      },
      include: [
        {
          model: User,
          as: 'customer',
          attributes: ['id', 'full_name', 'phone']
        }
      ],
      order: [['accepted_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your orders',
      error: error.message
    });
  }
};

/**
 * 6. UPDATE ORDER STATUS
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const order_id = req.params.id;
    const { status } = req.body;
    const footman_id = req.user.id;

    const validStatuses = ['picked_up', 'on_the_way', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findByPk(order_id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.assigned_footman_id !== footman_id) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    // Update order status
    await order.update({
      order_status: status,
      ...(status === 'picked_up' && { picked_up_at: new Date() }),
      ...(status === 'delivered' && { delivered_at: new Date() }),
      ...(status === 'cancelled' && { cancelled_at: new Date() })
    });

    // If delivered, create transaction record
    if (status === 'delivered') {
      const pricing = order.pricing_details ? JSON.parse(order.pricing_details) : null;
      
      if (pricing && pricing.partnerEarnings) {
        await Transaction.create({
          order_id: order.id,
          footman_id: footman_id,
          amount: pricing.partnerEarnings,
          commission: pricing.commission,
          total_amount: pricing.totalPrice,
          transaction_type: 'delivery_earning',
          status: 'completed'
        });
      }
    }

    return res.json({
      success: true,
      message: `Order status updated to: ${status}`,
      data: {
        order: {
          id: order.id,
          order_number: order.order_number,
          order_status: order.order_status
        }
      }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * 7. GET FOOTMAN STATS
 */
exports.getFootmanStats = async (req, res) => {
  try {
    const footman_id = req.user.id;

    const user = await User.findByPk(footman_id, {
      attributes: ['id', 'full_name', 'phone', 'total_completed_jobs', 'rating', 'is_online']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysTransactions = await Transaction.findAll({
      where: {
        footman_id: footman_id,
        transaction_type: 'delivery_earning',
        status: 'completed',
        created_at: {
          [Op.gte]: today
        }
      }
    });

    const todaysEarnings = todaysTransactions.reduce((sum, transaction) => {
      return sum + (transaction.amount || 0);
    }, 0);

    // Get total earnings
    const allTransactions = await Transaction.findAll({
      where: {
        footman_id: footman_id,
        transaction_type: 'delivery_earning',
        status: 'completed'
      }
    });

    const totalEarnings = allTransactions.reduce((sum, transaction) => {
      return sum + (transaction.amount || 0);
    }, 0);

    return res.json({
      success: true,
      data: {
        footman: user,
        earnings: {
          today: todaysEarnings,
          total: totalEarnings
        },
        transactions: {
          today: todaysTransactions.length,
          total: allTransactions.length
        }
      }
    });
  } catch (error) {
    console.error('Get footman stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
