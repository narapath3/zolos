import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const character = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');

test('duel hits are finite, positive and stamped with the active duel ID', () => {
  const handler = server.slice(server.indexOf("socket.on('duel_hit'"), server.indexOf("socket.on('duel_end'"));
  assert.match(handler, /Number\.isFinite\(damage\) \|\| damage <= 0/);
  assert.match(handler, /payload\.duelId !== duel\.duelId/);
  assert.match(handler, /duelId: duel\.duelId/);
  assert.match(handler, /targetUserId: opponentId/);
  assert.match(handler, /critical: payload\.critical === true/);
});

test('client ignores stale duel hits and results from another round', () => {
  assert.match(main, /onDuelHit\(payload\)[\s\S]*payload\.duelId !== duelState\.duelId/);
  assert.match(main, /onDuelResult\(payload\)[\s\S]*payload\.duelId !== duelState\.duelId/);
  assert.match(main, /!Number\.isFinite\(dmg\) \|\| dmg <= 0 \|\| dmg > 5000/);
});

test('client reports one defeat and ignores queued hits while settlement is pending', () => {
  const start = main.slice(main.indexOf('onDuelStart(payload)'), main.indexOf('onDuelResult(payload)'));
  assert.match(start, /defeatReported: false/);
  assert.match(start, /duelState\.defeatReported \|\| !payload/);
  assert.match(start, /!character\.isAlive\(\)\) return/);
  assert.match(start, /duelState\.defeatReported = true/);
  assert.match(start, /const defeatedDuel = duelState/);
  assert.match(start, /reportDuelEnd\(payload\.attackerUserId \|\| defeatedDuel\.opponentUserId, userId\)/);
  assert.equal((start.match(/reportDuelEnd\(/g) || []).length, 1);
});

test('duel hit packets carry the encounter ID and exact recipient end to end', () => {
  assert.match(sync, /sendDuelHit\(duelId, targetUserId, damage, critical = false\)/);
  const sender = sync.slice(sync.indexOf('export function sendDuelHit'), sync.indexOf('export function reportDuelEnd'));
  assert.match(sender, /socket\.emit\('duel_hit', \{\s*duelId,\s*targetUserId,/);
  assert.doesNotMatch(sender, /attackerUserId:/);
  assert.match(main, /sendDuelHit\(activeDuel\.duelId, activeDuel\.opponentUserId, dmg, isCritical\)/);
  assert.match(sync, /payload\.targetUserId === currentUserId[\s\S]*onDuelHit/);
});

test('every normal and skill duel hit call uses the current encounter ID', () => {
  const calls = [...`${main}\n${character}`.matchAll(/sendDuelHit\(([^\n]+)\)/g)].map(match => match[1]);
  assert.equal(calls.length, 3);
  for (const args of calls) {
    assert.match(args, /activeDuel\.duelId, activeDuel\.opponentUserId/);
  }
  assert.equal((character.match(/const activeDuel = window\.duelState/g) || []).length, 2);
});

test('duels start on one map and use trusted positions for hit range', () => {
  const response = server.slice(server.indexOf("socket.on('duel_response'"), server.indexOf("socket.on('duel_hit'"));
  const hit = server.slice(server.indexOf("socket.on('duel_hit'"), server.indexOf("socket.on('duel_end'"));

  assert.match(server, /const DUEL_MAX_HIT_RANGE = 12/);
  assert.match(response, /challenger\.mapId !== accepter\.mapId/);
  assert.match(response, /reason: 'different_map'/);
  assert.match(response, /challenger\.lastPos = \{ x: -17, y: 1\.2, z: 14/);
  assert.match(response, /accepter\.lastPos = \{ x: -11, y: 1\.2, z: 14/);
  assert.match(hit, /opponent\.mapId !== attacker\.mapId/);
  assert.match(hit, /!Number\.isFinite\(attackerPos\.x\)/);
  assert.match(hit, /duelDx \* duelDx \+ duelDz \* duelDz > DUEL_MAX_HIT_RANGE \* DUEL_MAX_HIT_RANGE/);
  assert.ok(hit.indexOf('DUEL_MAX_HIT_RANGE * DUEL_MAX_HIT_RANGE') < hit.indexOf("shouldRateLimitEvent(socket._rateLimitTracker, 'duel_hit'"));
});

test('disconnect removes pending friend requests in both directions', () => {
  const disconnect = server.slice(server.indexOf("socket.on('disconnect'"));
  assert.match(disconnect, /for \(const key of pendingFriendRequests\.keys\(\)\)/);
  assert.match(disconnect, /pendingFriendRequests\.delete\(key\)/);
});
