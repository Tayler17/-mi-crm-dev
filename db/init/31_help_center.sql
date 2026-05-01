-- 31_help_center.sql

CREATE TABLE IF NOT EXISTS help_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📄',
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS help_articles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES help_categories(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  video_url    TEXT,
  position     INT  NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_categories_tenant ON help_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_help_articles_tenant   ON help_articles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category_id);

CREATE TRIGGER update_help_categories_updated_at
  BEFORE UPDATE ON help_categories
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON help_articles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
