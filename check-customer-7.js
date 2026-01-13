const { sequelize } = require('./src/config/database');

async function checkCustomer7() {
  try {
    console.log('🔍 Checking Customer ID 7...');
    
    // 1. First, check if customer 7 exists
    const [customer] = await sequelize.query(`
      SELECT id, phone, full_name, user_type, is_active, created_at
      FROM users 
      WHERE id = 7
    `);
    
    if (customer.length === 0) {
      console.log('❌ Customer ID 7 not found in users table!');
    } else {
      console.log('👤 Customer 7 details:');
      console.log(`  ID: ${customer[0].id}`);
      console.log(`  Phone: ${customer[0].phone}`);
      console.log(`  Name: ${customer[0].full_name}`);
      console.log(`  Type: ${customer[0].user_type}`);
      console.log(`  Active: ${customer[0].is_active}`);
    }
    
    // 2. Check ALL requests from customer 7
    const [requests] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, customer_id, assigned_footman_id,
             customer_selected_payment, created_at, completed_at, cancelled_at
      FROM requests 
      WHERE customer_id = 7
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    console.log(`\n📊 Requests from Customer 7: ${requests.length}`);
    
    if (requests.length === 0) {
      console.log('✅ No requests found for customer 7');
    } else {
      requests.forEach(req => {
        console.log(`\n  Request #: ${req.request_number}`);
        console.log(`  ID: ${req.id}`);
        console.log(`  Status: ${req.request_status}`);
        console.log(`  Payment Lock: ${req.payment_lock}`);
        console.log(`  Payment Flow: ${req.payment_flow_state || 'null'}`);
        console.log(`  Created: ${req.created_at.toISOString().split('T')[0]} ${req.created_at.toISOString().split('T')[1].substring(0,8)}`);
        
        if (req.completed_at) {
          console.log(`  Completed: ${req.completed_at.toISOString().split('T')[0]}`);
        }
        if (req.cancelled_at) {
          console.log(`  Cancelled: ${req.cancelled_at.toISOString().split('T')[0]}`);
        }
        
        // If payment locked or incomplete, show fix option
        if (req.payment_lock || (req.payment_flow_state && req.payment_flow_state !== 'fully_completed')) {
          console.log(`  ⚠️  NEEDS FIX: payment_lock=${req.payment_lock}, payment_flow_state=${req.payment_flow_state}`);
        }
      });
    }
    
    // 3. Check ANY payment lock for customer 7
    const [locked] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM requests 
      WHERE customer_id = 7 AND payment_lock = true
    `);
    
    console.log(`\n🔒 Payment locked requests for customer 7: ${locked[0].count}`);
    
    if (locked[0].count > 0) {
      console.log('⚠️  FIXING payment locks for customer 7...');
      
      const [fixResult] = await sequelize.query(`
        UPDATE requests 
        SET payment_lock = false,
            payment_flow_state = 'fully_completed',
            request_status = 'completed'
        WHERE customer_id = 7 
          AND (payment_lock = true 
               OR (payment_flow_state IS NOT NULL 
                   AND payment_flow_state != 'fully_completed')
               OR request_status NOT IN ('completed', 'cancelled'))
        RETURNING id, request_number, request_status, payment_lock, payment_flow_state
      `);
      
      console.log(`✅ Fixed ${fixResult.rowCount} requests for customer 7:`);
      fixResult.forEach(req => {
        console.log(`  ID: ${req.id}, Request#: ${req.request_number}, New Status: ${req.request_status}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCustomer7();
