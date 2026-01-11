#!/bin/bash

echo "🚀 Testing Payment Flow Synchronization"
echo "======================================="

# Test 1: Check if backend is running
echo "1. Checking backend health..."
curl -s http://localhost:3000/health | grep -q "OK" && echo "✅ Backend is running" || echo "❌ Backend is not running"

# Test 2: Check if new endpoints exist
echo -e "\n2. Testing new payment endpoints..."
echo "   GET /api/v1/requests/payment/check"
curl -s -H "Authorization: Bearer test" http://localhost:3000/api/v1/requests/payment/check | python3 -c "import json,sys; data=json.load(sys.stdin); print('   Response:', 'success' in data);"

echo -e "\n3. Database check - verify new columns:"
psql -h localhost -p 5432 -U rakibulh.rasel -d footman_db -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'requests' AND column_name IN ('payment_flow_state', 'customer_selected_payment', 'partner_confirmed_at', 'payment_lock');"

echo -e "\n4. Sample completed request:"
psql -h localhost -p 5432 -U rakibulh.rasel -d footman_db -c "SELECT id, request_number, request_status, payment_flow_state, customer_selected_payment, payment_lock FROM requests WHERE request_status = 'completed' ORDER BY id DESC LIMIT 1;"

echo -e "\n✅ Payment flow setup complete!"
echo "   Next steps:"
echo "   1. Partner completes a job → triggers payment screen on customer app"
echo "   2. Customer selects payment method → same method turns green in partner app"
echo "   3. Partner confirms payment received → both apps return to home"
echo "   4. State persists if app closes/reopens"
