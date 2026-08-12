import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('rejoining presence on the same socket does not attach the main listener set twice', () => {
  const join = source.slice(source.indexOf('export async function joinPresence'), source.indexOf('export function broadcastPosition'));
  assert.doesNotMatch(join.slice(0, join.indexOf('// Store player info')), /socketListenersAttached\s*=\s*false/);
  assert.match(join, /if \(!socketListenersAttached \|\| socketListenersOwner !== socket\)/);
  assert.match(join, /socketListenersOwner\s*=\s*socket/);
});

test('presence event handlers use replaceable callbacks instead of stale join closures', () => {
  assert.match(source, /playerPositionCallback\s*=\s*onPlayerPositionUpdate/);
  assert.match(source, /if \(playerPositionCallback && payload && payload\.userId !== currentUserId\)/);
  assert.match(source, /playerPositionCallback\(payload\)/);
  assert.match(source, /leavePresence\(\)[\s\S]*playerPositionCallback\s*=\s*null/);
});

test('reconnect join emits the latest module-owned identity and character', () => {
  assert.match(source, /currentCharacterId\s*=\s*characterId/);
  assert.match(source, /socket\.emit\('join', \{ userId: currentUserId, username: currentUsername, level: liveLevel, mapId: liveMap, characterId: currentCharacterId/);
  assert.match(source, /leavePresence\(\)[\s\S]*currentCharacterId\s*=\s*null/);
});
