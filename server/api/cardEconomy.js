// Stardust (ผงดาว) economy — the card-dupe sink that keeps 100+ duplicate cards
// meaningful. Excess duplicates are "refined" into Stardust, a universal
// currency the player then spends to top up a fusion when they're short on
// natural duplicates for ANY card. Rates are admin-editable per rarity.
//
// Everything here is created + seeded idempotently at boot (like
// ensureMonsterTables / ensureCheatTable) and talks straight to local Postgres.
// The two RPCs mirror the existing fuse_card / award_card_drop design:
// advisory-locked, idempotent via a receipt table, SECURITY DEFINER.
import { query } from './db.js';

// Default rates by rarity: refine_dust = dust earned per duplicate refined;
// dust_per_dupe = dust charged to substitute one missing duplicate in a fusion.
// dust_per_dupe > refine_dust so refine→fuse round-trips are a net sink.
const DEFAULT_ECONOMY = [
    { rarity: 'common', refine_dust: 1, dust_per_dupe: 3 },
    { rarity: 'rare', refine_dust: 4, dust_per_dupe: 12 },
    { rarity: 'epic', refine_dust: 12, dust_per_dupe: 40 },
    { rarity: 'legendary', refine_dust: 40, dust_per_dupe: 140 },
    { rarity: 'mythic', refine_dust: 120, dust_per_dupe: 420 },
];

export async function ensureCardEconomy() {
    // 1) per-character stardust balance
    await query(`ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS stardust integer NOT NULL DEFAULT 0`);

    // 2) admin-editable rate table (one row per rarity)
    await query(`
        CREATE TABLE IF NOT EXISTS public.card_economy (
            rarity text PRIMARY KEY,
            refine_dust integer NOT NULL DEFAULT 1,
            dust_per_dupe integer NOT NULL DEFAULT 3,
            updated_at timestamptz DEFAULT now()
        )`);
    for (const e of DEFAULT_ECONOMY) {
        await query(
            `INSERT INTO public.card_economy (rarity, refine_dust, dust_per_dupe)
             VALUES ($1,$2,$3) ON CONFLICT (rarity) DO NOTHING`,
            [e.rarity, e.refine_dust, e.dust_per_dupe]);
    }

    // 3) idempotency receipt tables for the two RPCs
    await query(`
        CREATE TABLE IF NOT EXISTS public.card_refine_requests (
            idempotency_key text PRIMARY KEY,
            character_id text NOT NULL,
            card_id text NOT NULL,
            refine_count integer NOT NULL,
            dust_each integer NOT NULL,
            result jsonb NOT NULL,
            created_at timestamptz DEFAULT now()
        )`);
    await query(`
        CREATE TABLE IF NOT EXISTS public.card_fuse_dust_requests (
            idempotency_key text PRIMARY KEY,
            character_id text NOT NULL,
            card_id text NOT NULL,
            expected_stars smallint NOT NULL,
            dupe_cost integer NOT NULL,
            dust_each integer NOT NULL,
            result jsonb NOT NULL,
            created_at timestamptz DEFAULT now()
        )`);

    // 4) admin-editable per-card drop overrides (merged over CardCatalog defaults
    //    at roll time). A missing row = use the catalog default.
    await query(`
        CREATE TABLE IF NOT EXISTS public.card_overrides (
            card_id text PRIMARY KEY,
            chance real,
            pity integer,
            drop_enabled boolean NOT NULL DEFAULT true,
            updated_at timestamptz DEFAULT now()
        )`);

    // 5) RPCs
    await query(REFINE_CARDS_SQL);
    await query(FUSE_CARD_DUST_SQL);
}

// cardId -> { chance, pity, enabled }. Only rows that exist are returned.
export async function getCardOverrides() {
    const { rows } = await query('SELECT card_id, chance, pity, drop_enabled FROM public.card_overrides');
    const map = {};
    for (const r of rows) {
        map[r.card_id] = {
            chance: r.chance == null ? undefined : Number(r.chance),
            pity: r.pity == null ? undefined : Number(r.pity),
            enabled: r.drop_enabled !== false,
        };
    }
    return map;
}

// rarity -> { refine_dust, dust_per_dupe }
export async function getCardEconomy() {
    const { rows } = await query('SELECT rarity, refine_dust, dust_per_dupe FROM public.card_economy');
    const map = {};
    for (const r of rows) map[r.rarity] = { refine_dust: r.refine_dust, dust_per_dupe: r.dust_per_dupe };
    // Fall back to defaults for any rarity missing a row.
    for (const e of DEFAULT_ECONOMY) map[e.rarity] ??= { refine_dust: e.refine_dust, dust_per_dupe: e.dust_per_dupe };
    return map;
}

export async function getStardust(characterId) {
    const { rows } = await query('SELECT stardust FROM public.characters WHERE id = $1', [characterId]);
    return Number(rows[0]?.stardust) || 0;
}

const REFINE_CARDS_SQL = `
CREATE OR REPLACE FUNCTION public.refine_cards(
    p_character_id text, p_card_id text, p_count integer, p_dust_each integer, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_row public.character_cards%ROWTYPE;
  v_stardust integer;
  v_result jsonb;
  v_r_cid text; v_r_card text; v_r_count integer; v_r_dust integer;
BEGIN
  IF p_character_id IS NULL OR p_character_id = '' OR p_card_id IS NULL OR p_card_id = ''
     OR p_idempotency_key IS NULL OR p_idempotency_key = ''
     OR p_count IS NULL OR p_count <= 0 OR p_dust_each IS NULL OR p_dust_each < 0 THEN
    RAISE EXCEPTION 'invalid refine input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  SELECT r.character_id, r.card_id, r.refine_count, r.dust_each, r.result
    INTO v_r_cid, v_r_card, v_r_count, v_r_dust, v_result
    FROM public.card_refine_requests AS r WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_r_cid IS DISTINCT FROM p_character_id OR v_r_card IS DISTINCT FROM p_card_id
       OR v_r_count IS DISTINCT FROM p_count OR v_r_dust IS DISTINCT FROM p_dust_each THEN
      RAISE EXCEPTION 'idempotency key reused with different refine request' USING ERRCODE = '22023';
    END IF;
    RETURN v_result;
  END IF;

  SELECT cc.* INTO STRICT v_row FROM public.character_cards AS cc
    WHERE cc.character_id = p_character_id AND cc.card_id = p_card_id FOR UPDATE;

  IF v_row.owned - 1 < p_count THEN
    RAISE EXCEPTION 'not enough duplicate cards to refine' USING ERRCODE = '22023';
  END IF;

  UPDATE public.character_cards AS cc SET owned = cc.owned - p_count
    WHERE cc.character_id = p_character_id AND cc.card_id = p_card_id
    RETURNING cc.* INTO STRICT v_row;

  UPDATE public.characters SET stardust = COALESCE(stardust, 0) + (p_count * p_dust_each)
    WHERE id = p_character_id RETURNING stardust INTO v_stardust;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'character not found' USING ERRCODE = '22023';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'card_id', v_row.card_id, 'owned', v_row.owned, 'stardust', v_stardust);
  INSERT INTO public.card_refine_requests (idempotency_key, character_id, card_id, refine_count, dust_each, result)
    VALUES (p_idempotency_key, p_character_id, p_card_id, p_count, p_dust_each, v_result);
  RETURN v_result;
END;
$fn$;`;

const FUSE_CARD_DUST_SQL = `
CREATE OR REPLACE FUNCTION public.fuse_card_dust(
    p_character_id text, p_card_id text, p_expected_stars smallint,
    p_dupe_cost integer, p_dust_each integer, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_row public.character_cards%ROWTYPE;
  v_available integer; v_dupes_used integer; v_missing integer; v_dust_needed integer;
  v_stardust integer; v_result jsonb;
  v_r_cid text; v_r_card text; v_r_stars smallint; v_r_cost integer; v_r_dust integer;
BEGIN
  IF p_character_id IS NULL OR p_character_id = '' OR p_card_id IS NULL OR p_card_id = ''
     OR p_idempotency_key IS NULL OR p_idempotency_key = ''
     OR p_expected_stars IS NULL OR p_expected_stars < 1 OR p_expected_stars >= 5
     OR p_dupe_cost IS NULL OR p_dupe_cost <= 0 OR p_dust_each IS NULL OR p_dust_each < 0 THEN
    RAISE EXCEPTION 'invalid dust fusion input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  SELECT r.character_id, r.card_id, r.expected_stars, r.dupe_cost, r.dust_each, r.result
    INTO v_r_cid, v_r_card, v_r_stars, v_r_cost, v_r_dust, v_result
    FROM public.card_fuse_dust_requests AS r WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_r_cid IS DISTINCT FROM p_character_id OR v_r_card IS DISTINCT FROM p_card_id
       OR v_r_stars IS DISTINCT FROM p_expected_stars OR v_r_cost IS DISTINCT FROM p_dupe_cost
       OR v_r_dust IS DISTINCT FROM p_dust_each THEN
      RAISE EXCEPTION 'idempotency key reused with different dust fusion request' USING ERRCODE = '22023';
    END IF;
    RETURN v_result;
  END IF;

  SELECT cc.* INTO STRICT v_row FROM public.character_cards AS cc
    WHERE cc.character_id = p_character_id AND cc.card_id = p_card_id FOR UPDATE;

  IF v_row.stars <> p_expected_stars THEN
    RAISE EXCEPTION 'card stars changed concurrently' USING ERRCODE = '40001';
  END IF;

  v_available := GREATEST(0, v_row.owned - 1);
  IF v_available >= p_dupe_cost THEN
    v_dupes_used := p_dupe_cost; v_missing := 0;
  ELSE
    v_dupes_used := v_available; v_missing := p_dupe_cost - v_available;
  END IF;
  v_dust_needed := v_missing * p_dust_each;

  UPDATE public.characters SET stardust = COALESCE(stardust, 0) - v_dust_needed
    WHERE id = p_character_id AND COALESCE(stardust, 0) >= v_dust_needed
    RETURNING stardust INTO v_stardust;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not enough stardust' USING ERRCODE = '22023';
  END IF;

  UPDATE public.character_cards AS cc
    SET owned = cc.owned - v_dupes_used, stars = (cc.stars + 1)::smallint
    WHERE cc.character_id = p_character_id AND cc.card_id = p_card_id
    RETURNING cc.* INTO STRICT v_row;

  v_result := pg_catalog.jsonb_build_object(
    'card_id', v_row.card_id, 'owned', v_row.owned, 'stars', v_row.stars, 'pity', v_row.pity,
    'stardust', v_stardust, 'dust_spent', v_dust_needed, 'dupes_used', v_dupes_used);
  INSERT INTO public.card_fuse_dust_requests
    (idempotency_key, character_id, card_id, expected_stars, dupe_cost, dust_each, result)
    VALUES (p_idempotency_key, p_character_id, p_card_id, p_expected_stars, p_dupe_cost, p_dust_each, v_result);
  RETURN v_result;
END;
$fn$;`;
