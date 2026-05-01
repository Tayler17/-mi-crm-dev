-- 42_global_help_and_system_announcements.sql

-- ── Help Center: global articles (owner → visible to all tenants) ──────────────

ALTER TABLE help_categories
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE help_articles
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- Global articles/categories keep tenant_id = owner's tenant (for author tracking)
-- but is_global=true makes them visible in every tenant's help tree (read-only).

CREATE INDEX IF NOT EXISTS idx_help_categories_global ON help_categories(is_global) WHERE is_global = TRUE;
CREATE INDEX IF NOT EXISTS idx_help_articles_global   ON help_articles(is_global)   WHERE is_global = TRUE;

-- ── Announcements: system-level broadcasts from owner to tenants ───────────────

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS is_system        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS target_tenant_id UUID     REFERENCES tenants(id) ON DELETE CASCADE;

-- is_system=true  + target_tenant_id IS NULL  → shown to ALL tenants
-- is_system=true  + target_tenant_id = <id>   → shown to ONE specific tenant
-- is_system=false                             → normal tenant-scoped announcement (existing behaviour)

CREATE INDEX IF NOT EXISTS idx_announcements_system ON announcements(is_system) WHERE is_system = TRUE;
