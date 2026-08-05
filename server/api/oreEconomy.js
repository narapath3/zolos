import { query } from './db.js';

export const CELESTIAL_ORE_TO_ZOL = 100;

export async function ensureOreEconomy() {
    await query(`CREATE TABLE IF NOT EXISTS public.ore_conversion_requests (
        idempotency_key text PRIMARY KEY, character_id text NOT NULL,
        result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await query(CONVERT_ORE_SQL);
}

const CONVERT_ORE_SQL = `
CREATE OR REPLACE FUNCTION public.convert_celestial_ore_to_zol(
    p_character_id text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_ore integer; v_zol integer; v_result jsonb; v_receipt_character text;
BEGIN
  IF p_character_id IS NULL OR p_character_id = '' OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[a-zA-Z0-9:_-]{1,160}$' THEN
    RAISE EXCEPTION 'invalid ore conversion request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
  SELECT character_id, result INTO v_receipt_character, v_result
    FROM public.ore_conversion_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_receipt_character IS DISTINCT FROM p_character_id THEN
      RAISE EXCEPTION 'idempotency key reused for another character' USING ERRCODE = '22023';
    END IF;
    RETURN v_result;
  END IF;
  PERFORM 1 FROM public.characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'character not found' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.inventory
    WHERE character_id = p_character_id AND item_name = 'Celestial Ore' FOR UPDATE;
  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_ore FROM public.inventory
    WHERE character_id = p_character_id AND item_name = 'Celestial Ore';
  IF v_ore <= 0 THEN RAISE EXCEPTION 'no celestial ore to convert' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.inventory WHERE character_id = p_character_id AND item_name = 'Celestial Ore';
  UPDATE public.characters SET zol = LEAST(2147483647, COALESCE(zol, 0) + (v_ore * ${CELESTIAL_ORE_TO_ZOL})), updated_at = now()
    WHERE id = p_character_id RETURNING zol INTO v_zol;
  v_result := pg_catalog.jsonb_build_object('ore_spent', v_ore, 'zol_gained', v_ore * ${CELESTIAL_ORE_TO_ZOL}, 'zol', v_zol);
  INSERT INTO public.ore_conversion_requests (idempotency_key, character_id, result)
    VALUES (p_idempotency_key, p_character_id, v_result);
  RETURN v_result;
END;
$fn$;`;
