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

const combat = read('../src/engine/CombatSystem.js');

test('connected sessions block local monster progression without server authority', () => {
  assert.match(combat, /isSocketConnected\(\) && window\.__serverMonsters !== true/);
  assert.match(combat, /if \(this\._onlineSessionWithoutAuthority\(\)\) return;/);
  assert.match(combat, /const allowLocalReward = reward && !this\._onlineSessionWithoutAuthority\(\)/);
});

test('generic character writes reject client-owned progression and freshness fields', () => {
  assert.match(data, /SERVER_AUTHORITATIVE_CHARACTER_FIELDS/);
  assert.match(data, /server-authoritative character fields/);
  assert.match(data, /assertClientWriteAllowed\(table, action, spec\.values \|\| \{\}, spec\.filters \|\| \[\]\)/);
});

const rpc = read('../server/api/rpc.js');
const gameSync = read('../src/network/GameSync.js');
const marketMigration = read('../migrations/20260818_market_escrow.sql');

test('market escrow RPC locks ownership and inventory before creating a listing', () => {
  assert.match(rpc, /async function createMarketListing/);
  assert.match(rpc, /FROM inventory WHERE character_id = \$1 AND item_name = \$2 FOR UPDATE/);
  assert.match(rpc, /DELETE FROM inventory WHERE id = \$1/);
  assert.match(rpc, /INSERT INTO marketplace/);
  assert.match(rpc, /async function cancelMarketListing/);
  assert.match(rpc, /seller_id = \$2 FOR UPDATE/);
  assert.match(marketMigration, /CREATE OR REPLACE FUNCTION public\.create_market_listing/);
  assert.match(marketMigration, /CREATE OR REPLACE FUNCTION public\.cancel_market_listing/);
});

test('remote marketplace client paths use atomic RPCs and avoid double inventory mutations', () => {
  assert.match(gameSync, /supabase\.rpc\('create_market_listing'/);
  assert.match(gameSync, /supabase\.rpc\('cancel_market_listing'/);
  assert.match(gameSync, /serverAuthoritative: true/);
  assert.match(gameUI, /listing\._serverAuthoritative !== true/);
  assert.match(gameUI, /const serverAuthoritative = boughtResult\.serverAuthoritative === true/);
  assert.match(gameUI, /if \(!serverAuthoritative && this\.characterId\)/);
});

const mailMigration = read('../migrations/20260818_card_mail_idempotency.sql');

test('card mail retries are idempotent and cannot escrow the same request twice', () => {
  assert.match(gameSync, /p_request_id: idempotencyKey/);
  assert.match(rpc, /send_card_mail: \['p_recipient_char_id',[\s\S]*'p_request_id'\]/);
  assert.match(mailMigration, /CREATE UNIQUE INDEX IF NOT EXISTS card_mailbox_sender_request_uidx/);
  assert.match(mailMigration, /pg_advisory_xact_lock/);
  assert.match(mailMigration, /idempotent_replay/);
});

test('generic character inserts cannot mint non-default progression', () => {
  assert.match(data, /CHARACTER_CREATE_DEFAULTS/);
  assert.match(data, /invalid character creation fields/);
  assert.match(data, /action === 'insert'/);
});

test('self-host card mail locks the inventory row before escrow', () => {
  const rpcFunctions = read('../server/api/rpc_functions.sql');
  assert.match(rpcFunctions, /FROM inventory[\s\S]*ORDER BY quantity DESC LIMIT 1 FOR UPDATE/);
  assert.match(rpcFunctions, /request_id/);
});

test('character card collection is read-only through the generic data API', () => {
  assert.match(data, /character_cards:[\s\S]*?write: false/);
  assert.match(data, /Collection counts, stars, and pity are server-owned/);
});

test('generic inventory writes cannot grant items or forge quantity/stats', () => {
  assert.match(data, /inventory grants must come from server-authoritative rewards/);
  assert.match(data, /inventory quantity is server-authoritative/);
  assert.match(data, /inventory item stats are server-authoritative/);
  assert.match(data, /SYSTEM_INVENTORY_ITEMS/);
  assert.match(data, /isStarterSword/);
});

test('system inventory snapshots carry an explicit item identity on stats updates', () => {
  assert.match(gameSync, /update\(\{ stats: questData \}\)[\s\S]*eq\('item_name', 'daily_quests'\)/);
  assert.match(gameSync, /stats: \{ list: friendsList \}[\s\S]*eq\('item_name', 'friends_list'\)/);
});
