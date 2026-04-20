-- Link inboxes to schedules

ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inboxes_schedule ON inboxes(schedule_id);
