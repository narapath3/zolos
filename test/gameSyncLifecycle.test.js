import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('GameSync releases ping and offline-presence timers when leaving', () => {
  assert.match(source, /let offlineChatInterval = null/);
  assert.match(source, /let clientPingInterval = null/);
  assert.doesNotMatch(source, /window\.__zolosClientPingInterval/);
  assert.match(source, /offlineChatInterval\s*=\s*setInterval\(/);
  assert.match(source, /clientPingInterval\s*=\s*setInterval\(/);

  const leave = source.match(/export function leavePresence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  for (const timer of ['presenceUpdateInterval', 'offlineChatInterval', 'clientPingInterval']) {
    assert.match(leave, new RegExp(`clearInterval\\(${timer}\\)`));
  }
});

test('starting offline presence replaces any previous simulation timers', () => {
  const start = source.match(/function _startOfflineMockPresence\([^)]*\)\s*\{([\s\S]*?)mockPlayers\s*=\s*\[/)?.[1] || '';
  assert.match(start, /clearInterval\(presenceUpdateInterval\)/);
  assert.match(start, /clearInterval\(offlineChatInterval\)/);
});
