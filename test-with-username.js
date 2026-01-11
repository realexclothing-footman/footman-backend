require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false
  }
);

async function test() {
  try {
    await sequelize.authenticate();
    console.log('✅ SUCCESS: Connected with username:', process.env.DB_USER);
    process.exit(0);
  } catch (error) {
    console.log('❌ Failed with username:', process.env.DB_USER);
    console.log('Error:', error.message);
    
    // Try to connect without specifying user (peer authentication)
    console.log('\nTrying peer authentication...');
    try {
      const { Client } = require('pg');
      const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'footman_db'
        // No user/password - uses peer authentication
      });
      await client.connect();
      console.log('✅ Connected via peer authentication!');
      await client.end();
      process.exit(0);
    } catch (err2) {
      console.log('❌ Peer auth also failed:', err2.message);
      process.exit(1);
    }
  }
}

test();
