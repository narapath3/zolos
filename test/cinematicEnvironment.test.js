import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sceneSource = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');

test('sky dome renders performance-tiered animated procedural clouds', () => {
  assert.match(sceneSource, /const proceduralClouds = .*\? 1 : 0/);
  assert.match(sceneSource, /const cloudOctaves = this\.graphicsQuality === 'high' \? 3 : 2/);
  assert.match(sceneSource, /#if PROCEDURAL_CLOUDS == 1/);
  assert.match(sceneSource, /float skyFbm\(vec2 p\)/);
  assert.match(sceneSource, /float broad = skyFbm/);
  assert.match(sceneSource, /float detail = skyNoise/);
  assert.match(sceneSource, /silverLining/);
  assert.match(sceneSource, /uniform float skyTime/);
  assert.match(sceneSource, /uniforms\.skyTime\.value = this\.time/);
});

test('environment retains GPU-instanced wind grass with quality scaling', () => {
  assert.match(sceneSource, /new THREE\.InstancedMesh\(bladeGeo, bladeMat, BLADES\)/);
  assert.match(sceneSource, /qualityGrass = \{ 'ultra-low': 380, low: 760, medium: 1500, high: 2500 \}/);
  assert.match(sceneSource, /\(Math\.random\(\) - 0\.5\) \* 102/);
  assert.match(sceneSource, /uGrassTime/);
});

test('expanded field stays lit and distant mountains remain outside walkable space', () => {
  assert.match(sceneSource, /new THREE\.SphereGeometry\(180, 40, 24\)/);
  assert.match(sceneSource, /radius: 122/);
  assert.match(sceneSource, /shadow\.camera\.right = 72/);
  assert.match(sceneSource, /0x477e3f/);
  assert.doesNotMatch(sceneSource, /color = new THREE\.Color\(0x282828\)/);
});

test('high quality adds restrained cinematic post-processing', () => {
  assert.match(sceneSource, /new EffectComposer\(this\.renderer\)/);
  assert.match(sceneSource, /new UnrealBloomPass\(/);
  assert.match(sceneSource, /this\.graphicsQuality !== 'high'/);
  assert.match(sceneSource, /if \(this\.composer\) this\.composer\.render\(\)/);
});

test('explorable ridge uses fractured rock volumes instead of cone mountains', () => {
  assert.match(sceneSource, /Interlocking fractured boulders/);
  assert.match(sceneSource, /new THREE\.DodecahedronGeometry\(1, 1\)/);
  assert.doesNotMatch(sceneSource, /new THREE\.ConeGeometry\(r, h, 7\)/);
});
