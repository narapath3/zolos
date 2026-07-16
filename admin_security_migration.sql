-- PART 3.1: Ensure Supabase schema has correct columns
ALTER TABLE characters 
ADD COLUMN IF NOT EXISTS weapon TEXT,
ADD COLUMN IF NOT EXISTS hat TEXT,
ADD COLUMN IF NOT EXISTS glasses TEXT,
ADD COLUMN IF NOT EXISTS body_color INTEGER DEFAULT 4219072,
ADD COLUMN IF NOT EXISTS hair_color INTEGER DEFAULT 12600384,
ADD COLUMN IF NOT EXISTS pants_color INTEGER DEFAULT 3816026,
ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male',
ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS graphics_quality TEXT DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS fps_enabled BOOLEAN DEFAULT false;

-- PART 4.1: Remove duplicate function signatures
DROP FUNCTION IF EXISTS public.admin_delete_character(text);
DROP FUNCTION IF EXISTS public.admin_delete_character(uuid);
DROP FUNCTION IF EXISTS public.admin_update_character(text, jsonb);
DROP FUNCTION IF EXISTS public.admin_update_character(uuid, jsonb);
DROP FUNCTION IF EXISTS public.admin_reset_character(text);

-- PART 4.2: Implement secure admin_delete_character with cascading deletes
CREATE OR REPLACE FUNCTION public.admin_delete_character(target_char_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id uuid;
    caller_is_admin boolean;
BEGIN
    -- 1. Verify the calling user has is_admin = true
    SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = auth.uid();
    IF caller_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can delete characters';
    END IF;

    -- 2. Look up the user_id associated with the target character
    SELECT user_id INTO target_user_id FROM public.characters WHERE id = target_char_id;
    
    IF target_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Character not found');
    END IF;

    -- 3. Delete from public.inventory
    DELETE FROM public.inventory WHERE character_id = target_char_id;
    
    -- 4. Delete from public.marketplace
    DELETE FROM public.marketplace WHERE seller_id = target_user_id;
    
    -- 5. Delete from public.vending_stalls
    DELETE FROM public.vending_stalls WHERE user_id = target_user_id;
    
    -- 6. Delete from public.characters
    DELETE FROM public.characters WHERE id = target_char_id;
    
    -- 7. Delete from public.profiles
    DELETE FROM public.profiles WHERE id = target_user_id;

    RETURN json_build_object('success', true, 'message', 'Character and associated data deleted successfully');
END;
$$;

-- PART 4.3: Implement secure admin_update_character
CREATE OR REPLACE FUNCTION public.admin_update_character(target_char_id text, updates jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_is_admin boolean;
BEGIN
    -- 1. Verify the calling user has is_admin = true
    SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = auth.uid();
    IF caller_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can update characters';
    END IF;

    -- 2. Update only safe fields
    UPDATE public.characters
    SET 
        level = COALESCE((updates->>'level')::integer, level),
        gold = COALESCE((updates->>'gold')::integer, gold),
        total_kills = COALESCE((updates->>'total_kills')::integer, total_kills),
        play_time = COALESCE((updates->>'play_time')::integer, play_time),
        updated_at = now()
    WHERE id = target_char_id;

    RETURN json_build_object('success', true);
END;
$$;

-- PART 4.4: Add admin_reset_character function
CREATE OR REPLACE FUNCTION public.admin_reset_character(target_char_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_is_admin boolean;
BEGIN
    -- 1. Verify the calling user has is_admin = true
    SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = auth.uid();
    IF caller_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can reset characters';
    END IF;

    -- 2. Reset character to default values
    UPDATE public.characters
    SET 
        level = 1,
        exp = 0,
        gold = 0,
        total_kills = 0,
        play_time = 0,
        hp = 100,
        max_hp = 100,
        sp = 50,
        max_sp = 50,
        updated_at = now()
    WHERE id = target_char_id;

    RETURN json_build_object('success', true);
END;
$$;

-- PART 5.1: Add server-side stat validation (CHECK constraints)
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_level_check;
ALTER TABLE characters ADD CONSTRAINT characters_level_check CHECK (level BETWEEN 1 AND 999);

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_gold_check;
ALTER TABLE characters ADD CONSTRAINT characters_gold_check CHECK (gold >= 0 AND gold <= 2147483647);

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_atk_check;
ALTER TABLE characters ADD CONSTRAINT characters_atk_check CHECK (atk >= 0 AND atk <= 1000000);

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_def_check;
ALTER TABLE characters ADD CONSTRAINT characters_def_check CHECK (def >= 0 AND def <= 1000000);

-- PART 5.2: Remove suspicious "admin" profile
-- Delete in order to respect foreign key constraints
DELETE FROM public.inventory WHERE character_id = 'char_pwcunrj8';
DELETE FROM public.marketplace WHERE seller_id = '5561ff0b-a545-49f0-b3c1-fea10cc82610';
DELETE FROM public.vending_stalls WHERE user_id = '5561ff0b-a545-49f0-b3c1-fea10cc82610';
DELETE FROM public.characters WHERE id = 'char_pwcunrj8';
DELETE FROM public.profiles WHERE id = '5561ff0b-a545-49f0-b3c1-fea10cc82610';
