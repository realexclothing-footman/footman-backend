-- Add payment flow state enum
CREATE TYPE payment_flow_state AS ENUM (
    'waiting_payment',
    'payment_selected', 
    'payment_confirmed',
    'fully_completed'
);

-- Add payment-related columns to requests table
ALTER TABLE requests 
ADD COLUMN payment_flow_state payment_flow_state DEFAULT NULL,
ADD COLUMN customer_selected_payment VARCHAR(50) DEFAULT NULL,
ADD COLUMN partner_confirmed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN payment_lock BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX idx_requests_payment_flow ON requests(payment_flow_state);
CREATE INDEX idx_requests_payment_lock ON requests(payment_lock);

-- Update any existing 'completed' requests to 'fully_completed' payment state
UPDATE requests 
SET payment_flow_state = 'fully_completed' 
WHERE request_status = 'completed';

-- Show the updated table structure
\d+ requests;
