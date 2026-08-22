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

test('server save path persists all system snapshots under the verified character owner', () => {
  const save = block(server, 'async function saveCharacterToSupabase', '// Periodic batch save');
  for (const field of ['dailyQuests', 'friendsList', 'fishingAlmanac', 'adventureJournal', 'loginStreak']) {
    assert.match(save, new RegExp(field));
  }
  for (const item of ['fishing_almanac', 'adventure_journal', 'login_streak']) {
    assert.match(save, new RegExp(`saveSystemInventorySnapshot\\(characterId, '${item}'`));
  }
  assert.match(save, /eq\('id', characterId\)/);
  assert.match(save, /eq\('user_id', ownerUserId\)/);
  assert.match(save, /Ignored client inventory backup/);
});

test('system snapshot writes remain bounded to one row per character and item', () => {
  const helper = block(server, 'async function saveSystemInventorySnapshot', 'async function saveCharacterToSupabase');
  assert.match(helper, /item_type.*system/);
  assert.match(helper, /upsert\(/);
  assert.match(helper, /onConflict: 'character_id,item_name'/);
  assert.match(helper, /quantity: 1/);
  assert.match(helper, /if \(error\) throw error/);
});

test('inventory flush propagates explicit item-save failures to the final result', () => {
  const flush = block(gameUI, 'async _flushInventoryToDB()', '// ============ Fishing Almanac');
  assert.match(flush, /let ok = true/);
  assert.match(flush, /if \(saved === false\) ok = false/);
  assert.match(flush, /catch \(e\) \{\n\s+ok = false/);
  assert.match(flush, /return ok;/);
});

test('all client system adapters use atomic conflict-safe writes', () => {
  for (const itemName of ['daily_quests', 'friends_list', 'fishing_almanac', 'adventure_journal', 'login_streak']) {
    assert.match(gameSyncSource(), new RegExp(`item_name: '${itemName}'`));
  }
  assert.equal((gameSyncSource().match(/onConflict: 'character_id,item_name'/g) || []).length >= 5, true);
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
