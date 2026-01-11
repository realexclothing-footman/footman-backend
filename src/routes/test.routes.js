const express = require('express');
const router = express.Router();

// SIMPLE TEST ENDPOINT - NO AUTH NEEDED
router.post('/test-order', async (req, res) => {
  try {
    console.log('Test order received:', req.body);
    
    res.json({
      success: true,
      message: 'Test order created',
      data: {
        order_id: 'TEST_' + Date.now(),
        status: 'pending',
        price: 50
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
