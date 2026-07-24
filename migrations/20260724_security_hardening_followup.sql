-- Corrective follow-up after reviewing Supabase security/performance advisors.

-- Earlier grants may have targeted anon directly, so revoking PUBLIC alone is
-- insufficient. Admin RPCs remain callable by signed-in users and enforce the
-- profiles.is_admin check inside each function.
REVOKE EXECUTE ON FUNCTION public.admin_delete_character(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_character(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reset_character(text) FROM PUBLIC, anon;

ALTER FUNCTION public.admin_delete_character(text)
    SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_update_character(text, jsonb)
    SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_reset_character(text)
    SET search_path = public, pg_temp;

-- The production project already had equivalent ownership policies. Remove the
-- extra policies from the first hardening migration to avoid permissive-policy
-- duplication and retain the established application behavior.
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS characters_public_read ON public.characters;
DROP POLICY IF EXISTS characters_write_own ON public.characters;
DROP POLICY IF EXISTS inventory_public_read ON public.inventory;
DROP POLICY IF EXISTS inventory_write_own ON public.inventory;
DROP POLICY IF EXISTS marketplace_public_read ON public.marketplace;
DROP POLICY IF EXISTS marketplace_write_own ON public.marketplace;
DROP POLICY IF EXISTS vending_stalls_public_read ON public.vending_stalls;
DROP POLICY IF EXISTS vending_stalls_write_own ON public.vending_stalls;

-- Backup tables in public are not application APIs. Keep them inaccessible to
-- browser roles and add a service-role-only policy so RLS intent is explicit.
DO $$
DECLARE
    backup_table text;
    backup_tables text[] := ARRAY[
        'characters_backup_20260714',
        'inventory_backup_20260714',
        'marketplace_backup_20260714',
        'profiles_backup_20260714'
    ];
BEGIN
    FOREACH backup_table IN ARRAY backup_tables LOOP
        IF to_regclass('public.' || backup_table) IS NOT NULL THEN
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
                backup_table
            );
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = backup_table
                  AND policyname = 'service_role_only'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY service_role_only ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                    backup_table
                );
            END IF;
        END IF;
    END LOOP;
END
$$;
