const { sequelize } = require('./src/config/database');

async function checkHistory() {
  try {
    console.log('🔍 Checking payment lock history...');
    
    // Check if ANY request EVER had payment_lock = true
    const [everLocked] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM requests 
      WHERE payment_lock = true 
         OR (payment_flow_state IS NOT NULL 
             AND payment_flow_state != 'fully_completed')
    `);
    
    console.log(`📊 Ever had payment lock issues: ${everLocked[0].count}`);
    
    if (everLocked[0].count > 0) {
      const [details] = await sequelize.query(`
        SELECT id, request_number, request_status, payment_lock, 
               payment_flow_state, customer_id, created_at
        FROM requests 
        WHERE payment_lock = true 
           OR (payment_flow_state IS NOT NULL 
               AND payment_flow_state != 'fully_completed')
        ORDER BY created_at DESC
        LIMIT 20
      `);
      
      console.log('\n📝 Details of requests with payment issues:');
      details.forEach(req => {
        console.log(`  ID: ${req.id}, Request#: ${req.request_number}, Status: ${req.request_status}, Lock: ${req.payment_lock}, Flow: ${req.payment_flow_state || 'null'}`);
      });
    }
    
    // Check requests from TODAY
    const [todayRequests] = await sequelize.query(`
      SELECT id, request_number, request_status, payment_lock, 
             payment_flow_state, customer_id, created_at
      FROM requests 
      WHERE created_at >= CURRENT_DATE
      ORDER BY created_at DESC
    `);
    
    console.log(`\n📅 Requests from TODAY: ${todayRequests.length}`);
    todayRequests.forEach(req => {
      console.log(`  ID: ${req.id}, Request#: ${req.request_number}, Status: ${req.request_status}, Lock: ${req.payment_lock}, Customer: ${req.customer_id}, Time: ${req.created_at.toISOString().split('T')[1].substring(0,8)}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkHistory();
