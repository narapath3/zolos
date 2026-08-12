import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('duel challenges use trusted identity and correlated request state', () => {
  assert.match(sync, /const requestId = `duel:/);
  assert.match(server, /pendingDuelChallenges\.set[\s\S]*requestId: payload\.requestId/);
  assert.match(server, /pending\.requestId !== payload\.requestId/);
  assert.match(server, /senderLevel: sender\.level/);
  assert.match(server, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'duel_request'/);
});

test('busy duel acceptance is rejected before a positive response is relayed', () => {
  const handler = server.slice(server.indexOf("socket.on('duel_response'"), server.indexOf("socket.on('duel_hit'"));
  const busy = handler.indexOf("reason: 'busy'");
  const positiveRelay = handler.lastIndexOf("relayResponse('duel_response', payload");
  assert.ok(busy >= 0 && positiveRelay > busy);
});

test('duel UI ignores malformed or stale responses', () => {
  assert.match(ui, /\^duel:\[A-Za-z0-9:_-\]/);
  assert.match(ui, /payload\.requestId !== this\.pendingDuelRequestId/);
  assert.match(ui, /sendDuelResponse\(payload\.senderUserId, accepted, payload\.requestId\)/);
});
