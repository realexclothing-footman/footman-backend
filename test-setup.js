console.log('🧪 Testing FootMan Backend Setup...\n');

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = 'v18.0.0';
console.log(`1. Node.js Version: ${nodeVersion}`);

// Check required files
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'package.json',
  '.env',
  'src/app.js',
  'src/server.js',
  'src/config/database.js'
];

console.log('\n2. Checking required files:');
let allFilesExist = true;
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

// Check package.json
console.log('\n3. Checking package.json:');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log(`   ✅ Name: ${pkg.name}`);
  console.log(`   ✅ Main: ${pkg.main}`);
  console.log(`   ✅ Scripts: ${Object.keys(pkg.scripts).join(', ')}`);
  
  const requiredDeps = ['express', 'cors', 'dotenv', 'pg', 'sequelize'];
  console.log('\n4. Checking dependencies:');
  requiredDeps.forEach(dep => {
    const hasDep = pkg.dependencies && pkg.dependencies[dep];
    console.log(`   ${hasDep ? '✅' : '❌'} ${dep}`);
  });
} catch (err) {
  console.log(`   ❌ Error reading package.json: ${err.message}`);
}

console.log('\n🎯 Setup Test Complete!');
console.log('\nNext steps:');
console.log('1. Install PostgreSQL (if not installed)');
console.log('2. Create database: footman_db');
console.log('3. Run: npm run dev');
