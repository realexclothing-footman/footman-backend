const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function createAdminUser() {
  try {
    await sequelize.authenticate();
    
    // Check if admin user exists
    const adminExists = await User.findOne({ 
      where: { phone: '01800000000' } 
    });
    
    if (!adminExists) {
      const admin = await User.create({
        phone: '01800000000',
        email: 'admin@footman.com',
        full_name: 'Super Admin',
        password_hash: 'admin123',
        user_type: 'admin'
      });
      
      console.log('✅ Admin user created successfully!');
      console.log('📱 Phone: 01800000000');
      console.log('🔑 Password: admin123');
      console.log('📧 Email: admin@footman.com');
    } else {
      console.log('✅ Admin user already exists');
      console.log('📱 Phone: 01800000000');
      console.log('🔑 Password: admin123');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
