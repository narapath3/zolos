import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyTrustedCardReward,
  loadAndMergeAuthoritativeCards,
  mergeAuthoritativeCardRows,
} from '../../src/cards/CardRewards.js';

test('trusted reward replaces the persisted card row and refreshes card UI', () => {
  const character = {
    cardState: { valdris: { owned: 1, stars: 1, pity: 12 } },
  };
  const calls = [];
  const gameUI = {
    _renderInventory() { calls.push('inventory'); },
    refreshCardAlbum() { calls.push('album'); },
    showCardDropReveal(cardId, options) { calls.push(['reveal', cardId, options]); },
  };

  const applied = applyTrustedCardReward({
    cardId: 'valdris',
    owned: 2,
    stars: 3,
    pity: 0,
    source: { kind: 'world_boss', id: 'valdris', label: 'Valdris world boss' },
    isNew: false,
  }, { character, gameUI });

  assert.equal(applied, true);
  assert.deepEqual(character.cardState.valdris, { owned: 2, stars: 3, pity: 0 });
  assert.deepEqual(calls, [
    'inventory',
    'album',
    ['reveal', 'valdris', { sourceLabel: 'Valdris world boss', isNew: false }],
  ]);
});

test('malformed reward cannot modify card state or open a reveal', () => {
  const character = { cardState: {} };
  const gameUI = {
    showCardDropReveal() {
      assert.fail('invalid reward opened a reveal');
    },
  };

  assert.equal(applyTrustedCardReward({
    cardId: 'not-a-card',
    owned: 999,
    stars: 99,
    pity: -1,
  }, { character, gameUI }), false);
  assert.deepEqual(character.cardState, {});
});

test('authoritative rows restore on login and reconcile the current card gallery', () => {
  const character = {
    cardState: { poring: { owned: 2, stars: 1, pity: 4 } },
  };
  const gameUI = {
    inventory: [{
      item_name: 'Valdris Card',
      item_type: 'card',
      quantity: 99,
      stats: { equipped: true },
    }],
    _renderInventory() {},
  };

  const merged = mergeAuthoritativeCardRows([{
    card_id: 'valdris',
    owned: 3,
    stars: 2,
    pity: 7,
  }], { character, gameUI });

  assert.equal(merged, 1);
  assert.deepEqual(character.cardState, {
    poring: { owned: 2, stars: 1, pity: 4 },
    valdris: { owned: 3, stars: 2, pity: 7 },
  });
  assert.deepEqual(gameUI.inventory[0], {
    item_name: 'Valdris Card',
    item_type: 'card',
    quantity: 3,
    stats: { equipped: true, card_id: 'valdris', card_stars: 2 },
  });
});

test('missing authoritative world-boss rows remove fabricated legacy ownership', () => {
  const character = {
    cardState: {
      poring: { owned: 2, stars: 1, pity: 4 },
      valdris: { owned: 99, stars: 5, pity: 0 },
    },
  };
  const gameUI = {
    inventory: [
      { item_name: 'Poring Card', item_type: 'card', quantity: 2, stats: {} },
      { item_name: 'Valdris Card', item_type: 'card', quantity: 99, stats: {} },
    ],
    _renderInventory() {},
  };

  mergeAuthoritativeCardRows([], { character, gameUI });

  assert.equal(character.cardState.valdris, undefined);
  assert.deepEqual(character.cardState.poring, { owned: 2, stars: 1, pity: 4 });
  assert.deepEqual(gameUI.inventory.map(item => item.item_name), ['Poring Card']);
});

test('failed authoritative load preserves existing card state and inventory', async () => {
  const character = {
    cardState: { valdris: { owned: 2, stars: 1, pity: 4 } },
  };
  const gameUI = {
    inventory: [{
      item_name: 'Valdris Card',
      item_type: 'card',
      quantity: 2,
      stats: { card_id: 'valdris', card_stars: 1 },
    }],
  };
  const beforeCharacter = structuredClone(character);
  const beforeInventory = structuredClone(gameUI.inventory);

  const loaded = await loadAndMergeAuthoritativeCards(
    async () => { throw new Error('database unavailable'); },
    { character, gameUI, logger: { warn() {} } },
  );

  assert.equal(loaded, false);
  assert.deepEqual(character, beforeCharacter);
  assert.deepEqual(gameUI.inventory, beforeInventory);
});

test('pity-only authoritative rows stay hidden from the owned-card gallery', () => {
  const character = { cardState: {} };
  const gameUI = { inventory: [], _renderInventory() {} };

  mergeAuthoritativeCardRows([{
    card_id: 'valdris',
    owned: 0,
    stars: 1,
    pity: 8,
  }], { character, gameUI });

  assert.deepEqual(character.cardState.valdris, { owned: 0, stars: 1, pity: 8 });
  assert.equal(gameUI.inventory.some(item => item.item_name === 'Valdris Card'), false);
});

test('socket listener forwards only the trusted server card_reward event', async () => {
  const source = await readFile(new URL('../../src/network/GameSync.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /socket\.on\('card_reward',\s*\(payload\)\s*=>\s*window\.cardRewardManager\?\.onReward\?\.\(payload\)\)/,
  );
  assert.doesNotMatch(source, /socket\.emit\(['"]card_reward['"]/);
});

test('online login reloads authoritative card rows after legacy inventory migration', async () => {
  const sync = await readFile(new URL('../../src/network/GameSync.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(sync, /export async function loadCharacterCards\(characterId\)/);
  const legacyLoad = main.indexOf('await gameUI.loadInventoryFromDB(charData.id)');
  const authoritativeLoad = main.indexOf('await loadAndMergeAuthoritativeCards(');
  assert.ok(legacyLoad > 0 && authoritativeLoad > legacyLoad);
  assert.match(main, /\(\)\s*=>\s*loadCharacterCards\(charData\.id\)/);
  assert.match(sync, /if \(error\)\s*throw error/);
});
