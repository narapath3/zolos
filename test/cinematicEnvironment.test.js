import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sceneSource = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');

test('sky dome renders animated multi-scale procedural clouds', () => {
  assert.match(sceneSource, /float skyFbm\(vec2 p\)/);
  assert.match(sceneSource, /float broad = skyFbm/);
  assert.match(sceneSource, /float detail = skyFbm/);
  assert.match(sceneSource, /silverLining/);
  assert.match(sceneSource, /uniform float skyTime/);
  assert.match(sceneSource, /uniforms\.skyTime\.value = this\.time/);
});

test('environment retains GPU-instanced wind grass with quality scaling', () => {
  assert.match(sceneSource, /new THREE\.InstancedMesh\(bladeGeo, bladeMat, BLADES\)/);
  assert.match(sceneSource, /qualityGrass = \{ 'ultra-low': 260, low: 520, medium: 1050, high: 1800 \}/);
  assert.match(sceneSource, /uGrassTime/);
});
