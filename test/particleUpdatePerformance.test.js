import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/ParticleSystem.js', import.meta.url), 'utf8');

test('particle update rejects invalid time and clamps resumed-frame hitches', () => {
  const update = source.slice(source.indexOf('    update(deltaTime) {'), source.indexOf('    // ============ Performance Control'));
  assert.match(update, /!Number\.isFinite\(deltaTime\) \|\| deltaTime <= 0/);
  assert.match(update, /deltaTime = Math\.min\(deltaTime, 0\.1\)/);
});

test('projectiles reuse a scratch direction vector instead of allocating every frame', () => {
  assert.match(source, /this\._projectileDirection = new THREE\.Vector3\(\)/);
  const update = source.slice(source.indexOf('    update(deltaTime) {'), source.indexOf('    // Update splash effects'));
  assert.match(update, /this\._projectileDirection\.subVectors/);
  assert.doesNotMatch(update, /new THREE\.Vector3\(\)\.subVectors/);
});

test('effect collections remove expired members backwards and dispose meshes', () => {
  for (const name of ['projectiles', 'splashEffects', 'shockwaves', 'hitEffects', 'deathEffects', 'slashes']) {
    assert.match(source, new RegExp(`for \\(let i = this\\.${name}\\.length - 1; i >= 0; i--\\)`));
  }
  assert.match(source, /this\._disposeEffectObject\(effect\.mesh\)/);
});
