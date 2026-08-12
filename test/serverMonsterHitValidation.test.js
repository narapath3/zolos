import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const engine = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');

test('authoritative monster hits require a finite same-map player position', () => {
  const hit = engine.match(/export function applyHit[\s\S]*?\n\}/)?.[0] || '';
  assert.match(hit, /const pos = player\.lastPos/);
  assert.match(hit, /!pos \|\| pos\.mapId !== mapId/);
  assert.match(hit, /!Number\.isFinite\(pos\.x\) \|\| !Number\.isFinite\(pos\.z\)/);
});

test('authoritative monster hits are bounded to current skill range plus latency tolerance', () => {
  assert.match(engine, /const MAX_PLAYER_HIT_RANGE = 12/);
  const hit = engine.match(/export function applyHit[\s\S]*?\n\}/)?.[0] || '';
  assert.match(hit, /dx \* dx \+ dz \* dz > MAX_PLAYER_HIT_RANGE \* MAX_PLAYER_HIT_RANGE/);
  assert.ok(hit.indexOf('MAX_PLAYER_HIT_RANGE * MAX_PLAYER_HIT_RANGE') < hit.indexOf('clampMonsterDamage'));
});
