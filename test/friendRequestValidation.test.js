import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('friend requests carry correlation IDs and trusted progression', () => {
  assert.match(sync, /const requestId = `friend:/);
  assert.match(server, /pendingFriendRequests\.set/);
  assert.match(server, /senderLevel: sender\.level/);
  assert.match(server, /pending\.requestId !== payload\.requestPayload\.requestId/);
});

test('friend UI ignores malformed and stale responses', () => {
  assert.match(ui, /\^friend:\[A-Za-z0-9:_-\]/);
  assert.match(ui, /typeof payload\.accepted !== 'boolean'/);
  assert.match(ui, /req\.requestId !== this\.pendingFriendRequestId/);
});
