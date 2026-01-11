const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function syncDatabase() {
  try {
    console.log('🔄 Syncing database...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync all models
    await sequelize.sync({ alter: true });
    console.log('✅ Database synchronized successfully');
    
    // Create a test admin user if doesn't exist
    const adminExists = await User.findOne({ where: { phone: '01700000000' } });
    if (!adminExists) {
      await User.create({
        phone: '01700000000',
        email: 'admin@footman.com',
        full_name: 'Admin User',
        password_hash: 'admin123',
        user_type: 'admin'
      });
      console.log('✅ Test admin user created');
      console.log('   Phone: 01700000000');
      console.log('   Password: admin123');
    }
    
    console.log('\n🎉 Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    process.exit(1);
  }
}

syncDatabase();
