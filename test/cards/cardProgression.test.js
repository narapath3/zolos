import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSION_COSTS, STAR_MULTIPLIERS, fuseCard, previewFusion,
  normalizeCardState, starMultiplier,
} from '../../src/cards/CardProgression.js';

test('fusion consumes 1, 2, 3, and 5 duplicates through five stars', () => {
  let state = { poring: { owned: 12, stars: 1, pity: 0 } };
  for (const expected of [
    { stars: 2, owned: 11 }, { stars: 3, owned: 9 },
    { stars: 4, owned: 6 }, { stars: 5, owned: 1 },
  ]) {
    state = fuseCard(state, 'poring');
    assert.deepEqual(state.poring, { ...expected, pity: 0 });
  }
  assert.deepEqual(FUSION_COSTS, [0, 1, 2, 3, 5]);
  assert.deepEqual(STAR_MULTIPLIERS, [0, 1, 1.08, 1.18, 1.30, 1.45]);
  assert.throws(() => fuseCard(state, 'poring'), /maximum star/);
});

test('failed fusion leaves the original state untouched', () => {
  const state = { poring: { owned: 1, stars: 1, pity: 7 } };
  assert.throws(() => fuseCard(state, 'poring'), /duplicate/);
  assert.deepEqual(state, { poring: { owned: 1, stars: 1, pity: 7 } });
  assert.equal(previewFusion(state, 'poring').canFuse, false);
});

test('normalization clamps malformed values and star multipliers use valid stars', () => {
  assert.deepEqual(normalizeCardState({ poring: { owned: -2.7, stars: 10, pity: '3.9' } }), {
    poring: { owned: 0, stars: 5, pity: 3 },
  });
  assert.equal(starMultiplier(0), 1);
  assert.equal(starMultiplier(99), 1.45);
});
