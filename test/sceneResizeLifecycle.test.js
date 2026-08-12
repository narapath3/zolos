import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scene = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('scene resize follows mobile visual viewport and container changes', () => {
  assert.match(scene, /window\.visualViewport\?\.addEventListener\?\.\('resize', this\._boundResize/);
  assert.match(scene, /new ResizeObserver\(this\._boundResize\)/);
  assert.match(scene, /this\._resizeObserver\.observe\(this\.canvas\.parentElement\)/);
  assert.match(scene, /w < 1 \|\| h < 1\) return/);
});

test('scene resize listeners have an owned teardown lifecycle', () => {
  assert.match(scene, /destroyResizeHandling\(\)/);
  assert.match(scene, /window\.removeEventListener\('resize', this\._boundResize\)/);
  assert.match(scene, /this\._resizeObserver\?\.disconnect\?\.\(\)/);
  assert.match(main, /sceneManager\?\.destroyResizeHandling\?\.\(\)/);
});
