import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const fishing = read('../server/api/fishing.js');
const server = read('../server/server.js');
const gameSync = read('../src/network/GameSync.js');
const main = read('../src/main.js');

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
  assert.match(fishing, /ON CONFLICT \(character_id, item_name\) DO UPDATE/);
  assert.match(fishing, /INSERT INTO public\.fishing_catch_requests/);
  assert.match(fishing, /SELECT pg_advisory_xact_lock/);
});

test('socket fishing claim is authenticated, state-gated, rate-limited and server-owned', () => {
  assert.match(server, /socket\.on\('fish_claim', async \(payload\) =>/);
  assert.match(server, /!player\?\.verified \|\| !player\.characterId \|\| !supabase/);
  assert.match(server, /player\.lastMotionState !== 'fishing'/);
  assert.match(server, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'fish_claim'/);
  assert.match(server, /claimFishingReward\(\{/);
  assert.doesNotMatch(server, /claimFishingReward\(\{[\s\S]{0,420}payload\.(item|fish)/);
});

test('online client accepts fish only from a validated server receipt', () => {
  assert.match(gameSync, /export function requestFishingReward\(requestId\)/);
  assert.match(gameSync, /socket\.emit\('fish_claim'/);
  assert.match(gameSync, /isCommittedFishingReward/);
  assert.match(main, /event\.item\?\.type === 'fish' && gameUI\?\._onlineSessionWithoutAuthority\?\.\(\)\) break/);
  assert.match(main, /addItemLocal\(item, receipt\.quantity\)/);
  assert.match(main, /recordFishCatch\?\.\(item\)/);
});
