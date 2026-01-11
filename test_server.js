const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

// SIMPLE TEST ENDPOINT
app.post('/api/test/order', (req, res) => {
  console.log('📦 Test order:', req.body);
  res.json({
    success: true,
    message: 'Help requested!',
    data: { order_id: 'TEST_' + Date.now() }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'FootMan Test' });
});

app.listen(PORT, () => {
  console.log(`✅ Test server running on port ${PORT}`);
  console.log(`🌐 Test endpoint: POST http://localhost:${PORT}/api/test/order`);
});
