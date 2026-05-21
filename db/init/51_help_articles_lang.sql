-- 51_help_articles_lang.sql
-- Add lang column to help_articles for multilingual support
ALTER TABLE help_articles
  ADD COLUMN IF NOT EXISTS lang VARCHAR(10) NOT NULL DEFAULT 'es';

CREATE INDEX IF NOT EXISTS idx_help_articles_lang ON help_articles(lang);
