import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyCards } from '../../src/cards/CardMigration.js';

test('migration preserves quantities and socketed legacy cards and is idempotent', () => {
  const inventory = [
    { item_name: 'Poring Card', item_type: 'card', quantity: 4, stats: { equippedSlot: 'body' } },
    { item_name: 'Andre Card', item_type: 'card', quantity: 2, stats: {} },
  ];
  const first = migrateLegacyCards(inventory, { body: 'Poring Card', weapon: 'Andre Card' });
  const second = migrateLegacyCards(first.inventory, first.equippedCards);
  assert.deepEqual(second, first);
  assert.deepEqual(first.cardState.poring, { owned: 4, stars: 1, pity: 0 });
  assert.equal(first.equippedCards.body, 'poring');
  assert.equal(first.inventory.reduce((sum, row) => sum + row.quantity, 0), 6);
});

test('migration merges aliases without losing quantities and preserves non-card rows', () => {
  const inventory = [
    { item_name: 'Willow Card', item_type: 'card', quantity: 3, stats: { card_stars: 2 } },
    { item_name: 'Andre Card', item_type: 'card', quantity: 4, stats: { equippedSlot: 'weapon', custom: true } },
    { item_name: 'Potion', item_type: 'consumable', quantity: 7, stats: { rare: false } },
  ];
  const original = structuredClone(inventory);
  const result = migrateLegacyCards(inventory, { weapon: 'Andre Card' });

  assert.deepEqual(inventory, original);
  assert.deepEqual(result.inventory, [
    { item_name: 'Willow Card', item_type: 'card', quantity: 7, stats: { card_stars: 2, card_id: 'willow', equippedSlot: 'weapon', custom: true, equipped: true, slot: 'weapon' } },
    original[2],
  ]);
  assert.deepEqual(result.cardState, { willow: { owned: 7, stars: 2, pity: 0 } });
  assert.deepEqual(result.equippedCards, { weapon: 'willow' });
});

test('migration canonicalizes id-valued sockets and leaves unknown cards intact', () => {
  const inventory = [
    { item_name: 'Poring Card', item_type: 'card', quantity: 1, stats: {} },
    { item_name: 'Retired Card', item_type: 'card', quantity: 2, stats: { token: 'keep' } },
  ];
  const result = migrateLegacyCards(inventory, { body: 'poring', weapon: 'Retired Card' });

  assert.equal(result.equippedCards.body, 'poring');
  assert.equal(result.equippedCards.weapon, 'Retired Card');
  assert.deepEqual(result.inventory[1], inventory[1]);
});

test('migration restores canonical sockets recorded on legacy inventory rows', () => {
  const result = migrateLegacyCards([
    { item_name: 'Andre Card', item_type: 'card', quantity: 1, stats: { equipped: true, slot: 'weapon' } },
  ]);

  assert.deepEqual(result.equippedCards, { weapon: 'willow' });
});

test('migration recognizes a saved canonical card_id when the item name is stale', () => {
  const result = migrateLegacyCards([
    { item_name: 'Removed Card', item_type: 'card', quantity: 3, stats: { card_id: 'poring' } },
  ]);

  assert.equal(result.inventory[0].item_name, 'Poring Card');
  assert.deepEqual(result.cardState.poring, { owned: 3, stars: 1, pity: 0 });
});

test('merged rows persist the selected legacy socket for the next migration', () => {
  const first = migrateLegacyCards([
    { item_name: 'Willow Card', item_type: 'card', quantity: 1, stats: { equipped: false } },
    { item_name: 'Andre Card', item_type: 'card', quantity: 1, stats: { equipped: true, slot: 'weapon' } },
  ]);
  const second = migrateLegacyCards(first.inventory, {});

  assert.deepEqual(first.inventory[0].stats, {
    card_id: 'willow', card_stars: 1, equipped: true, slot: 'weapon',
  });
  assert.deepEqual(second.equippedCards, { weapon: 'willow' });
});

test('duplicate canonical socket IDs keep the first supplied slot', () => {
  const result = migrateLegacyCards([], { body: 'Poring Card', weapon: 'poring' });

  assert.deepEqual(result.equippedCards, { body: 'poring', weapon: null });
});
