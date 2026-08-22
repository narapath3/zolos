-- ZOLOS server-authority lockdown — 2026-08-22
--
-- Browser-authenticated users may read their normal UI data, but they cannot
-- mutate inventory or marketplace rows directly. Economy and progression writes
-- below are performed by SECURITY DEFINER functions after checking auth.uid(),
-- ownership, completion state, and transaction locks.

REVOKE INSERT, UPDATE, DELETE ON public.inventory FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace FROM anon, authenticated;
GRANT SELECT ON public.inventory, public.marketplace TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_equipped_item(
  p_character_id text,
  p_item_name text,
  p_equipped boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item public.inventory%ROWTYPE;
  v_other public.inventory%ROWTYPE;
  v_stats jsonb;
  v_slot text;
  v_other_slot text;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = ''
     OR p_item_name IS NULL OR p_item_name = '' OR p_equipped IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_equipped_state');
  END IF;
  PERFORM 1 FROM public.characters WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;
  SELECT * INTO v_item FROM public.inventory
   WHERE character_id = p_character_id AND item_name = left(p_item_name, 64)
   ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_item.item_type NOT IN ('weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'headgear', 'glasses', 'accessory', 'title')
     OR NOT EXISTS (SELECT 1 FROM public.inventory WHERE character_id = p_character_id AND item_name = left(p_item_name, 64) AND COALESCE(quantity, 0) > 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_equippable');
  END IF;
  v_slot := CASE
    WHEN v_item.item_type IN ('weapon', 'fishing_rod') THEN 'weapon'
    WHEN v_item.item_type = 'shield' THEN 'shield'
    WHEN v_item.item_type IN ('hat', 'headgear') THEN 'hat'
    WHEN v_item.item_type = 'glasses' THEN 'glasses'
    WHEN v_item.item_type = 'title' THEN 'title'
    WHEN v_item.item_type IN ('armor', 'accessory') THEN CASE v_item.item_name
      WHEN 'Iron Helm' THEN 'head' WHEN 'Ranger Hood' THEN 'head' WHEN 'Celestial Sovereign Helm' THEN 'head'
      WHEN 'Leather Cloak' THEN 'garment' WHEN 'Shadow Garment' THEN 'garment' WHEN 'Odin Garment' THEN 'garment' WHEN 'Wings of Aeon' THEN 'garment'
      WHEN 'Silver Ring' THEN 'ring' WHEN 'Gorgon Ring' THEN 'ring' WHEN 'Glow Ring' THEN 'ring' WHEN 'Eternity Ring' THEN 'ring'
      WHEN 'Speed Boots' THEN 'feet' WHEN 'Dragon Greaves' THEN 'feet' WHEN 'Worldwalker Greaves' THEN 'feet'
      WHEN 'Gold Earring' THEN 'accessory' WHEN 'Heart of Cosmos' THEN 'accessory'
      WHEN 'Leather Pants' THEN 'pants' WHEN 'Plate Legguards' THEN 'pants' WHEN 'Astral Legguards' THEN 'pants'
      WHEN 'Leather Bracer' THEN 'wrist' WHEN 'Steel Bracer' THEN 'wrist' WHEN 'Guardian Wristguard' THEN 'wrist' WHEN 'Titan Bracers' THEN 'wrist'
      ELSE 'body' END
    ELSE NULL END;
  IF v_slot IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_equippable'); END IF;
  IF p_equipped THEN
    FOR v_other IN SELECT * FROM public.inventory
      WHERE character_id = p_character_id AND COALESCE(quantity, 0) > 0 FOR UPDATE LOOP
      IF v_other.id = v_item.id THEN CONTINUE; END IF;
      v_other_slot := CASE
        WHEN v_other.item_type IN ('weapon', 'fishing_rod') THEN 'weapon'
        WHEN v_other.item_type = 'shield' THEN 'shield'
        WHEN v_other.item_type IN ('hat', 'headgear') THEN 'hat'
        WHEN v_other.item_type = 'glasses' THEN 'glasses'
        WHEN v_other.item_type = 'title' THEN 'title'
        WHEN v_other.item_type IN ('armor', 'accessory') THEN CASE v_other.item_name
          WHEN 'Iron Helm' THEN 'head' WHEN 'Ranger Hood' THEN 'head' WHEN 'Celestial Sovereign Helm' THEN 'head'
          WHEN 'Leather Cloak' THEN 'garment' WHEN 'Shadow Garment' THEN 'garment' WHEN 'Odin Garment' THEN 'garment' WHEN 'Wings of Aeon' THEN 'garment'
          WHEN 'Silver Ring' THEN 'ring' WHEN 'Gorgon Ring' THEN 'ring' WHEN 'Glow Ring' THEN 'ring' WHEN 'Eternity Ring' THEN 'ring'
          WHEN 'Speed Boots' THEN 'feet' WHEN 'Dragon Greaves' THEN 'feet' WHEN 'Worldwalker Greaves' THEN 'feet'
          WHEN 'Gold Earring' THEN 'accessory' WHEN 'Heart of Cosmos' THEN 'accessory'
          WHEN 'Leather Pants' THEN 'pants' WHEN 'Plate Legguards' THEN 'pants' WHEN 'Astral Legguards' THEN 'pants'
          WHEN 'Leather Bracer' THEN 'wrist' WHEN 'Steel Bracer' THEN 'wrist' WHEN 'Guardian Wristguard' THEN 'wrist' WHEN 'Titan Bracers' THEN 'wrist'
          ELSE 'body' END
        ELSE NULL END;
      IF v_other_slot = v_slot THEN
        UPDATE public.inventory SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{equipped}', 'false'::jsonb, true) WHERE id = v_other.id;
      END IF;
    END LOOP;
  END IF;
  v_stats := jsonb_set(COALESCE(v_item.stats, '{}'::jsonb), '{equipped}', to_jsonb(p_equipped), true);
  UPDATE public.inventory SET stats = v_stats WHERE id = v_item.id;
  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true,
    'item', jsonb_build_object('item_name', v_item.item_name, 'item_type', v_item.item_type,
      'quantity', v_item.quantity, 'stats', v_stats));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_equipped_state');
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_starter_loadout(p_character_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text;
  v_type text;
  v_equipped boolean;
  v_row public.inventory%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_character');
  END IF;
  PERFORM 1 FROM public.characters WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;
  FOR v_name, v_type, v_equipped IN
    SELECT * FROM (VALUES ('Sword'::text, 'weapon'::text, true), ('Fishing Rod'::text, 'fishing_rod'::text, false)) AS starter(name, item_type, equipped)
  LOOP
    SELECT * INTO v_row FROM public.inventory
     WHERE character_id = p_character_id AND item_name = v_name
     ORDER BY id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
      VALUES (p_character_id, v_name, v_type, 1, jsonb_build_object('equipped', v_equipped))
      RETURNING * INTO v_row;
    ELSIF COALESCE(v_row.quantity, 0) < 1 THEN
      UPDATE public.inventory SET item_type = v_type, quantity = 1,
        stats = jsonb_set(COALESCE(v_row.stats, '{}'::jsonb), '{equipped}', to_jsonb(v_equipped), true)
       WHERE id = v_row.id
       RETURNING * INTO v_row;
    END IF;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'item_name', v_row.item_name, 'item_type', v_row.item_type,
      'quantity', GREATEST(0, COALESCE(v_row.quantity, 0)), 'stats', COALESCE(v_row.stats, '{}'::jsonb)));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'items', v_items);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_character');
END;
$function$;

REVOKE ALL ON FUNCTION public.save_equipped_item(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_starter_loadout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_equipped_item(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_starter_loadout(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.consumable_use_requests (
  request_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  character_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.consumable_use_requests FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.job_change_requests (
  request_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  character_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.job_change_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.change_job(
  p_character_id text,
  p_job_id text,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job text := lower(trim(p_job_id));
  v_signature text;
  v_char public.characters%ROWTYPE;
  v_item public.inventory%ROWTYPE;
  v_cost integer;
  v_new_gold bigint;
  v_stats jsonb;
  v_result jsonb;
  v_prior jsonb;
  v_prior_user uuid;
  v_prior_character text;
  v_has_item boolean;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = ''
     OR p_request_id IS NULL OR length(p_request_id) < 1 OR length(p_request_id) > 160
     OR p_request_id !~ '^[A-Za-z0-9:_-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;
  v_signature := CASE v_job
    WHEN 'swordsman' THEN 'Sword' WHEN 'mage' THEN 'Mage Staff'
    WHEN 'archer' THEN 'Bow' WHEN 'priest' THEN 'Holy Rod' ELSE NULL END;
  IF v_signature IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_job'); END IF;
  SELECT user_id, character_id, result INTO v_prior_user, v_prior_character, v_prior
    FROM public.job_change_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior_user IS DISTINCT FROM auth.uid() OR v_prior_character IS DISTINCT FROM p_character_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'request_conflict');
    END IF;
    RETURN v_prior;
  END IF;
  SELECT * INTO v_char FROM public.characters WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;
  IF COALESCE(v_char.job, '') = v_job THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_job'); END IF;
  v_cost := CASE WHEN COALESCE(v_char.job, '') = '' THEN 0 ELSE 50000 END;
  IF COALESCE(v_char.gold, 0)::bigint < v_cost THEN RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_gold'); END IF;
  SELECT * INTO v_item FROM public.inventory
    WHERE character_id = p_character_id AND item_name = v_signature
    ORDER BY id LIMIT 1 FOR UPDATE;
  v_has_item := FOUND;
  v_new_gold := COALESCE(v_char.gold, 0)::bigint - v_cost;
  UPDATE public.characters SET job = v_job, gold = v_new_gold, updated_at = now() WHERE id = p_character_id;
  UPDATE public.inventory SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{equipped}', 'false'::jsonb, true)
    WHERE character_id = p_character_id AND item_type IN ('weapon', 'fishing_rod') AND item_name <> v_signature AND COALESCE(quantity, 0) > 0;
  IF v_has_item THEN
    v_stats := jsonb_set(COALESCE(v_item.stats, '{}'::jsonb), '{equipped}', 'true'::jsonb, true);
    UPDATE public.inventory SET item_type = 'weapon', quantity = GREATEST(1, quantity), stats = v_stats WHERE id = v_item.id
      RETURNING * INTO v_item;
  ELSE
    v_stats := jsonb_build_object('equipped', true);
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
      VALUES (p_character_id, v_signature, 'weapon', 1, v_stats) RETURNING * INTO v_item;
  END IF;
  v_result := jsonb_build_object('ok', true, 'serverAuthoritative', true, 'requestId', p_request_id,
    'job', v_job, 'gold', v_new_gold, 'cost', v_cost,
    'item', jsonb_build_object('item_name', v_item.item_name, 'item_type', v_item.item_type,
      'quantity', v_item.quantity, 'stats', v_item.stats));
  INSERT INTO public.job_change_requests (request_id, user_id, character_id, result)
    VALUES (p_request_id, auth.uid(), p_character_id, v_result);
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  SELECT result INTO v_prior FROM public.job_change_requests WHERE request_id = p_request_id;
  RETURN COALESCE(v_prior, jsonb_build_object('ok', false, 'reason', 'request_conflict'));
WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
END;
$function$;

REVOKE ALL ON FUNCTION public.change_job(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_job(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.use_consumable(
  p_character_id text,
  p_item_name text,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_item public.inventory%ROWTYPE;
  v_prior jsonb;
  v_prior_user uuid;
  v_prior_character text;
  v_heal integer := 0;
  v_restore integer := 0;
  v_hp integer;
  v_sp integer;
  v_qty integer;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = ''
     OR p_item_name IS NULL OR p_item_name = '' OR p_request_id IS NULL
     OR length(p_request_id) < 1 OR length(p_request_id) > 160
     OR p_request_id !~ '^[A-Za-z0-9:_-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;
  SELECT user_id, character_id, result INTO v_prior_user, v_prior_character, v_prior FROM public.consumable_use_requests
   WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior_user IS DISTINCT FROM auth.uid() OR v_prior_character IS DISTINCT FROM p_character_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'request_conflict');
    END IF;
    RETURN v_prior;
  END IF;
  IF p_item_name = 'Apple' THEN v_heal := 25;
  ELSIF p_item_name = 'Carrot' THEN v_heal := 35;
  ELSIF p_item_name = 'Banana' THEN v_heal := 20;
  ELSIF p_item_name = 'Red Herb' THEN v_heal := 120;
  ELSIF p_item_name = 'Green Herb' THEN v_heal := 45;
  ELSIF p_item_name = 'Yellow Herb' THEN v_heal := 75;
  ELSIF p_item_name = 'Orange Juice' THEN v_heal := 180;
  ELSIF p_item_name = 'Sweet Milk' THEN v_heal := 100;
  ELSIF p_item_name = 'Fish' THEN v_heal := 15;
  ELSIF p_item_name = 'Novice Potion' THEN v_heal := 65;
  ELSIF p_item_name = 'Candy' THEN v_heal := 50;
  ELSIF p_item_name = 'Blue Herb' THEN v_restore := 25;
  ELSIF p_item_name = 'Grape' THEN v_heal := 60;
  ELSIF p_item_name = 'Honey' THEN v_heal := 150; v_restore := 15;
  ELSIF p_item_name = 'Royal Jelly' THEN v_heal := 300; v_restore := 50;
  ELSIF p_item_name = 'Blue Potion' THEN v_restore := 40;
  ELSIF p_item_name = 'Red Potion' THEN v_heal := 250;
  ELSIF p_item_name = 'Monster Cookie' THEN v_heal := 200;
  ELSIF p_item_name = 'White Herb' THEN v_heal := 500;
  ELSIF p_item_name = 'Yggdrasil Seed' THEN v_heal := 800;
  ELSIF p_item_name = 'White Potion' THEN v_heal := 650;
  ELSIF p_item_name = 'Yggdrasil Berry' THEN v_heal := 9999; v_restore := 999;
  ELSIF p_item_name = 'Lord Potion' THEN v_heal := 1500; v_restore := 200;
  ELSE RETURN jsonb_build_object('ok', false, 'reason', 'not_consumable');
  END IF;

  SELECT * INTO v_char FROM public.characters
   WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;
  SELECT * INTO v_item FROM public.inventory
   WHERE character_id = p_character_id AND item_name = p_item_name
   ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_item.quantity, 0) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'item_missing');
  END IF;
  v_hp := LEAST(COALESCE(v_char.max_hp, 0), COALESCE(v_char.hp, 0) + v_heal);
  v_sp := LEAST(COALESCE(v_char.max_sp, 0), COALESCE(v_char.sp, 0) + v_restore);
  IF v_hp = COALESCE(v_char.hp, 0) AND v_sp = COALESCE(v_char.sp, 0) THEN
    v_result := jsonb_build_object('ok', true, 'serverAuthoritative', true, 'requestId', p_request_id,
      'consumed', false, 'item_name', p_item_name, 'quantity', v_item.quantity,
      'hp', COALESCE(v_char.hp, 0), 'sp', COALESCE(v_char.sp, 0),
      'max_hp', COALESCE(v_char.max_hp, 0), 'max_sp', COALESCE(v_char.max_sp, 0), 'gold', COALESCE(v_char.gold, 0));
  ELSE
    UPDATE public.characters SET hp = v_hp, sp = v_sp, updated_at = now() WHERE id = p_character_id;
    v_qty := GREATEST(0, COALESCE(v_item.quantity, 0) - 1);
    IF v_qty = 0 THEN DELETE FROM public.inventory WHERE id = v_item.id;
    ELSE UPDATE public.inventory SET quantity = v_qty WHERE id = v_item.id;
    END IF;
    v_result := jsonb_build_object('ok', true, 'serverAuthoritative', true, 'requestId', p_request_id,
      'consumed', true, 'item_name', p_item_name, 'quantity', v_qty,
      'hp', v_hp, 'sp', v_sp, 'max_hp', COALESCE(v_char.max_hp, 0), 'max_sp', COALESCE(v_char.max_sp, 0), 'gold', COALESCE(v_char.gold, 0));
  END IF;
  INSERT INTO public.consumable_use_requests (request_id, user_id, character_id, result)
  VALUES (p_request_id, auth.uid(), p_character_id, v_result);
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  SELECT result INTO v_prior FROM public.consumable_use_requests WHERE request_id = p_request_id;
  RETURN COALESCE(v_prior, jsonb_build_object('ok', false, 'reason', 'request_conflict'));
WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
END;
$function$;

REVOKE ALL ON FUNCTION public.use_consumable(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_consumable(text, text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.shop_purchase_requests (
  request_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  character_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.shop_purchase_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(
  p_character_id text,
  p_item_name text,
  p_quantity integer,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_price integer;
  v_type text;
  v_char public.characters%ROWTYPE;
  v_item public.inventory%ROWTYPE;
  v_prior jsonb;
  v_prior_user uuid;
  v_prior_character text;
  v_total bigint;
  v_new_gold bigint;
  v_inventory_quantity integer;
  v_has_item boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = ''
     OR p_item_name IS NULL OR p_item_name = '' OR p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 999
     OR p_request_id IS NULL OR length(p_request_id) < 1 OR length(p_request_id) > 160
     OR p_request_id !~ '^[A-Za-z0-9:_-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
  END IF;
  v_price := CASE p_item_name
    WHEN 'Apple' THEN 15 WHEN 'Carrot' THEN 20 WHEN 'Red Herb' THEN 100 WHEN 'Green Herb' THEN 30
    WHEN 'Yellow Herb' THEN 60 WHEN 'Orange Juice' THEN 120 WHEN 'Blue Herb' THEN 150 WHEN 'Grape' THEN 50
    WHEN 'Novice Cutter' THEN 150 WHEN 'Sword' THEN 200 WHEN 'Bow' THEN 250 WHEN 'Gun' THEN 400
    WHEN 'Mage Staff' THEN 600 WHEN 'Silver Fishing Rod' THEN 15000 WHEN 'Golden Fishing Rod' THEN 75000
    WHEN 'Silver Dagger' THEN 3200 WHEN 'Katana' THEN 3500 WHEN 'Crossbow' THEN 4000 WHEN 'Heavy Warhammer' THEN 5000
    WHEN 'Excalibur' THEN 25000 WHEN 'Rudra Bow' THEN 28000 WHEN 'Ragnarok Blade' THEN 120000
    WHEN 'Cotton Shirt' THEN 100 WHEN 'Iron Helm' THEN 50 WHEN 'Wooden Buckler' THEN 120 WHEN 'Silver Ring' THEN 450
    WHEN 'Leather Cloak' THEN 650 WHEN 'Iron Shield' THEN 750 WHEN 'Adventurer Suit' THEN 800 WHEN 'Speed Boots' THEN 900
    WHEN 'Ranger Hood' THEN 2500 WHEN 'Tear Shield' THEN 3600 WHEN 'Steel Plate Mail' THEN 6000 WHEN 'Golden Shield' THEN 18000
    WHEN 'Odin Garment' THEN 22000 WHEN 'Leather Bracer' THEN 300 WHEN 'Leather Pants' THEN 550 WHEN 'Steel Bracer' THEN 3200
    WHEN 'Plate Legguards' THEN 4200 WHEN 'Guardian Wristguard' THEN 16000 WHEN 'Dragon Greaves' THEN 20000
    WHEN 'Oridecon' THEN 2500 WHEN 'Elunium' THEN 2500 ELSE NULL END;
  v_type := CASE
    WHEN p_item_name IN ('Apple','Carrot','Red Herb','Green Herb','Yellow Herb','Orange Juice','Blue Herb','Grape') THEN 'consumable'
    WHEN p_item_name IN ('Novice Cutter','Sword','Bow','Gun','Mage Staff','Silver Dagger','Katana','Crossbow','Heavy Warhammer','Excalibur','Rudra Bow','Ragnarok Blade') THEN 'weapon'
    WHEN p_item_name IN ('Silver Fishing Rod','Golden Fishing Rod') THEN 'fishing_rod'
    WHEN p_item_name IN ('Wooden Buckler','Iron Shield','Tear Shield','Golden Shield') THEN 'shield'
    WHEN v_price IS NOT NULL THEN 'armor' END;
  IF v_price IS NULL OR v_type IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'item_not_for_sale'); END IF;
  SELECT user_id, character_id, result INTO v_prior_user, v_prior_character, v_prior
    FROM public.shop_purchase_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior_user IS DISTINCT FROM auth.uid() OR v_prior_character IS DISTINCT FROM p_character_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'request_conflict');
    END IF;
    RETURN v_prior;
  END IF;
  v_total := v_price::bigint * p_quantity::bigint;
  SELECT * INTO v_char FROM public.characters WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;
  IF COALESCE(v_char.gold, 0)::bigint < v_total THEN RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_gold'); END IF;
  SELECT * INTO v_item FROM public.inventory
    WHERE character_id = p_character_id AND item_name = p_item_name ORDER BY id LIMIT 1 FOR UPDATE;
  v_has_item := FOUND;
  IF v_has_item AND COALESCE(v_item.quantity, 0) > 2147483647 - p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inventory_limit');
  END IF;
  v_new_gold := LEAST(500000000::bigint, COALESCE(v_char.gold, 0)::bigint - v_total);
  UPDATE public.characters SET gold = v_new_gold, updated_at = now() WHERE id = p_character_id;
  IF v_has_item THEN
    v_inventory_quantity := v_item.quantity + p_quantity;
    UPDATE public.inventory SET item_type = v_type, quantity = v_inventory_quantity WHERE id = v_item.id;
  ELSE
    v_inventory_quantity := p_quantity;
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
      VALUES (p_character_id, p_item_name, v_type, p_quantity, '{}'::jsonb);
  END IF;
  v_result := jsonb_build_object('ok', true, 'serverAuthoritative', true, 'requestId', p_request_id,
    'item_name', p_item_name, 'item_type', v_type, 'quantity', p_quantity,
    'inventory_quantity', v_inventory_quantity, 'total_cost', v_total, 'gold', v_new_gold);
  INSERT INTO public.shop_purchase_requests (request_id, user_id, character_id, result)
    VALUES (p_request_id, auth.uid(), p_character_id, v_result);
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  SELECT result INTO v_prior FROM public.shop_purchase_requests WHERE request_id = p_request_id;
  RETURN COALESCE(v_prior, jsonb_build_object('ok', false, 'reason', 'request_conflict'));
WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'bad_request');
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_shop_item(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_system_state(
  p_character_id text,
  p_key text,
  p_state jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_row public.inventory%ROWTYPE;
  v_state jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = ''
     OR p_key NOT IN ('daily_quests', 'friends_list', 'adventure_journal')
     OR p_state IS NULL OR jsonb_typeof(p_state) <> 'object'
     OR octet_length(p_state::text) > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_system_state');
  END IF;

  SELECT * INTO v_char
    FROM public.characters
   WHERE id = p_character_id AND user_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;

  IF p_key = 'friends_list' THEN
    IF jsonb_typeof(p_state->'list') <> 'array'
       OR jsonb_array_length(p_state->'list') > 200 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_friends_state');
    END IF;
    v_state := jsonb_build_object('list', p_state->'list');
  ELSIF p_key = 'daily_quests' THEN
    IF jsonb_typeof(p_state->'quests') <> 'array'
       OR jsonb_array_length(p_state->'quests') > 8 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_quest_state');
    END IF;
    v_state := jsonb_build_object(
      'lastDate', left(COALESCE(p_state->>'lastDate', ''), 32),
      'streak', greatest(0, least(100000, COALESCE((p_state->>'streak')::integer, 0))),
      'rouletteSpent', COALESCE((p_state->>'rouletteSpent')::boolean, false),
      'quests', p_state->'quests'
    );
  ELSE
    v_state := p_state;
  END IF;

  SELECT * INTO v_row
    FROM public.inventory
   WHERE character_id = p_character_id AND item_name = p_key AND item_type = 'system'
   ORDER BY id LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    UPDATE public.inventory SET quantity = 1, stats = v_state WHERE id = v_row.id;
  ELSE
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (p_character_id, p_key, 'system', 1, v_state);
  END IF;
  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'key', p_key, 'state', v_state);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_system_state');
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_daily_reward(p_character_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_row public.inventory%ROWTYPE;
  v_today text := ((now() AT TIME ZONE 'Asia/Bangkok')::date)::text;
  v_yesterday text := (((now() AT TIME ZONE 'Asia/Bangkok')::date - 1))::text;
  v_streak integer;
  v_day integer;
  v_gold integer;
  v_item_name text := NULL;
  v_item_type text := NULL;
  v_item_quantity integer := 0;
  v_state jsonb;
  v_new_gold bigint;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_character');
  END IF;
  SELECT * INTO v_char FROM public.characters
   WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;

  SELECT * INTO v_row FROM public.inventory
   WHERE character_id = p_character_id AND item_name = 'login_streak' AND item_type = 'system'
   ORDER BY id LIMIT 1 FOR UPDATE;
  v_state := CASE WHEN v_row.id IS NULL OR jsonb_typeof(v_row.stats) <> 'object' THEN '{}'::jsonb ELSE v_row.stats END;
  v_streak := greatest(0, least(100000, COALESCE((v_state->>'streak')::integer, 0)));
  IF v_state->>'lastClaim' = v_today THEN
    RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'claimed', false,
      'day', greatest(1, ((greatest(1, v_streak) - 1) % 7) + 1), 'streak', v_streak,
      'gold', COALESCE(v_char.gold, 0), 'items', jsonb_build_array(), 'state', v_state);
  END IF;

  IF v_state->>'lastClaim' = v_yesterday THEN v_streak := v_streak + 1; ELSE v_streak := 1; END IF;
  v_day := ((v_streak - 1) % 7) + 1;
  v_gold := CASE v_day WHEN 1 THEN 500 WHEN 2 THEN 1000 WHEN 3 THEN 2000 WHEN 4 THEN 3500 WHEN 5 THEN 5000 WHEN 6 THEN 8000 ELSE 15000 END;
  IF v_day = 2 THEN v_item_name := 'Red Herb'; v_item_type := 'consumable'; v_item_quantity := 5;
  ELSIF v_day = 3 THEN v_item_name := 'Iron Ore'; v_item_type := 'material'; v_item_quantity := 5;
  ELSIF v_day = 4 THEN v_item_name := 'Crystal Blue'; v_item_type := 'material'; v_item_quantity := 2;
  ELSIF v_day = 5 THEN v_item_name := 'Oridecon Stone'; v_item_type := 'material'; v_item_quantity := 2;
  ELSIF v_day = 6 THEN v_item_name := 'Fire Element Stone'; v_item_type := 'material'; v_item_quantity := 1;
  ELSIF v_day = 7 THEN v_item_name := 'Dragon Heart'; v_item_type := 'material'; v_item_quantity := 1;
  END IF;

  UPDATE public.characters SET gold = LEAST(COALESCE(gold, 0) + v_gold, 500000000), updated_at = now()
   WHERE id = p_character_id RETURNING gold INTO v_new_gold;
  v_state := jsonb_build_object('streak', v_streak, 'lastClaim', v_today);
  IF v_row.id IS NULL THEN
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (p_character_id, 'login_streak', 'system', 1, v_state);
  ELSE
    UPDATE public.inventory SET quantity = 1, stats = v_state WHERE id = v_row.id;
  END IF;
  IF v_item_name IS NOT NULL THEN
    SELECT * INTO v_row FROM public.inventory
     WHERE character_id = p_character_id AND item_name = v_item_name
     ORDER BY id LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      UPDATE public.inventory SET item_type = v_item_type, quantity = quantity + v_item_quantity WHERE id = v_row.id;
    ELSE
      INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
      VALUES (p_character_id, v_item_name, v_item_type, v_item_quantity, '{}'::jsonb);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'claimed', true,
    'day', v_day, 'streak', v_streak, 'gold', COALESCE(v_new_gold, 0),
    'items', CASE WHEN v_item_name IS NULL THEN jsonb_build_array()
      ELSE jsonb_build_array(jsonb_build_object('name', v_item_name, 'type', v_item_type, 'quantity', v_item_quantity)) END,
    'state', v_state);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_daily_reward_state');
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_almanac_reward(p_character_id text, p_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_row public.inventory%ROWTYPE;
  v_almanac_id public.inventory.id%TYPE;
  v_stats jsonb;
  v_claimed jsonb;
  v_caught jsonb;
  v_required integer;
  v_found integer;
  v_gold integer;
  v_item_name text := NULL;
  v_item_type text := NULL;
  v_next jsonb;
  v_new_gold bigint;
BEGIN
  IF auth.uid() IS NULL OR p_character_id IS NULL OR p_character_id = ''
     OR p_tier NOT IN ('common', 'uncommon', 'rare', 'legendary', 'all') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_almanac_claim');
  END IF;
  SELECT * INTO v_char FROM public.characters
   WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;
  SELECT * INTO v_row FROM public.inventory
   WHERE character_id = p_character_id AND item_name = 'fishing_almanac' AND item_type = 'system'
   ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_row.stats) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'almanac_incomplete');
  END IF;
  v_almanac_id := v_row.id;
  v_stats := v_row.stats;
  v_claimed := CASE WHEN jsonb_typeof(v_stats->'claimed') = 'array' THEN v_stats->'claimed' ELSE '[]'::jsonb END;
  IF v_claimed ? p_tier THEN
    RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'claimed', false, 'tier', p_tier,
      'gold', COALESCE(v_char.gold, 0), 'items', jsonb_build_array(), 'state', v_stats);
  END IF;
  v_caught := CASE WHEN jsonb_typeof(v_stats->'caught') = 'array' THEN v_stats->'caught' ELSE '[]'::jsonb END;

  WITH fish(name, rarity) AS (VALUES
    ('Tilapia','common'),('Catfish','common'),('Carp','common'),('Perch','common'),('Sardine','common'),('Anchovy','common'),('Mackerel','common'),('Herring','common'),('Shad','common'),('Smelt','common'),('Goby','common'),('Mullet','common'),('Sole','common'),('Crucian Carp','common'),('Bass','common'),('Trout','common'),('Pike','common'),('Bluegill','common'),('Minnow','common'),('Sunfish','common'),('Roach','common'),('Dace','common'),('Whiting','common'),('Flounder','common'),('Snapper','common'),('Cod','common'),('Haddock','common'),('Pollock','common'),('Butterfish','common'),('Sea Bass','common'),
    ('Rainbow Trout','uncommon'),('Salmon','uncommon'),('Tuna','uncommon'),('Swordfish','uncommon'),('Eel','uncommon'),('Barramundi','uncommon'),('Grouper','uncommon'),('Red Snapper','uncommon'),('Yellowtail','uncommon'),('Pompano','uncommon'),('Wahoo','uncommon'),('Mahi-Mahi','uncommon'),('Sailfish','uncommon'),('Sturgeon','uncommon'),('Walleye','uncommon'),('Striped Bass','uncommon'),('King Mackerel','uncommon'),('Dorado','uncommon'),('Arapaima','uncommon'),('Paddlefish','uncommon'),('Tarpon','uncommon'),('Bonefish','uncommon'),
    ('Golden Koi','rare'),('Arowana','rare'),('Moonfish','rare'),('Ghost Fish','rare'),('Crystal Fish','rare'),('Sunstone Fish','rare'),('Stargazer','rare'),('Coelacanth','rare'),('Electric Eel','rare'),('Oarfish','rare'),('Piranha','rare'),('Marlin','rare'),('Giant Catfish','rare'),('Anglerfish','rare'),
    ('Great White Shark','legendary'),('Hammerhead','legendary'),('Raja Ampat Shark','legendary'),('Leviathan','legendary'),('Phoenix Fish','legendary'),('Frost Dragon Fish','legendary'),('Emperor Fish','legendary')
  ) SELECT count(*) INTO v_required FROM fish WHERE rarity = CASE WHEN p_tier = 'all' THEN rarity ELSE p_tier END;

  -- Keep the completion test based on the server's canonical caught list. The
  -- self-host fishing transaction writes this list; browser state cannot write
  -- fishing_almanac after the lockdown migration.
  WITH fish(name, rarity) AS (VALUES
    ('Tilapia','common'),('Catfish','common'),('Carp','common'),('Perch','common'),('Sardine','common'),('Anchovy','common'),('Mackerel','common'),('Herring','common'),('Shad','common'),('Smelt','common'),('Goby','common'),('Mullet','common'),('Sole','common'),('Crucian Carp','common'),('Bass','common'),('Trout','common'),('Pike','common'),('Bluegill','common'),('Minnow','common'),('Sunfish','common'),('Roach','common'),('Dace','common'),('Whiting','common'),('Flounder','common'),('Snapper','common'),('Cod','common'),('Haddock','common'),('Pollock','common'),('Butterfish','common'),('Sea Bass','common'),
    ('Rainbow Trout','uncommon'),('Salmon','uncommon'),('Tuna','uncommon'),('Swordfish','uncommon'),('Eel','uncommon'),('Barramundi','uncommon'),('Grouper','uncommon'),('Red Snapper','uncommon'),('Yellowtail','uncommon'),('Pompano','uncommon'),('Wahoo','uncommon'),('Mahi-Mahi','uncommon'),('Sailfish','uncommon'),('Sturgeon','uncommon'),('Walleye','uncommon'),('Striped Bass','uncommon'),('King Mackerel','uncommon'),('Dorado','uncommon'),('Arapaima','uncommon'),('Paddlefish','uncommon'),('Tarpon','uncommon'),('Bonefish','uncommon'),
    ('Golden Koi','rare'),('Arowana','rare'),('Moonfish','rare'),('Ghost Fish','rare'),('Crystal Fish','rare'),('Sunstone Fish','rare'),('Stargazer','rare'),('Coelacanth','rare'),('Electric Eel','rare'),('Oarfish','rare'),('Piranha','rare'),('Marlin','rare'),('Giant Catfish','rare'),('Anglerfish','rare'),
    ('Great White Shark','legendary'),('Hammerhead','legendary'),('Raja Ampat Shark','legendary'),('Leviathan','legendary'),('Phoenix Fish','legendary'),('Frost Dragon Fish','legendary'),('Emperor Fish','legendary')
  ) SELECT count(*) INTO v_found FROM fish WHERE (p_tier = 'all' OR rarity = p_tier) AND v_caught ? name;
  IF p_tier = 'all' THEN v_required := 73; END IF;
  IF v_found <> v_required THEN RETURN jsonb_build_object('ok', false, 'reason', 'almanac_incomplete'); END IF;

  v_gold := CASE p_tier WHEN 'common' THEN 3000 WHEN 'uncommon' THEN 8000 WHEN 'rare' THEN 20000 WHEN 'legendary' THEN 60000 ELSE 150000 END;
  IF p_tier = 'all' THEN v_item_name := 'Master Angler Trophy'; v_item_type := 'title'; END IF;
  UPDATE public.characters SET gold = LEAST(COALESCE(gold, 0) + v_gold, 500000000), updated_at = now()
   WHERE id = p_character_id RETURNING gold INTO v_new_gold;
  IF v_item_name IS NOT NULL THEN
    SELECT * INTO v_row FROM public.inventory WHERE character_id = p_character_id AND item_name = v_item_name ORDER BY id LIMIT 1 FOR UPDATE;
    IF FOUND THEN UPDATE public.inventory SET item_type = v_item_type, quantity = quantity + 1 WHERE id = v_row.id;
    ELSE INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats) VALUES (p_character_id, v_item_name, v_item_type, 1, '{}'::jsonb);
    END IF;
  END IF;
  v_next := jsonb_set(v_stats, '{claimed}', v_claimed || jsonb_build_array(p_tier), true);
  UPDATE public.inventory SET quantity = 1, stats = v_next WHERE id = v_almanac_id;
  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'claimed', true, 'tier', p_tier,
    'gold', COALESCE(v_new_gold, 0), 'items', CASE WHEN v_item_name IS NULL THEN jsonb_build_array()
      ELSE jsonb_build_array(jsonb_build_object('name', v_item_name, 'type', v_item_type, 'quantity', 1)) END,
    'state', v_next);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_almanac_state');
END;
$function$;

REVOKE ALL ON FUNCTION public.save_system_state(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_daily_reward(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_almanac_reward(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_system_state(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_almanac_reward(text, text) TO authenticated;
