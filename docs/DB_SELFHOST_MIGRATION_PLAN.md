# Zolos — Full Migration off Supabase → Self-hosted on VPS

**Goal:** remove Supabase entirely (DB + Auth + Realtime) and run everything on the
Windows VPS (`103.58.150.195`). Eliminates metered **egress/quota billing** (current
pain: under attack, egress over quota) and gives full control.

> ⚠️ Self-hosting stops egress **billing** but does **not** stop attacks — the new
> API must be hardened (rate limiting, validation, Postgres bound to localhost only).

---

## Current architecture

- **Frontend** (Vercel, `zolos.online`): `@supabase/supabase-js` for **Auth**
  (login/signup/reset), **direct DB** reads/writes (PostgREST + RLS), and a
  **Realtime presence channel** (online count on the auth screen — a big egress source).
- **VPS realtime server** (socket.io :3001, Windows service `ZolosServer`): uses the
  Supabase **service_role** key for character saves + some queries. Already uses `pg`.
- **Supabase**: Postgres (~14 MB, ~15 tables), Auth (**381 users, all bcrypt + email**), RLS.

## Target architecture

- **VPS Postgres** (local, localhost-only) — the database.
- **VPS API server** (extend the existing Node/socket server): Auth API + Data API +
  the existing socket.io realtime. Server-side authorization replaces RLS.
- **Frontend**: replace all `supabase-js` usage with `fetch` calls to the VPS API +
  JWT in localStorage. Realtime already on socket.io.
- **Caddy**: already fronts `rt.zolos.online`; add `api.zolos.online` (or reuse a path)
  for the HTTP API, TLS auto.

---

## Phases (game stays live throughout; single short cutover at the end)

### Phase 0 — Stand up VPS Postgres + copy data  *(no downtime, fully reversible)*
1. Install PostgreSQL on the Windows VPS (bound to `127.0.0.1` only).
2. `pg_dump` the Supabase DB (schema + data) → restore into local Postgres (~minutes, 14 MB).
3. Export `auth.users` (id, email, `encrypted_password` bcrypt, created_at) → local `users` table.
4. Verify row counts match; set up nightly `pg_dump` backups.

### Phase 1 — Build the VPS API (backend), tested against local Postgres
*(live client untouched — no user impact yet)*
- Enumerate every `supabase.from()/rpc()/auth` call (client ≈ 22 + server) → one endpoint each.
- **Auth**: `POST /auth/signup`, `/auth/login` (verify existing **bcrypt**, issue JWT),
  `GET /auth/me`, `POST /auth/guest` (persistent anonymous → real DB row + JWT).
- **Data**: characters (load/create/save), inventory, marketplace (list/buy/sell),
  leaderboard, profiles, mail, cards, daily quests, friends. Authorization enforced
  server-side (JWT → "own character only", etc.).
- Rate limiting + input validation on every endpoint from day one.

### Phase 2 — Rewrite the frontend data layer
- New thin API client replaces `SupabaseClient.js` (calls VPS API with JWT).
- Replace all `supabase.*` in `GameSync.js`, `AuthUI.js`, `GameUI.js`, …
- JWT in localStorage; attached to requests + the socket handshake.
- Drop the `@supabase/supabase-js` dependency and the auth-screen Realtime channel.

### Phase 3 — Cutover  *(short maintenance window)*
- Brief write freeze on Supabase → final `pg_dump` → re-import to local Postgres (tiny).
- Deploy the new frontend (Vercel) pointing at the VPS API.
- Monitor; keep Supabase **read-only as a fallback** for a few days, then decommission.

---

## Key decisions (gate the plan)

1. **Password reset / email** — login itself needs no email (bcrypt reuse). But
   "forgot password" needs an email sender. Options: (a) free SMTP (Resend/Brevo),
   (b) admin-issued reset links, (c) skip for now. **Which?**
2. **API exposure** — `api.zolos.online` (new DNS A + TLS via Caddy, recommended) vs
   `rt.zolos.online/api`.
3. **Postgres on this same VPS** — OK? (Recommended: yes, localhost-only + nightly backups.)
4. **Security** — since you're under attack: rate limiting, request validation, and
   Postgres never exposed to the internet — built in from the start.

## Effort & risk
- **Effort**: substantial — the API build + client rewrite is the bulk (several days,
  phased). Data migration itself is trivial (14 MB).
- **Risk**: live game + 381 real users. Mitigation: build/test in parallel, keep
  Supabase as a fallback, cut over in a maintenance window, full backups first.

## Safe to start now
**Phase 0** (install Postgres + dump/restore data) has **zero impact** on the live game
and is reversible.
