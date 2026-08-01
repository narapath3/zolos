import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/engine/CharacterManager.js', import.meta.url), 'utf8');

test('visible armor families have item-specific 3D construction', () => {
  for (const name of [
    'Cotton Shirt', 'Adventurer Suit', 'Dragon Scale Mail', 'Valkyrie Armor',
    'Ranger Hood', 'Odin Garment', 'Guardian Wristguard', 'Speed Boots',
    'Aegis of Olympus',
  ]) assert.match(source, new RegExp(`=== '${name}'`));
  assert.match(source, /const scale = new THREE\.Mesh\(new THREE\.ConeGeometry/);
  assert.match(source, /const feather = new THREE\.Mesh\(new THREE\.ConeGeometry/);
  assert.match(source, /const wing = new THREE\.Mesh\(new THREE\.ConeGeometry/);
});

test('worn gear uses canonical main and accent palettes', () => {
  assert.match(source, /_gearColor\(name, fallback/);
  assert.match(source, /_gearAccent\(name, fallback/);
  assert.match(source, /'Valkyrie Armor': 0xe8edf2/);
  assert.match(source, /'Tear Shield': 0x315d99/);
});
