-- Migration 47: Add visual_config JSONB column to ai_chatbots
ALTER TABLE ai_chatbots ADD COLUMN IF NOT EXISTS visual_config JSONB;
