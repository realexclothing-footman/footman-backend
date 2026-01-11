const { sequelize } = require('./src/config/database');
const Order = require('./src/models/Order');

async function updateOrdersSchema() {
  try {
    console.log('🔄 Updating orders table schema...');
    
    // Sync Order model with database
    await sequelize.sync({ alter: true });
    
    console.log('✅ Orders schema updated successfully!');
    console.log('📊 Added/Updated fields:');
    console.log('   - commission_amount (decimal)');
    console.log('   - footman_earnings (decimal)');
    console.log('   - assigned_footman_id (replaces delivery_boy_id)');
    console.log('   - Updated order_status enum');
    console.log('     (pending, searching, accepted, picked_up, delivered, completed, cancelled)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating orders schema:', error.message);
    console.error(error);
    process.exit(1);
  }
}

updateOrdersSchema();
