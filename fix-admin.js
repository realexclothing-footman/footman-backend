const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function fixAdmin() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Check if admin exists
    let admin = await User.findOne({ where: { phone: '01800000000' } });
    
    if (admin) {
      console.log('✅ Admin user already exists');
      console.log('Updating admin credentials...');
      
      // Update admin user
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash('admin123', salt);
      
      admin.email = 'admin@footman.com';
      admin.full_name = 'Super Admin';
      admin.user_type = 'admin';
      admin.password_hash = password_hash;
      admin.is_active = true;
      
      await admin.save();
      console.log('✅ Admin user updated');
    } else {
      console.log('Creating new admin user...');
      
      // Create admin user
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash('admin123', salt);
      
      admin = await User.create({
        phone: '01800000000',
        email: 'admin@footman.com',
        full_name: 'Super Admin',
        password_hash: password_hash,
        user_type: 'admin',
        is_active: true
      });
      console.log('✅ Admin user created');
    }
    
    console.log('\n📋 Admin Credentials:');
    console.log('📱 Phone: 01800000000');
    console.log('🔑 Password: admin123');
    console.log('📧 Email: admin@footman.com');
    console.log('👤 User Type: admin');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAdmin();
