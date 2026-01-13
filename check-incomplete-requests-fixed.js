const { sequelize } = require('./src/config/database');

async function checkIncomplete() {
  try {
    console.log('🔍 Checking incomplete requests in PRODUCTION database...');
    
    const [requests] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, customer_id, assigned_footman_id,
             created_at, completed_at, cancelled_at
      FROM requests 
      WHERE payment_lock = true 
         OR (payment_flow_state IS NOT NULL 
             AND payment_flow_state NOT IN ('fully_completed', 'cancelled'))
         OR (request_status NOT IN ('completed', 'cancelled') 
             AND created_at < NOW() - INTERVAL '1 hour')
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    console.log(`📊 Found ${requests.length} incomplete/stuck requests:`);
    
    if (requests.length === 0) {
      console.log('✅ No incomplete requests found!');
    } else {
      requests.forEach(req => {
        console.log(`\n  Request #: ${req.request_number}`);
        console.log(`  ID: ${req.id}`);
        console.log(`  Status: ${req.request_status}`);
        console.log(`  Payment Lock: ${req.payment_lock}`);
        console.log(`  Payment Flow: ${req.payment_flow_state || 'null'}`);
        console.log(`  Customer ID: ${req.customer_id}`);
        console.log(`  Footman ID: ${req.assigned_footman_id || 'none'}`);
        console.log(`  Created: ${req.created_at.toISOString().split('T')[0]}`);
        
        if (req.completed_at) {
          console.log(`  Completed: ${req.completed_at.toISOString().split('T')[0]}`);
        }
        if (req.cancelled_at) {
          console.log(`  Cancelled: ${req.cancelled_at.toISOString().split('T')[0]}`);
        }
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkIncomplete();
