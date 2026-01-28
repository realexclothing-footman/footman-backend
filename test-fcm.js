const request = require('supertest');
const app = require('./src/app');

async function testFcmEndpoint() {
  console.log('Testing FCM token update endpoint...');
  
  // First, login to get a token (using test admin credentials)
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({
      phone: '01700000000',
      password: 'admin123'
    });
  
  if (loginRes.body.success) {
    const token = loginRes.body.data.token;
    console.log('✅ Login successful, token:', token.substring(0, 20) + '...');
    
    // Test FCM token update
    const fcmRes = await request(app)
      .post('/api/v1/auth/update-fcm-token')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fcm_token: 'test_fcm_token_' + Date.now()
      });
    
    console.log('FCM Update Response:', fcmRes.body);
    
    if (fcmRes.body.success) {
      console.log('✅ FCM token update successful!');
    } else {
      console.log('❌ FCM token update failed:', fcmRes.body.message);
    }
  } else {
    console.log('❌ Login failed:', loginRes.body.message);
  }
}

testFcmEndpoint().catch(console.error);
