import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const character = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('single-target skills report non-zero damage to server-owned monsters', () => {
  const skills = character.match(/useSkill\(skillId[\s\S]*?\n    loadStats\(/)?.[0] || '';
  assert.match(skills, /serverOwned[\s\S]*resolveCardDamage\(currentTarget, finalDmg\)\.damage/);
  assert.match(skills, /effectCallback\(skillId, currentTarget, actualDmg, \{ serverOwned/);
  assert.doesNotMatch(skills, /const actualDmg = this\.applyCardDamage\(currentTarget, finalDmg\);/);
});

test('AoE skills relay each server-owned monster through the normal hit pipeline', () => {
  const skills = character.match(/physical_aoe[\s\S]*?\} else if \(skill\.type === 'heal'/)?.[0] || '';
  assert.match(skills, /resolveCardDamage\(m, finalDmg\)\.damage/);
  assert.match(skills, /effectCallback\(skillId, m, actualDmg, \{ serverOwned/);
  assert.match(ui, /combatSystem\?\.onMonsterDamaged\?\.\(hitTarget\.id, dmg/);
  assert.match(main, /onMonsterDamaged = \(monsterId, damage[\s\S]*reportMonsterHit\(monsterId, damage/);
});
