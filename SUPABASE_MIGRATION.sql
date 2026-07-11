-- Zolos Database Migration: Add Appearance Columns
-- Run this in the Supabase SQL Editor to add missing appearance columns to the characters table

-- Add appearance columns if they don't exist
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS weapon TEXT DEFAULT 'Sword',
ADD COLUMN IF NOT EXISTS hat TEXT DEFAULT 'None',
ADD COLUMN IF NOT EXISTS glasses TEXT DEFAULT 'None',
ADD COLUMN IF NOT EXISTS body_color TEXT DEFAULT '4060c0',
ADD COLUMN IF NOT EXISTS hair_color TEXT DEFAULT 'c04040',
ADD COLUMN IF NOT EXISTS pants_color TEXT DEFAULT '3a3a5a';

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);

-- Add comment documenting the appearance columns
COMMENT ON COLUMN characters.weapon IS 'Equipped weapon: Sword, Bow, Crossbow, Great Bow, Gun, Fishing Rod, or null';
COMMENT ON COLUMN characters.hat IS 'Equipped hat: Wizard Hat, Cap, Crown, Cat Ears, Straw Hat, Cowboy Hat, or None';
COMMENT ON COLUMN characters.glasses IS 'Equipped glasses: Sunglasses, Reading Glasses, Monocle, Classic Glasses, or None';
COMMENT ON COLUMN characters.body_color IS 'Hex color for character body/shirt (without 0x prefix)';
COMMENT ON COLUMN characters.hair_color IS 'Hex color for character hair (without 0x prefix)';
COMMENT ON COLUMN characters.pants_color IS 'Hex color for character pants (without 0x prefix)';
