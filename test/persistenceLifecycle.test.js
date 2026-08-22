import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const supabaseClient = read('../src/network/SupabaseClient.js');
const gameUI = read('../src/ui/GameUI.js');
const main = read('../src/main.js');
const server = read('../server/server.js');

function block(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  return source.slice(start, end < 0 ? source.length : end);
}

test('online Guest auth fails closed instead of silently entering local-only mode', () => {
  const signIn = block(supabaseClient, 'export async function signInAnonymously', 'export async function getSession');
  const catchStart = signIn.lastIndexOf('  } catch (e) {');
  const onlineCatch = signIn.slice(catchStart);
  assert.match(signIn, /if \(isOfflineMode \|\| !supabase\) return createLocalGuestSession/);
  assert.match(onlineCatch, /Online anonymous sign-in failed; refusing local-only Guest mode/);
  assert.match(onlineCatch, /throw e;/);
  assert.doesNotMatch(onlineCatch, /return createLocalGuestSession/);
});

test('the client builds one complete snapshot for autosave, background and logout', () => {
  const snapshot = block(main, 'const buildPersistenceSnapshot = () =>', '// Start auto-save.');
  for (const field of ['characterId', 'userId', 'inventory', 'updates', 'dailyQuests', 'friendsList', 'fishingAlmanac', 'adventureJournal', 'loginStreak']) {
    assert.match(snapshot, new RegExp(`${field}:`));
  }
  assert.match(main, /gameUI\?\.flushPersistence\?\.\(\)/);
  assert.match(main, /sendSaveState\(buildPersistenceSnapshot\(\)\)/);
  assert.match(main, /const flushOk = await gameUI\.flushPersistence\(\)/);
});

test('GameUI final flush includes every delayed system adapter and cancels journal timer', () => {
  const flush = block(gameUI, 'async flushPersistence()', '/**\n   * Flush all inventory');
  for (const method of ['_saveDailyQuestsToDB', '_saveFriendsListToDB', '_saveFishingAlmanac', '_saveLoginStreak', '_saveAdventureJournalNow', '_flushInventoryToDB']) {
    assert.match(flush, new RegExp(method));
  }
  assert.match(gameUI, /clearTimeout\(this\._journalSaveTimer\)/);
  assert.match(gameUI, /this\._persistenceFlushPromise/);
});

test('server save path ignores client progression snapshots under the verified character owner', () => {
  const save = block(server, 'async function saveCharacterToSupabase', '// Periodic batch save');
  for (const field of ['dailyQuests', 'friendsList', 'fishingAlmanac', 'adventureJournal', 'loginStreak']) {
    assert.match(save, new RegExp(field));
  }
  assert.match(save, /eq\('id', characterId\)/);
  assert.match(save, /eq\('user_id', ownerUserId\)/);
  assert.match(save, /Ignored client progression snapshot/);
  assert.match(save, /use dedicated server RPCs/);
  assert.match(save, /Ignored client inventory backup/);
});

test('system snapshot helper was removed so service-role save cannot write arbitrary progress blobs', () => {
  assert.doesNotMatch(server, /saveSystemInventorySnapshot\(/);
  assert.match(gameSyncSource(), /supabase\.rpc\('save_system_state'/);
});

test('inventory flush propagates explicit item-save failures to the final result', () => {
  const flush = block(gameUI, 'async _flushInventoryToDB()', '// ============ Fishing Almanac');
  assert.match(flush, /let ok = true/);
  assert.match(flush, /if \(saved === false\) ok = false/);
  assert.match(flush, /catch \(e\) \{\n\s+ok = false/);
  assert.match(flush, /return ok;/);
});

test('all online client system adapters use the allowlisted RPC', () => {
  const sync = gameSyncSource();
  assert.match(sync, /async function saveSystemState\(characterId, key, state\)/);
  assert.match(sync, /supabase\.rpc\('save_system_state'/);
  for (const fn of ['saveDailyQuests', 'saveFishingAlmanac', 'saveAdventureJournal', 'saveFriendsList']) {
    assert.match(sync, new RegExp(`${fn}\\([^\\n]+\\)\\s*\\{\\s*return saveSystemState`));
  }
  assert.match(sync, /Online login streaks are advanced only by claim_daily_reward/);
});

function gameSyncSource() {
  return read('../src/network/GameSync.js');
}

test('mobile lifecycle fallback sends an inventory-free keepalive snapshot through the authenticated route', () => {
  const sync = gameSyncSource();
  assert.match(sync, /export function sendSaveState\(saveData, \{ keepalive = false \} = \{\}\)/);
  assert.match(sync, /const \{ inventory: _ignoredInventory, \.\.\.snapshot \} = saveData/);
  assert.match(sync, /keepalive: true/);
  assert.match(main, /sendSaveState\(buildPersistenceSnapshot\(\), \{ keepalive: true \}\)/);
  assert.match(server, /app\.post\('\/api\/persistence\/snapshot'/);
  assert.match(server, /auth\.authFromReq\(req\)/);
  assert.match(server, /Buffer\.byteLength\(encoded, 'utf8'\) > 256 \* 1024/);
  assert.match(server, /_ownerUserId: actor\.userId/);
});

test('Guest logout requires an explicit bind, continue, or risky unbound exit choice', () => {
  assert.match(gameUI, /showGuestExitWarning\(\)/);
  assert.match(gameUI, /บัญชีของคุณยังเป็น Guest และยังไม่ได้ผูกอีเมล/);
  assert.match(gameUI, /ประวัติการเล่นอาจสูญหายได้/);
  assert.match(gameUI, /data-guest-exit-action="bind"/);
  assert.match(gameUI, /modal\.className = 'modal-popup guest-exit-warning-modal'/);
  assert.match(gameUI, /pointer-events: auto !important/);
  assert.match(gameUI, /modal\.addEventListener\('pointerdown'/);
  assert.match(gameUI, /element\.addEventListener\('pointerup'/);
  assert.match(gameUI, /element\.addEventListener\('touchend'/);
  assert.match(gameUI, /data-guest-exit-action="cancel"/);
  assert.match(gameUI, /ออกโดยไม่ผูกบัญชี \(เสี่ยงข้อมูลหาย\)/);
  assert.match(gameUI, /reload: false, source: 'exit-warning'/);
  assert.match(main, /if \(gameUI\.isGuest\)/);
  assert.match(main, /exitDecision\?\.action === 'cancel'/);
});

test('cancelled Guest logout restores the logout control for mobile retry', () => {
  assert.match(gameUI, /if \(result === false\)/);
  assert.match(gameUI, /btn\.disabled = false/);
  assert.match(gameUI, /btn\.style\.pointerEvents = ''/);
});


test('pet persistence uses the dedicated ownership-safe state path', () => {
  const rpc = read('../server/api/rpc.js');
  const sync = read('../src/network/GameSync.js');
  assert.match(sync, /export function savePetState\(characterId, itemName, stats = \{\}\)/);
  assert.match(sync, /supabase\.rpc\('save_pet_state'/);
  assert.match(gameUI, /item\.item_type === 'pet'\s*\n\s*\? await savePetState/);
  assert.match(gameUI, /async _persistPetRow\(item\)/);
  assert.match(gameUI, /const result = await savePetState\(this\.characterId, item\.item_name/);
  assert.match(rpc, /async function savePetState\(body, userId\)/);
  assert.match(rpc, /id = \$1 AND user_id = \$2 FOR UPDATE/);
  assert.match(rpc, /item_type !== 'pet'/);
  assert.match(rpc, /incomingInstances\.length !== stored\.length/);
  assert.match(rpc, /pet_uid_not_owned/);
  assert.match(rpc, /UPDATE inventory SET stats = \$1 WHERE id = \$2/);
  assert.match(rpc, /quantity: row\.quantity/);
});

test('pet state cannot use generic client inventory quantity or arbitrary stats writes', () => {
  const data = read('../server/api/data.js');
  assert.match(data, /const isSystemSnapshot = SYSTEM_INVENTORY_ITEMS\.has/);
  assert.match(data, /\['insert', 'upsert', 'update', 'delete'\]/);
  assert.match(data, /\$\{category\} mutations must come from server-authoritative RPCs/);
  assert.match(gameUI, /item\.item_type === 'pet'\n\s*\? await savePetState/);
  assert.match(gameUI, /const \{ savePetState \} = await import\('\.\.\/network\/GameSync\.js'\)/);
});

test('pet load restores the server-selected instance instead of clearing it', () => {
  assert.match(gameUI, /const equippedPetRow = this\.inventory\.find\(i => i\.item_type === 'pet'/);
  assert.match(gameUI, /equippedPetRow\.stats\.equippedUid/);
  assert.match(gameUI, /this\.character\.setPet\(petModelOf\(equippedPetRow\.item_name\), equippedInst\.level/);
  assert.match(gameUI, /this\.character\.equippedPetUid = equippedInst\.uid/);
});


test('online pet progression is server-derived from committed monster kills', () => {
  const monsterEngine = read('../server/game/monsterEngine.js');
  assert.match(monsterEngine, /const PET_MAX_LEVEL = 40/);
  assert.match(monsterEngine, /petXpRequired\(level\)/);
  assert.match(monsterEngine, /UPDATE inventory SET stats = \$1 WHERE id = \$2/);
  assert.match(monsterEngine, /pet: committed\.pet \|\| null/);
  assert.match(main, /Never derive pet level\/XP from a client-visible reward/);
  assert.match(main, /gameUI\.applyServerPetReward\(payload\.pet\)/);
  assert.doesNotMatch(main, /payload\.exp \|\| 0\) \* 0\.5\)\);\n\s+if \(petLeveled\)/);
  assert.match(gameUI, /applyServerPetReward\(receipt\)/);
});

test('pet state RPC preserves server-owned level and XP', () => {
  const rpc = read('../server/api/rpc.js');
  assert.match(rpc, /Level and XP are server-owned/);
  assert.match(rpc, /level: previous\.level/);
  assert.match(rpc, /xp: previous\.xp/);
  assert.doesNotMatch(rpc, /level: Math\.max\(previous\.level, level\)/);
});


test('pet market and NPC sale mutations are server-authoritative per instance', () => {
  const rpc = read('../server/api/rpc.js');
  const npcSale = read('../server/api/npcSale.js');
  const sync = gameSyncSource();
  assert.match(rpc, /async function createPetMarketListing\(body, userId\)/);
  assert.match(rpc, /async function cancelPetMarketListing\(body, userId\)/);
  assert.match(rpc, /async function buyPetMarketItem\(body, userId\)/);
  assert.match(rpc, /p_pet_uid/);
  assert.match(rpc, /pet_uid_not_owned/);
  assert.match(rpc, /pet-market:/);
  assert.match(npcSale, /CREATE TABLE IF NOT EXISTS public\.npc_pet_sale_requests/);
  assert.match(npcSale, /export async function sellPetInstanceToNpc/);
  assert.match(npcSale, /npc_pet_sale_requests/);
  assert.match(sync, /export async function listPetInstanceMarket/);
  assert.match(sync, /supabase\.rpc\('create_pet_market_listing'/);
  assert.match(sync, /supabase\.rpc\('sell_pet_instance'/);
});

test('online pet list/sell UI never persists a locally shortened instance array', () => {
  const listBlock = block(gameUI, 'async _listPetInstanceMarket(uid, price)', '  // Level-scaled NPC sell price');
  const sellBlock = block(gameUI, 'async _sellPetInstanceNpc(uid)', '  // ============ Leaderboard');
  assert.match(listBlock, /listPetInstanceMarket\(/);
  assert.doesNotMatch(listBlock, /savePetState\(/);
  assert.match(listBlock, /listing\._serverAuthoritative/);
  assert.match(sellBlock, /this\._isServerBackedCharacter\(\)/);
  assert.match(sellBlock, /requestPetNpcSale\(/);
  assert.doesNotMatch(sellBlock, /setInventoryItemQuantity\(/);
});

test('market buy/cancel routes pet listings through canonical server receipts', () => {
  const sync = gameSyncSource();
  assert.match(sync, /listingMeta\?\.item_type === 'pet'/);
  assert.match(sync, /buy_pet_market_item/);
  assert.match(sync, /cancel_pet_market_listing/);
  assert.match(gameUI, /buyMarketItem\(listing\.id, this\.characterId, this\.character\.stats\.name, listing\)/);
  assert.match(gameUI, /boughtResult\.pet\?\.instances/);
  assert.match(gameUI, /canceled\.listing\?\.stats\?\.instances/);
});


test('pet marketplace escrow binds to the originating character in multi-character accounts', () => {
  const rpc = read('../server/api/rpc.js');
  const listingBlock = block(rpc, 'function petListingStats(instance, sellerCharacterId)', ' async function createMarketListing');
  assert.match(listingBlock, /sellerCharacterId/);
  assert.match(rpc, /SELECT id FROM characters WHERE id = \$1 AND user_id = \$2 FOR UPDATE/);
  assert.match(rpc, /listing\.stats\?\.sellerCharacterId/);
});
