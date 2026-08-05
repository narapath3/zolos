import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameUi = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const gameSync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const economy = fs.readFileSync(new URL('../server/api/petEconomy.js', import.meta.url), 'utf8');

test('Pet Sanctuary waits for authoritative purchase before changing UI state', () => {
  const block = gameUi.match(/const buyEntry=async\(entry,button\)=>\{[\s\S]*?\n    \};/)?.[0] || '';
  assert.match(block, /await requestPetPurchase/);
  assert.ok(block.indexOf('await requestPetPurchase') < block.indexOf('this.character.stats.gold='));
  assert.doesNotMatch(block, /_performShopAction|setInventoryItemQuantity|saveStatsToDatabase/);
});

test('server owns pet catalog, price, identity and database transaction', () => {
  const handler = server.match(/socket\.on\('pet_purchase'[\s\S]*?\n    \}\);/)?.[0] || '';
  assert.match(handler, /PET_CATALOG\[itemName\]/);
  assert.doesNotMatch(handler, /payload\?\.(price|pet|rarity)/);
  assert.match(handler, /p_price: catalogPet\.price/);
  assert.match(economy, /FOR UPDATE/);
  assert.match(economy, /pet_purchase_requests/);
  assert.match(economy, /ON CONFLICT \(character_id, item_name\)/);
  assert.match(economy, /gold = gold - p_price/);
  assert.match(economy, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
});

test('client uses request correlation and does not silently persist through Supabase', () => {
  assert.match(gameSync, /pendingPetPurchases/);
  assert.match(gameSync, /socket\.emit\('pet_purchase', \{ itemName, requestId \}\)/);
  assert.match(gameSync, /pet_purchase_result/);
  assert.match(gameSync, /pet_purchase_error/);
});
