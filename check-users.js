const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function checkUsers() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Get all users
    const users = await User.findAll({
      attributes: ['id', 'phone', 'email', 'full_name', 'user_type', 'is_active', 'created_at']
    });
    
    console.log('\n📋 ALL USERS IN DATABASE:');
    console.log('==========================');
    
    if (users.length === 0) {
      console.log('No users found in database!');
    } else {
      users.forEach(user => {
        console.log(`ID: ${user.id}`);
        console.log(`Phone: ${user.phone}`);
        console.log(`Name: ${user.full_name}`);
        console.log(`Type: ${user.user_type}`);
        console.log(`Active: ${user.is_active}`);
        console.log(`Created: ${user.created_at}`);
        console.log('---');
      });
    }
    
    // Check specifically for admin
    const admin = await User.findOne({ where: { phone: '01800000000' } });
    if (admin) {
      console.log('\n✅ Admin user FOUND:');
      console.log(JSON.stringify(admin.toJSON(), null, 2));
    } else {
      console.log('\n❌ Admin user NOT FOUND (phone: 01800000000)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUsers();
