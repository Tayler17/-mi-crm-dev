-- Content posts table for the marketing content module
CREATE TABLE IF NOT EXISTS content_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | pending_review | approved | published
  channel         TEXT NOT NULL DEFAULT 'blog',  -- blog | instagram | facebook | linkedin | twitter | youtube | other
  tags            TEXT[] DEFAULT '{}',
  cover_url       TEXT,
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  author_id       UUID,
  author_name     TEXT,
  assigned_to     TEXT,
  assigned_team   TEXT,
  media_url       TEXT,
  media_type      TEXT,          -- image | gif | video
  alt_text        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_posts_tenant ON content_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_status  ON content_posts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_content_posts_sched   ON content_posts(tenant_id, scheduled_at);
