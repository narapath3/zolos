import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCardDrops } from '../../src/cards/CardDrops.js';
import { MonsterManager } from '../../src/engine/MonsterManager.js';

test('only the named owner card is eligible and a success resets its pity', () => {
  const result = resolveCardDrops({
    source: { kind: 'monster', id: 'poring' },
    cardState: { poring: { owned: 0, stars: 1, pity: 12 } },
    random: () => 0,
  });
  assert.deepEqual(result.drops, ['poring']);
  assert.deepEqual(result.cardState.poring, { owned: 1, stars: 1, pity: 0 });
});

test('pity guarantees the eligible card and failures increment only it', () => {
  const fail = resolveCardDrops({
    source: { kind: 'monster', id: 'poring' },
    cardState: { poring: { owned: 1, stars: 1, pity: 98 } },
    random: () => 0.999,
  });
  assert.equal(fail.drops.length, 0);
  assert.equal(fail.cardState.poring.pity, 99);
  const pity = resolveCardDrops({
    source: { kind: 'monster', id: 'poring' }, cardState: fail.cardState, random: () => 0.999,
  });
  assert.deepEqual(pity.drops, ['poring']);
});

test('MVP and drop bonuses never exceed twice the base chance', () => {
  const result = resolveCardDrops({
    source: { kind: 'world_boss', id: 'valdris' }, cardState: {},
    isMvp: true, dropRatePct: 9, eligible: true, random: () => 0.0069,
  });
  assert.equal(result.rolls[0].chance, 0.007);
  assert.deepEqual(result.drops, ['valdris']);
});

test('ineligible contributor receives no roll or pity', () => {
  assert.deepEqual(resolveCardDrops({
    source: { kind: 'world_boss', id: 'valdris' },
    cardState: {}, eligible: false, random: () => 0,
  }).rolls, []);
});

test('does not mutate the supplied card state', () => {
  const cardState = { poring: { owned: 1, stars: 2, pity: 4 } };
  resolveCardDrops({
    source: { kind: 'monster', id: 'poring' }, cardState, random: () => 0,
  });
  assert.deepEqual(cardState, { poring: { owned: 1, stars: 2, pity: 4 } });
});

test('requires callers to inject randomness', () => {
  assert.throws(() => resolveCardDrops({
    source: { kind: 'monster', id: 'poring' }, cardState: {},
  }), /random function/);
});

test('monster respawn queue resolves each local death once with contribution eligibility', () => {
  const manager = Object.create(MonsterManager.prototype);
  manager.deadQueue = [];
  const events = [];
  manager.onMonsterDeath = (monster, context) => events.push({ monster, context });
  const monster = { isWaterMonster: false, spawnIndex: 0, _localContributed: true };

  manager.queueRespawn(monster);
  manager.queueRespawn(monster);

  assert.deepEqual(events, [{ monster, context: { eligible: true } }]);
});
