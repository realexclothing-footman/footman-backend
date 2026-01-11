const { sequelize } = require('./src/config/database');

async function checkDB() {
  console.log('📊 CURRENT DATABASE STATE\n');
  
  try {
    await sequelize.authenticate();
    
    // Check all tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('1. Tables in database:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    
    // Check users
    const [users] = await sequelize.query(`
      SELECT id, phone, email, user_type, created_at 
      FROM users 
      ORDER BY id
    `);
    
    console.log('\n2. Users in database:');
    if (users.length === 0) {
      console.log('   No users found');
    } else {
      users.forEach(u => {
        console.log(`   ID: ${u.id}, Phone: ${u.phone}, Type: ${u.user_type}, Email: ${u.email || 'none'}, Created: ${u.created_at}`);
      });
    }
    
    // Check orders
    const [orders] = await sequelize.query('SELECT id, order_number, customer_id FROM orders');
    console.log('\n3. Orders in database:', orders.length);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

checkDB();
