-- One-time, bounded onboarding supply for the mandatory +0 -> +1 weapon refine.
-- The game server is the only caller. The idempotency key is derived from the
-- trusted character identity by server.js; the browser never chooses a reward.

CREATE TABLE IF NOT EXISTS public.first_refine_supply_requests (
  request_id text PRIMARY KEY,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  receipt_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, receipt_id)
);

CREATE OR REPLACE FUNCTION public.claim_first_refine_supply(
  p_character_id text,
  p_user_id text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_receipt public.first_refine_supply_requests%ROWTYPE;
  v_ore_qty integer := 0;
  v_ore_id public.inventory.id%TYPE;
  v_result jsonb;
  v_gold integer;
  v_receipt_id text := 'first-refine-kit:v1';
BEGIN
  IF p_character_id IS NULL OR p_character_id = ''
     OR p_user_id IS NULL OR p_user_id = ''
     OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[a-zA-Z0-9:_-]{1,160}$' THEN
    RAISE EXCEPTION 'invalid first refine supply request' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_character_id || ':' || v_receipt_id, 0)
  );

  SELECT * INTO v_receipt
    FROM public.first_refine_supply_requests
   WHERE request_id = p_idempotency_key
      OR (character_id = p_character_id AND receipt_id = v_receipt_id)
   ORDER BY created_at ASC
   LIMIT 1;
  IF FOUND THEN
    IF v_receipt.character_id IS DISTINCT FROM p_character_id
       OR v_receipt.receipt_id IS DISTINCT FROM v_receipt_id THEN
      RAISE EXCEPTION 'first refine receipt belongs to another character' USING ERRCODE = '22023';
    END IF;
    RETURN v_receipt.result;
  END IF;

  SELECT * INTO v_char
    FROM public.characters
   WHERE id = p_character_id AND user_id::text = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'character not found' USING ERRCODE = '22023'; END IF;

  SELECT id, COALESCE(quantity, 0) INTO v_ore_id, v_ore_qty
    FROM public.inventory
   WHERE character_id = p_character_id AND item_name = 'Oridecon'
   FOR UPDATE;

  IF v_ore_id IS NULL THEN v_ore_qty := 0; END IF;
  v_gold := GREATEST(0, COALESCE(v_char.gold, 0));
  IF v_gold >= 620 AND v_ore_qty >= 1 THEN
    RETURN jsonb_build_object(
      'ok', true, 'serverAuthoritative', true, 'requestId', p_idempotency_key,
      'receiptId', v_receipt_id, 'granted', false,
      'goldGranted', 0, 'oreGranted', 0,
      'gold', v_gold, 'item_name', 'Oridecon', 'item_type', 'material',
      'inventory_quantity', v_ore_qty, 'reason', 'not_needed'
    );
  END IF;

  UPDATE public.characters
     SET gold = LEAST(2147483647, v_gold + 620), updated_at = pg_catalog.now()
   WHERE id = p_character_id
   RETURNING gold INTO v_gold;

  IF v_ore_id IS NULL THEN
    v_ore_qty := 1;
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (p_character_id, 'Oridecon', 'material', 1, '{}'::jsonb);
  ELSE
    v_ore_qty := v_ore_qty + 1;
    UPDATE public.inventory SET quantity = quantity + 1 WHERE id = v_ore_id;
  END IF;

  v_result := jsonb_build_object(
    'ok', true, 'serverAuthoritative', true, 'requestId', p_idempotency_key,
    'receiptId', v_receipt_id, 'granted', true,
    'goldGranted', 620, 'oreGranted', 1,
    'gold', v_gold, 'item_name', 'Oridecon', 'item_type', 'material',
    'inventory_quantity', v_ore_qty
  );
  INSERT INTO public.first_refine_supply_requests (request_id, character_id, receipt_id, result)
  VALUES (p_idempotency_key, p_character_id, v_receipt_id, v_result);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON TABLE public.first_refine_supply_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_first_refine_supply(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_refine_supply(text, text, text) TO service_role;
