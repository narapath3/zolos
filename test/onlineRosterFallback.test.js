import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(
  new URL('../src/main.js', import.meta.url),
  'utf8',
);
const gameSyncSource = readFileSync(
  new URL('../src/network/GameSync.js', import.meta.url),
  'utf8',
);

test('map roster remains the compatible UI fallback while socket is connected', () => {
  const joinPresenceStart = mainSource.indexOf('joinPresence(');
  const positionCallbackStart = mainSource.indexOf(
    '        (p) => {',
    joinPresenceStart,
  );
  const playersCallback = mainSource.slice(
    joinPresenceStart,
    positionCallbackStart,
  );

  assert.match(
    playersCallback,
    /if\s*\(gameUI\)\s*\{\s*gameUI\.updateOnlinePlayers\(players\);/s,
  );
  assert.doesNotMatch(
    playersCallback,
    /!isSocketConnected\(\)/,
  );
});

test('global roster remains the preferred cross-map enhancement', () => {
  assert.match(
    gameSyncSource,
    /socket\.on\('players_global',\s*\(players\)\s*=>/,
  );
  assert.match(
    gameSyncSource,
    /window\.gameUI\.updateOnlinePlayers\(players\)/,
  );
});
