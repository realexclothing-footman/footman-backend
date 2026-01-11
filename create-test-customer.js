const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function createTestCustomer() {
  try {
    let user = await User.findOne({
      where: { phone: '01722222222', user_type: 'customer' }
    });
    
    if (!user) {
      console.log('Creating test customer...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      
      user = await User.create({
        phone: '01722222222',
        password_hash: hashedPassword,
        full_name: 'Test Customer',
        user_type: 'customer',
        email: 'customer@test.com'
      });
      console.log('✅ Test customer created');
    } else {
      console.log('⚠️ Customer already exists');
    }
    
    console.log('Phone: 01722222222');
    console.log('Password: password123');
    console.log('User ID:', user.id);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createTestCustomer();
