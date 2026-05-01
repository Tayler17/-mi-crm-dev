CREATE TABLE IF NOT EXISTS backup_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT        NOT NULL,
  size_bytes    BIGINT,
  storage       TEXT        NOT NULL DEFAULT 'local',
  storage_path  TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending',
  error_message TEXT,
  duration_ms   INTEGER,
  triggered_by  TEXT        NOT NULL DEFAULT 'cron',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_created ON backup_logs (created_at DESC);
