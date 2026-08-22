import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('keepalive saver never persists client-owned progression snapshots', async () => {
  const source = await read('../server/server.js');
  assert.match(source, /Ignored client progression snapshot/);
  assert.doesNotMatch(source, /saveSystemInventorySnapshot\(/);
});

test('system progression writers use an allowlisted RPC instead of direct inventory upsert', async () => {
  const source = await read('../src/network/GameSync.js');
  assert.match(source, /supabase\.rpc\('save_system_state'/);
  assert.match(source, /saveDailyQuests\(characterId, questData\)\s*\{\s*return saveSystemState/);
  assert.match(source, /saveFishingAlmanac\(characterId, almanacData\)\s*\{\s*return saveSystemState/);
  assert.match(source, /saveAdventureJournal\(characterId, journalData\)\s*\{\s*return saveSystemState/);
  assert.match(source, /saveFriendsList\(characterId, friendsList\)\s*\{\s*return saveSystemState/);
  assert.match(source, /Online login streaks are advanced only by claim_daily_reward/);
});

test('online daily and almanac rewards consume server receipts without client grants', async () => {
  const source = await read('../src/ui/GameUI.js');
  const daily = source.slice(source.indexOf('async _claimDailyReward()'), source.indexOf('// ============ Vending Stalls'));
  const almanac = source.slice(source.indexOf('async _claimAlmanacReward(tier)'), source.indexOf('  openFishingAlmanac() {'));
  assert.match(daily, /claimDailyReward\(this\.characterId\)/);
  assert.match(daily, /this\.character\.stats\.gold = result\.gold/);
  assert.doesNotMatch(daily.slice(0, daily.indexOf('// Explicit offline fallback')), /saveInventoryItem\(/);
  assert.match(almanac, /claimAlmanacReward\(this\.characterId, tier\)/);
  assert.match(almanac, /this\.character\.stats\.gold = result\.gold/);
  assert.doesNotMatch(almanac.slice(0, almanac.indexOf('// Explicit offline fallback')), /addItem\(reward\.item\)/);
});

test('online fishing receipt is the only source of discovery gold and almanac state', async () => {
  const source = await read('../src/ui/GameUI.js');
  const block = source.slice(source.indexOf('recordFishCatch(item)'), source.indexOf('_notifyAlmanacCompletions() {'));
  assert.match(block, /const snapshot = item\.almanac/);
  assert.match(block, /this\.character\.stats\.gold = item\.gold/);
  assert.match(block, /if \(trustedServerReward\)/);
  assert.match(block, /GameUI\._ALMANAC_DISCOVERY/);
});

test('server fishing transaction writes canonical almanac and discovery bonus atomically', async () => {
  const source = await read('../server/api/fishing.js');
  assert.match(source, /item_name = 'fishing_almanac'/);
  assert.match(source, /const firstDiscovery = !caught\.includes\(fish\.name\)/);
  assert.match(source, /const discoveryBonus = firstDiscovery/);
  assert.match(source, /UPDATE public\.characters SET gold/);
  assert.match(source, /almanac,/);
});

test('online daily quests are read-only until server progression transactions exist', async () => {
  const source = await read('../src/ui/GameUI.js');
  const save = source.slice(source.indexOf('async _saveDailyQuestsToDB()'), source.indexOf('// ============ Friends List'));
  const claimStart = source.lastIndexOf('  _claimQuestReward(idx)');
  const spinStart = source.indexOf('  _spinRoulette()');
  const progressStart = source.indexOf('  incrementQuestProgress(type');
  const claim = source.slice(claimStart, spinStart);
  const spin = source.slice(spinStart, progressStart);
  const progress = source.slice(progressStart, source.indexOf('// ============ WARP MAP MODAL'));
  assert.match(save, /if \(this\._isServerBackedCharacter\(\)\) return false/);
  assert.match(claim, /if \(this\._isServerBackedCharacter\(\)/);
  assert.match(spin, /if \(this\._isServerBackedCharacter\(\)/);
  assert.match(progress, /this\._isServerBackedCharacter\(\)/);
});

test('online job changes reconcile a server receipt instead of mutating gold or signature gear locally', async () => {
  const source = await read('../src/ui/GameUI.js');
  const start = source.indexOf('async chooseJob(jobId, isChange)');
  const end = source.indexOf('  _renderCombatStatBreakdown()', start);
  const block = source.slice(start, end);
  assert.match(block, /requestChangeJob\(this\.characterId, canonicalJobId, requestId\)/);
  assert.match(block, /s\.gold = Number\(serverJobReceipt\.gold\)/);
  assert.match(block, /if \(isChange && !serverJobReceipt\)/);
});

test('hosted migration revokes direct browser DML and exposes only authoritative reward RPCs', async () => {
  const source = await read('../migrations/20260822_server_authority.sql');
  assert.match(source, /REVOKE INSERT, UPDATE, DELETE ON public\.inventory FROM anon, authenticated/);
  assert.match(source, /REVOKE INSERT, UPDATE, DELETE ON public\.marketplace FROM anon, authenticated/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.save_system_state/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.claim_daily_reward/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.claim_almanac_reward/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.save_equipped_item/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.claim_starter_loadout/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.use_consumable/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.purchase_shop_item/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.change_job/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.change_job\(text, text, text\) TO authenticated/);
  assert.match(source, /v_has_item := FOUND/);
  assert.match(source, /v_prior_user uuid/);
  assert.match(source, /v_almanac_id public\.inventory\.id%TYPE/);
  assert.match(source, /v_almanac_id := v_row\.id/);
  assert.match(source, /WHERE id = v_almanac_id/);
});

test('daily/almanac backend RPC dispatch is authenticated and bounded', async () => {
  const source = await read('../server/api/rpc.js');
  assert.match(source, /if \(fn === 'save_equipped_item'\)/);
  assert.match(source, /if \(fn === 'claim_starter_loadout'\)/);
  assert.match(source, /if \(fn === 'save_system_state'\)/);
  assert.match(source, /if \(fn === 'claim_daily_reward'\)/);
  assert.match(source, /if \(fn === 'claim_almanac_reward'\)/);
  assert.match(source, /SYSTEM_STATE_KEYS = new Set\(\['daily_quests', 'friends_list', 'adventure_journal'\]\)/);
  assert.match(source, /const DAILY_REWARDS = Object\.freeze/);
  assert.match(source, /const ALMANAC_REWARDS = Object\.freeze/);
  assert.match(source, /if \(fn === 'use_consumable'\)/);
  assert.match(source, /if \(fn === 'purchase_shop_item'\)/);
  assert.match(source, /if \(fn === 'change_job'\)/);
  assert.match(source, /async function changeJob/);
  assert.match(source, /JOB_CHANGE_COST/);
});
