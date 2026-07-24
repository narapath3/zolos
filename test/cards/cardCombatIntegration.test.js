import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveOutgoingCardEffects } from '../../src/cards/CardEffects.js';
import { resolveMonsterDamage } from '../../src/engine/MonsterManager.js';
import { getAllMonsters, getMonsterCombatMeta } from '../../src/engine/GameData.js';

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

test('all live player damage and skill hits use shared card-aware paths', async () => {
  const [characterSource, mainSource] = await Promise.all([
    readFile(new URL('../../src/engine/CharacterManager.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(characterSource, /takeDamage\(amount[\s\S]{0,700}applyIncomingCardEffects/);
  assert.doesNotMatch(mainSource, /const def = character\.stats\.def/);
  assert.equal((mainSource.match(/character\.takeDamage\(/g) || []).length, 3);
  assert.doesNotMatch(characterSource, /currentTarget\.takeDamage\(finalDmg\)/);
  assert.doesNotMatch(characterSource, /m\.takeDamage\(finalDmg\)/);
  assert.match(characterSource, /applyCardDamage\(currentTarget, finalDmg/);
  assert.match(characterSource, /applyCardDamage\(m, finalDmg/);
});
