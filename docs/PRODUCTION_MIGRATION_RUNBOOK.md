# ZOLOS Production Migration Runbook

**Purpose:** Apply the four server-authority migrations and verify the Windows VPS/Supabase deployment without exposing secrets or mutating production unexpectedly.

> This runbook is deliberately execution-gated. Do not run it against production until an operator has approved a maintenance window, confirmed a recent database backup, and verified the target project and database connection.

## 1. Pre-flight safety checks

Use a staging database first whenever possible. Confirm that the working tree is the intended release and that the VPS will deploy the same Git commit. The current security release includes the commits `b6d8645` and `64f4a98` after `6aaa3e2`.

On the Windows VPS, inspect environment variables without printing the JWT value:

```powershell
if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET)) { throw "JWT_SECRET is missing" }
if ($env:JWT_SECRET.Length -lt 32) { throw "JWT_SECRET must be at least 32 characters" }
if ($env:USE_LOCAL_DB -ne "true") { throw "USE_LOCAL_DB must be true for the local Postgres deployment" }
if ($env:WORLD_MONSTERS -eq "false") { throw "WORLD_MONSTERS=false is not permitted for production" }
if ($env:CORS_ALLOW_ALL -eq "true") { throw "CORS_ALLOW_ALL=true is not permitted for production" }
if ([string]::IsNullOrWhiteSpace($env:CORS_ORIGINS)) { throw "CORS_ORIGINS must be an explicit allowlist" }
Write-Host "Environment shape is acceptable; JWT_SECRET was not printed."
```

Confirm that Caddy exposes only the intended HTTPS reverse-proxy routes. PostgreSQL, the Node port, admin endpoints, and database management interfaces must not be directly reachable from the public internet.

## 2. Migration order

Run each file separately with `ON_ERROR_STOP` semantics, recording the result after every file. The recommended order is:

| Order | File | Purpose | Main dependency |
|---:|---|---|---|
| 1 | `migrations/20260818_market_escrow.sql` | Atomically escrow inventory when creating or cancelling marketplace listings | Existing `characters`, `inventory`, and `marketplace` tables |
| 2 | `migrations/20260818_card_mail_idempotency.sql` | Add `card_mailbox.request_id`, a replay-protection index, and the idempotent `send_card_mail` RPC | Existing `card_mailbox`, `inventory`, and `auth.uid()` |
| 3 | `migrations/20260818_market_buy_lock.sql` | Lock the buyer character row before marketplace settlement | Existing `buy_market_item` RPC and marketplace tables |
| 4 | `migrations/20260818_vending_authority.sql` | Move stall open/close mutations into SECURITY DEFINER RPCs and revoke generic table writes | Existing `vending_stalls`, `characters`, and `auth.uid()` |

For a direct PostgreSQL connection from PowerShell, run one file at a time. Do not place the connection string or any token in chat or a committed file:

```powershell
$env:PGPASSWORD = $env:POSTGRES_PASSWORD
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f migrations/20260818_market_escrow.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f migrations/20260818_card_mail_idempotency.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f migrations/20260818_market_buy_lock.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f migrations/20260818_vending_authority.sql
Remove-Item Env:PGPASSWORD
```

If the deployment uses the Supabase SQL Editor, paste and run the four files separately in the same order. Verify the selected Supabase project before executing. Do not run a migration copied from a different branch or project.

## 3. Read-only post-migration verification

Run these checks after the SQL editor reports success. They are read-only and should return the expected function signatures and column/privilege state:

```sql
select to_regprocedure('public.create_market_listing(text,text,integer,integer)');
select to_regprocedure('public.cancel_market_listing(uuid)');
select to_regprocedure('public.send_card_mail(text,text,text,integer,integer,jsonb,text)');
select to_regprocedure('public.buy_market_item(uuid)');
select to_regprocedure('public.open_vending_stall(text,text,jsonb,integer)');
select to_regprocedure('public.close_vending_stall()');

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'card_mailbox'
  and column_name = 'request_id'
limit 1;

select has_table_privilege('authenticated', 'public.vending_stalls', 'INSERT') as authenticated_can_insert_stalls;
select has_table_privilege('authenticated', 'public.vending_stalls', 'UPDATE') as authenticated_can_update_stalls;
select has_table_privilege('authenticated', 'public.vending_stalls', 'DELETE') as authenticated_can_delete_stalls;
```

The `to_regprocedure` calls must return non-null values, `request_id` must be present, and all three vending table privilege values must be `false`. Confirm the actual SQL output in the database console; do not rely only on a successful HTTP response from the game client.

## 4. Application deployment

After migration verification, deploy the exact Git commit to the Windows VPS. Keep the existing `.env` or service configuration outside Git and never replace secrets with placeholders. Install from the lockfile, run the complete verification suite, and restart the Node service only after the checks pass:

```powershell
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm test
npm run build
npm audit --omit=dev
```

The server startup log must show the intended local database mode and server-authoritative monster mode. In production, `WORLD_MONSTERS` should be omitted or set to `true`; `WORLD_MONSTERS=false` is only a deliberately controlled rollback switch and must not be used for normal production operation.

## 5. Staging acceptance tests

Use two separate test accounts and verify database balances after each action. Test duplicate clicks and retry behavior, not only the happy-path UI. The minimum release gate covers marketplace listing/cancel/buy, vending open/close, card mail send/claim/return, reconnect, duplicate request IDs, ownership rejection, combat reward receipts, and the client-only reward fail-closed behavior for fishing and quests.

For every economic operation, record the pre-state and post-state for the buyer, seller, inventory row, mailbox row, or stall row. A passing UI toast is not evidence of a committed transaction. Confirm that a retry produces one economic result rather than two.

## 6. Rollback and incident handling

Do not roll back by enabling insecure client-authoritative monster rewards. If a migration fails, stop at the failed file, preserve the database error, and restore from the approved backup or apply a reviewed corrective migration. If the application build fails, keep the database migrations intact and deploy the last verified application commit only after confirming that its RPC signatures are compatible.

If production shows inconsistent balances, stop marketplace and trading activity through the normal maintenance control, preserve logs and database snapshots, and investigate the transaction receipt and row locks before reopening traffic. Never request or paste passwords, private keys, JWTs, or database tokens into an issue, chat, or repository.

## 7. Final sign-off

The operator may sign off only when the environment checks pass, all four migrations are verified, the clean-install test suite/build/audit pass, Caddy routes are restricted, two-account staging tests pass, and the production smoke test confirms that the client receives authoritative monster mode. Until then, the release should remain staged and the unresolved `about:blank` browser anomaly should be reproduced with Chrome Console and Network logs on a normal workstation.
