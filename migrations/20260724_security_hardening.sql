-- Zolos security hardening
-- Safe to run repeatedly after the base schema and admin RPCs exist.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vending_stalls ENABLE ROW LEVEL SECURITY;

-- Data API privileges and RLS are separate gates. Anonymous browser traffic may
-- read public game data; authenticated users may mutate rows allowed by policy.
GRANT SELECT ON public.profiles, public.characters, public.inventory,
    public.marketplace, public.vending_stalls TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.characters, public.inventory,
    public.marketplace, public.vending_stalls TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- is_admin is intentionally excluded. RLS limits the row; these grants limit
-- the writable columns on that row.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT INSERT (id, username, created_at, gender)
    ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, created_at, gender)
    ON public.profiles TO anon, authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'profiles_public_read'
    ) THEN
        CREATE POLICY profiles_public_read ON public.profiles
            FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'profiles_insert_own'
    ) THEN
        CREATE POLICY profiles_insert_own ON public.profiles
            FOR INSERT TO authenticated
            WITH CHECK ((SELECT auth.uid()) = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'profiles_update_own'
    ) THEN
        CREATE POLICY profiles_update_own ON public.profiles
            FOR UPDATE TO authenticated
            USING ((SELECT auth.uid()) = id)
            WITH CHECK ((SELECT auth.uid()) = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'characters'
          AND policyname = 'characters_public_read'
    ) THEN
        CREATE POLICY characters_public_read ON public.characters
            FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'characters'
          AND policyname = 'characters_write_own'
    ) THEN
        CREATE POLICY characters_write_own ON public.characters
            FOR ALL TO authenticated
            USING ((SELECT auth.uid()) = user_id)
            WITH CHECK ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'inventory'
          AND policyname = 'inventory_public_read'
    ) THEN
        CREATE POLICY inventory_public_read ON public.inventory
            FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'inventory'
          AND policyname = 'inventory_write_own'
    ) THEN
        CREATE POLICY inventory_write_own ON public.inventory
            FOR ALL TO authenticated
            USING (EXISTS (
                SELECT 1 FROM public.characters c
                WHERE c.id = inventory.character_id
                  AND c.user_id = (SELECT auth.uid())
            ))
            WITH CHECK (EXISTS (
                SELECT 1 FROM public.characters c
                WHERE c.id = inventory.character_id
                  AND c.user_id = (SELECT auth.uid())
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'marketplace'
          AND policyname = 'marketplace_public_read'
    ) THEN
        CREATE POLICY marketplace_public_read ON public.marketplace
            FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'marketplace'
          AND policyname = 'marketplace_write_own'
    ) THEN
        CREATE POLICY marketplace_write_own ON public.marketplace
            FOR ALL TO authenticated
            USING (seller_id = (SELECT auth.uid()))
            WITH CHECK (seller_id = (SELECT auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'vending_stalls'
          AND policyname = 'vending_stalls_public_read'
    ) THEN
        CREATE POLICY vending_stalls_public_read ON public.vending_stalls
            FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'vending_stalls'
          AND policyname = 'vending_stalls_write_own'
    ) THEN
        CREATE POLICY vending_stalls_write_own ON public.vending_stalls
            FOR ALL TO authenticated
            USING (user_id = (SELECT auth.uid()))
            WITH CHECK (user_id = (SELECT auth.uid()));
    END IF;
END
$$;

-- SECURITY DEFINER functions are callable by PUBLIC unless explicitly revoked.
REVOKE EXECUTE ON FUNCTION public.admin_delete_character(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_character(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_character(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_character(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_character(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_character(text) TO authenticated;

-- Operator verification:
-- SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- SELECT grantee, privilege_type, column_name
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND grantee IN ('anon', 'authenticated');
