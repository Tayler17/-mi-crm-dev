-- 50_ai_image_gen.sql
-- AI Image Generation — history table + plan feature flags

-- ── History table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_image_generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID,
  prompt          TEXT NOT NULL,
  image_url       TEXT NOT NULL,        -- permanent local path (/uploads/content/...)
  provider        TEXT NOT NULL DEFAULT 'openai',  -- openai | stability | fal
  model           TEXT DEFAULT 'dall-e-3',
  size            TEXT DEFAULT '1024x1024',
  style           TEXT DEFAULT 'vivid',
  cost_usd        NUMERIC(10,6) DEFAULT 0.040,
  content_post_id UUID,                 -- optional link to a content post
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_img_gen_tenant  ON ai_image_generations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_img_gen_month   ON ai_image_generations(tenant_id, created_at);

-- ── Plan feature flags ────────────────────────────────────────────────────────
ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_image_gen       BOOLEAN DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_image_gen_month INT     DEFAULT 0;  -- 0 = no access, -1 = unlimited

-- ── Seed defaults for existing plans ─────────────────────────────────────────
UPDATE plans SET has_image_gen = FALSE, max_image_gen_month =  0 WHERE slug = 'free';
UPDATE plans SET has_image_gen = TRUE,  max_image_gen_month = 10 WHERE slug = 'starter';
UPDATE plans SET has_image_gen = TRUE,  max_image_gen_month = 50 WHERE slug = 'pro';
UPDATE plans SET has_image_gen = TRUE,  max_image_gen_month = -1 WHERE slug = 'enterprise';
