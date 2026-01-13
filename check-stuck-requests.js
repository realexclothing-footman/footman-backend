const { sequelize } = require('./src/config/database');

async function checkStuck() {
  try {
    console.log('🔍 Checking for stuck requests...');
    
    // 1. Check payment locked requests
    const [locked] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM requests 
      WHERE payment_lock = true
    `);
    console.log(`🔒 Payment locked requests: ${locked[0].count}`);
    
    if (locked[0].count > 0) {
      const [lockedDetails] = await sequelize.query(`
        SELECT id, request_number, request_status, payment_lock, 
               payment_flow_state, created_at
        FROM requests 
        WHERE payment_lock = true
        ORDER BY created_at DESC
      `);
      console.log('📝 Locked request details:');
      lockedDetails.forEach(req => {
        console.log(`  ID: ${req.id}, Request#: ${req.request_number}, Status: ${req.request_status}, Created: ${req.created_at.toISOString().split('T')[0]}`);
      });
    }
    
    // 2. Check old pending requests (older than 1 hour)
    const [oldPending] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM requests 
      WHERE request_status NOT IN ('completed', 'cancelled')
        AND created_at < NOW() - INTERVAL '1 hour'
    `);
    console.log(`⏰ Old pending requests (>1 hour): ${oldPending[0].count}`);
    
    if (oldPending[0].count > 0) {
      const [pendingDetails] = await sequelize.query(`
        SELECT id, request_number, request_status, 
               payment_lock, payment_flow_state, created_at
        FROM requests 
        WHERE request_status NOT IN ('completed', 'cancelled')
          AND created_at < NOW() - INTERVAL '1 hour'
        ORDER BY created_at DESC
      `);
      console.log('📝 Old pending details:');
      pendingDetails.forEach(req => {
        console.log(`  ID: ${req.id}, Request#: ${req.request_number}, Status: ${req.request_status}, Created: ${req.created_at.toISOString().split('T')[0]}`);
      });
    }
    
    // 3. Check payment flow not completed
    const [incompleteFlow] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM requests 
      WHERE payment_flow_state IS NOT NULL 
        AND payment_flow_state != 'fully_completed'
    `);
    console.log(`🔄 Incomplete payment flow: ${incompleteFlow[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStuck();
