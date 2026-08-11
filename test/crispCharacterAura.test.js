import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');

test('persistent player aura uses crisp rings without a translucent floor pool', () => {
  const method = source.match(/_createAuraRing\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(method, /RingGeometry\(0\.79, 0\.9, 48\)/);
  assert.match(method, /THREE\.NormalBlending/);
  assert.doesNotMatch(method, /CircleGeometry/);
  assert.doesNotMatch(method, /AdditiveBlending/);
});

test('pet aura does not cover the model with a translucent sphere', () => {
  const method = source.match(/_buildPetAura\(level\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(method, /TorusGeometry\(ringR \* 0\.72/);
  assert.match(method, /THREE\.NormalBlending/);
  assert.doesNotMatch(method, /new THREE\.SphereGeometry\(floats \?/);
});
