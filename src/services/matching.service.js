const PricingService = require('./pricing.service');
const { User } = require('../models');

/**
 * Matching Service for FOOTMAN
 * Handles Footman-customer matching logic
 */
class MatchingService {
    /**
     * Find online Footmen within 1KM radius
     * @param {number} userLat - User latitude
     * @param {number} userLng - User longitude
     * @param {number} radiusKm - Radius in KM (default: 1KM)
     * @param {number} limit - Maximum results (default: 10)
     * @returns {Array} Nearby Footmen with distance
     */
    static async findNearbyFootmen(userLat, userLng, radiusKm = 1, limit = 10) {
        try {
            // 1. Get all online Footmen
            const onlineFootmen = await User.findAll({
                where: {
                    user_type: 'delivery',
                    is_online: true,
                    is_active: true
                },
                attributes: ['id', 'full_name', 'phone', 'latitude', 'longitude', 'total_completed_jobs', 'rating']
            });

            if (!onlineFootmen.length) {
                return [];
            }

            // 2. Calculate distance for each Footman and filter by radius
            const nearbyFootmen = [];
            
            onlineFootmen.forEach(footman => {
                if (footman.latitude && footman.longitude) {
                    const distance = this.calculateDistance(
                        userLat,
                        userLng,
                        footman.latitude,
                        footman.longitude
                    );
                    
                    // Store distance on footman object
                    footman.dataValues.distance_km = distance;
                    
                    // Only include if within radius
                    if (distance <= radiusKm) {
                        nearbyFootmen.push(footman);
                    }
                }
            });

            // 3. Sort by distance (nearest first)
            nearbyFootmen.sort((a, b) => a.dataValues.distance_km - b.dataValues.distance_km);

            // 4. Apply limit
            const result = nearbyFootmen.slice(0, limit);

            console.log(`Found ${result.length} online Footmen within ${radiusKm}KM`);

            return result.map(f => ({
                id: f.id,
                full_name: f.full_name,
                phone: f.phone,
                latitude: f.latitude,
                longitude: f.longitude,
                completed_jobs: f.total_completed_jobs,
                rating: f.rating,
                distance_km: parseFloat(f.dataValues.distance_km).toFixed(2)
            }));
        } catch (error) {
            console.error('Error finding nearby Footmen:', error);
            throw error;
        }
    }

    /**
     * Find nearest available Footman for a request
     * @param {number} pickupLat - Pickup latitude
     * @param {number} pickupLng - Pickup longitude
     * @returns {Object} Nearest Footman details
     */
    static async findNearestFootman(pickupLat, pickupLng) {
        try {
            // Find Footmen within 1KM radius (max 5 closest)
            const nearbyFootmen = await this.findNearbyFootmen(pickupLat, pickupLng, 1, 5);
            
            if (!nearbyFootmen.length) {
                throw {
                    status: 404,
                    message: 'No Footmen available within 1KM radius',
                    code: 'NO_FOOTMEN_AVAILABLE'
                };
            }

            // The first one is the nearest (already sorted by distance)
            const nearestFootman = nearbyFootmen[0];

            return {
                footman_id: nearestFootman.id,
                footman_name: nearestFootman.full_name,
                footman_phone: nearestFootman.phone,
                distance: nearestFootman.distance_km,
                coordinates: {
                    latitude: nearestFootman.latitude,
                    longitude: nearestFootman.longitude
                }
            };
        } catch (error) {
            console.error('Error finding nearest Footman:', error);
            throw error;
        }
    }

    /**
     * Validate if distance is within 1KM limit
     * @param {number} pickupLat - Pickup latitude
     * @param {number} pickupLng - Pickup longitude
     * @param {number} deliveryLat - Delivery latitude
     * @param {number} deliveryLng - Delivery longitude
     * @returns {number} Distance in KM
     */
    static validateDistance(pickupLat, pickupLng, deliveryLat, deliveryLng) {
        const distance = PricingService.calculateDistance(
            pickupLat,
            pickupLng,
            deliveryLat,
            deliveryLng
        );
        
        if (distance > 1) {
            throw new Error(`Distance ${distance.toFixed(2)}KM exceeds 1KM service limit`);
        }
        
        return distance;
    }

    /**
     * Check if Footman is within 1KM of pickup
     * @param {number} footmanLat - Footman latitude
     * @param {number} footmanLng - Footman longitude
     * @param {number} pickupLat - Pickup latitude
     * @param {number} pickupLng - Pickup longitude
     * @returns {boolean} True if within radius
     */
    static isWithinRadius(footmanLat, footmanLng, pickupLat, pickupLng) {
        const distance = PricingService.calculateDistance(
            footmanLat,
            footmanLng,
            pickupLat,
            pickupLng
        );
        return distance <= 1;
    }

    /**
     * Calculate actual distance between two points
     * @param {number} lat1 - Latitude 1
     * @param {number} lng1 - Longitude 1
     * @param {number} lat2 - Latitude 2
     * @param {number} lng2 - Longitude 2
     * @returns {number} Distance in KM
     */
    static calculateDistance(lat1, lng1, lat2, lng2) {
        return PricingService.calculateDistance(lat1, lng1, lat2, lng2);
    }
}

module.exports = MatchingService;
