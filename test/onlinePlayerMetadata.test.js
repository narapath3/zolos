import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeOnlinePlayer } from '../server/securityPolicy.js';
import {
  escapeOnlineText,
  formatOnlinePlayerMeta,
} from '../src/ui/OnlinePlayerMeta.js';

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

test('online metadata formats Thai city, level, and ping boundaries', () => {
  assert.deepEqual(formatOnlinePlayerMeta(
    { mapId: 'payon', level: 42, ping: 79 },
    { isLocal: false, localPing: 5 },
  ), {
    cityLabel: 'ป่าเปยอง',
    levelLabel: 'LV 42',
    pingLabel: '79ms',
    pingClass: 'ping-good',
    isOffline: false,
  });
  assert.equal(
    formatOnlinePlayerMeta({ mapId: 'payon', level: 2, ping: 80 }).pingClass,
    'ping-mid',
  );
  assert.equal(
    formatOnlinePlayerMeta({ mapId: 'payon', level: 2, ping: 160 }).pingClass,
    'ping-bad',
  );
});

test('offline and missing metadata use safe fallbacks', () => {
  assert.deepEqual(formatOnlinePlayerMeta(
    { isOffline: true, mapId: null, level: '?' },
    { isLocal: false, localPing: 20 },
  ), {
    cityLabel: 'ไม่ทราบเมือง',
    levelLabel: 'LV 1',
    pingLabel: 'Offline',
    pingClass: 'ping-offline',
    isOffline: true,
  });
  assert.equal(
    formatOnlinePlayerMeta({ mapId: 'unknown_map', level: 5, ping: null }).pingLabel,
    '--ms',
  );
  assert.equal(
    escapeOnlineText('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;',
  );
});

test('only the local row may use local RTT fallback', () => {
  assert.equal(
    formatOnlinePlayerMeta(
      { level: 1, ping: null },
      { isLocal: true, localPing: 55 },
    ).pingLabel,
    '55ms',
  );
  assert.equal(
    formatOnlinePlayerMeta(
      { level: 1, ping: null },
      { isLocal: false, localPing: 55 },
    ).pingLabel,
    '--ms',
  );
});
