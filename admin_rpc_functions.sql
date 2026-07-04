-- ======================================
-- ZOLOS Admin RPC Functions
-- รันใน Supabase Dashboard → SQL Editor
-- ======================================

-- 1) Admin Delete Character (+ related data)
CREATE OR REPLACE FUNCTION admin_delete_character(target_char_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin BOOLEAN;
  deleted_char JSON;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO caller_is_admin
  FROM profiles
  WHERE id = auth.uid();

  IF caller_is_admin IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Not an admin');
  END IF;

  -- Delete related data first
  DELETE FROM market_history WHERE character_id = target_char_id;
  DELETE FROM marketplace WHERE seller_id = target_char_id;
  DELETE FROM inventory WHERE character_id = target_char_id;

  -- Delete character and return it
  DELETE FROM characters WHERE id = target_char_id
  RETURNING row_to_json(characters.*) INTO deleted_char;

  IF deleted_char IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Character not found');
  END IF;

  RETURN json_build_object('success', true, 'deleted', deleted_char);
END;
$$;

-- 2) Admin Update Character
CREATE OR REPLACE FUNCTION admin_update_character(target_char_id UUID, updates JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin BOOLEAN;
  updated_char JSON;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO caller_is_admin
  FROM profiles
  WHERE id = auth.uid();

  IF caller_is_admin IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Not an admin');
  END IF;

  -- Update character fields
  UPDATE characters
  SET
    level = COALESCE((updates->>'level')::INT, level),
    exp = COALESCE((updates->>'exp')::INT, exp),
    hp = COALESCE((updates->>'hp')::INT, hp),
    max_hp = COALESCE((updates->>'max_hp')::INT, max_hp),
    sp = COALESCE((updates->>'sp')::INT, sp),
    max_sp = COALESCE((updates->>'max_sp')::INT, max_sp),
    atk = COALESCE((updates->>'atk')::INT, atk),
    def = COALESCE((updates->>'def')::INT, def),
    gold = COALESCE((updates->>'gold')::INT, gold),
    total_kills = COALESCE((updates->>'total_kills')::INT, total_kills),
    play_time = COALESCE((updates->>'play_time')::INT, play_time)
  WHERE id = target_char_id
  RETURNING row_to_json(characters.*) INTO updated_char;

  IF updated_char IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Character not found');
  END IF;

  RETURN json_build_object('success', true, 'updated', updated_char);
END;
$$;
