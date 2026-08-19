import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');

test('fantasy sky includes a physical sun halo, horizon haze and banding control', () => {
  assert.match(source, /sunDirection/);
  assert.match(source, /sunDisc/);
  assert.match(source, /horizonGlow/);
  assert.match(source, /gradient banding/);
});

test('ground uses a lit production material with detail relief', () => {
  assert.match(source, /new THREE\.MeshStandardMaterial\(\{\s*vertexColors: true/);
  assert.match(source, /bumpMap: this\._detailTexture/);
  assert.match(source, /roughness: 0\.91/);
  assert.match(source, /anisotropy = Math\.min\(8/);
});

test('grass density scales by quality and its shader receives animated wind', () => {
  for (const tier of ["'ultra-low'", 'low', 'medium', 'high']) assert.match(source, new RegExp(`${tier}: \\d+`));
  assert.match(source, /uGrassTime/);
  assert.match(source, /grassWindUniform\.value = this\.time/);
  assert.match(source, /Math\.max\(55, Math\.round\(BLADES \/ 7\)\)/);
});

test('lighting preserves warm key light with cool sky fill and soft shadow bias', () => {
  assert.match(source, /skyFillLight = new THREE\.DirectionalLight/);
  assert.match(source, /shadow\.normalBias = 0\.025/);
  assert.match(source, /outputColorSpace = THREE\.SRGBColorSpace/);
});

test('river water upgrades to an adaptive Fresnel shader on medium/high tiers and keeps a low-cost fallback', () => {
  assert.match(source, /const useAdaptiveWater = this\.graphicsQuality === 'medium' \|\| this\.graphicsQuality === 'high'/);
  assert.match(source, /uTime: \{ value: 0 \}/);
  assert.match(source, /uniform sampler2D uMap/);
  assert.match(source, /float fresnel = pow/);
  assert.match(source, /waterShaderUniforms\.uTime\.value = this\.time/);
  assert.match(source, /Ultra-low\/low keeps a single inexpensive lit material/);
});

test('waterfall uses quality-scaled flow ribbons, foam, mist, and impact spray', () => {
  assert.match(source, /const useAdaptiveFall = this\.graphicsQuality === 'medium' \|\| this\.graphicsQuality === 'high'/);
  assert.match(source, /const makeFlowMaterial = \(color, opacity, phase = 0\)/);
  assert.match(source, /flowUv\.y -= uTime \* 0\.58/);
  assert.match(source, /const mistN = this\.graphicsQuality === 'high'/);
  assert.match(source, /const sprayN = this\.graphicsQuality === 'high'/);
  assert.match(source, /waterfallStateFinal\.spray/);
  assert.match(source, /wf\.foam\.scale\.set/);
  assert.match(source, /wf\.pool\.scale\.setScalar/);
});

test('water reflection-heavy effects remain scoped to adaptive tiers', () => {
  assert.match(source, /this\.graphicsQuality === 'medium' \|\| this\.graphicsQuality === 'high'/g);
  assert.match(source, /depthWrite: false/);
  assert.match(source, /toneMapped: false/);
});

test('adaptive water adds shoreline foam and Fresnel reflection without forcing high-tier probes on low devices', () => {
  assert.match(source, /uFoamStrength/);
  assert.match(source, /uReflectionStrength/);
  assert.match(source, /float shoreBand =/);
  assert.match(source, /float foamMask = clamp\(shoreBand/);
  assert.match(source, /float fresnel = pow/);
  assert.match(source, /vec3 skyReflection = mix/);
  assert.match(source, /const enablePlanarReflection = this\.graphicsQuality === 'high'/);
  assert.match(source, /uPlanarReflectionStrength: \{ value: enablePlanarReflection \? 1\.0 : 0\.0 \}/);
});

test('high-tier planar reflection is resolution-capped and disposed on map changes', () => {
  assert.match(source, /new Reflector\(new THREE\.PlaneGeometry\(riverLength, 40\)/);
  assert.match(source, /Math\.max\(256, Math\.min\(512/);
  assert.match(source, /multisample: 0/);
  assert.match(source, /if \(object\.isReflector && typeof object\.dispose === 'function'\)/);
  assert.match(source, /this\.waterReflection = null/);
});

test('river shoreline foam uses bounded geometry and animated bubbles', () => {
  assert.match(source, /_createRiverFoam\(config, riverLength\)/);
  assert.match(source, /const segments = quality === 'high' \? 72 : 48/);
  assert.match(source, /new THREE\.TubeGeometry\(curve, segments, radius, 5, false\)/);
  assert.match(source, /float bubbles = sin\(vUv\.x \* 38\.0/);
  assert.match(source, /this\.waterFoamMeshes\.forEach/);
});
