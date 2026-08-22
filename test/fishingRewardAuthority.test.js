import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const fishing = read('../server/api/fishing.js');
const server = read('../server/server.js');
const gameSync = read('../src/network/GameSync.js');
const main = read('../src/main.js');
const gameUI = read('../src/ui/GameUI.js');

 test('server fishing reward uses a shared fish catalog and returns a committed receipt', async () => {
  const { rollFishingCatch } = await import('../server/api/fishing.js');
  for (const random of [0, 0.59, 0.8, 0.99]) {
    const fish = rollFishingCatch(() => random);
    assert.equal(typeof fish.name, 'string');
    assert.equal(fish.emoji.length > 0, true);
    assert.match(fish.rarity, /^(common|uncommon|rare|legendary)$/);
    assert.equal(Number.isInteger(fish.price), true);
  }
  assert.match(fishing, /CREATE TABLE IF NOT EXISTS public\.fishing_catch_requests/);
  assert.match(fishing, /export function ensureFishingEconomy\(\)/);
  assert.match(fishing, /await ensureFishingEconomy\(\)/);
  assert.doesNotMatch(fishing, /ON CONFLICT \(character_id, item_name\) DO UPDATE/);
  assert.match(fishing, /INSERT INTO public\.fishing_catch_requests/);
  assert.match(fishing, /SELECT pg_advisory_xact_lock/);
});

test('map fishing pools scale rare catches into dangerous maps', async () => {
  const { rollFishingCatch, getFishingMapConfig } = await import('../server/api/fishing.js');
  const sequence = (...values) => { let index = 0; return () => values[Math.min(index++, values.length - 1)]; };
  const safe = rollFishingCatch(sequence(0.999, 0), 'prontera', 'Fishing Rod');
  const abyss = rollFishingCatch(sequence(0.999, 0), 'abyss_lake', 'Golden Fishing Rod');
  assert.equal(getFishingMapConfig('unknown_map').tier, 1);
  assert.equal(safe.mapId, 'prontera');
  assert.equal(abyss.mapId, 'abyss_lake');
  assert.equal(abyss.mapTier, 5);
  assert.equal(abyss.mapDanger, 'extreme');
  assert.equal(abyss.rarity, 'legendary');
  assert.ok(abyss.price >= safe.price);
  assert.match(abyss.mapName, /Abyss Lake/);
});

test('rod tiers gate fish rarity and preserve map progression', async () => {
  const { canFishingRodCatchRarity, getFishingRodConfig, pickFishingCatch } = await import('../src/engine/GameData.js');
  assert.equal(getFishingRodConfig('Fishing Rod').maxRarity, 'common');
  assert.equal(getFishingRodConfig('Silver Fishing Rod').maxRarity, 'rare');
  assert.equal(getFishingRodConfig('Golden Fishing Rod').maxRarity, 'legendary');
  assert.equal(canFishingRodCatchRarity('Fishing Rod', 'common'), true);
  assert.equal(canFishingRodCatchRarity('Fishing Rod', 'rare'), false);
  assert.equal(canFishingRodCatchRarity('Silver Fishing Rod', 'rare'), true);
  assert.equal(canFishingRodCatchRarity('Silver Fishing Rod', 'legendary'), false);
  assert.equal(canFishingRodCatchRarity('Golden Fishing Rod', 'legendary'), true);
  const wood = pickFishingCatch('abyss_lake', () => 0.999, { rodName: 'Fishing Rod' });
  const gold = pickFishingCatch('abyss_lake', () => 0.999, { rodName: 'Golden Fishing Rod' });
  assert.notEqual(wood.rarity, 'legendary');
  assert.equal(gold.rarity, 'legendary');
  assert.match(fishing, /getFishingRodConfig/);
  assert.match(fishing, /ต้องสวมคันเบ็ดก่อนตกปลา/);
  assert.match(fishing, /rod_max_rarity/);
});

test('local guest fallback keeps fishing on the local reward path', () => {
  assert.match(gameUI, /_isLocalGuestSession\(\)/);
  assert.match(gameUI, /window\.__serverRewards !== true[\s\S]*!this\._isLocalGuestSession\(\)/);
  assert.match(main, /gameUI && gameUI\._onlineSessionWithoutAuthority\?\.\(\)/);
  assert.match(main, /event\.item\?\.type === 'fish' && gameUI\?\._onlineSessionWithoutAuthority\?\.\(\)\) break/);
  assert.match(main, /rawMessage\.startsWith\('บันทึกรางวัลปลาไม่สำเร็จ'\)/);
  assert.match(main, /rawMessage \|\| 'กรุณาลองใหม่'/);
  assert.match(gameUI, /item\.item_type === 'pet' \? savePetState : updateInventoryItemStats/);
  assert.match(gameUI, /otherItem\.item_type === 'pet' \? savePetState : updateInventoryItemStats/);
});

test('socket fishing claim is authenticated, state-gated, rate-limited and server-owned', () => {
  assert.match(server, /socket\.on\('fish_claim', async \(payload\) =>/);
  assert.match(server, /!player\?\.verified \|\| !player\.characterId \|\| !supabase/);
  assert.match(server, /player\.lastMotionState !== 'fishing'/);
  assert.match(server, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'fish_claim'/);
  assert.match(server, /claimFishingReward\(\{/);
  assert.match(server, /mapId: player\.mapId/);
  assert.doesNotMatch(server, /claimFishingReward\(\{[\s\S]{0,420}payload\.(item|fish)/);
});

test('online client accepts fish only from a validated server receipt', () => {
  assert.match(gameSync, /export function requestFishingReward\(requestId\)/);
  assert.match(gameSync, /socket\.emit\('fish_claim'/);
  assert.match(gameSync, /isCommittedFishingReward/);
  assert.match(main, /event\.item\?\.type === 'fish' && gameUI\?\._onlineSessionWithoutAuthority\?\.\(\)\) break/);
  assert.match(main, /addItemLocal\(item, receipt\.quantity\)/);
  assert.match(main, /recordFishCatch\?\.\(item\)/);
  assert.match(main, /mapName: receipt\.map_name/);
});
