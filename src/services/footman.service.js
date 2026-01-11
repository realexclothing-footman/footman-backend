const MatchingService = require('./matching.service');
const PricingService = require('./pricing.service');

/**
 * Footman Service
 * Handles Footman-related business logic
 */
class FootmanService {
    /**
     * Create a help request
     */
    static async createHelpRequest(userId, userLat, userLng) {
        try {
            // 1. Find nearest Footman within 1KM
            const nearestFootman = await MatchingService.findNearestFootman(userLat, userLng);
            
            if (!nearestFootman) {
                throw new Error('No Footmen available within 1KM');
            }

            const distance = parseFloat(nearestFootman.distance);
            if (isNaN(distance)) {
                throw new Error('Invalid distance calculation');
            }

            // 2. Calculate fixed price based on new pricing model
            const price = PricingService.calculatePrice(distance);
            
            // 3. Prepare commission breakdown
            const CommissionService = require('./commission.service');
            const commission = CommissionService.calculateCommission(price.basePrice);

            return {
                success: true,
                request: {
                    customer_id: userId,
                    nearest_footman_id: nearestFootman.footman_id,
                    distance_km: distance,
                    price_breakdown: price,
                    commission_breakdown: commission
                },
                footman: {
                    id: nearestFootman.footman_id,
                    name: nearestFootman.footman_name,
                    phone: nearestFootman.footman_phone,
                    distance_km: distance,
                    coordinates: nearestFootman.coordinates
                },
                message: this._getPriceMessage(distance, price.basePrice)
            };
        } catch (error) {
            console.error('Error in createHelpRequest:', error);
            throw new Error(error.message);
        }
    }

    /**
     * Find nearest Footman and calculate price
     * @param {number} userLat - User latitude
     * @param {number} userLng - User longitude
     * @returns {Object} Response with Footman and price details
     */
    static async findNearestFootmanWithPrice(userLat, userLng) {
        try {
            // 1. Find nearest Footman within 1KM
            const nearestFootman = await MatchingService.findNearestFootman(userLat, userLng);
            
            if (!nearestFootman) {
                throw new Error('No Footmen available within 1KM');
            }

            const distance = parseFloat(nearestFootman.distance);
            if (isNaN(distance)) {
                throw new Error('Invalid distance calculation');
            }

            // 2. Calculate fixed price based on new pricing model
            const price = PricingService.calculatePrice(distance);

            return {
                success: true,
                footman: {
                    id: nearestFootman.footman_id,
                    name: nearestFootman.footman_name,
                    phone: nearestFootman.footman_phone,
                    distance_km: distance,
                    coordinates: nearestFootman.coordinates
                },
                pricing: {
                    distance_km: distance,
                    base_price: price.basePrice,
                    commission: price.commission,
                    partner_earnings: price.partnerEarnings,
                    total_price: price.totalPrice,
                    price_tier: price.priceTier
                },
                message: this._getPriceMessage(distance, price.basePrice)
            };
        } catch (error) {
            console.error('Error in findNearestFootmanWithPrice:', error);
            return {
                success: false,
                error: error.message,
                code: error.code || 'SERVICE_ERROR'
            };
        }
    }

    /**
     * Generate appropriate price message
     */
    static _getPriceMessage(distance, price) {
        if (distance <= 0.5) {
            return `Help within ${distance.toFixed(2)}KM - Fixed price: ৳${price} (≤0.5KM rate)`;
        } else {
            return `Help within ${distance.toFixed(2)}KM - Fixed price: ৳${price} (≤1KM rate)`;
        }
    }

    /**
     * Get nearby Footmen for map display
     * @param {number} userLat - User latitude
     * @param {number} userLng - User longitude
     * @param {number} radiusKm - Radius in KM (default: 1KM)
     * @returns {Object} Response with Footmen list
     */
    static async getNearbyFootmenForMap(userLat, userLng, radiusKm = 1) {
        try {
            // Get Footmen within specified radius
            const footmen = await MatchingService.findNearbyFootmen(userLat, userLng, radiusKm, 20);
            
            return {
                success: true,
                count: footmen.length,
                footmen: footmen.map(f => ({
                    id: f.id,
                    full_name: f.full_name,
                    phone: f.phone,
                    latitude: f.latitude,
                    longitude: f.longitude,
                    completed_jobs: f.completed_jobs || 0,
                    rating: f.rating || 0,
                    distance: f.distance_km
                })),
                service_radius: radiusKm,
                max_distance: PricingService.MAX_DISTANCE
            };
        } catch (error) {
            console.error('Error in getNearbyFootmenForMap:', error);
            return {
                success: false,
                error: error.message,
                footmen: [],
                count: 0
            };
        }
    }
}

module.exports = FootmanService;
