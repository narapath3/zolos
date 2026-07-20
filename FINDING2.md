# Investigation Finding 2: Missing `shield` and `armor` columns in characters table

## DB Schema - characters table columns:
id, user_id, name, level, exp, hp, max_hp, sp, max_sp, atk, def, gold, total_kills, play_time, last_map, created_at, updated_at, weapon, hat, glasses, current_map, gender, sound_enabled, graphics_quality, fps_enabled, body_color, hair_color, pants_color, mmr, pvp_wins, pvp_losses, zol, job, tutorial_completed

## MISSING: shield, armor

## Impact:
- CharacterManager.getSaveData() includes `shield: this.equippedShield` and `armor: this.equippedGear?.body || null`
- saveStatsToDatabase() calls saveCharacterByUserId/saveCharacter with these fields
- Supabase rejects the UPDATE because columns don't exist
- This causes the character save to fail, but the inventory save (saveInventoryItem) may still work independently
- HOWEVER: the saveCharacter failure means the character's gold deduction isn't persisted either

## Also check: Does the inventory table have a unique constraint on (character_id, item_name)?
The table schema shows NO unique constraint on (character_id, item_name).
But the saveInventoryItem function uses .maybeSingle() to check for existing items.
If there are duplicate rows for the same (character_id, item_name), the update path won't work correctly.

## Root cause for Mage Staff disappearing:
The characters table is missing `shield` and `armor` columns. When saveStatsToDatabase() fails
due to these missing columns, it may cascade and prevent the overall save flow from completing
properly. The saveInventoryItem call itself should still work (it's independent), but the
overall save flow is fragile.
