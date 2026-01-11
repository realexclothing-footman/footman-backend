const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function updateDatabase() {
  try {
    console.log('🔄 Updating database schema...');
    
    // Sync all models - this will add missing columns
    await sequelize.sync({ alter: true });
    
    console.log('✅ Database schema updated successfully!');
    console.log('📊 Added Footman fields:');
    console.log('   - is_online (boolean)');
    console.log('   - latitude, longitude (decimal)');
    console.log('   - last_location_update (timestamp)');
    console.log('   - total_completed_jobs (integer)');
    console.log('   - rating (decimal)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating database:', error.message);
    process.exit(1);
  }
}

updateDatabase();
