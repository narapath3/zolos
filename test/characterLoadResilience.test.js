import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/network/ZolosApiClient.js', import.meta.url), 'utf8');

test('character loading retries safely with progress and one in-flight guard', () => {
  assert.match(main, /const waits = \[0, 650, 1600\]/);
  assert.match(main, /if \(characterLoadInFlight\) return characterLoadInFlight/);
  assert.match(main, /loadCharacterResilient\(\)/);
  assert.match(main, /refreshSession/);
});

test('character query times out in both Supabase and self-host modes', () => {
  assert.match(sync, /AbortSignal\.timeout\(8000\)/);
  assert.match(sync, /query\.abortSignal\(timeoutSignal\)/);
  assert.match(api, /abortSignal\(signal\) \{ this\._signal = signal/);
  assert.match(api, /signal: this\._signal/);
});

test('failure UI reconnects without destructive page reload', () => {
  const failureUi = main.slice(main.indexOf('function retryCharacterLoadNow()'), main.indexOf('// ============ Input Handling'));
  assert.match(failureUi, /setTimeout\(retryCharacterLoadNow, 6000\)/);
  assert.match(failureUi, /window\.addEventListener\('online'/);
  assert.match(failureUi, /ลองเชื่อมต่อทันที/);
  assert.doesNotMatch(failureUi, /location\.reload/);
});
