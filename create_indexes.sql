CREATE INDEX IF NOT EXISTS idx_footman_rejections ON request_rejections(footman_id);
CREATE INDEX IF NOT EXISTS idx_request_rejections ON request_rejections(request_id);
CREATE INDEX IF NOT EXISTS idx_rejection_time ON request_rejections(created_at);
