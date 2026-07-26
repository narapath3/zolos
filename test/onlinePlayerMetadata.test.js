import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeOnlinePlayer } from '../server/securityPolicy.js';

test('online roster serializer includes trusted metadata', () => {
  assert.deepEqual(serializeOnlinePlayer({
    userId: 'u1',
    username: 'Hero',
    level: 42,
    mapId: 'payon',
    device: 'mobile',
    ping: 78.6,
    characterId: 'c1',
  }), {
    userId: 'u1',
    username: 'Hero',
    level: 42,
    mapId: 'payon',
    device: 'mobile',
    ping: 79,
    characterId: 'c1',
  });
});

test('online roster serializer normalizes missing and invalid values', () => {
  assert.deepEqual(serializeOnlinePlayer({
    username: '<img>',
    level: -10,
    mapId: '../bad',
    device: 'watch',
    ping: -5,
  }), {
    userId: null,
    username: '<img>',
    level: 1,
    mapId: 'prontera_field',
    device: 'desktop',
    ping: null,
    characterId: null,
  });
});
