class LocationService {
    // Haversine formula to calculate distance in km
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distance in km
    }

    static toRad(degrees) {
        return degrees * (Math.PI/180);
    }

    // Find available footmen within 1km radius (FOOTMAN BUSINESS LOGIC)
    static async findNearbyFootmen(userLat, userLng, radiusKm = 1) {
        // This will be implemented with database query
        // For now, return stub
        return [];
    }

    // Check if footman is within 1km of pickup (FOOTMAN BUSINESS LOGIC)
    static isWithinRadius(footmanLat, footmanLng, pickupLat, pickupLng, radiusKm = 1) {
        const distance = this.calculateDistance(footmanLat, footmanLng, pickupLat, pickupLng);
        return distance <= radiusKm;
    }
}

module.exports = LocationService;
