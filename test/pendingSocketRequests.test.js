import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('disconnect immediately rejects and clears every correlated socket request', () => {
  const rejectMap = source.match(/function rejectPendingMap\(map, message\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(rejectMap, /clearTimeout\(pending\.timeout\)/);
  assert.match(rejectMap, /pending\.reject\(new Error\(message\)\)/);
  assert.match(rejectMap, /map\.clear\(\)/);

  const rejectAll = source.match(/function rejectPendingSocketRequests\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  for (const map of ['pendingOreConversions', 'pendingPetPurchases', 'pendingCardFusions', 'pendingCardRefines']) {
    assert.match(rejectAll, new RegExp(`rejectPendingMap\\(${map}, message\\)`));
  }
  assert.match(source, /socket\.on\('disconnect', rejectPendingSocketRequests\)/);
});

test('manual presence leave also releases pending request state', () => {
  const leave = source.match(/export function leavePresence\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(leave, /rejectPendingSocketRequests\(\)/);
  assert.ok(leave.indexOf('rejectPendingSocketRequests()') < leave.indexOf('disconnectSocket()'));
});
