const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Order = require('./src/models/Order');
const Address = require('./src/models/Address');

async function fullReset() {
  console.log('🔥 FULL DATABASE RESET\n');
  
  try {
    // 1. Drop all tables
    console.log('1. Dropping all tables...');
    await sequelize.drop();
    console.log('   ✅ All tables dropped\n');
    
    // 2. Create fresh tables
    console.log('2. Creating fresh tables...');
    await sequelize.sync({ force: true });
    console.log('   ✅ All tables created\n');
    
    // 3. Create test users
    console.log('3. Creating test users...');
    const bcrypt = require('bcryptjs');
    
    // Admin
    const adminHash = await bcrypt.hash('admin123', 10);
    const admin = await User.create({
      phone: '01800000000',
      email: 'admin@footman.com',
      full_name: 'Super Admin',
      password_hash: adminHash,
      user_type: 'admin',
      is_active: true
    });
    console.log('   ✅ Admin created (01800000000/admin123)');
    
    // Delivery
    const deliveryHash = await bcrypt.hash('delivery123', 10);
    const delivery = await User.create({
      phone: '01711111111',
      email: 'delivery@footman.com',
      full_name: 'Test Delivery',
      password_hash: deliveryHash,
      user_type: 'delivery',
      is_active: true
    });
    console.log('   ✅ Delivery created (01711111111/delivery123)');
    
    // Customer
    const customerHash = await bcrypt.hash('customer123', 10);
    const customer = await User.create({
      phone: '01712345678',
      email: 'customer@footman.com',
      full_name: 'Test Customer',
      password_hash: customerHash,
      user_type: 'customer',
      is_active: true
    });
    console.log('   ✅ Customer created (01712345678/customer123)\n');
    
    // 4. Create test order
    console.log('4. Creating test order...');
    const order = await Order.create({
      order_number: 'TEST001',
      customer_id: customer.id,
      store_name: 'Test Store',
      store_address: 'Test Address',
      items_description: 'Test Items',
      estimated_amount: 100.00,
      service_charge: 30.00,
      payment_method: 'cash',
      order_status: 'pending',
      payment_status: 'pending'
    });
    console.log('   ✅ Test order created (TEST001)\n');
    
    console.log('🎉 FULL RESET COMPLETE!');
    console.log('=======================');
    console.log('\nTest Credentials:');
    console.log('Admin: 01800000000 / admin123');
    console.log('Delivery: 01711111111 / delivery123');
    console.log('Customer: 01712345678 / customer123');
    console.log('\nTest Order: TEST001 (pending)');
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
  }
  
  process.exit(0);
}

fullReset();
