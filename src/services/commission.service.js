/**
 * FOOTMAN Commission Engine
 * Central service for all commission calculations
 * 
 * Rules:
 * - 10% platform commission (configurable)
 * - Applied to every completed job
 * - Transparent calculation
 * - Easy to switch between models (percentage, fixed, distance-based)
 */

class CommissionService {
    // Current commission model: Percentage
    static COMMISSION_TYPE = 'PERCENTAGE';
    static DEFAULT_COMMISSION_RATE = 0.10; // 10%

    /**
     * Calculate commission for a job
     * @param {number} orderAmount - Total job amount
     * @param {Object} options - Optional parameters
     * @returns {Object} Commission breakdown
     */
    static calculateCommission(orderAmount, options = {}) {
        const commissionRate = options.commissionRate || this.DEFAULT_COMMISSION_RATE;
        
        // Calculate commission based on current type
        let commission = 0;
        let footmanEarnings = orderAmount;
        
        switch (this.COMMISSION_TYPE) {
            case 'PERCENTAGE':
                commission = orderAmount * commissionRate;
                footmanEarnings = orderAmount - commission;
                break;
                
            case 'FIXED':
                commission = options.fixedAmount || 0;
                footmanEarnings = orderAmount - commission;
                break;
                
            // Future: distance-based, tiered, etc.
            default:
                throw new Error(`Unsupported commission type: ${this.COMMISSION_TYPE}`);
        }
        
        // Ensure commission doesn't exceed order amount
        commission = Math.min(commission, orderAmount);
        footmanEarnings = Math.max(footmanEarnings, 0);
        
        return {
            totalAmount: orderAmount,
            commission: parseFloat(commission.toFixed(2)),
            commissionRate: commissionRate,
            commissionType: this.COMMISSION_TYPE,
            footmanEarnings: parseFloat(footmanEarnings.toFixed(2)),
            platformEarnings: parseFloat(commission.toFixed(2)),
            currency: 'BDT',
            isTransparent: true
        };
    }

    /**
     * Get commission details for display (pre-acceptance)
     * Used in Partner App before accepting job
     */
    static getCommissionPreview(orderAmount) {
        const breakdown = this.calculateCommission(orderAmount);
        
        return {
            message: 'Commission Breakdown',
            breakdown: breakdown,
            display: {
                total: `৳${breakdown.totalAmount.toFixed(2)}`,
                commission: `৳${breakdown.commission.toFixed(2)} (${(breakdown.commissionRate * 100).toFixed(0)}%)`,
                earnings: `৳${breakdown.footmanEarnings.toFixed(2)}`
            }
        };
    }

    /**
     * Apply commission to completed order
     * This should be called when order is marked as completed
     */
    static async applyCommissionToOrder(orderId, orderAmount) {
        try {
            const commissionBreakdown = this.calculateCommission(orderAmount);
            
            // In future: Save to database, update Footman earnings, etc.
            return {
                success: true,
                orderId,
                ...commissionBreakdown,
                appliedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Commission application failed:', error);
            throw new Error('Failed to apply commission');
        }
    }

    /**
     * Update commission settings (admin only)
     */
    static updateSettings(newType, newRate) {
        // Validation
        if (newRate < 0 || newRate > 1) {
            throw new Error('Commission rate must be between 0 and 1 (0% to 100%)');
        }
        
        this.COMMISSION_TYPE = newType;
        this.DEFAULT_COMMISSION_RATE = newRate;
        
        return {
            success: true,
            message: 'Commission settings updated',
            newType,
            newRate: `${(newRate * 100).toFixed(1)}%`,
            effectiveFor: 'New jobs only'
        };
    }

    /**
     * Get current commission settings
     */
    static getSettings() {
        return {
            type: this.COMMISSION_TYPE,
            rate: this.DEFAULT_COMMISSION_RATE,
            displayRate: `${(this.DEFAULT_COMMISSION_RATE * 100).toFixed(1)}%`,
            description: 'Percentage-based commission'
        };
    }
}

module.exports = CommissionService;
