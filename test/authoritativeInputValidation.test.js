import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateMovement } from '../server/securityPolicy.js';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

test('movement rejects non-finite and impossible world coordinates', () => {
  const prev = { x: 0, y: 1.2, z: 0, mapId: 'prontera' };
  assert.equal(validateMovement(prev, { x: NaN, y: 1, z: 0, mapId: 'prontera' }, 200), false);
  assert.equal(validateMovement(prev, { x: 0, y: Infinity, z: 0, mapId: 'prontera' }, 200), false);
  assert.equal(validateMovement(prev, { x: 501, y: 1, z: 0, mapId: 'prontera' }, 200), false);
  assert.equal(validateMovement(prev, { x: 1, y: 1, z: 1, mapId: 'prontera' }, 200), true);
});

test('socket relays require finite positions and effect targets', () => {
  assert.match(server, /if \(Number\.isFinite\(payload\.x\) && Number\.isFinite\(payload\.z\)\)/);
  assert.equal((server.match(/Number\.isFinite\(payload\.tx\) && Number\.isFinite\(payload\.tz\)/g) || []).length, 2);
  assert.match(server, /const hasCoords = pos && Number\.isFinite\(pos\.x\) && Number\.isFinite\(pos\.z\)/);
});

test('only the registered duel loser can report their defeat', () => {
  const duelEnd = server.match(/socket\.on\('duel_end'[\s\S]*?\n    \}\);/)?.[0] || '';
  assert.match(duelEnd, /payload\.winnerUserId === payload\.loserUserId/);
  assert.match(duelEnd, /reporter\.userId !== payload\.loserUserId/);
  assert.doesNotMatch(duelEnd, /!pair\.includes\(reporter\.userId\)/);
});
