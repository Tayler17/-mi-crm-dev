-- Add optional queue assignment to campaigns
-- When set, every conversation created/updated by this campaign gets assigned to that queue
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES queues(id) ON DELETE SET NULL;
