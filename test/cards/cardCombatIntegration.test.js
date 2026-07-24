import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyWorldBossCardEffects, resolveOutgoingCardEffects } from '../../src/cards/CardEffects.js';
import { resolveMonsterDamage } from '../../src/engine/MonsterManager.js';
import { getAllMonsters, getMonsterCombatMeta } from '../../src/engine/GameData.js';
import { CharacterManager } from '../../src/engine/CharacterManager.js';

test('execute bypasses monster defense and never executes bosses', () => {
  const effects = { executePct: 0.1 };
  const execute = resolveOutgoingCardEffects({
    damage: 1, isBoss: false, targetHpRatio: 0.05, targetHp: 5,
  }, effects);
  assert.deepEqual(execute, { damage: 5, execute: true });
  assert.equal(resolveMonsterDamage(execute.damage, 999, { ignoreDefense: execute.execute }), 5);

  const boss = resolveOutgoingCardEffects({
    damage: 1, isBoss: true, targetHpRatio: 0.05, targetHp: 5,
  }, effects);
  assert.deepEqual(boss, { damage: 1, execute: false });
  assert.equal(resolveMonsterDamage(boss.damage, 999, { ignoreDefense: boss.execute }), 1);
});

test('real monster metadata supplies family and boss context', () => {
  assert.deepEqual(getMonsterCombatMeta('savage'), { family: 'beast', isBoss: false, isElite: false });
  assert.deepEqual(getMonsterCombatMeta('dullahan'), { family: 'undead', isBoss: true, isElite: true });
  assert.equal(getAllMonsters().savage.family, 'beast');
  assert.equal(getAllMonsters().dullahan.isBoss, true);
});

test('legacy aggro damage stays at two defense passes before card reduction', () => {
  const character = Object.create(CharacterManager.prototype);
  character.stats = { hp: 500, max_hp: 500, def: 10 };

  const legacyAggroInput = Math.max(1, 100 - Math.floor(10 * 0.3));
  character.getCardEffects = () => ({ damageReduction: 0 });
  assert.equal(character.takeDamage(legacyAggroInput, { preMitigated: true }), 94);

  character.stats.hp = 500;
  character.getCardEffects = () => ({ damageReduction: 0.35 });
  assert.equal(character.takeDamage(legacyAggroInput, { preMitigated: true }), 61);
});

test('world-boss outgoing damage applies boss effects without changing no-card damage', () => {
  assert.equal(applyWorldBossCardEffects({ damage: 100, playerHpRatio: 1 }, {}), 100);
  assert.equal(applyWorldBossCardEffects({ damage: 100, playerHpRatio: 0.2 }, {
    damagePct: 0.1,
    bossDamagePct: 0.2,
    lowHpPower: { threshold: 0.3, value: 0.1 },
  }), 140);
});

test('all live player damage and skill hits use shared card-aware paths', async () => {
  const [characterSource, mainSource] = await Promise.all([
    readFile(new URL('../../src/engine/CharacterManager.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(characterSource, /takeDamage\(amount[\s\S]{0,700}applyIncomingCardEffects/);
  assert.match(mainSource, /applyWorldBossCardEffects/);
  assert.doesNotMatch(characterSource, /currentTarget\.takeDamage\(finalDmg\)/);
  assert.doesNotMatch(characterSource, /m\.takeDamage\(finalDmg\)/);
  assert.match(characterSource, /applyCardDamage\(currentTarget, finalDmg/);
  assert.match(characterSource, /applyCardDamage\(m, finalDmg/);
});
