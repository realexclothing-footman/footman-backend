const { sequelize } = require('./src/config/database');

async function checkPhoneUser(phone) {
  try {
    console.log(`🔍 Checking phone: ${phone}`);
    
    // Check in users table
    const [user] = await sequelize.query(`
      SELECT id, phone, full_name, user_type, is_active, created_at
      FROM users 
      WHERE phone = $1
    `, [phone]);
    
    if (user.length === 0) {
      console.log('❌ User not found in this database');
      return;
    }
    
    console.log('👤 User found:');
    console.log(`  ID: ${user[0].id}`);
    console.log(`  Phone: ${user[0].phone}`);
    console.log(`  Name: ${user[0].full_name}`);
    console.log(`  Type: ${user[0].user_type}`);
    console.log(`  Active: ${user[0].is_active}`);
    console.log(`  Created: ${user[0].created_at.toISOString().split('T')[0]}`);
    
    // Check their requests
    const [requests] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, customer_id, assigned_footman_id,
             customer_selected_payment, created_at, completed_at, cancelled_at
      FROM requests 
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [user[0].id]);
    
    console.log(`\n📊 Requests from this user: ${requests.length}`);
    
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
      
      // Check if stuck
      if (req.payment_lock || (req.payment_flow_state && req.payment_flow_state !== 'fully_completed')) {
        console.log(`  ⚠️  STUCK! Needs fix`);
      }
    });
    
    // Check for ANY stuck requests
    const [stuck] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM requests 
      WHERE customer_id = $1 
        AND (payment_lock = true 
             OR (payment_flow_state IS NOT NULL 
                 AND payment_flow_state != 'fully_completed')
             OR request_status NOT IN ('completed', 'cancelled'))
    `, [user[0].id]);
    
    console.log(`\n🔒 Stuck requests for this user: ${stuck[0].count}`);
    
    if (stuck[0].count > 0) {
      console.log('🔄 Fixing stuck requests...');
      
      const [fixResult] = await sequelize.query(`
        UPDATE requests 
        SET payment_lock = false,
            payment_flow_state = 'fully_completed',
            request_status = 'completed'
        WHERE customer_id = $1 
          AND (payment_lock = true 
               OR (payment_flow_state IS NOT NULL 
                   AND payment_flow_state != 'fully_completed')
               OR request_status NOT IN ('completed', 'cancelled'))
        RETURNING id, request_number, request_status, payment_lock, payment_flow_state
      `, [user[0].id]);
      
      console.log(`✅ Fixed ${fixResult.rowCount} requests:`);
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

// Get phone from command line or use the one provided
const phone = process.argv[2] || '01921455120';
checkPhoneUser(phone);
