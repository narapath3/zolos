import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('ore and pet economy responses are schema checked before resolving UI state', () => {
  assert.match(source, /function isCommittedOreConversion\(result\)/);
  assert.match(source, /if \(!isCommittedOreConversion\(result\)\) \{[\s\S]*pending\.reject/);
  assert.match(source, /function isCommittedPetPurchase\(result\)/);
  assert.match(source, /if \(!isCommittedPetPurchase\(result\)\) \{[\s\S]*pending\.reject/);
  assert.match(source, /result\.stats\.instances\.length === result\.quantity/);
});

test('card refine accepts only committed bounded server results', () => {
  assert.match(source, /function isCommittedCardRefineResult\(result\)/);
  assert.match(source, /if \(!isCommittedCardRefineResult\(result\)\) \{[\s\S]*pending\.reject/);
  assert.match(source, /Number\.isInteger\(result\.stardust\) && result\.stardust >= 0/);
});
