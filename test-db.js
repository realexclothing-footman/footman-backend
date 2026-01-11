const { sequelize, testConnection } = require('./src/config/database');

async function test() {
  console.log('🧪 Testing Database Connection...');
  console.log('Database Config:', {
    host: sequelize.config.host,
    port: sequelize.config.port,
    database: sequelize.config.database,
    username: sequelize.config.username
  });
  
  const connected = await testConnection();
  if (connected) {
    console.log('✅ Database connection successful!');
    process.exit(0);
  } else {
    console.log('❌ Database connection failed.');
    console.log('\nTroubleshooting steps:');
    console.log('1. Make sure PostgreSQL is running: brew services start postgresql');
    console.log('2. Check credentials in .env file');
    console.log('3. Try: psql -U postgres -c "CREATE DATABASE footman_db;"');
    process.exit(1);
  }
}

test();
