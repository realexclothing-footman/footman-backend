const { sequelize } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function checkCustomer() {
  console.log('🔍 Checking customer password...\n');
  
  try {
    await sequelize.authenticate();
    
    // Get customer
    const [customer] = await sequelize.query(`
      SELECT id, phone, password_hash 
      FROM users 
      WHERE phone = '01712345678' AND user_type = 'customer'
    `);
    
    if (customer.length === 0) {
      console.log('❌ Customer not found with phone 01712345678');
      return;
    }
    
    console.log(`✅ Customer found: ID ${customer[0].id}, Phone ${customer[0].phone}`);
    console.log(`Password hash: ${customer[0].password_hash.substring(0, 30)}...`);
    
    // Test common passwords
    const testPasswords = ['test123', 'password', '123456', 'customer123', 'footman123'];
    
    console.log('\n🔐 Testing passwords:');
    for (const password of testPasswords) {
      const isValid = await bcrypt.compare(password, customer[0].password_hash);
      console.log(`   ${password}: ${isValid ? '✅ CORRECT' : '❌ WRONG'}`);
    }
    
    // If none work, reset password
    console.log('\n🔄 Resetting password to "customer123"...');
    const newHash = await bcrypt.hash('customer123', 10);
    
    await sequelize.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = NOW() 
      WHERE phone = '01712345678'
    `, { bind: [newHash] });
    
    console.log('✅ Password reset to "customer123"');
    
    // Verify
    const [updated] = await sequelize.query(`
      SELECT password_hash FROM users WHERE phone = '01712345678'
    `);
    
    const verify = await bcrypt.compare('customer123', updated[0].password_hash);
    console.log(`Verification: ${verify ? '✅ SUCCESS' : '❌ FAILED'}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

checkCustomer();
