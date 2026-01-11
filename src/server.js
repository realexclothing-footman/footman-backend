const app = require('./app');
const { sequelize, testConnection } = require('./config/database');
const User = require('./src/models/User');

const PORT = process.env.PORT || 3000;

const syncDatabase = async () => {
  try {
    console.log('🔄 Attempting to sync database tables...');
    
    // Sync all models with alter option (safe for production)
    // This will create tables if they don't exist, or alter if safe
    await sequelize.sync({ alter: true });
    console.log('✅ Database tables synchronized successfully');
    
    // Check and create admin user if doesn't exist
    try {
      const adminExists = await User.findOne({ where: { phone: '01700000000' } });
      if (!adminExists) {
        await User.create({
          phone: '01700000000',
          email: 'admin@footman.com',
          full_name: 'Admin User',
          password_hash: 'admin123',
          user_type: 'admin',
          is_active: true
        });
        console.log('✅ Default admin user created (phone: 01700000000, password: admin123)');
      } else {
        console.log('✅ Admin user already exists');
      }
    } catch (userError) {
      console.log('⚠️  Could not create admin user (table might not exist yet):', userError.message);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database sync failed:', error.message);
    console.log('⚠️  Starting server without complete database sync...');
    return false;
  }
};

const startServer = async () => {
  console.log('🚀 Starting FootMan Backend Server...');
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.log('⚠️  Starting server without database connection...');
  } else {
    // Sync database if connected
    await syncDatabase();
  }
  
  // Start server
  app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API: http://localhost:${PORT}/api/v1`);
    console.log('🔄 Server started successfully!');
  });
};

// Handle server errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Start the server
startServer();
