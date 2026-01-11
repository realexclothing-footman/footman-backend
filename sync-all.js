const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const Request = require('./src/models/Request');

async function syncAll() {
  try {
    console.log('🔄 Syncing FOOTMAN database...');
    
    // Sync all models
    await sequelize.sync({ alter: true });
    
    console.log('✅ Database synced successfully!');
    console.log('\n📊 FOOTMAN System Ready:');
    console.log('   ✅ Users table (customers & footmen)');
    console.log('   ✅ Requests table (simple help requests)');
    console.log('   ✅ Fixed pricing: 50 BDT (≤1.5KM), 100 BDT (≤3KM)');
    console.log('   ✅ 10% platform commission');
    console.log('   ✅ 3KM service radius enforcement');
    
    console.log('\n🚀 Ready for:');
    console.log('   1. Customer: Request help (location only)');
    console.log('   2. Footman: Accept/reject requests');
    console.log('   3. Real-time updates');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

syncAll();
