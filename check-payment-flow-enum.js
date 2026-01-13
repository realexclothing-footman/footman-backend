const { sequelize } = require('./src/config/database');

async function checkEnum() {
  try {
    console.log('📊 Checking payment_flow_state enum values...');
    
    // Get distinct values
    const [values] = await sequelize.query(`
      SELECT DISTINCT payment_flow_state 
      FROM requests 
      WHERE payment_flow_state IS NOT NULL
      ORDER BY payment_flow_state
    `);
    
    console.log('\nValid payment_flow_state values:');
    values.forEach(v => console.log(`  "${v.payment_flow_state}"`));
    
    // Also check request_status enum
    const [statusValues] = await sequelize.query(`
      SELECT DISTINCT request_status 
      FROM requests 
      ORDER BY request_status
    `);
    
    console.log('\nValid request_status values:');
    statusValues.forEach(v => console.log(`  "${v.request_status}"`));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkEnum();
