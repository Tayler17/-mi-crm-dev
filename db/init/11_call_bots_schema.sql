-- Call Bots: AI-powered voice automation

CREATE TABLE IF NOT EXISTS call_bots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         VARCHAR(255) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  status            VARCHAR(50)  DEFAULT 'inactive',  -- active | inactive | draft
  phone_number      VARCHAR(50),                       -- assigned DID number
  language          VARCHAR(20)  DEFAULT 'es-MX',
  voice_type        VARCHAR(50)  DEFAULT 'neutral',    -- neutral | female | male
  provider          VARCHAR(50)  DEFAULT 'twilio',     -- twilio | vonage | telnyx
  provider_config   JSONB        DEFAULT '{}',
  -- AI settings
  system_prompt     TEXT,                              -- AI personality / instructions
  welcome_message   TEXT,                              -- first message played
  fallback_message  TEXT,                              -- when AI doesn't understand
  handoff_keyword   VARCHAR(100) DEFAULT 'agente',     -- word that triggers human handoff
  max_call_duration INT          DEFAULT 300,          -- seconds
  -- Metrics
  total_calls       INT          DEFAULT 0,
  handled_calls     INT          DEFAULT 0,            -- resolved by bot
  transferred_calls INT          DEFAULT 0,            -- handed off to human
  -- Inbox / queue linking
  inbox_id          UUID,
  queue_ids         UUID[]       DEFAULT '{}',
  -- TTS / voice
  tts_provider      VARCHAR(50)  DEFAULT 'twilio_basic',
  tts_voice_id      VARCHAR(255),
  transfer_to_number VARCHAR(50),
  voice_catalog_id  UUID,
  -- Meta
  created_by        UUID,
  created_at        TIMESTAMP    DEFAULT NOW(),
  updated_at        TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        VARCHAR(255) NOT NULL,
  bot_id           UUID REFERENCES call_bots(id) ON DELETE SET NULL,
  direction        VARCHAR(20)  NOT NULL DEFAULT 'inbound',  -- inbound | outbound
  from_number      VARCHAR(50),
  to_number        VARCHAR(50),
  duration         INT          DEFAULT 0,                   -- seconds
  status           VARCHAR(50)  DEFAULT 'completed',         -- ringing | in-progress | completed | failed | busy | no-answer | transferred
  outcome          VARCHAR(50)  DEFAULT 'handled',           -- handled | transferred | abandoned | failed
  transcript       TEXT,
  recording_url    VARCHAR(500),
  contact_id       UUID,
  conversation_id  UUID,
  started_at       TIMESTAMP    DEFAULT NOW(),
  ended_at         TIMESTAMP,
  created_at       TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_bots_tenant   ON call_bots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant   ON call_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_bot      ON call_logs(bot_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_started  ON call_logs(started_at DESC);

CREATE OR REPLACE FUNCTION update_call_bots_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_call_bots_updated_at
BEFORE UPDATE ON call_bots
FOR EACH ROW EXECUTE FUNCTION update_call_bots_updated_at();
