-- ============================================================
-- ZOL in-game currency — characters.zol column
-- ============================================================
-- Applied to production 2026-07-17.
--
-- ZOL is an IN-GAME currency only (earned by converting Celestial Ore mined in
-- the Svarrga / Heaven city). It is not connected to real money or crypto.
--
-- Persisted like `gold`: written by the client save path and re-clamped
-- server-side (server.js allowedFields + clamp) against the CHECK below.

ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS zol INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.characters DROP CONSTRAINT IF EXISTS characters_zol_check;
ALTER TABLE public.characters ADD CONSTRAINT characters_zol_check CHECK (zol >= 0 AND zol <= 2147483647);
