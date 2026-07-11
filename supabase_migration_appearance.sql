-- Run this in your Supabase SQL Editor to add missing appearance and settings columns
-- This will enable cloud persistence for equipment, colors, and game settings

ALTER TABLE characters 
ADD COLUMN IF NOT EXISTS weapon TEXT,
ADD COLUMN IF NOT EXISTS hat TEXT,
ADD COLUMN IF NOT EXISTS glasses TEXT,
ADD COLUMN IF NOT EXISTS body_color INT,
ADD COLUMN IF NOT EXISTS hair_color INT,
ADD COLUMN IF NOT EXISTS pants_color INT,
ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS graphics_quality TEXT DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS fps_enabled BOOLEAN DEFAULT false;

-- Add comment to track migration
COMMENT ON TABLE characters IS 'Character data with appearance and settings persistence';
