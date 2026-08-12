import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adaptive = fs.readFileSync(new URL('../src/engine/AdaptiveRendererSystem.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('adaptive quality measures actual rendered frames over elapsed time', () => {
  assert.match(adaptive, /recordFrame\(\) \{[\s\S]*this\.frameCount\+\+/);
  assert.match(adaptive, /this\.fps = Math\.round\(\(this\.frameCount \* 1000\) \/ elapsed\)/);
  assert.match(main, /window\.rendererSystem\?\.recordFrame\?\.\(time\)/);
  assert.doesNotMatch(adaptive, /this\.frameCount\+\+;\s*\n\s*if \(this\.frameCount >= 60\)/);
});

test('quality changes require stable samples and renderer replacement stops old monitor', () => {
  assert.match(adaptive, /this\.qualityCandidateSamples < \(isUpgrade \? 3 : 2\)/);
  assert.match(main, /window\.rendererSystem\?\.stop\?\.\(\)/);
  assert.match(adaptive, /this\.performanceInterval = null/);
});

test('shadow map replacement disposes the previous render target', () => {
  assert.match(adaptive, /child\.shadow\.map\?\.dispose\?\.\(\)/);
  assert.match(adaptive, /this\.scene\.traverse\(\(child\) =>/);
});

test('quality settings control the real composer render path and its resolution', () => {
  const scene = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
  assert.match(adaptive, /composer\?\.setPixelRatio\?\.\(this\.pixelRatio\)/);
  assert.match(adaptive, /sceneManager\.postProcessingEnabled = this\.postProcessing/);
  assert.match(scene, /this\.composer && this\.postProcessingEnabled !== false/);
  assert.match(main, /sceneManager\.scene,\s*\n\s*sceneManager/);
});
