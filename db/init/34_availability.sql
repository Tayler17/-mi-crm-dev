-- Agent availability status
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability VARCHAR(20) NOT NULL DEFAULT 'online';
