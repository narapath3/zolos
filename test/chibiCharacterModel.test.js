import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');

test('player base model uses rounded production chibi geometry', () => {
  assert.match(source, /new THREE\.CapsuleGeometry\(0\.29, 0\.30/);
  assert.match(source, /new THREE\.SphereGeometry\(0\.5, 22, 16\)/);
  assert.match(source, /head\.scale\.set\(0\.68, 0\.64, 0\.60\)/);
  assert.match(source, /new THREE\.CapsuleGeometry\(0\.105, 0\.36/);
  assert.match(source, /new THREE\.CapsuleGeometry\(0\.12, 0\.28/);
  assert.doesNotMatch(source, /const headGeo = new THREE\.BoxGeometry/);
});

test('chibi face and layered hair include expressive detail', () => {
  assert.match(source, /this\.hairTufts = this\._buildChibiHairSilhouette\(hairMat\)/);
  assert.match(source, /group\.name = 'chibi-hair-silhouette'/);
  assert.match(source, /Overlapping teardrop bangs/);
  assert.match(source, /this\.hairHighlightMaterial/);
  assert.doesNotMatch(source, /hairTufts[\s\S]{0,500}ConeGeometry/);
  assert.match(source, /const shine = faceMesh/);
  assert.match(source, /new THREE\.TorusGeometry\(0\.055/);
  assert.match(source, /const leftHand = new THREE\.Mesh\(new THREE\.SphereGeometry/);
  assert.match(source, /const rightHand = new THREE\.Mesh\(new THREE\.SphereGeometry/);
});
