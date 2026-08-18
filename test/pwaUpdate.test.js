import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const pwa = fs.readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8');

test('service worker rotates the cache for iOS shop-label updates', () => {
  assert.match(sw, /const CACHE = 'zolos-cache-v3-ios-shop-label'/);
  assert.match(sw, /ZOLOS_SKIP_WAITING/);
  assert.match(sw, /self\.skipWaiting\(\)/);
});

test('PWA registration bypasses stale service-worker script cache and activates updates', () => {
  assert.match(pwa, /updateViaCache: 'none'/);
  assert.match(pwa, /await registration\.update\(\)/);
  assert.match(pwa, /registration\.waiting\.postMessage/);
  assert.match(pwa, /worker\.postMessage\(\{ type: 'ZOLOS_SKIP_WAITING' \}\)/);
  assert.match(pwa, /navigator\.serviceWorker\.addEventListener\('controllerchange', activate/);
  assert.match(pwa, /window\.location\.reload\(\)/);
});
