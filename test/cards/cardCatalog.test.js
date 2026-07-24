import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_CATALOG, CARD_BY_ID, CARD_BY_ITEM_NAME,
  getCard, getCardsBySource,
} from '../../src/cards/CardCatalog.js';
import { ITEMS } from '../../src/engine/GameData.js';
import { readFile } from 'node:fs/promises';

const validRarities = new Set(['common', 'rare', 'epic', 'legendary', 'mythic']);
const validSlots = new Set(['weapon', 'armor', 'shield', 'accessory']);
const supportedEffects = new Set([
  'damagePct', 'critBonus', 'lifestealPct', 'damageToFamily',
  'damageReduction', 'onKillRestore', 'executePct', 'lowHpPower',
  'bossDamagePct', 'dropRatePct',
]);

test('catalog contains 60 unique cards and 12 of each rarity', () => {
  assert.equal(CARD_CATALOG.length, 60);
  assert.equal(new Set(CARD_CATALOG.map(card => card.id)).size, 60);
  assert.deepEqual(
    Object.fromEntries([...validRarities].map(rarity => [
      rarity, CARD_CATALOG.filter(card => card.rarity === rarity).length,
    ])),
    { common: 12, rare: 12, epic: 12, legendary: 12, mythic: 12 },
  );
});

test('every card has a complete valid record and lookup', () => {
  for (const card of CARD_CATALOG) {
    assert.ok(validRarities.has(card.rarity));
    assert.ok(validSlots.has(card.slot));
    assert.match(card.collectionNo, /^[CRELM]-\d{2}$/);
    assert.match(card.art, /^\/assets\/cards\/[a-z0-9_]+\.webp$/);
    assert.equal(CARD_BY_ID.get(card.id), card);
    assert.equal(CARD_BY_ITEM_NAME.get(card.itemName), card);
    assert.equal(getCard(card.id), card);
    assert.equal(getCard(card.itemName), card);
    assert.ok(card.abilityName && card.lore && card.source.label);
    assert.ok(card.source.chance > 0 && card.source.pity > 0);
    if (card.effect) assert.ok(supportedEffects.has(card.effect.type));
  }
});

test('owner-source lookup returns only the matching source', () => {
  assert.deepEqual(
    getCardsBySource('monster', 'poring').map(card => card.id),
    ['poring'],
  );
});

test('world-boss cards use the resolver source kind', () => {
  assert.deepEqual(
    getCardsBySource('world_boss', 'valdris').map(card => card.id),
    ['valdris'],
  );
});

test('legacy card aliases remain valid item registry entries', () => {
  for (const [itemName, cardId] of [
    ['Andre Card', 'willow'], ['Pupa Card', 'dragon_egg'],
    ['Vadon Card', 'crab'], ['Sohee Card', 'golem'],
    ['Goblin Card', 'deviruchi'], ['Mantis Card', 'harpy'],
  ]) {
    assert.equal(ITEMS[itemName]?.cardId, cardId);
  }
});

test('the client no longer imports or rolls the deleted legacy boss-card function', async () => {
  const source = await readFile(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /rollBossCards/);
});
