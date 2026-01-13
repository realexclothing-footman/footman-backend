const { sequelize } = require('./src/config/database');

async function checkConnection() {
  try {
    console.log('🔍 Checking which database we are connected to...');
    
    // Get database info
    const [dbInfo] = await sequelize.query('SELECT current_database() as db, version() as version');
    console.log('📊 Database Info:');
    console.log(`  Database: ${dbInfo[0].db}`);
    console.log(`  Version: ${dbInfo[0].version.split(',')[0]}`);
    
    // Check environment
    console.log(`\n🌐 Environment:`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`  DATABASE_URL set: ${process.env.DATABASE_URL ? 'YES' : 'NO'}`);
    
    // Check users count
    const [userCount] = await sequelize.query('SELECT COUNT(*) as count FROM users');
    console.log(`\n👥 Users in this database: ${userCount[0].count}`);
    
    // List users
    const [users] = await sequelize.query('SELECT id, phone, full_name FROM users ORDER BY id LIMIT 10');
    console.log('\n📱 First 10 users:');
    users.forEach(user => {
      console.log(`  ID: ${user.id}, Phone: ${user.phone}, Name: ${user.full_name || 'No name'}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkConnection();
