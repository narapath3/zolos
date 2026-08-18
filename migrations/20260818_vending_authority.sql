-- Vending stall authority hardening.
-- Stall writes are moved behind SECURITY DEFINER RPCs so a client cannot spoof
-- another character, occupy an invalid slot, or race two owners into one slot.

CREATE OR REPLACE FUNCTION public.open_vending_stall(
  p_character_id text,
  p_shop_name text,
  p_appearance jsonb,
  p_requested_slot integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_mine public.vending_stalls%ROWTYPE;
  v_stall public.vending_stalls%ROWTYPE;
  v_slot integer;
  v_appearance jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  IF p_character_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_character'); END IF;
  IF p_requested_slot IS NOT NULL AND (p_requested_slot < 0 OR p_requested_slot >= 8) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_slot');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vending:slots', 0));
  SELECT * INTO v_char FROM public.characters
    WHERE id = p_character_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;

  SELECT * INTO v_mine FROM public.vending_stalls
    WHERE user_id = auth.uid() FOR UPDATE;
  IF p_requested_slot IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.vending_stalls
      WHERE slot = p_requested_slot AND user_id <> auth.uid()
    ) THEN RETURN jsonb_build_object('ok', false, 'reason', 'taken'); END IF;
    v_slot := p_requested_slot;
  ELSIF FOUND THEN
    v_slot := v_mine.slot;
  ELSE
    SELECT gs INTO v_slot
      FROM pg_catalog.generate_series(0, 7) AS gs
      WHERE NOT EXISTS (
        SELECT 1 FROM public.vending_stalls s WHERE s.slot = gs
      )
      ORDER BY gs LIMIT 1;
    IF v_slot IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'full'); END IF;
  END IF;

  v_appearance := jsonb_strip_nulls(jsonb_build_object(
    'bodyColor', left(p_appearance->>'bodyColor', 32),
    'hairColor', left(p_appearance->>'hairColor', 32),
    'pantsColor', left(p_appearance->>'pantsColor', 32),
    'gender', left(p_appearance->>'gender', 32)
  ));

  INSERT INTO public.vending_stalls
    (user_id, character_id, owner_name, shop_name, slot, appearance)
  VALUES (
    auth.uid(), v_char.id, v_char.name,
    COALESCE(NULLIF(left(trim(p_shop_name), 24), ''), 'ร้านค้า'),
    v_slot, COALESCE(v_appearance, '{}'::jsonb)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    character_id = EXCLUDED.character_id,
    owner_name = EXCLUDED.owner_name,
    shop_name = EXCLUDED.shop_name,
    slot = EXCLUDED.slot,
    appearance = EXCLUDED.appearance,
    updated_at = now()
  RETURNING * INTO v_stall;

  RETURN jsonb_build_object('ok', true, 'slot', v_slot,
    'moved', (v_mine.id IS NOT NULL AND v_mine.slot IS DISTINCT FROM v_slot),
    'stall', to_jsonb(v_stall));
END $function$;

CREATE OR REPLACE FUNCTION public.close_vending_stall()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  DELETE FROM public.vending_stalls WHERE user_id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE INSERT, UPDATE, DELETE ON public.vending_stalls FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_vending_stall(text, text, jsonb, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.close_vending_stall() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.open_vending_stall(text, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_vending_stall() TO authenticated;
