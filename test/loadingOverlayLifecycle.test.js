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

test('loading failure stops all hidden overlay work through its public lifecycle', () => {
  assert.match(source, /hide\(\)\s*\{[\s\S]*this\._stopActivity\(\)/);
  assert.match(source, /_stopActivity\(\)\s*\{[\s\S]*cancelAnimationFrame\(this\._animationFrame\)[\s\S]*clearInterval\(this\._tipInterval\)[\s\S]*clearTimeout\(this\._tipTimeout\)/);
  assert.match(source, /if \(!this\._isVisible\) return;[\s\S]*this\.tipIconEl\.innerHTML/);
});

test('loading overlay owns and removes its resize listener', () => {
  assert.match(source, /this\._boundResize\s*=\s*\(\)\s*=>\s*this\._resizeCanvas\(\)/);
  assert.match(source, /addEventListener\('resize', this\._boundResize\)/);
  assert.match(source, /removeEventListener\('resize', this\._boundResize\)/);
});

test('character load failure uses LoadingOverlay hide instead of bypassing lifecycle', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const failureHandler = main.match(/function showCharacterLoadError\(error\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(failureHandler, /loadingOverlay\.hide\(\)/);
  assert.doesNotMatch(failureHandler, /introOv\.style\.display/);
});
