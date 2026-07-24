import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCardEffects, applyOutgoingCardEffects,
  applyIncomingCardEffects, applyOnKillCardEffects,
} from '../../src/cards/CardEffects.js';

test('numeric stats scale with stars and duplicate socket IDs count once', () => {
  const effects = aggregateCardEffects({
    equippedCards: { body: 'poring', head: 'poring', weapon: 'willow' },
    cardState: { poring: { owned: 12, stars: 5, pity: 0 }, willow: { owned: 1, stars: 1, pity: 0 } },
  });
  assert.equal(effects.stats.hpBonus, Math.round(80 * 1.45));
  assert.equal(effects.stats.atkBonus, 8);
});

test('conditional effects respect boss, family, health, execute, and caps', () => {
  const effects = {
    damagePct: 0.12, bossDamagePct: 0.14, damageToFamily: { beast: 0.08 },
    executePct: 0.05, lowHpPower: { threshold: 0.3, value: 0.14 },
    damageReduction: 0.9, onKillRestore: { hp: 20, sp: 20 },
  };
  assert.equal(applyOutgoingCardEffects({ damage: 100, isBoss: true, family: 'beast', playerHpRatio: 0.2, targetHpRatio: 1 }, effects), 148);
  assert.equal(applyOutgoingCardEffects({ damage: 1, isBoss: false, family: 'undead', playerHpRatio: 1, targetHpRatio: 0.04, targetHp: 500 }, effects), 500);
  assert.equal(applyIncomingCardEffects({ damage: 100 }, effects), 65);
  assert.deepEqual(applyOnKillCardEffects({ hp: 90, maxHp: 100, sp: 5, maxSp: 20 }, effects), { hp: 100, sp: 20 });
});

test('aggregation caps stacked effects and includes declarative stat effects', () => {
  const effects = aggregateCardEffects({
    equippedCards: {
      accessory: 'lunatic', ring: 'nine_tail', wrist: 'ghostring_prime',
      garment: 'fenrir', feet: 'maya', body: 'drake', weapon: 'dullahan',
      shield: 'emperium_avatar', head: 'abyss_golem', glasses: 'golden_thief_bug',
      pants: 'odins_echo', hat: 'archer_skeleton', armor: 'storm_dragon', cloak: 'valkyrie',
    },
    cardState: Object.fromEntries([
      'lunatic', 'nine_tail', 'ghostring_prime', 'fenrir', 'maya', 'drake',
      'dullahan', 'emperium_avatar', 'abyss_golem', 'golden_thief_bug',
      'odins_echo', 'archer_skeleton', 'storm_dragon', 'valkyrie',
    ].map(id => [id, { owned: 1, stars: 5, pity: 0 }])),
  });
  assert.equal(effects.critBonus, 0.5);
  assert.equal(effects.damageReduction, 0.35);
  assert.equal(effects.executePct, 0.05 * 1.45);
  assert.equal(effects.dropRatePct, 0.05 * 1.45);
});
