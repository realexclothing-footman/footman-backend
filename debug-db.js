const { sequelize } = require('./src/config/database');
const User = require('./src/models/User');

async function debug() {
  console.log('🔍 DEBUGGING DATABASE...\n');
  
  try {
    // 1. Test connection
    console.log('1. Testing database connection...');
    await sequelize.authenticate();
    console.log('   ✅ Database connected\n');
    
    // 2. Check users table exists
    console.log('2. Checking users table...');
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name = 'users'
    `);
    
    if (tables.length > 0) {
      console.log('   ✅ Users table exists\n');
    } else {
      console.log('   ❌ Users table does not exist!\n');
      return;
    }
    
    // 3. List all users
    console.log('3. Listing all users:');
    const [users] = await sequelize.query('SELECT id, phone, email, user_type FROM users ORDER BY id');
    
    if (users.length === 0) {
      console.log('   No users found in database\n');
    } else {
      users.forEach(user => {
        console.log(`   ID: ${user.id}, Phone: ${user.phone}, Type: ${user.user_type}, Email: ${user.email || '(none)'}`);
      });
      console.log('');
    }
    
    // 4. Try to create admin user directly
    console.log('4. Creating admin user...');
    
    // First, check if user with phone exists
    const [existing] = await sequelize.query(
      "SELECT id FROM users WHERE phone = '01800000000'"
    );
    
    if (existing.length > 0) {
      console.log('   Admin user already exists with phone 01800000000');
      console.log('   Deleting and recreating...');
      await sequelize.query("DELETE FROM users WHERE phone = '01800000000'");
    }
    
    // Create admin user
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('admin123', salt);
    
    const [result] = await sequelize.query(`
      INSERT INTO users (
        phone, email, full_name, password_hash, 
        user_type, is_active, created_at, updated_at
      ) VALUES (
        '01800000000', 
        'admin@footman.com', 
        'Super Admin', 
        $1, 
        'admin', 
        true, 
        NOW(), 
        NOW()
      ) RETURNING id
    `, { bind: [password_hash] });
    
    console.log(`   ✅ Admin user created with ID: ${result[0].id}\n`);
    
    // 5. Verify
    console.log('5. Verifying admin user:');
    const [admin] = await sequelize.query(`
      SELECT id, phone, email, user_type, is_active 
      FROM users 
      WHERE phone = '01800000000'
    `);
    
    if (admin.length > 0) {
      console.log('   ✅ Admin user found:');
      console.log('      ID:', admin[0].id);
      console.log('      Phone:', admin[0].phone);
      console.log('      Email:', admin[0].email);
      console.log('      Type:', admin[0].user_type);
      console.log('      Active:', admin[0].is_active);
      
      // Test password
      const dbHash = await sequelize.query(
        "SELECT password_hash FROM users WHERE phone = '01800000000'",
        { type: sequelize.QueryTypes.SELECT }
      );
      
      const isValid = await bcrypt.compare('admin123', dbHash[0].password_hash);
      console.log('      Password valid:', isValid ? '✅ YES' : '❌ NO');
    } else {
      console.log('   ❌ Admin user not found after creation!');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Full error:', error);
  }
  
  process.exit(0);
}

debug();
