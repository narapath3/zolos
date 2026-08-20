import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');

test('server monster simulation enforces the same terrain categories as clients', () => {
  assert.match(engine, /const environmentAt = \(mapId, x, z\) => \{[\s\S]*return 'water'[\s\S]*return 'cave'[\s\S]*return 'mountain'[\s\S]*return 'ground'/);
  assert.doesNotMatch(engine, /mapId === 'prontera' && x [<>] -?6/);
  assert.match(engine, /const required = m\.isWater \? 'water' : \(def\?\.environment \|\| 'ground'\)/);
  assert.match(engine, /return environmentAt\(mapId, x, z\) === required/);
});

test('server validates both chase and wander steps and cannot overshoot targets', () => {
  const step = engine.match(/function stepMonster[\s\S]*?\n\}/)?.[0] || '';
  const occupancyChecks = (step.match(/canMonsterOccupy\(|canMonsterChaseOccupy\(/g) || []).length;
  assert.ok(occupancyChecks >= 3);
  assert.ok((step.match(/Math\.min\(dist,/g) || []).length >= 2);
  assert.match(step, /m\.aggroChar = null;[\s\S]*m\.targetX = m\.spawnX/);
  assert.match(step, /if \(!canMonster(?:Occupy|ChaseOccupy)\(m, mapId, nextX, nextZ(?:, def)?\)\) \{/);
});
