import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

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

test('duel hit packets carry the encounter ID and exact recipient end to end', () => {
  assert.match(sync, /sendDuelHit\(duelId, targetUserId, damage, critical = false\)/);
  const sender = sync.slice(sync.indexOf('export function sendDuelHit'), sync.indexOf('export function reportDuelEnd'));
  assert.match(sender, /socket\.emit\('duel_hit', \{\s*duelId,\s*targetUserId,/);
  assert.doesNotMatch(sender, /attackerUserId:/);
  assert.match(main, /sendDuelHit\(activeDuel\.duelId, activeDuel\.opponentUserId, dmg, isCritical\)/);
  assert.match(sync, /payload\.targetUserId === currentUserId[\s\S]*onDuelHit/);
});

test('disconnect removes pending friend requests in both directions', () => {
  const disconnect = server.slice(server.indexOf("socket.on('disconnect'"));
  assert.match(disconnect, /for \(const key of pendingFriendRequests\.keys\(\)\)/);
  assert.match(disconnect, /pendingFriendRequests\.delete\(key\)/);
});
