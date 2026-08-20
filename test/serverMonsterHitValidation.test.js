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

test('same player cannot burst unlimited hits into one monster', () => {
  assert.match(engine, /const HIT_WINDOW_MS = 500/);
  assert.match(engine, /const MAX_HITS_PER_MONSTER_WINDOW = 2/);
  const hit = engine.match(/export function applyHit[\s\S]*?\n\}/)?.[0] || '';
  assert.match(hit, /const charId = player\.characterId;\s*const aggroId = charId \|\| player\.userId/);
  assert.match(hit, /if \(!aggroId\) return/);
  assert.match(hit, /m\.hitCadenceByChar\.get\(aggroId\)/);
  assert.match(hit, /recent\.length >= MAX_HITS_PER_MONSTER_WINDOW/);
  assert.match(hit, /m\.hitCadenceByChar\.set\(aggroId, recent\)/);
});

test('guest hits can arm aggro without entering persisted reward contributors', () => {
  assert.match(engine, /const aggroId = charId \|\| player\.userId/);
  assert.match(engine, /if \(charId\) m\.dmgByChar\.set\(charId/);
  assert.match(engine, /m\.aggroChar = aggroId/);
  assert.match(engine, /p\.characterId === characterId \|\| p\.userId === characterId/);
});

test('hit cadence state is reset for every monster life', () => {
  assert.ok((engine.match(/hitCadenceByChar: new Map\(\)|m\.hitCadenceByChar = new Map\(\)/g) || []).length >= 2);
});
