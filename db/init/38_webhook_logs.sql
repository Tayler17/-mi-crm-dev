CREATE TABLE IF NOT EXISTS outbound_webhook_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id   UUID NOT NULL REFERENCES outbound_webhooks(id) ON DELETE CASCADE,
  event        VARCHAR(100) NOT NULL,
  status       VARCHAR(20)  NOT NULL, -- 'success' | 'error'
  status_code  INT,
  error_message TEXT,
  duration_ms  INT,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id
  ON outbound_webhook_logs(webhook_id, created_at DESC);
