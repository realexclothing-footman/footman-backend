const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function createAdmin() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Delete existing admin if any
    await User.destroy({ where: { phone: '01800000000' } });
    console.log('Cleaned up any existing admin');
    
    // Create new admin
    const admin = await User.create({
      phone: '01800000000',
      email: 'admin@footman.com',
      full_name: 'Super Admin',
      password_hash: 'admin123', // Will be hashed by model hook
      user_type: 'admin',
      is_active: true
    });
    
    console.log('\n🎉 ADMIN USER CREATED SUCCESSFULLY!');
    console.log('====================================');
    console.log('📱 Phone: 01800000000');
    console.log('🔑 Password: admin123');
    console.log('📧 Email: admin@footman.com');
    console.log('👤 User Type: admin');
    console.log('🆔 User ID:', admin.id);
    console.log('====================================');
    
    // Verify the user was created
    const verify = await User.findOne({ 
      where: { phone: '01800000000' },
      attributes: ['id', 'phone', 'email', 'full_name', 'user_type', 'is_active']
    });
    
    console.log('\n✅ Verification:');
    console.log(JSON.stringify(verify.toJSON(), null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();
