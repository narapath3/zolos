import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('trade relay validates bounded payloads and stamps trusted character identity', () => {
  assert.match(server, /const isSafeTradeRequest =/);
  assert.match(server, /Number\.isInteger\(payload\.quantity\).*payload\.quantity >= 1/);
  assert.match(server, /Number\.isSafeInteger\(payload\.price\).*payload\.price >= 0/);
  assert.match(server, /relayRequest\('trade_request', \{ \.\.\.payload, senderCharacterId: sender\.characterId \}/);
  assert.match(server, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'trade_request'/);
});

test('trade receiver rejects unknown or malformed inventory mutations', () => {
  assert.match(ui, /const knownItem = itemType === 'card' \? getCard\(itemName\) : ITEMS\[itemName\]/);
  assert.match(ui, /!Number\.isInteger\(payload\.quantity\) \|\| payload\.quantity < 1/);
  assert.match(sync, /throw new Error\('Invalid incoming trade payload'\)/);
});

test('trade cancellation is correlated to the active request', () => {
  assert.match(ui, /requestId: this\.pendingTradeRequestId/);
  assert.match(ui, /cancelledId === activeId/);
  assert.match(server, /isTradeId\(payload\?\.requestPayload\?\.requestId\)/);
});
