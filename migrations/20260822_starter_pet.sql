-- One-time tutorial companion. The browser never writes this reward directly.
CREATE TABLE IF NOT EXISTS public.starter_pet_claims (
  request_id text PRIMARY KEY,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  receipt_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, receipt_id)
);

CREATE OR REPLACE FUNCTION public.claim_starter_pet(
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
  v_existing public.inventory%ROWTYPE;
  v_owner public.characters%ROWTYPE;
  v_stats jsonb;
  v_instance jsonb;
  v_uid text;
  v_result jsonb;
  v_receipt public.starter_pet_claims%ROWTYPE;
  v_receipt_id text := 'starter-pet:v1';
BEGIN
  IF p_character_id IS NULL OR p_character_id = ''
     OR p_user_id IS NULL OR p_user_id = ''
     OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[a-zA-Z0-9:_-]{1,160}$' THEN
    RAISE EXCEPTION 'invalid starter pet request' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_character_id || ':' || v_receipt_id, 0));

  SELECT * INTO v_receipt
    FROM public.starter_pet_claims
   WHERE request_id = p_idempotency_key
      OR (character_id = p_character_id AND receipt_id = v_receipt_id)
   ORDER BY created_at ASC
   LIMIT 1;
  IF FOUND THEN
    IF v_receipt.character_id IS DISTINCT FROM p_character_id
       OR v_receipt.receipt_id IS DISTINCT FROM v_receipt_id THEN
      RAISE EXCEPTION 'starter pet receipt belongs to another character' USING ERRCODE = '22023';
    END IF;
    RETURN v_receipt.result;
  END IF;

  SELECT * INTO v_owner
    FROM public.characters
   WHERE id = p_character_id AND user_id::text = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'character not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
    FROM public.inventory
   WHERE character_id = p_character_id
     AND item_name = 'Starter Poring Pet'
   ORDER BY id
   LIMIT 1
   FOR UPDATE;

  IF FOUND AND COALESCE(v_existing.quantity, 0) > 0 THEN
    v_stats := COALESCE(v_existing.stats, '{}'::jsonb);
    v_result := pg_catalog.jsonb_build_object(
      'ok', true,
      'serverAuthoritative', true,
      'requestId', p_idempotency_key,
      'receiptId', v_receipt_id,
      'granted', false,
      'item_name', 'Starter Poring Pet',
      'item_type', 'pet',
      'pet_key', 'poring',
      'price', 0,
      'quantity', v_existing.quantity,
      'stats', v_stats,
      'instance', NULL
    );
    INSERT INTO public.starter_pet_claims (request_id, character_id, receipt_id, result)
    VALUES (p_idempotency_key, p_character_id, v_receipt_id, v_result);
    RETURN v_result;
  END IF;

  v_uid := 'pet_poring_' || pg_catalog.substr(
    pg_catalog.md5(p_character_id || ':' || v_receipt_id), 1, 16);
  v_instance := pg_catalog.jsonb_build_object(
    'uid', v_uid, 'name', NULL, 'level', 1, 'xp', 0);
  v_stats := pg_catalog.jsonb_build_object(
    'instances', pg_catalog.jsonb_build_array(v_instance));

  IF FOUND THEN
    UPDATE public.inventory
       SET item_type = 'pet', quantity = 1, stats = v_stats
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (p_character_id, 'Starter Poring Pet', 'pet', 1, v_stats);
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'serverAuthoritative', true,
    'requestId', p_idempotency_key,
    'receiptId', v_receipt_id,
    'granted', true,
    'item_name', 'Starter Poring Pet',
    'item_type', 'pet',
    'pet_key', 'poring',
    'price', 0,
    'quantity', 1,
    'stats', v_stats,
    'instance', v_instance
  );
  INSERT INTO public.starter_pet_claims (request_id, character_id, receipt_id, result)
  VALUES (p_idempotency_key, p_character_id, v_receipt_id, v_result);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON TABLE public.starter_pet_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_starter_pet(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_starter_pet(text, text, text) TO service_role;
