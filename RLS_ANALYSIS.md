# RLS Policy Analysis for characters table

## Policies Found

1. **"Allow public read access to characters"** — cmd: SELECT, qual: true, roles: {public}
   - This should allow ANYONE to SELECT from characters

2. **"Allow users to manage their own characters"** — cmd: ALL, qual: (auth.uid() = user_id)
   - INSERT/UPDATE/DELETE only for own rows

3. **"admin_all_characters"** — cmd: ALL, for authenticated users where profiles.is_admin = true

4. **"admin_manage_all_characters"** — cmd: ALL, for specific email

## Analysis
The first policy says SELECT is allowed for public (unauthenticated too). So `fetchPublicCharacter` should work even without auth.

## The REAL Problem
The `fetchPublicCharacter` function requires `supabase` to be initialized AND `!isOfflineMode`. If the Supabase client isn't connected (offline mode), it returns null.

But the screenshot shows the 3D model renders (liveAppearance works), which means the socket connection is alive. The issue is likely that `fetchPublicCharacter` is using the anon key without auth context, and the RLS policy "Allow public read access" should work.

Wait — let me check if the issue is that the query uses `.maybeSingle()` which returns null when there are NO rows matching. If the target player's character row was never created in the DB (guest account), it would return null.

That's it! If BAGIDEA is a guest user (userId starts with 'guest_'), fetchPublicCharacter returns null at line 89. And the profile shows all ??? because there's no DB row for guest users.

The fix should be: when DB data is null, still try to populate what we can from liveAppearance, and don't show ??? for stats we can infer.
