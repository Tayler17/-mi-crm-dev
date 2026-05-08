-- Add lang column to help_articles
-- Run once: docker exec -i crm_postgres psql -U crm -d crm_dev < scripts/help-center-lang-migration.sql

ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS lang VARCHAR(10) NOT NULL DEFAULT 'es';

-- Mark existing articles as Spanish
UPDATE help_articles SET lang = 'es' WHERE lang IS NULL OR lang = '';

-- Index for fast lang filtering
CREATE INDEX IF NOT EXISTS idx_help_articles_lang ON help_articles (lang);
