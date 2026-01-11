const { Client } = require('pg');

const configs = [
  { user: 'footman_app', password: 'footman123', desc: 'footman_app user' },
  { user: 'postgres', password: '', desc: 'postgres user' },
  { user: process.env.USER, password: '', desc: 'system user' }
];

async function testConnection(config) {
  try {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      database: 'footman_db',
      user: config.user,
      password: config.password
    });
    await client.connect();
    console.log(`✅ Connected with: ${config.desc} (${config.user})`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ Failed with: ${config.desc} (${config.user}) - ${err.message}`);
    return false;
  }
}

async function runTests() {
  console.log('Testing database connections...\n');
  
  let success = false;
  for (const config of configs) {
    if (await testConnection(config)) {
      success = true;
      // Update .env with successful credentials
      require('fs').writeFileSync('.env', 
        require('fs').readFileSync('.env', 'utf8')
          .replace(/DB_USER=.*/g, `DB_USER=${config.user}`)
          .replace(/DB_PASSWORD=.*/g, `DB_PASSWORD=${config.password}`)
      );
      console.log(`\n📝 Updated .env with ${config.user} credentials`);
      break;
    }
  }
  
  if (!success) {
    console.log('\n❌ All connection attempts failed.');
    console.log('\n🛠️  Manual setup needed:');
    console.log('1. Run: psql');
    console.log('2. In psql, run: CREATE DATABASE footman_db;');
    console.log('3. Then: CREATE USER your_user;');
    console.log('4. Update .env with those credentials');
  }
}

runTests();
