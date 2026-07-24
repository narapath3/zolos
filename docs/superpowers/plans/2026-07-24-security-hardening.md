# Zolos Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed server, Supabase, Socket.IO, and login-screen security and lifecycle gaps while preserving normal gameplay.

**Architecture:** Extract pure security-policy functions from the Socket.IO server so they can be regression-tested without booting the server. Keep database ownership checks in `server/server.js`, but strictly filter client snapshots and require a privileged Supabase key. Repair login lifecycle behavior in place, add a focused Canvas test, and ship an idempotent Supabase hardening migration.

**Tech Stack:** Node.js ESM, Node built-in test runner, Socket.IO, Supabase JS, Vite, HTML5 Canvas, PostgreSQL.

## Global Constraints

- Do not include or modify ignored `.env` or token files.
- Preserve the user's staged login-screen changes.
- Do not move the entire game simulation server-side in this change.
- Reject progression/economy fields from `save_state`.
- Normal socket broadcasts use only the server-trusted map and identity.
- Database persistence requires `SUPABASE_SERVICE_ROLE_KEY`.
- SQL must be idempotent and contain no destructive user cleanup.

---

### Task 1: Add Test Harness and Pure Server Security Policy

**Files:**
- Create: `server/securityPolicy.js`
- Create: `test/securityPolicy.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `sanitizeSaveUpdates(updates)`, `resolveTrustedMap(player)`, `normalizePresence(input)`, `isAllowedOrigin(origin, configuredOrigins)`.
- Consumes: plain JavaScript values only; no Socket.IO or Supabase dependencies.

- [ ] **Step 1: Add the test command**

Add to `package.json`:

```json
"test": "node --test"
```

- [ ] **Step 2: Write failing policy tests**

Create `test/securityPolicy.test.js` with tests asserting:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeSaveUpdates,
  resolveTrustedMap,
  normalizePresence,
  isAllowedOrigin,
} from '../server/securityPolicy.js';

test('save snapshots reject progression and economy fields', () => {
  assert.deepEqual(
    sanitizeSaveUpdates({ level: 300, exp: 99, gold: 500000000, zol: 99, atk: 999, def: 999, total_kills: 10 }),
    {},
  );
});

test('save snapshots preserve safe appearance and device fields', () => {
  assert.deepEqual(
    sanitizeSaveUpdates({ weapon: 'Sword', body_color: 12, sound_enabled: false, graphics_quality: 'low' }),
    { weapon: 'Sword', body_color: 12, sound_enabled: false, graphics_quality: 'low' },
  );
});

test('trusted map ignores client-selected room', () => {
  assert.equal(resolveTrustedMap({ mapId: 'prontera_field' }), 'prontera_field');
});

test('presence values are normalized and bounded', () => {
  assert.deepEqual(normalizePresence({ username: '  Hero  ', level: 99999, mapId: '../admin' }), {
    username: 'Hero',
    level: 300,
    mapId: 'prontera_field',
  });
});

test('origin policy rejects unrelated Vercel sites', () => {
  assert.equal(isAllowedOrigin('https://attacker.vercel.app', []), false);
  assert.equal(isAllowedOrigin('https://zolos.online', []), true);
  assert.equal(isAllowedOrigin('https://preview.example', ['https://preview.example']), true);
});
```

- [ ] **Step 3: Verify RED**

Run: `npm.cmd test`

Expected: FAIL because `server/securityPolicy.js` does not exist.

- [ ] **Step 4: Implement the minimal pure policy module**

Create `server/securityPolicy.js` with:

```js
const SAFE_SAVE_FIELDS = new Set([
  'name', 'hp', 'max_hp', 'sp', 'max_sp', 'play_time', 'last_map',
  'weapon', 'hat', 'glasses', 'shield', 'armor',
  'body_color', 'hair_color', 'pants_color', 'gender',
  'sound_enabled', 'graphics_quality', 'fps_enabled',
]);

const DEFAULT_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://zolos.online',
  'https://www.zolos.online',
  'https://zolos.vercel.app',
  'https://zolos-multiplayer.vercel.app',
]);

export function sanitizeSaveUpdates(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return {};
  return Object.fromEntries(Object.entries(updates).filter(([key]) => SAFE_SAVE_FIELDS.has(key)));
}

export function resolveTrustedMap(player) {
  return normalizeMapId(player?.mapId);
}

export function normalizePresence(input = {}) {
  const username = String(input.username || 'Adventurer').trim().slice(0, 32) || 'Adventurer';
  const level = Math.max(1, Math.min(300, Number.parseInt(input.level, 10) || 1));
  return { username, level, mapId: normalizeMapId(input.mapId) };
}

export function normalizeMapId(value) {
  const mapId = String(value || '');
  return /^[a-z0-9_]{1,48}$/.test(mapId) ? mapId : 'prontera_field';
}

export function isAllowedOrigin(origin, configuredOrigins = []) {
  if (!origin) return true;
  return DEFAULT_ORIGINS.has(origin) || configuredOrigins.includes(origin);
}
```

- [ ] **Step 5: Verify GREEN**

Run: `npm.cmd test`

Expected: all policy tests PASS.

### Task 2: Apply the Security Policy to Socket.IO and Supabase

**Files:**
- Modify: `server/server.js`
- Modify: `test/securityPolicy.test.js`

**Interfaces:**
- Consumes: policy functions from Task 1.
- Produces: server broadcasts and saves constrained by trusted identity, map, origin, and save fields.

- [ ] **Step 1: Add failing source-level regression tests**

Add tests that read `server/server.js` and assert:

```js
test('server does not treat client userId as a system-message capability', async () => {
  const source = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /payload\.userId\s*===\s*['"]system['"]/);
});

test('server does not fall back from service role to anon key', async () => {
  const source = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|[^;]*ANON_KEY/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test`

Expected: the two source regression tests FAIL against current `server/server.js`.

- [ ] **Step 3: Apply minimal server changes**

In `server/server.js`:

- import the policy helpers;
- parse explicit configured origins once;
- delegate the Socket.IO origin callback to `isAllowedOrigin`;
- create the Supabase client only when both URL and `SUPABASE_SERVICE_ROLE_KEY` exist;
- normalize join and presence display fields;
- route `pos`, `monster_hit`, `skill_cast`, and `chat` with `resolveTrustedMap(player)`;
- remove the client-controlled system-message branch from normal chat;
- call `sanitizeSaveUpdates(updates)` before database update;
- skip the update when the sanitized result is empty.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 5: Build**

Run: `npm.cmd run build`

Expected: exit 0.

### Task 3: Repair Login and Canvas Lifecycle

**Files:**
- Modify: `src/engine/LoginCanvasBg.js`
- Modify: `src/ui/AuthUI.js`
- Modify: `src/styles/login-new.css`
- Create: `test/loginCanvasBg.test.js`

**Interfaces:**
- Produces: safe `LoginCanvasBg.start()` and idempotent AuthUI subscriptions/timers.

- [ ] **Step 1: Write the failing Canvas test**

Create `test/loginCanvasBg.test.js` that stubs `document.getElementById()` to return
`null`, constructs `LoginCanvasBg`, calls `start()`, and asserts no animation
frame was requested.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test`

Expected: FAIL because the current `start()` schedules a frame for an incomplete instance.

- [ ] **Step 3: Implement safe Canvas readiness**

In `LoginCanvasBg`:

- initialize `isReady = false`;
- return early when canvas or 2D context is absent;
- set `isReady = true` only after context creation;
- make `start()` return without scheduling when not ready;
- reset the transform before applying DPR scaling in `_onResize()`.

- [ ] **Step 4: Make AuthUI lifecycle idempotent**

In `AuthUI`:

- `_subscribeOnlineCount()` returns early when already subscribed;
- `_startPingMonitor()` clears or returns when an interval already exists;
- `show()` calls `_subscribeOnlineCount()`;
- keep `hide()` cleanup intact;
- remove the unused `distance` calculation in card tilt.

- [ ] **Step 5: Remove the missing background**

In `login-new.css`, remove `/src/assets/login_bg_epic.png` from the background list.

- [ ] **Step 6: Verify GREEN and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: tests PASS; build exits 0 without the unresolved `login_bg_epic.png` warning.

### Task 4: Add an Idempotent Supabase Hardening Migration

**Files:**
- Create: `migrations/20260724_security_hardening.sql`

**Interfaces:**
- Consumes: existing public tables and admin function names.
- Produces: explicit Data API grants, RLS enablement, and restricted admin RPC execution.

- [ ] **Step 1: Write migration validation tests**

Add a source test that asserts the migration:

- contains no UUID literal or `DELETE FROM`;
- enables RLS for `profiles`, `characters`, `inventory`, `marketplace`, and `vending_stalls`;
- revokes execute from `PUBLIC` on every admin RPC signature;
- grants execute to `authenticated`;
- does not grant `is_admin` write access.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd test`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Create the migration**

Write idempotent SQL that:

- enables RLS on each known client-facing table;
- grants required table/sequence usage to `anon` and `authenticated`;
- reapplies the safe column-level `profiles` insert/update grants;
- revokes `PUBLIC` execution from the three admin functions;
- grants those functions to `authenticated`;
- includes verification queries as comments.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test`

Expected: all migration validation tests PASS.

### Task 5: Full Verification and Review

**Files:**
- Review all modified files; create no new production behavior.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: evidence that the implementation meets the approved design.

- [ ] **Step 1: Run the complete tests**

Run: `npm.cmd test`

Expected: zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm.cmd run build`

Expected: exit 0 and no unresolved login background warning.

- [ ] **Step 3: Check whitespace and repository state**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; ignored secret files remain untracked by Git.

- [ ] **Step 4: Review the final diff**

Confirm:

- progression/economy fields cannot pass through `save_state`;
- normal chat cannot claim system identity;
- room routing uses server player state;
- service-role fallback is removed;
- wildcard `vercel.app` access is removed;
- Login subscriptions and timers are idempotent;
- Canvas absence is safe;
- SQL has no destructive cleanup or secret identifiers;
- unrelated user changes were preserved.

