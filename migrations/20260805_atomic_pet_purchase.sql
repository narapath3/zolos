-- Server-authoritative, idempotent Pet Sanctuary purchases.
-- Canonical price and pet key are supplied only by the trusted socket server.
CREATE TABLE IF NOT EXISTS public.pet_purchase_requests (
  idempotency_key text PRIMARY KEY,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.purchase_pet(
  p_character_id text, p_item_name text, p_price integer,
  p_pet_key text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_gold integer; v_stats jsonb; v_instances jsonb; v_quantity integer;
  v_uid text; v_result jsonb; v_receipt_character text; v_receipt_item text;
BEGIN
  IF p_character_id IS NULL OR p_character_id = '' OR p_item_name IS NULL OR p_item_name = ''
     OR p_pet_key IS NULL OR p_pet_key !~ '^[a-z0-9_]{1,64}$'
     OR p_price IS NULL OR p_price < 1 OR p_price > 100000000
     OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-zA-Z0-9:_-]{1,160}$' THEN
    RAISE EXCEPTION 'invalid pet purchase request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_character_id || ':' || p_idempotency_key, 0));
  SELECT character_id, item_name, result INTO v_receipt_character, v_receipt_item, v_result
    FROM public.pet_purchase_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_receipt_character IS DISTINCT FROM p_character_id OR v_receipt_item IS DISTINCT FROM p_item_name THEN
      RAISE EXCEPTION 'idempotency key reused for another purchase' USING ERRCODE = '22023';
    END IF;
    RETURN v_result;
  END IF;
  SELECT gold INTO v_gold FROM public.characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'character not found' USING ERRCODE = '22023'; END IF;
  IF v_gold < p_price THEN RAISE EXCEPTION 'insufficient gold' USING ERRCODE = '22023'; END IF;
  SELECT stats INTO v_stats FROM public.inventory
    WHERE character_id = p_character_id AND item_name = p_item_name FOR UPDATE;
  IF pg_catalog.jsonb_typeof(v_stats -> 'instances') = 'array' THEN
    v_instances := v_stats -> 'instances';
  ELSE v_instances := '[]'::jsonb;
  END IF;
  IF pg_catalog.jsonb_array_length(v_instances) >= 200 THEN
    RAISE EXCEPTION 'pet storage full' USING ERRCODE = '22023';
  END IF;
  v_uid := 'pet_' || pg_catalog.substr(pg_catalog.md5(p_character_id || ':' || p_idempotency_key), 1, 24);
  v_instances := v_instances || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('uid', v_uid, 'name', null, 'level', 1, 'xp', 0));
  v_quantity := pg_catalog.jsonb_array_length(v_instances);
  v_stats := coalesce(v_stats, '{}'::jsonb) || pg_catalog.jsonb_build_object('instances', v_instances);
  INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (p_character_id, p_item_name, 'pet', v_quantity, v_stats)
    ON CONFLICT (character_id, item_name) DO UPDATE
      SET item_type = 'pet', quantity = EXCLUDED.quantity, stats = EXCLUDED.stats;
  UPDATE public.characters SET gold = gold - p_price, updated_at = pg_catalog.now()
    WHERE id = p_character_id RETURNING gold INTO v_gold;
  v_result := pg_catalog.jsonb_build_object(
    'item_name', p_item_name, 'pet_key', p_pet_key, 'price', p_price,
    'gold', v_gold, 'quantity', v_quantity, 'stats', v_stats,
    'instance', v_instances -> (v_quantity - 1));
  INSERT INTO public.pet_purchase_requests (idempotency_key, character_id, item_name, result)
    VALUES (p_idempotency_key, p_character_id, p_item_name, v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON TABLE public.pet_purchase_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_pet(text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_pet(text, text, integer, text, text) TO service_role;
