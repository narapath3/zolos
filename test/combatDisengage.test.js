import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CombatSystem } from '../src/engine/CombatSystem.js';

function createCharacter() {
  return {
    targetMonster: null,
    state: 'idle',
  };
}

test('manual disengage clears the target, auto target, route state, and attack pose', () => {
  const character = createCharacter();
  const combat = new CombatSystem(character, null, () => {}, null);
  const monster = { alive: true };
  character.targetMonster = monster;
  character.state = 'attacking';
  combat.currentTarget = monster;
  combat.autoSearchTarget = monster;
  combat.autoSearchStuckTime = 2;
  combat.autoRoute = [{ x: 1, z: 2 }];
  combat.autoRouteIndex = 1;
  combat.autoRouteTarget = monster;
  combat.autoRouteReplans = 3;
  combat.autoTargetStuckTime = 2;

  assert.equal(combat.disengageManualCombat(), true);
  assert.equal(character.targetMonster, null);
  assert.equal(combat.currentTarget, null);
  assert.equal(character.state, 'idle');
  assert.equal(combat.autoSearchTarget, null);
  assert.equal(combat.autoSearchStuckTime, 0);
  assert.deepEqual(combat.autoRoute, []);
  assert.equal(combat.autoRouteIndex, 0);
  assert.equal(combat.autoRouteTarget, null);
  assert.equal(combat.autoRouteReplans, 0);
  assert.equal(combat.autoTargetStuckTime, 0);
});

test('manual disengage does not change Auto Bot target tracking', () => {
  const character = createCharacter();
  const combat = new CombatSystem(character, null, () => {}, null);
  const monster = { alive: true };
  character.targetMonster = monster;
  character.state = 'attacking';
  combat.currentTarget = monster;
  combat.autoFarm = true;

  assert.equal(combat.disengageManualCombat(), false);
  assert.equal(character.targetMonster, monster);
  assert.equal(combat.currentTarget, monster);
  assert.equal(character.state, 'attacking');
});

test('movement and click-to-move paths invoke disengage before target tracking can restore autoPath', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const hasManualMove = !!moveDir && \(Math\.abs\(moveDir\.x\) > 0\.08 \|\| Math\.abs\(moveDir\.z\) > 0\.08\);/);
  const movementBlock = main.slice(main.indexOf('if (hasManualMove) {'), main.indexOf('} else if (autoPath', main.indexOf('if (hasManualMove) {')));
  assert.match(movementBlock, /disengageManualCombat\(\);/);
  assert.match(movementBlock, /character\.manualMove/);
  assert.match(main, /if \(character\.targetMonster && !hasManualMove\) \{/);
  assert.match(main, /function disengageManualCombat\(\) \{[\s\S]{0,220}combatSystem\?\.disengageManualCombat\?\.\(\)/);
  assert.match(main, /hit\.type === 'ground'[\s\S]{0,130}disengageManualCombat\(\);/);
});

test('disengage is a no-op when there is no manual target or auto target', () => {
  const character = createCharacter();
  const combat = new CombatSystem(character, null, () => {}, null);
  assert.equal(combat.disengageManualCombat(), false);
  assert.equal(character.targetMonster, null);
  assert.equal(combat.currentTarget, null);
});
