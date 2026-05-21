-- Add error_message column to content_posts for tracking publish failures
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS error_message TEXT;
