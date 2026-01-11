const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function createTestFootman() {
  try {
    // Check if user exists
    let user = await User.findOne({
      where: { phone: '01711111111', user_type: 'delivery' }
    });
    
    if (user) {
      console.log('User already exists, updating password...');
      // Update password to known value
      user.password_hash = 'temp123'; // This will be hashed by the beforeCreate hook
      await user.save();
      console.log('Password updated to "temp123"');
    } else {
      console.log('Creating new test Footman...');
      user = await User.create({
        phone: '01711111111',
        password_hash: 'temp123', // Will be hashed
        full_name: 'Test Footman',
        user_type: 'delivery',
        is_online: true,
        latitude: 23.8103,
        longitude: 90.4125
      });
      console.log('Test Footman created with password "temp123"');
    }
    
    console.log('User ID:', user.id);
    console.log('Phone:', user.phone);
    console.log('Password (raw): temp123');
    console.log('Password (hashed):', user.password_hash);
    
    // Test the password
    const isValid = await user.checkPassword('temp123');
    console.log('Password check:', isValid ? '✅ Valid' : '❌ Invalid');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createTestFootman();
