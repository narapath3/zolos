import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const updater = fs.readFileSync(new URL('../src/engine/UpdateChecker.js', import.meta.url), 'utf8');

test('every build injects a production timestamp into code and HTML', () => {
  assert.match(vite, /const buildTime = new Date\(\)\.toISOString\(\)/);
  assert.match(vite, /__ZOLOS_BUILD_TIME__/);
  assert.match(vite, /name: 'zolos-build-time'/);
});

test('deploy time stays available for diagnostics and update notices without a startup badge', () => {
  assert.match(main, /timeZone: 'Asia\/Bangkok'/);
  assert.match(updater, /zolos-build-time/);
  assert.match(updater, /showUpdateBanner\(latest\.buildTime\)/);
  assert.doesNotMatch(main, /zolos-build-stamp/);
});
