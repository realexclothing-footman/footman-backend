const app = require('./app');
const { sequelize, testConnection } = require('./config/database');

const PORT = process.env.PORT || 3000;

const syncDatabase = async () => {
  try {
    console.log('🔄 Syncing database tables...');
    
    // SAFE: Remove { alter: true } to prevent automatic schema changes
    // In production, use migrations instead: npx sequelize-cli db:migrate
    await sequelize.sync();
    
    console.log('✅ Database tables synchronized (safe mode)');
    return true;
  } catch (error) {
    console.error('❌ Database sync failed:', error.message);
    return false;
  }
};

const startServer = async () => {
  console.log('🚀 Starting FootMan Backend Server...');
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.log('⚠️ Starting server without database connection...');
  } else {
    await syncDatabase();
  }
  
  app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API: http://localhost:${PORT}/api/v1`);
    console.log('🔄 Server started successfully!');
  });
};

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

startServer();
