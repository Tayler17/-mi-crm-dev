-- ── 1. Campaign: drop broken single-FK, add proper relations ─────────────────

-- Remove the single contact_list_id column (wrong 1:1 model)
ALTER TABLE campaigns DROP COLUMN IF EXISTS contact_list_id;

-- Add optional schedule reference on campaign (for delivery scheduling)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;

-- Many-to-many: campaign → contact_lists (audience targeting)
CREATE TABLE IF NOT EXISTS campaign_targets (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_list_id UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (campaign_id, contact_list_id)
);

-- ── 2. Schedule: generic assignment table ────────────────────────────────────

-- Assigns a schedule to any entity: inbox | bot | campaign | user
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,  -- inbox | bot | campaign | user
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(schedule_id, target_type, target_id)
);

-- Migrate existing inbox assignments from inboxes.schedule_id → schedule_assignments
INSERT INTO schedule_assignments (schedule_id, target_type, target_id)
SELECT schedule_id, 'inbox', id FROM inboxes
WHERE schedule_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep inboxes.schedule_id for backward-compat reads (it stays in sync via triggers or app logic)

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_schedule ON schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_target ON schedule_assignments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);
