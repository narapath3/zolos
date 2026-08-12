import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/LoadingOverlay.js', import.meta.url), 'utf8');

test('loading overlay keeps only one animation loop and stale hide timer', () => {
  assert.match(source, /show\(\)\s*\{[\s\S]*cancelAnimationFrame\(this\._animationFrame\)/);
  assert.match(source, /show\(\)\s*\{[\s\S]*clearTimeout\(this\._hideTimeout\)/);
  assert.match(source, /this\._animationFrame\s*=\s*null/);
  assert.match(source, /this\._hideTimeout\s*=\s*setTimeout\(/);
  assert.match(source, /if \(this\._isVisible\) return/);
});
