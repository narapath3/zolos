# Zolos Security Hardening Design

## Goal

Close the confirmed security and reliability gaps without redesigning the whole
game or changing normal player-facing behavior.

## Scope

The implementation covers:

- server-side filtering of client save snapshots;
- server-owned chat identities and map routing;
- explicit failure when the map server lacks a Supabase service-role key;
- a narrow Socket.IO CORS policy;
- login-screen subscription, timer, Canvas, and asset lifecycle fixes;
- explicit Supabase Data API grants and RLS verification SQL;
- automated regression tests for the extracted security rules.

Moving combat, rewards, inventory mutations, and the complete game simulation to
a fully server-authoritative architecture is outside this change. The new save
filter is a containment boundary: economy and progression fields cannot be
written through `save_state`, while cosmetic and device-setting fields continue
to save.

## Server Security Design

### Save snapshots

Create a small, dependency-free policy module used by the Socket.IO server and
the test suite. It will expose an allowlist-based sanitizer for character
updates. The snapshot path may persist only:

- `name`
- `hp`, `max_hp`, `sp`, `max_sp`
- `play_time`, `last_map`
- `weapon`, `hat`, `glasses`, `shield`, `armor`
- `body_color`, `hair_color`, `pants_color`, `gender`
- `sound_enabled`, `graphics_quality`, `fps_enabled`

It must reject progression and economy fields including `level`, `exp`, `atk`,
`def`, `gold`, `zol`, and `total_kills`. Existing ownership verification remains
mandatory.

### Identity and room routing

Player chat always uses the server-trusted player identity. A client-provided
`userId: "system"` has no special meaning. System and market announcements must
use their dedicated server-side events.

Position, monster-hit, skill-cast, and normal chat broadcasts always route to
the player's current server-side `mapId`. A payload cannot select another room.
Presence updates may request a map transition, but the server normalizes the map
identifier before changing room membership.

Usernames and displayed levels are normalized and bounded before being stored in
presence state. They remain display data, not authorization inputs.

### Supabase credentials

The map server creates its privileged database client only from
`SUPABASE_SERVICE_ROLE_KEY`. An anon key is never treated as a server credential.
If the URL or service-role key is absent, database persistence is disabled and a
clear startup warning is emitted. Socket features that do not require database
access continue to operate.

### CORS

Allowed origins come from `CORS_ORIGINS` or `CORS_ORIGIN`, plus the known Zolos
production origins and localhost development origins. The blanket
`*.vercel.app` allowance is removed. Optional preview origins must be supplied
explicitly in environment configuration. `CORS_ALLOW_ALL=true` remains an
explicit development escape hatch and retains its warning.

## Login Reliability Design

- `AuthUI.show()` restores the online-count subscription after `hide()` removed
  it.
- Ping monitoring and online subscriptions are idempotent so repeated `show()`
  calls do not create duplicates.
- The 3D card listener setup stores cleanup callbacks for eventual destruction.
- `LoginCanvasBg` exposes readiness through safe `start()` behavior: missing
  canvas or 2D context produces no animation loop or exception.
- Canvas resize resets its transform deterministically.
- The nonexistent `login_bg_epic.png` reference is removed; existing bundled
  login backgrounds remain.

## Supabase Migration Design

Add one idempotent migration that:

- enables RLS on the client-facing application tables known to the repository;
- grants only the table operations required by `anon` and `authenticated`;
- preserves column-level restrictions that prevent writes to
  `profiles.is_admin`;
- revokes default public execution from admin `SECURITY DEFINER` functions and
  grants execution only to `authenticated`;
- records verification queries as comments for operators.

The migration must not contain project-specific secrets, user identifiers, or
destructive data cleanup.

## Testing

Use Node's built-in test runner to avoid adding a dependency. Tests import the
dependency-free server policy module and verify:

- progression/economy fields are removed from save updates;
- allowed cosmetic and setting fields survive;
- client system-message claims are ignored;
- broadcasts resolve to the trusted server map;
- origin validation rejects unrelated `vercel.app` sites and accepts configured
  origins;
- username, level, and map normalization handle malformed input.

Login lifecycle behavior will be covered by focused tests of extracted
idempotency/readiness helpers where practical, then verified through the
production build.

## Verification

Completion requires all of:

1. Every regression test fails against the pre-fix behavior and passes after the
   implementation.
2. `npm test` exits successfully with zero failures.
3. `npm run build` exits successfully.
4. `git diff --check` reports no whitespace errors.
5. A final diff review confirms no secret files, unrelated user changes, or
   destructive SQL were introduced.

