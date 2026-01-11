const { Request, User, sequelize } = require('./src/models');
const PricingService = require('./src/services/pricing.service');

async function syncRequests() {
    console.log('🚀 Starting FOOTMAN Request Sync...');
    console.log('   - Cleaning up old/unassigned requests...');
    
    try {
        // Delete requests older than 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const deleted = await Request.destroy({
            where: {
                status: 'pending',
                created_at: {
                    [sequelize.Op.lt]: twentyFourHoursAgo
                }
            }
        });
        
        console.log(`   - Deleted ${deleted} old pending requests`);
        
        // Update pricing info for existing requests if needed
        const requests = await Request.findAll({
            where: {
                status: 'pending'
            }
        });
        
        console.log('   - Current pricing model:');
        console.log('     - 50 BDT for ≤0.5KM (Partner earns: 45 BDT)');
        console.log('     - 100 BDT for 0.5-1KM (Partner earns: 90 BDT)');
        console.log('     - 10% platform commission');
        console.log('     - 1KM maximum service radius');
        
        console.log('✅ FOOTMAN Request Sync Complete!');
        console.log(`   ${requests.length} active pending requests`);
        
    } catch (error) {
        console.error('❌ Sync Error:', error);
    } finally {
        await sequelize.close();
    }
}

// Run if called directly
if (require.main === module) {
    syncRequests();
}

module.exports = syncRequests;
