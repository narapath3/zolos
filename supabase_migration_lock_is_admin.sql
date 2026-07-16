-- ============================================================
-- Security fix: lock profiles.is_admin against privilege escalation
-- ============================================================
-- Applied to production 2026-07-16.
--
-- Root cause: the profiles RLS policy
--   "Allow users to insert/update their own profile"  FOR ALL USING (auth.uid() = id)
-- had no column restriction, so any logged-in user (including anonymous
-- guests) could run  UPDATE profiles SET is_admin = true WHERE id = auth.uid()
-- and grant themselves admin. Admin unlocks the announcement broadcast AND the
-- admin_* character RPCs (delete/update/reset any character).
--
-- Fix: column-level privileges. Client roles (anon, authenticated) may only
-- write the safe columns; only service_role (the server, via the service key)
-- can set is_admin. RLS still limits WHICH row a user may touch (auth.uid()=id).
--
-- An intruder account (username probe_mm2j9v97) that had self-granted admin was
-- purged from profiles / characters / inventory / auth.users at the same time.

ALTER TABLE public.profiles ALTER COLUMN is_admin SET DEFAULT false;

REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT  INSERT (id, username, gender) ON public.profiles TO anon, authenticated;
GRANT  UPDATE (username, gender)     ON public.profiles TO anon, authenticated;

-- Verify (expect: no is_admin row for anon/authenticated):
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE');
