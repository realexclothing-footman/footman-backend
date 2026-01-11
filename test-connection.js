require('dotenv').config();
const { Sequelize } = require('sequelize');

console.log('Testing database connection with current .env settings...');
console.log('Configuration from .env:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : '0');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

async function test() {
  try {
    await sequelize.authenticate();
    console.log('\n✅ SUCCESS: Database connection established!');
    
    // Test a simple query
    const [result] = await sequelize.query('SELECT version()');
    console.log('PostgreSQL Version:', result[0].version.split(',')[0]);
    
    process.exit(0);
  } catch (error) {
    console.log('\n❌ ERROR: Database connection failed!');
    console.log('Error message:', error.message);
    
    console.log('\n🔧 Troubleshooting suggestions:');
    console.log('1. Check if PostgreSQL is running: brew services start postgresql@14');
    console.log('2. Try different credentials in .env file');
    console.log('3. Create database manually: createdb footman_db');
    console.log('4. Or connect without password (for local dev):');
    console.log('   DB_USER=postgres');
    console.log('   DB_PASSWORD=');
    
    process.exit(1);
  }
}

test();
