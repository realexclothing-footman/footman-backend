const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Order = require('./src/models/Order');
const Address = require('./src/models/Address');

async function fixAll() {
  console.log('🔧 FIXING EVERYTHING\n');
  
  try {
    await sequelize.authenticate();
    
    // 1. Sync all models
    console.log('1. Syncing all models...');
    await sequelize.sync({ alter: true });
    console.log('   ✅ All models synced\n');
    
    // 2. Update admin phone (change 01700000000 to 01800000000 for consistency)
    console.log('2. Updating admin phone...');
    const admin = await User.findOne({ where: { phone: '01700000000' } });
    if (admin) {
      admin.phone = '01800000000';
      admin.email = 'admin@footman.com';
      await admin.save();
      console.log('   ✅ Admin phone updated to 01800000000');
    } else {
      // Create new admin if doesn't exist
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('admin123', 10);
      await User.create({
        phone: '01800000000',
        email: 'admin@footman.com',
        full_name: 'Super Admin',
        password_hash: hash,
        user_type: 'admin',
        is_active: true
      });
      console.log('   ✅ New admin created');
    }
    
    // 3. Verify delivery user exists
    console.log('\n3. Verifying delivery user...');
    let delivery = await User.findOne({ where: { phone: '01711111111' } });
    if (!delivery || delivery.user_type !== 'delivery') {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('delivery123', 10);
      if (delivery) {
        delivery.user_type = 'delivery';
        delivery.password_hash = hash;
        await delivery.save();
        console.log('   ✅ Delivery user updated');
      } else {
        await User.create({
          phone: '01711111111',
          email: 'delivery@footman.com',
          full_name: 'Test Delivery',
          password_hash: hash,
          user_type: 'delivery',
          is_active: true
        });
        console.log('   ✅ Delivery user created');
      }
    } else {
      console.log('   ✅ Delivery user exists');
    }
    
    // 4. Verify customer user exists
    console.log('\n4. Verifying customer user...');
    let customer = await User.findOne({ where: { phone: '01712345678' } });
    if (!customer || customer.user_type !== 'customer') {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('customer123', 10);
      if (customer) {
        customer.user_type = 'customer';
        customer.password_hash = hash;
        await customer.save();
        console.log('   ✅ Customer user updated');
      } else {
        await User.create({
          phone: '01712345678',
          email: 'customer@footman.com',
          full_name: 'Test Customer',
          password_hash: hash,
          user_type: 'customer',
          is_active: true
        });
        console.log('   ✅ Customer user created');
      }
    } else {
      console.log('   ✅ Customer user exists');
    }
    
    // 5. Create a test order
    console.log('\n5. Creating test order...');
    customer = await User.findOne({ where: { phone: '01712345678' } });
    
    if (customer) {
      const orderCount = await Order.count();
      if (orderCount === 0) {
        const order = await Order.create({
          order_number: Order.generateOrderNumber(),
          customer_id: customer.id,
          store_name: 'Test Store',
          store_address: '123 Test Street, Dhaka',
          items_description: '2kg Rice, 1L Oil, 1kg Sugar',
          estimated_amount: 500.00,
          service_charge: 30.00,
          payment_method: 'cash',
          order_status: 'pending',
          payment_status: 'pending'
        });
        console.log(`   ✅ Test order created: ${order.order_number}`);
      } else {
        console.log(`   ✅ ${orderCount} orders already exist`);
      }
    }
    
    // 6. Show final state
    console.log('\n6. Final database state:');
    const users = await User.findAll({
      attributes: ['id', 'phone', 'user_type', 'email']
    });
    
    console.log('\n📋 ALL USERS:');
    users.forEach(u => {
      console.log(`   ID: ${u.id}, Phone: ${u.phone}, Type: ${u.user_type}, Email: ${u.email || 'none'}`);
    });
    
    const orders = await Order.findAll({
      attributes: ['id', 'order_number', 'order_status', 'customer_id']
    });
    
    console.log('\n📦 ALL ORDERS:');
    if (orders.length === 0) {
      console.log('   No orders found');
    } else {
      orders.forEach(o => {
        console.log(`   ID: ${o.id}, Order#: ${o.order_number}, Status: ${o.order_status}, Customer: ${o.customer_id}`);
      });
    }
    
    console.log('\n🎉 FIX COMPLETE!');
    console.log('===============');
    console.log('\n🔐 LOGIN CREDENTIALS:');
    console.log('Admin:    01800000000 / admin123');
    console.log('Delivery: 01711111111 / delivery123');
    console.log('Customer: 01712345678 / customer123');
    console.log('\n🚀 Ready to test!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

fixAll();
