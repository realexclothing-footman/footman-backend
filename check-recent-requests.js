const { sequelize } = require('./src/config/database');

async function checkRecent() {
  try {
    console.log('🔍 Checking LAST 10 requests (all statuses)...');
    
    const [requests] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, customer_id, assigned_footman_id,
             customer_selected_payment, created_at, completed_at, cancelled_at
      FROM requests 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`📊 Recent requests (total in DB: might be more):`);
    
    requests.forEach(req => {
      console.log(`\n  Request #: ${req.request_number}`);
      console.log(`  ID: ${req.id}`);
      console.log(`  Status: ${req.request_status}`);
      console.log(`  Payment Lock: ${req.payment_lock}`);
      console.log(`  Payment Flow: ${req.payment_flow_state || 'null'}`);
      console.log(`  Customer ID: ${req.customer_id}`);
      console.log(`  Selected Payment: ${req.customer_selected_payment || 'null'}`);
      console.log(`  Created: ${req.created_at.toISOString().split('T')[0]} ${req.created_at.toISOString().split('T')[1].substring(0,8)}`);
      
      if (req.completed_at) {
        console.log(`  Completed: ${req.completed_at.toISOString().split('T')[0]}`);
      }
      if (req.cancelled_at) {
        console.log(`  Cancelled: ${req.cancelled_at.toISOString().split('T')[0]}`);
      }
    });
    
    // Check total count
    const [total] = await sequelize.query(`SELECT COUNT(*) as count FROM requests`);
    console.log(`\n📈 Total requests in database: ${total[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRecent();
