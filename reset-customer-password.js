const bcrypt = require('bcryptjs');
const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function resetPassword() {
  try {
    const user = await User.findOne({
      where: { phone: '01722222222', user_type: 'customer' }
    });
    
    if (!user) {
      console.log('User not found');
      process.exit(1);
    }
    
    // Hash the password manually
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    
    // Update the password
    user.password_hash = hashedPassword;
    await user.save();
    
    console.log('✅ Password reset to "password123"');
    console.log('Hashed password:', hashedPassword);
    
    // Verify
    const isValid = await user.checkPassword('password123');
    console.log('Password verification:', isValid ? '✅ Success' : '❌ Failed');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetPassword();
