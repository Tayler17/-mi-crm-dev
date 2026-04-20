-- Add queue_ids to AI Chatbots, AI Prompts and Call Bots
-- Allows bots and prompts to serve conversations from specific queues

ALTER TABLE ai_chatbots ADD COLUMN IF NOT EXISTS queue_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE ai_prompts  ADD COLUMN IF NOT EXISTS queue_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE call_bots   ADD COLUMN IF NOT EXISTS queue_ids UUID[]          DEFAULT '{}';
