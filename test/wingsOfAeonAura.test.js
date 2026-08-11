import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const aura = source.match(/_updateDivineAura\(\) \{[\s\S]*?\n    \}/)?.[0] || '';

test('Wings of Aeon renders layered celestial feathers instead of divine floor rings', () => {
  assert.match(aura, /equipped\.includes\('Wings of Aeon'\)/);
  assert.match(aura, /ConeGeometry\(0\.075, 0\.72, 5\)/);
  assert.match(aura, /for \(let i = 0; i < 7; i\+\+\)/);
  assert.match(aura, /this\.auraRing\.visible = false/);
  assert.doesNotMatch(aura, /floorCyan|floorGold/);
});

test('celestial wing materials keep sharp non-additive edges', () => {
  assert.match(aura, /THREE\.NormalBlending/);
  assert.doesNotMatch(aura, /THREE\.AdditiveBlending/);
});
