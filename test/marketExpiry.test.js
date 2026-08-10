import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MARKET_EXPIRY_INTERVAL_MS,
  VENDING_STALL_TTL_HOURS,
  mergeReturnedPetStats,
} from '../server/api/marketExpiry.js';

const expirySource = fs.readFileSync(new URL('../server/api/marketExpiry.js', import.meta.url), 'utf8');
const dataSource = fs.readFileSync(new URL('../server/api/data.js', import.meta.url), 'utf8');
const rpcSource = fs.readFileSync(new URL('../server/api/rpc.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('vending stall expiry is exactly 48 hours and checked at least once a minute', () => {
  assert.equal(VENDING_STALL_TTL_HOURS, 48);
  assert.ok(MARKET_EXPIRY_INTERVAL_MS <= 60_000);
  assert.match(expirySource, /NOW\(\) - INTERVAL '\$\{VENDING_STALL_TTL_HOURS\} hours'/);
});

test('expiry returns inventory before deleting listings and stall inside a transaction', () => {
  assert.match(expirySource, /tx\(async client/);
  const inventoryWrite = expirySource.indexOf('await returnListingToInventory');
  const listingDelete = expirySource.indexOf("DELETE FROM public.marketplace");
  const stallDelete = expirySource.indexOf("DELETE FROM public.vending_stalls");
  assert.ok(inventoryWrite > 0 && inventoryWrite < listingDelete);
  assert.ok(listingDelete < stallDelete);
  assert.match(expirySource, /WHERE user_id = \$1/);
});

test('returned pets preserve custom identity and existing instances', () => {
  const merged = mergeReturnedPetStats(
    { equipped: true, instances: [{ uid: 'pet_existing', name: 'Mochi', level: 4, xp: 22 }] },
    1,
    { id: 'listing_7', quantity: 1, stats: { petName: 'Luna', petLevel: 9, petXp: 77 } },
  );
  assert.equal(merged.equipped, true);
  assert.deepEqual(merged.instances[0], { uid: 'pet_existing', name: 'Mochi', level: 4, xp: 22 });
  assert.deepEqual(merged.instances[1], {
    uid: 'market_return_listing_7_0', name: 'Luna', level: 9, xp: 77,
  });
});

test('stall timestamp comes from server and expiry is enforced on startup and purchase', () => {
  const openStallBlock = syncSource.match(/export async function openVendingStall[\s\S]*?\n}\r?\n\r?\nexport async function closeVendingStall/)?.[0] || '';
  assert.match(dataSource, /table === 'vending_stalls'/);
  assert.match(dataSource, /row\.updated_at = new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(openStallBlock, /updated_at/);
  assert.match(serverSource, /startMarketExpiryScheduler\(\{ io \}\)/);
  assert.match(rpcSource, /fn === 'buy_market_item'.*cleanupExpiredVendingStalls\(\)/s);
});
