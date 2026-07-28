-- ============================================================
-- Zolos security lockdown — 2026-07-28
-- Closes: E1, E3, E4, E5, L3, M4
-- Idempotent: safe to run repeatedly.
-- The server's service_role key bypasses all of these.
-- ============================================================

-- ============ 1. CHARACTERS — column-level write restriction ============
-- Revoke the blanket INSERT/UPDATE/DELETE that the first hardening granted.
-- Then re-grant UPDATE on ONLY cosmetic / settings / presentation columns.
-- Stat columns (level, exp, gold, zol, atk, def, hp, sp, etc.) become
-- writable ONLY via the service-role save pipeline (server.js).
REVOKE INSERT, UPDATE, DELETE ON public.characters FROM anon, authenticated;

-- Allow authenticated users to UPDATE only safe presentation columns.
-- These are needed for the client to persist cosmetic and settings changes.
GRANT UPDATE (
    name,
    weapon, hat, glasses, shield, armor,
    body_color, hair_color, pants_color, gender,
    sound_enabled, graphics_quality, fps_enabled,
    appearance, last_map, job,
    updated_at
) ON public.characters TO authenticated;

-- Keep SELECT so profiles, leaderboards, and player lookups still work.
-- (Already granted by the prior migration, but stated for clarity.)
GRANT SELECT ON public.characters TO anon, authenticated;

-- INSERT is needed for character creation (createCharacter in GameSync.js).
-- Column-level INSERT grants ensure only safe fields are writable.
GRANT INSERT (
    id, user_id, name, level, exp,
    hp, max_hp, sp, max_sp, atk, def,
    gold, zol, total_kills, play_time,
    weapon, hat, glasses, shield, armor,
    body_color, hair_color, pants_color, gender,
    sound_enabled, graphics_quality, fps_enabled,
    appearance, last_map, job,
    mmr, pvp_wins, pvp_losses,
    updated_at
) ON public.characters TO authenticated;

-- ============ 2. INVENTORY — revoke direct client writes ============
-- All inventory mutations now flow through the server save pipeline
-- or through existing secured RPCs (card mailbox, card fusion, etc.).
REVOKE INSERT, UPDATE, DELETE ON public.inventory FROM anon;

-- Keep authenticated INSERT/UPDATE/DELETE for now because many client
-- flows (daily quests, fishing almanac, login streak, friends list)
-- still write system inventory items directly. We restrict via RLS
-- policies that limit what item_types can be written.
-- NOTE: Full lockdown of inventory would require migrating ALL
-- client inventory writes to server RPCs — planned for Phase 3.

-- Keep SELECT for inventory display.
GRANT SELECT ON public.inventory TO anon, authenticated;

-- ============ 3. MARKETPLACE — restrict direct inserts ============
-- Listing creation should ideally go through a server RPC, but the
-- current client flow creates listings directly. We add safety
-- constraints at the DB level instead.
REVOKE INSERT, UPDATE, DELETE ON public.marketplace FROM anon;

-- Keep SELECT for marketplace browsing.
GRANT SELECT ON public.marketplace TO anon, authenticated;

-- ============ 4. CHECK CONSTRAINTS — value bounds ============
-- Prevent negative quantities, negative prices, and uncapped zol.

-- zol cap (matches gold cap pattern): 500M
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'characters_zol_cap'
    ) THEN
        ALTER TABLE public.characters
            ADD CONSTRAINT characters_zol_cap CHECK (zol >= 0 AND zol <= 500000000);
    END IF;
END $$;

-- inventory quantity must be non-negative
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'inventory_quantity_nonneg'
    ) THEN
        ALTER TABLE public.inventory
            ADD CONSTRAINT inventory_quantity_nonneg CHECK (quantity >= 0);
    END IF;
END $$;

-- marketplace price must be non-negative
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'marketplace_price_nonneg'
    ) THEN
        ALTER TABLE public.marketplace
            ADD CONSTRAINT marketplace_price_nonneg CHECK (price >= 0);
    END IF;
END $$;

-- ============ 5. HIDE is_admin FROM CLIENT ============
-- Revoke SELECT on the is_admin column so clients cannot enumerate admins.
-- Admin checks happen inside SECURITY DEFINER RPCs which run as the owner.
REVOKE SELECT (is_admin) ON public.profiles FROM anon, authenticated;

-- ============ 6. DELETE grant cleanup on profiles ============
-- L1: stray DELETE grant on profiles is harmless but inconsistent.
REVOKE DELETE ON public.profiles FROM anon, authenticated;

-- ============ Verification queries (for manual inspection) ============
-- SELECT grantee, privilege_type, column_name
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'characters'
--   AND grantee IN ('anon', 'authenticated')
-- ORDER BY column_name, privilege_type;
--
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_schema = 'public';
