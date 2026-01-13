const { sequelize } = require('./src/config/database');

async function checkActive() {
  try {
    console.log('🔍 Checking ALL active/pending requests...');
    
    // Get ALL requests that are NOT completed/cancelled
    const [active] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, customer_id, assigned_footman_id,
             created_at, customer_selected_payment
      FROM requests 
      WHERE request_status NOT IN ('completed', 'cancelled')
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${active.length} active/pending requests:`);
    
    if (active.length === 0) {
      console.log('✅ No active requests found');
    } else {
      active.forEach(req => {
        console.log(`\n  Request #: ${req.request_number}`);
        console.log(`  ID: ${req.id}`);
        console.log(`  Status: ${req.request_status}`);
        console.log(`  Payment Lock: ${req.payment_lock}`);
        console.log(`  Payment Flow: ${req.payment_flow_state || 'null'}`);
        console.log(`  Customer ID: ${req.customer_id}`);
        console.log(`  Selected Payment: ${req.customer_selected_payment || 'null'}`);
        console.log(`  Created: ${req.created_at.toISOString()}`);
      });
    }
    
    // Also check any payment locked requests (even if status is completed)
    const [anyLocked] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, created_at
      FROM requests 
      WHERE payment_lock = true
      ORDER BY created_at DESC
    `);
    
    console.log(`\n🔒 ANY payment locked requests: ${anyLocked.length}`);
    anyLocked.forEach(req => {
      console.log(`  ID: ${req.id}, Request#: ${req.request_number}, Status: ${req.request_status}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkActive();
