-- Authoritative card collection state for service-role server rewards.
-- Browser clients may read their own rows but cannot mutate card progression.

CREATE TABLE IF NOT EXISTS public.character_cards (
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  card_id text NOT NULL,
  owned integer NOT NULL DEFAULT 0 CHECK (owned >= 0),
  stars smallint NOT NULL DEFAULT 1 CHECK (stars BETWEEN 1 AND 5),
  pity integer NOT NULL DEFAULT 0 CHECK (pity >= 0),
  PRIMARY KEY (character_id, card_id)
);

CREATE TABLE IF NOT EXISTS public.card_reward_requests (
  idempotency_key text PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  card_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS public.card_fusion_requests (
  idempotency_key text PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  card_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS characters_user_id_idx
  ON public.characters (user_id);
CREATE INDEX IF NOT EXISTS card_reward_requests_character_id_idx
  ON public.card_reward_requests (character_id);
CREATE INDEX IF NOT EXISTS card_fusion_requests_character_id_idx
  ON public.card_fusion_requests (character_id);

ALTER TABLE public.character_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_reward_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_fusion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS character_cards_read_own ON public.character_cards;
CREATE POLICY character_cards_read_own
  ON public.character_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.characters AS c
      WHERE c.id = character_cards.character_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.character_cards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.character_cards TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.character_cards FROM anon, authenticated;
REVOKE ALL ON public.card_reward_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.card_fusion_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.award_card_drop(
  p_character_id uuid,
  p_card_id text,
  p_expected_pity integer,
  p_new_pity integer,
  p_won boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.character_cards%ROWTYPE;
  v_result jsonb;
  v_is_new boolean;
BEGIN
  IF p_character_id IS NULL
    OR p_card_id IS NULL OR p_card_id = ''
    OR p_idempotency_key IS NULL OR p_idempotency_key = ''
    OR p_expected_pity IS NULL
    OR p_new_pity IS NULL
    OR p_won IS NULL
    OR p_expected_pity < 0 OR p_new_pity < 0
  THEN
    RAISE EXCEPTION 'invalid card award input' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries for this logical reward before inspecting its receipt.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key, 0)
  );

  SELECT r.result
  INTO v_result
  FROM public.card_reward_requests AS r
  WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  INSERT INTO public.character_cards (character_id, card_id, owned, stars, pity)
  VALUES (p_character_id, p_card_id, 0, 1, 0)
  ON CONFLICT (character_id, card_id) DO NOTHING;

  SELECT cc.*
  INTO STRICT v_row
  FROM public.character_cards AS cc
  WHERE cc.character_id = p_character_id
    AND cc.card_id = p_card_id
  FOR UPDATE;

  IF v_row.pity <> p_expected_pity THEN
    RAISE EXCEPTION 'card pity changed concurrently'
      USING ERRCODE = '40001';
  END IF;
  IF (p_won AND p_new_pity <> 0)
    OR (NOT p_won AND p_new_pity <> p_expected_pity + 1)
  THEN
    RAISE EXCEPTION 'invalid card pity transition'
      USING ERRCODE = '22023';
  END IF;

  v_is_new := p_won AND v_row.owned = 0;
  UPDATE public.character_cards AS cc
  SET owned = cc.owned + CASE WHEN p_won THEN 1 ELSE 0 END,
      pity = p_new_pity
  WHERE cc.character_id = p_character_id
    AND cc.card_id = p_card_id
  RETURNING cc.* INTO STRICT v_row;

  v_result := pg_catalog.jsonb_build_object(
    'card_id', v_row.card_id,
    'owned', v_row.owned,
    'stars', v_row.stars,
    'pity', v_row.pity,
    'is_new', v_is_new,
    'won', p_won
  );

  INSERT INTO public.card_reward_requests (
    idempotency_key, character_id, card_id, result
  )
  VALUES (p_idempotency_key, p_character_id, p_card_id, v_result);

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fuse_card(
  p_character_id uuid,
  p_card_id text,
  p_expected_stars smallint,
  p_cost integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.character_cards%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_character_id IS NULL
    OR p_card_id IS NULL OR p_card_id = ''
    OR p_idempotency_key IS NULL OR p_idempotency_key = ''
    OR p_expected_stars IS NULL
    OR p_cost IS NULL
    OR p_expected_stars < 1 OR p_expected_stars >= 5
    OR p_cost <= 0
  THEN
    RAISE EXCEPTION 'invalid card fusion input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key, 0)
  );

  SELECT r.result
  INTO v_result
  FROM public.card_fusion_requests AS r
  WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  SELECT cc.*
  INTO STRICT v_row
  FROM public.character_cards AS cc
  WHERE cc.character_id = p_character_id
    AND cc.card_id = p_card_id
  FOR UPDATE;

  IF v_row.stars <> p_expected_stars THEN
    RAISE EXCEPTION 'card stars changed concurrently'
      USING ERRCODE = '40001';
  END IF;
  IF v_row.owned - 1 < p_cost THEN
    RAISE EXCEPTION 'not enough duplicate cards'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.character_cards AS cc
  SET owned = cc.owned - p_cost,
      stars = (cc.stars + 1)::smallint
  WHERE cc.character_id = p_character_id
    AND cc.card_id = p_card_id
  RETURNING cc.* INTO STRICT v_row;

  v_result := pg_catalog.jsonb_build_object(
    'card_id', v_row.card_id,
    'owned', v_row.owned,
    'stars', v_row.stars,
    'pity', v_row.pity
  );

  INSERT INTO public.card_fusion_requests (
    idempotency_key, character_id, card_id, result
  )
  VALUES (p_idempotency_key, p_character_id, p_card_id, v_result);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_card_drop(uuid, text, integer, integer, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_card_drop(uuid, text, integer, integer, boolean, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fuse_card(uuid, text, smallint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fuse_card(uuid, text, smallint, integer, text) TO service_role;
