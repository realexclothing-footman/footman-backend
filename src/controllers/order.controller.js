const Order = require('../models/Order');
const Address = require('../models/Address');
const User = require('../models/User');
const MatchingService = require('../services/matching.service');
const CommissionService = require('../services/commission.service');

exports.createOrder = async (req, res) => {
  try {
    const { 
      store_name, 
      store_address, 
      items_description, 
      estimated_amount,
      delivery_address_id,
      delivery_instructions,
      payment_method,
      pickup_lat,
      pickup_lng,
      delivery_lat,
      delivery_lng
    } = req.body;

    const customer_id = req.user.id;

    // 1. Validate distance is within 1KM limit
    if (pickup_lat && pickup_lng && delivery_lat && delivery_lng) {
      MatchingService.validateDistance(pickup_lat, pickup_lng, delivery_lat, delivery_lng);
    }

    // 2. Calculate commission
    const commissionBreakdown = CommissionService.calculateCommission(estimated_amount);
    
    // 3. Generate order number
    const order_number = Order.generateOrderNumber();

    // 4. Create order with commission data
    const order = await Order.create({
      order_number,
      customer_id,
      store_name,
      store_address,
      items_description,
      estimated_amount,
      delivery_instructions,
      payment_method,
      pickup_lat: pickup_lat || null,
      pickup_lng: pickup_lng || null,
      delivery_lat: delivery_lat || null,
      delivery_lng: delivery_lng || null,
      order_status: 'pending',
      payment_status: 'pending',
      commission_amount: commissionBreakdown.commission,
      footman_earnings: commissionBreakdown.footmanEarnings
    });

    // 5. Try to find nearby Footmen (but don't auto-assign)
    let matchingResult = null;
    if (pickup_lat && pickup_lng) {
      try {
        matchingResult = await MatchingService.findNearbyFootmen(
          pickup_lat,
          pickup_lng,
          1, // 1KM radius
          5  // limit to 5 nearest
        );
        
        if (matchingResult.count > 0) {
          // Update order to 'searching' status (Footmen can see it)
          await order.update({
            order_status: 'searching'
          });
          console.log(`Order ${order.id} is now searching for Footmen. Nearest: ${matchingResult.footmen[0].full_name} (${matchingResult.footmen[0].distance}KM)`);
        } else {
          console.log(`No Footmen available within 1KM for order ${order.id}`);
          // Order stays in 'pending' status
        }
      } catch (matchingError) {
        console.log('Footman matching failed:', matchingError.message);
        // Order stays in 'pending' status
      }
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { 
        order,
        commission: commissionBreakdown,
        matching: matchingResult
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create order'
    });
  }
};

exports.getCustomerOrders = async (req, res) => {
  try {
    const customer_id = req.user.id;
    
    const orders = await Order.findAll({
      where: { customer_id },
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'footman',
          attributes: ['id', 'full_name', 'phone', 'rating']
        }
      ]
    });

    res.json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const customer_id = req.user.id;

    const order = await Order.findOne({
      where: { id, customer_id },
      include: [
        {
          model: User,
          as: 'footman',
          attributes: ['id', 'full_name', 'phone', 'rating']
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Add commission breakdown if order is completed
    let commissionBreakdown = null;
    if (order.order_status === 'completed' && order.estimated_amount) {
      commissionBreakdown = CommissionService.calculateCommission(order.estimated_amount);
    }

    res.json({
      success: true,
      data: { 
        order,
        commission: commissionBreakdown
      }
    });
  } catch (error) {
    console.error('Order details error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const customer_id = req.user.id;

    const order = await Order.findOne({
      where: { 
        id, 
        customer_id,
        order_status: ['pending', 'searching', 'accepted'] // Can cancel only in these states
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or cannot be cancelled'
      });
    }

    // Update order status
    await order.update({
      order_status: 'cancelled',
      cancelled_at: new Date()
    });

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Only admin/delivery can update status
    const user = req.user;
    
    // Check permissions based on user type
    const order = await Order.findOne({ where: { id } });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Authorization logic
    if (user.user_type === 'customer' && order.customer_id !== user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (user.user_type === 'delivery' && order.assigned_footman_id !== user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Update status
    await order.update({ order_status: status });

    // If order is completed, ensure commission is applied
    if (status === 'completed' && order.estimated_amount) {
      try {
        await CommissionService.applyCommissionToOrder(order.id, order.estimated_amount);
        
        // Update Footman's completed jobs count
        if (order.assigned_footman_id) {
          const footman = await User.findByPk(order.assigned_footman_id);
          if (footman) {
            await footman.increment('total_completed_jobs');
          }
        }
      } catch (commissionError) {
        console.error('Commission application error:', commissionError);
        // Don't fail the request, just log the error
      }
    }

    res.json({
      success: true,
      message: 'Order status updated',
      data: { order }
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};
