import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('trade requests carry a unique correlation id through online and offline envelopes', () => {
  assert.match(sync, /const requestId = `trade:/);
  assert.equal((sync.match(/, requestId/g) || []).length >= 3, true);
  assert.match(sync, /return \{ success: true, requestId \}/);
});

test('trade responses are validated before clearing the active wait state', () => {
  const method = ui.slice(ui.indexOf('async receiveTradeResponse(payload)'), ui.indexOf('// ============ Daily Quest System'));
  assert.match(method, /const req = payload\?\.requestPayload/);
  assert.match(method, /typeof payload\.accepted !== 'boolean'/);
  assert.match(method, /req\.requestId !== this\.pendingTradeRequestId/);
  assert.ok(method.indexOf('req.requestId !== this.pendingTradeRequestId') < method.indexOf('clearTimeout(this.tradeTimeout)'));
});

test('closing or timing out a trade clears its correlation state', () => {
  assert.ok((ui.match(/this\.pendingTradeRequestId = null/g) || []).length >= 5);
});
