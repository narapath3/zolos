import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeRemoteAppearance, validateMovement } from '../server/securityPolicy.js';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

test('movement rejects non-finite and impossible world coordinates', () => {
  const prev = { x: 0, y: 1.2, z: 0, mapId: 'prontera' };
  assert.equal(validateMovement(prev, { x: NaN, y: 1, z: 0, mapId: 'prontera' }, 200), false);
  assert.equal(validateMovement(prev, { x: 0, y: Infinity, z: 0, mapId: 'prontera' }, 200), false);
  assert.equal(validateMovement(prev, { x: 501, y: 1, z: 0, mapId: 'prontera' }, 200), false);
  assert.equal(validateMovement(prev, { x: 1, y: 1, z: 1, mapId: 'prontera' }, 200), true);
});

test('position relay stamps identity and bounds high-cost animation fields', () => {
  const pos = server.slice(server.indexOf("socket.on('pos'"), server.indexOf('// --- SHARED MONSTER HP ---'));
  assert.doesNotMatch(pos, /\.\.\.payload/);
  assert.match(pos, /username: self\.username/);
  assert.match(pos, /level: self\.level/);
  assert.match(pos, /PLAYER_MOTION_STATES\.has\(payload\.state\) \? payload\.state : 'idle'/);
  assert.match(pos, /Math\.atan2\(Math\.sin\(payload\.rY\), Math\.cos\(payload\.rY\)\)/);
  assert.match(pos, /Number\.isSafeInteger\(payload\.aseq\)/);
  assert.match(pos, /payload\.aseq !== socket\._lastAttackSequence/);
  assert.match(pos, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'pos_attack', 8, 1000\)/);
  assert.match(pos, /appearanceKey !== socket\._lastAppearanceKey/);
  assert.match(pos, /now - \(socket\._lastAppearanceAt \|\| 0\) >= 5000/);
  assert.match(pos, /socket\._lastAppearanceAt = now/);
  assert.match(pos, /out\.appearance = appearance/);
  const relay = pos.slice(pos.indexOf('const out = {'), pos.indexOf("socket.to(`map:${mapId}`).emit('pos', out)"));
  assert.doesNotMatch(relay, /\by:/);
});

test('remote appearance sanitizer keeps render fields and drops unbounded data', () => {
  const clean = sanitizeRemoteAppearance({
    gender: 'male', bodyColor: 0x123456, petLevel: 999,
    hat: 'H'.repeat(100), petName: 'P'.repeat(80),
    gear: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`slot${i}`, `item${i}`])),
    refine: { weapon: 999, body: 12 }, cards: { weapon: 'poring_card' },
    cardState: { enormous: 'x'.repeat(10000) }, injected: { deep: true },
  });
  assert.equal(clean.gender, 'male');
  assert.equal(clean.bodyColor, 0x123456);
  assert.equal(clean.petLevel, undefined);
  assert.equal(clean.hat.length, 64);
  assert.equal(clean.petName.length, 32);
  assert.equal(Object.keys(clean.gear).length, 16);
  assert.deepEqual(clean.refine, { body: 12 });
  assert.deepEqual(clean.cards, { weapon: 'poring_card' });
  assert.equal(clean.cardState, undefined);
  assert.equal(clean.injected, undefined);
});

test('socket relays require finite positions and effect targets', () => {
  assert.match(server, /if \(Number\.isFinite\(payload\.x\) && Number\.isFinite\(payload\.z\)\)/);
  const skill = server.slice(server.indexOf("socket.on('skill_cast'"), server.indexOf('// --- ATTACK HIT EFFECTS ---'));
  const attack = server.slice(server.indexOf("socket.on('attack_hit'"), server.indexOf('// --- LATENCY PONG ---'));
  for (const handler of [skill, attack]) {
    assert.match(handler, /!Number\.isFinite\(payload\.tx\) \|\| !Number\.isFinite\(payload\.tz\)/);
    assert.match(handler, /const hasTarget = payload\.tx !== undefined \|\| payload\.tz !== undefined/);
  }
  assert.match(server, /const hasCoords = pos && Number\.isFinite\(pos\.x\) && Number\.isFinite\(pos\.z\)/);
});

test('combat visuals are catalogued, range-bound and rate limited before broadcast', () => {
  assert.match(server, /const COMBAT_VISUAL_MAX_RANGE = 14/);
  assert.match(server, /const COMBAT_SKILL_IDS = new Set/);
  assert.match(server, /const COMBAT_WEAPON_CLASSES = new Set/);

  const skill = server.slice(server.indexOf("socket.on('skill_cast'"), server.indexOf('// --- ATTACK HIT EFFECTS ---'));
  assert.match(skill, /COMBAT_SKILL_IDS\.has\(payload\.skillId\)/);
  assert.match(skill, /dx \* dx \+ dz \* dz > COMBAT_VISUAL_MAX_RANGE \* COMBAT_VISUAL_MAX_RANGE/);
  assert.ok(skill.indexOf("shouldRateLimitEvent(socket._rateLimitTracker, 'skill_cast', 8, 1000)") < skill.indexOf("emit('skill_cast', out)"));

  const attack = server.slice(server.indexOf("socket.on('attack_hit'"), server.indexOf('// --- LATENCY PONG ---'));
  assert.match(attack, /COMBAT_WEAPON_CLASSES\.has\(payload\.wsc\) \? payload\.wsc : 'melee'/);
  assert.match(attack, /dx \* dx \+ dz \* dz > COMBAT_VISUAL_MAX_RANGE \* COMBAT_VISUAL_MAX_RANGE/);
  assert.ok(attack.indexOf('COMBAT_VISUAL_MAX_RANGE * COMBAT_VISUAL_MAX_RANGE') < attack.indexOf("emit('attack_hit', out)"));
});

test('only the registered duel loser can report their defeat', () => {
  const duelEnd = server.match(/socket\.on\('duel_end'[\s\S]*?\n    \}\);/)?.[0] || '';
  assert.match(duelEnd, /payload\.winnerUserId === payload\.loserUserId/);
  assert.match(duelEnd, /reporter\.userId !== payload\.loserUserId/);
  assert.doesNotMatch(duelEnd, /!pair\.includes\(reporter\.userId\)/);
});
