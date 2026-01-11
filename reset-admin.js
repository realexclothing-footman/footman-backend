const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function resetAdmin() {
  try {
    console.log('🔄 Resetting admin user...');
    
    await sequelize.authenticate();
    
    // Delete existing admin
    await User.destroy({ where: { phone: '01800000000' } });
    console.log('✅ Removed existing admin user');
    
    // Create salt and hash
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('admin123', salt);
    
    // Create new admin
    const admin = await User.create({
      phone: '01800000000',
      email: 'admin@footman.com',
      full_name: 'Super Admin',
      password_hash: password_hash,
      user_type: 'admin',
      is_active: true
    });
    
    console.log('\n🎉 ADMIN USER CREATED!');
    console.log('======================');
    console.log('📱 Phone: 01800000000');
    console.log('🔑 Password: admin123');
    console.log('📧 Email: admin@footman.com');
    console.log('👤 Type: admin');
    console.log('🆔 ID:', admin.id);
    console.log('======================');
    
    // Test login
    console.log('\n🔐 Testing login...');
    const testUser = await User.findOne({ where: { phone: '01800000000' } });
    if (testUser) {
      const valid = await bcrypt.compare('admin123', testUser.password_hash);
      console.log('Password verification:', valid ? '✅ SUCCESS' : '❌ FAILED');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetAdmin();
