const { sequelize } = require('./src/config/database');

async function checkSchema() {
  try {
    console.log('📊 Checking request table structure...');
    
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'requests'
      ORDER BY ordinal_position
    `);
    
    console.log('\nColumns in requests table:');
    columns.forEach(col => {
      console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });
    
    // Also check sample data
    const [sample] = await sequelize.query(`
      SELECT * FROM requests LIMIT 1
    `);
    
    if (sample.length > 0) {
      console.log('\n📝 Sample request row:');
      console.log(sample[0]);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
