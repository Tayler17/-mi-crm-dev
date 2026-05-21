-- Migration 48: Add visual_config JSONB column to call_bots
ALTER TABLE call_bots ADD COLUMN IF NOT EXISTS visual_config JSONB;
