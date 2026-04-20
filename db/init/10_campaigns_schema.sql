-- Campaigns module

CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(50)  NOT NULL DEFAULT 'email', -- email | whatsapp | sms
  status        VARCHAR(50)  NOT NULL DEFAULT 'draft', -- draft | scheduled | running | paused | completed | cancelled
  subject       VARCHAR(500),
  content       TEXT,
  scheduled_at  TIMESTAMP,
  started_at    TIMESTAMP,
  completed_at  TIMESTAMP,
  sent_count    INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  opened_count  INT DEFAULT 0,
  clicked_count INT DEFAULT 0,
  created_by    UUID,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL,
  status       VARCHAR(50) DEFAULT 'pending', -- pending | sent | delivered | opened | clicked | failed
  sent_at      TIMESTAMP,
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);

CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION update_campaigns_updated_at();
