# Full Analysis — Why Mage Staff (and other items) disappear

## CRITICAL BUG 1: Missing `shield` and `armor` columns in characters table
The characters table has NO `shield` or `armor` column. CharacterManager.getSaveData() sends these fields.
When saveCharacterByUserId/saveCharacter tries to UPDATE with these columns, Supabase returns PGRST204.
The saveCharacter fallback logic retries with core fields only, BUT the gold change may have already been
deducted locally. The inventory save is independent and should work, but the overall save flow is fragile.

## CRITICAL BUG 2: No UNIQUE constraint on (character_id, item_name) in inventory table
There are 27 duplicate groups with 23,207 extra rows. Items like "daily_quests" and "friends_list" have 
2,500+ duplicate rows per character. This means saveInventoryItem's .maybeSingle() returns ambiguous results
— when there are multiple rows for the same (character_id, item_name), maybeSingle() returns null (because 
it finds more than one row). The code then falls into the INSERT branch, creating yet another duplicate row
instead of updating the existing one. The item data is scattered across many rows with inconsistent quantities.

## ROOT CAUSE FOR MAGE STAFF DISAPPEARING:
The combination of:
1. Duplicate rows for (character_id, item_name) causing maybeSingle() to fail silently
2. Missing shield/armor columns causing character save to fail
3. No error handling in the original saveInventoryItem (now fixed in previous commit)

When a player buys Mage Staff:
- saveInventoryItem inserts a new row (because maybeSingle finds duplicates and returns null)
- saveStatsToDatabase fails (missing shield/armor columns)  
- On next load, loadInventoryFromDB reads ALL duplicate rows and the last one may have quantity 0
- Or the saveInventoryItem insert itself fails due to the duplicate row confusion

## REQUIRED FIXES:
1. Add shield and armor columns to characters table (migration)
2. Add UNIQUE constraint on (character_id, item_name) in inventory table
3. Clean up existing duplicate inventory rows
4. Update saveInventoryItem to handle duplicate rows by updating the most recent one
