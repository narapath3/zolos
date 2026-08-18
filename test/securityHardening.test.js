import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../server/api/auth.js');
const data = read('../server/api/data.js');
const server = read('../server/server.js');
const gameUI = read('../src/ui/GameUI.js');
const offlineAuth = read('../src/network/SupabaseClient.js');

test('production self-host auth refuses a missing or weak JWT secret', () => {
  assert.match(auth, /configuredJwtSecret\.length < 32/);
  assert.match(auth, /process\.env\.USE_LOCAL_DB === 'true'/);
  assert.match(auth, /JWT_SECRET must be configured/);
});

test('public profile reads use an allowlist and cannot request is_admin', () => {
  assert.match(data, /publicColumns: \['id', 'username', 'gender', 'created_at'\]/);
  assert.match(data, /public column not available/);
  assert.match(data, /const publicColumns = policy\.read === 'public'/);
});

test('local Postgres defaults to server-authoritative monster rewards', () => {
  assert.match(server, /const WORLD_MONSTERS = USE_LOCAL_DB && process\.env\.WORLD_MONSTERS !== 'false'/);
  assert.match(server, /browser can award itself EXP, gold, and loot/);
});

test('job changes clamp current HP and SP to the new class maxima', () => {
  assert.match(gameUI, /s\.hp = Math\.min\(Number\(s\.max_hp\) \|\| 100/);
  assert.match(gameUI, /s\.sp = Math\.min\(Number\(s\.max_sp\) \|\| 50/);
});

test('offline fallback never creates new plaintext password records', () => {
  assert.match(offlineAuth, /password_hash: await hashOfflinePassword\(password\)/);
  assert.match(offlineAuth, /delete user\.password/);
});
