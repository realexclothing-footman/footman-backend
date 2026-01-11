/**
 * FOOTMAN Fixed Pricing Service
 * Based on distance from user to Footman
 */
class PricingService {
    // Updated pricing model for 1KM maximum service radius
    static PRICE_0_5_KM = 50;   // 50 BDT for ≤0.5KM
    static PRICE_1_KM = 100;    // 100 BDT for 0.5-1KM
    static MAX_DISTANCE = 1;    // 1KM maximum service radius
    static COMMISSION_RATE = 0.10; // 10% platform commission

    /**
     * Calculate price based on distance
     * @param {number} distanceKm - Distance in kilometers
     * @returns {Object} Price details
     */
    static calculatePrice(distanceKm) {
        let basePrice;
        
        if (distanceKm <= 0.5) {
            basePrice = this.PRICE_0_5_KM;
        } else if (distanceKm <= 1) {
            basePrice = this.PRICE_1_KM;
        } else {
            throw new Error(`Distance ${distanceKm}KM exceeds ${this.MAX_DISTANCE}KM service limit`);
        }

        const commission = basePrice * this.COMMISSION_RATE;
        const partnerEarnings = basePrice - commission;

        return {
            basePrice: basePrice,
            commission: commission,
            partnerEarnings: partnerEarnings,
            totalPrice: basePrice,
            distanceKm: parseFloat(distanceKm.toFixed(2)),
            priceTier: distanceKm <= 0.5 ? '0.5KM' : '1KM'
        };
    }

    /**
     * Calculate distance between two coordinates (Haversine formula)
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        return distance;
    }

    static toRad(degrees) {
        return degrees * (Math.PI/180);
    }
}

module.exports = PricingService;
