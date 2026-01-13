const { sequelize } = require('./src/config/database');

async function checkLastRequest() {
  try {
    console.log('🔍 Checking the MOST RECENT request in database...');
    
    // Get the VERY LAST request created
    const [lastRequest] = await sequelize.query(`
      SELECT r.id, r.request_number, r.request_status, r.payment_lock, 
             r.payment_flow_state, r.customer_id, r.assigned_footman_id,
             r.customer_selected_payment, r.created_at, r.completed_at, r.cancelled_at,
             u.phone as customer_phone, u.full_name as customer_name
      FROM requests r
      LEFT JOIN users u ON r.customer_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 1
    `);
    
    if (lastRequest.length === 0) {
      console.log('❌ No requests found in database at all!');
      return;
    }
    
    const req = lastRequest[0];
    console.log('📊 MOST RECENT REQUEST IN DATABASE:');
    console.log(`  Request #: ${req.request_number}`);
    console.log(`  ID: ${req.id}`);
    console.log(`  Status: ${req.request_status}`);
    console.log(`  Payment Lock: ${req.payment_lock}`);
    console.log(`  Payment Flow: ${req.payment_flow_state || 'null'}`);
    console.log(`  Customer ID: ${req.customer_id}`);
    console.log(`  Customer: ${req.customer_name} (${req.customer_phone})`);
    console.log(`  Assigned Footman ID: ${req.assigned_footman_id || 'none'}`);
    console.log(`  Created: ${req.created_at.toISOString()}`);
    
    if (req.completed_at) {
      console.log(`  Completed: ${req.completed_at.toISOString()}`);
    }
    if (req.cancelled_at) {
      console.log(`  Cancelled: ${req.cancelled_at.toISOString()}`);
    }
    
    // Check if this could be the stuck request
    if (req.payment_lock || (req.payment_flow_state && req.payment_flow_state !== 'fully_completed')) {
      console.log('\n⚠️  THIS REQUEST IS STUCK!');
      console.log('   Fixing it...');
      
      const [fixResult] = await sequelize.query(`
        UPDATE requests 
        SET payment_lock = false,
            payment_flow_state = 'fully_completed',
            request_status = 'completed'
        WHERE id = $1
        RETURNING id, request_number, request_status, payment_lock, payment_flow_state
      `, [req.id]);
      
      console.log(`✅ Fixed request ${req.request_number}`);
      console.log(`   New status: ${fixResult[0].request_status}`);
      console.log(`   Payment lock: ${fixResult[0].payment_lock}`);
    } else {
      console.log('\n✅ This request is already completed/cancelled');
    }
    
    // Also check ALL requests from last 24 hours
    console.log('\n📅 Requests from last 24 hours:');
    const [recent] = await sequelize.query(`
      SELECT r.id, r.request_number, r.request_status, r.payment_lock, 
             r.payment_flow_state, r.customer_id, u.phone,
             r.created_at
      FROM requests r
      LEFT JOIN users u ON r.customer_id = u.id
      WHERE r.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY r.created_at DESC
    `);
    
    console.log(`   Total: ${recent.length} requests`);
    recent.forEach(r => {
      const status = r.payment_lock ? '🔒 LOCKED' : 
                    (r.request_status === 'completed' ? '✅' : 
                     r.request_status === 'cancelled' ? '❌' : '🔄');
      console.log(`   ${status} #${r.request_number} - Customer: ${r.phone || r.customer_id} - ${r.request_status} - Created: ${r.created_at.toISOString().split('T')[1].substring(0,8)}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkLastRequest();
