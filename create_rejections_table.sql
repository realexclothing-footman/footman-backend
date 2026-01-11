CREATE TABLE IF NOT EXISTS request_rejections (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  footman_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(20) NOT NULL DEFAULT 'forward' CHECK (reason IN ('forward', 'busy', 'too_far', 'other')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, footman_id)
);
