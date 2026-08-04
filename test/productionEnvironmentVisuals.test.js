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
