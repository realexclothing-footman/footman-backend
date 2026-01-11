const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Order = require('./src/models/Order');
const Address = require('./src/models/Address');

async function syncDatabase() {
  try {
    console.log('🔄 Syncing database with new models...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync all models
    await sequelize.sync({ alter: true });
    console.log('✅ Database synchronized successfully');
    
    // Create test users if they don't exist
    const testCustomer = await User.findOne({ where: { phone: '01712345678' } });
    if (!testCustomer) {
      await User.create({
        phone: '01712345678',
        email: 'customer@footman.com',
        full_name: 'Test Customer',
        password_hash: 'test123',
        user_type: 'customer'
      });
      console.log('✅ Test customer user created');
    }
    
    const testDeliveryBoy = await User.findOne({ where: { phone: '01711111111' } });
    if (!testDeliveryBoy) {
      await User.create({
        phone: '01711111111',
        email: 'delivery@footman.com',
        full_name: 'Test Delivery Boy',
        password_hash: 'delivery123',
        user_type: 'delivery'
      });
      console.log('✅ Test delivery boy user created');
    }
    
    console.log('\n🎉 Database setup complete!');
    console.log('\n📋 Test credentials:');
    console.log('Customer: 01712345678 / test123');
    console.log('Delivery: 01711111111 / delivery123');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    process.exit(1);
  }
}

syncDatabase();
