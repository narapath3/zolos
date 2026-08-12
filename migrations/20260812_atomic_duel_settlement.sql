CREATE OR REPLACE FUNCTION public.settle_duel_mmr(
  p_winner_character_id text,
  p_loser_character_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_winner public.characters%ROWTYPE;
  v_loser public.characters%ROWTYPE;
  v_winner_mmr integer;
  v_loser_mmr integer;
  v_delta integer;
BEGIN
  IF p_winner_character_id IS NULL OR p_winner_character_id = ''
     OR p_loser_character_id IS NULL OR p_loser_character_id = ''
     OR p_winner_character_id = p_loser_character_id THEN
    RAISE EXCEPTION 'invalid duel settlement';
  END IF;

  PERFORM 1
  FROM public.characters
  WHERE id IN (p_winner_character_id, p_loser_character_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_winner FROM public.characters WHERE id = p_winner_character_id;
  SELECT * INTO v_loser FROM public.characters WHERE id = p_loser_character_id;
  IF v_winner.id IS NULL OR v_loser.id IS NULL THEN
    RAISE EXCEPTION 'duel character not found';
  END IF;

  v_winner_mmr := COALESCE(v_winner.mmr, 1000);
  v_loser_mmr := COALESCE(v_loser.mmr, 1000);
  v_delta := GREATEST(1, ROUND(32 * (1 - (1 / (1 + POWER(10::numeric,
    (v_loser_mmr - v_winner_mmr)::numeric / 400))))))::integer;
  v_winner_mmr := v_winner_mmr + v_delta;
  v_loser_mmr := GREATEST(0, v_loser_mmr - v_delta);

  UPDATE public.characters
  SET mmr = v_winner_mmr, pvp_wins = COALESCE(pvp_wins, 0) + 1, updated_at = now()
  WHERE id = p_winner_character_id;
  UPDATE public.characters
  SET mmr = v_loser_mmr, pvp_losses = COALESCE(pvp_losses, 0) + 1, updated_at = now()
  WHERE id = p_loser_character_id;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'winnerMmr', v_winner_mmr,
    'loserMmr', v_loser_mmr, 'delta', v_delta
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.settle_duel_mmr(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_duel_mmr(text, text) TO service_role;
