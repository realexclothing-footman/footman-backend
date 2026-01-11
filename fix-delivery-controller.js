const fs = require('fs');
const content = fs.readFileSync('src/controllers/delivery.controller.js', 'utf8');
const lines = content.split('\n');
lines.splice(2, 0, "const { sequelize } = require('../config/database');");
fs.writeFileSync('src/controllers/delivery.controller.js', lines.join('\n'));
console.log('✅ Added sequelize import to delivery controller');
