import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../server/api/auth.js');
const data = read('../server/api/data.js');
const server = read('../server/server.js');
const gameUI = read('../src/ui/GameUI.js');
const profileModal = read('../src/ui/PlayerProfileModal.js');
const authUI = read('../src/ui/AuthUI.js');
const indexHtml = read('../index.html');
const main = read('../src/main.js');
const offlineAuth = read('../src/network/SupabaseClient.js');

test('production self-host auth refuses a missing or weak JWT secret', () => {
  assert.match(auth, /configuredJwtSecret\.length < 32/);
  assert.match(auth, /process\.env\.USE_LOCAL_DB === 'true'/);
  assert.match(auth, /JWT_SECRET must be configured/);
});

test('public profile reads use an allowlist and cannot request is_admin', () => {
  assert.match(data, /publicColumns: \['id', 'username', 'gender', 'created_at'\]/);
  assert.match(data, /public column not available/);
  assert.match(data, /const publicColumns = \['public', 'authenticated'\]\.includes\(policy\.read\)/);
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

const serverSource = read('../server/server.js');

test('save_state never persists a client inventory snapshot through service role', () => {
  assert.match(serverSource, /Ignored client inventory backup/);
  assert.match(serverSource, /inventory is server-authoritative/);
  assert.doesNotMatch(serverSource, /const sanitized = sanitizeInventoryBackup\(inventory\)/);
});

test('character data requires authentication and uses a field allowlist', () => {
  assert.match(data, /characters:[\s\S]*?read: 'authenticated'/);
  assert.match(data, /characters:[\s\S]*?publicColumns:/);
  assert.match(data, /policy\.read === 'authenticated'/);
});

const vendingMigration = read('../migrations/20260818_vending_authority.sql');

test('vending stalls use authoritative RPCs instead of generic row writes', () => {
  assert.match(data, /vending_stalls:[\s\S]*?write: false/);
  assert.match(gameSync, /supabase\.rpc\('open_vending_stall'/);
  assert.match(gameSync, /supabase\.rpc\('close_vending_stall'/);
  assert.match(vendingMigration, /pg_advisory_xact_lock/);
  assert.match(vendingMigration, /user_id = auth\.uid\(\)/);
  assert.match(vendingMigration, /REVOKE INSERT, UPDATE, DELETE ON public\.vending_stalls/);
});

const marketBuyMigration = read('../migrations/20260818_market_buy_lock.sql');

test('market purchases lock the buyer balance before settlement', () => {
  const rpcFunctions = read('../server/api/rpc_functions.sql');
  assert.match(rpcFunctions, /v_buyer characters%ROWTYPE/);
  assert.match(rpcFunctions, /FROM characters[\s\S]*ORDER BY created_at LIMIT 1 FOR UPDATE/);
  assert.match(marketBuyMigration, /CREATE OR REPLACE FUNCTION public\.buy_market_item\(p_listing_id uuid\)/);
  assert.match(marketBuyMigration, /FROM public\.characters[\s\S]*LIMIT 1 FOR UPDATE/);
});

test('starter Sword inventory exception cannot carry forged combat stats', () => {
  assert.match(data, /starterStatsSafe/);
  assert.match(data, /Object\.keys\(starterStats\)\.every\(key => key === 'equipped'\)/);
});

test('public leaderboard redacts auth user ids and profile lookup uses character ids', () => {
  assert.match(gameSync, /const cols = 'id, name, level, total_kills, gold, zol, play_time, mmr, pvp_wins, pvp_losses';/);
  assert.doesNotMatch(gameSync, /const cols = '[^']*user_id/);
  assert.match(gameSync, /export async function fetchPublicCharacterById\(characterId\)/);
  assert.match(gameSync, /\.eq\('id', characterId\)/);
  assert.match(gameUI, /data-character-id="\$\{characterId\}"/);
  assert.doesNotMatch(gameUI, /data-user-id="\$\{uid\}"/);
  assert.match(profileModal, /Boolean\(player\.characterId\) && window\.gameUI\?\.characterId === player\.characterId/);
});

test('connected sessions fail closed for client-only reward paths', () => {
  assert.match(gameUI, /isSocketConnected\(\) && window\.__serverRewards !== true/);
  assert.match(gameUI, /_claimQuestReward\(idx\)[\s\S]*_onlineSessionWithoutAuthority\(\)/);
  assert.match(gameUI, /_spinRoulette\(\)[\s\S]*_onlineSessionWithoutAuthority\(\)/);
  assert.match(main, /event\.item\?\.type === 'fish' && gameUI\?\._onlineSessionWithoutAuthority\?\.\(\)/);
  assert.match(main, /case 'fishCaught':[\s\S]*requestFishingReward/);
  assert.match(main, /addItemLocal\(item, receipt\.quantity\)/);
  assert.match(gameSync, /export function requestFishingReward\(requestId\)/);
  assert.match(gameSync, /fish_claim_result/);
});

test('guest splash resumes the active session instead of creating a new character from a casual tap', () => {
  assert.match(indexHtml, /<span>เล่นเป็น Guest<\/span>/);
  assert.match(authUI, /_splashGuestBtn\.addEventListener\('click', \(\) => this\._handleGuest\(\)\)/);
  assert.match(authUI, /_splashGuestLabelEl\.textContent = 'เล่น Guest เดิม'/);
  assert.match(authUI, /กลับเข้า Guest เดิมที่บันทึกไว้/);
  assert.match(authUI, /signInAnonymously\(\{ forceNew \}\)/);
});
