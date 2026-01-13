const { sequelize } = require('./src/config/database');

async function checkIncomplete() {
  try {
    console.log('🔍 Checking incomplete requests in PRODUCTION database...');
    
    const [requests] = await sequelize.query(`
      SELECT id, status, payment_lock, payment_flow_state, 
             created_at, customer_id, delivery_partner_id
      FROM requests 
      WHERE payment_lock = true 
         OR payment_flow_state NOT IN ('fully_completed', 'cancelled')
         OR status NOT IN ('completed', 'cancelled')
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${requests.length} incomplete requests:`);
    requests.forEach(req => {
      console.log(`\n  ID: ${req.id}`);
      console.log(`  Status: ${req.status}`);
      console.log(`  Payment Lock: ${req.payment_lock}`);
      console.log(`  Payment Flow: ${req.payment_flow_state}`);
      console.log(`  Created: ${req.created_at}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkIncomplete();
