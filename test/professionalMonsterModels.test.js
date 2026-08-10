import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { addSpeciesArtDetails } from '../src/engine/MonsterAnatomy.js';

const manager = fs.readFileSync(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');
const anatomy = fs.readFileSync(new URL('../src/engine/MonsterAnatomy.js', import.meta.url), 'utf8');

test('all simple monster families pass through the professional anatomy layer', () => {
  assert.match(manager, /upgradeMonsterAnatomy\(\{/);
  assert.match(manager, /animateMonsterRig\(this\._professionalRig/);
  for (const type of ['poring', 'lunatic', 'fabre', 'willow', 'spore', 'bigfoot', 'horn', 'savage', 'boa', 'deviruchi', 'crab', 'fish', 'shrimp', 'clam', 'marina']) {
    assert.match(anatomy, new RegExp(`type === '${type}'|SLIMES.*${type}`));
  }
});

test('slimes use a shaped lathe body instead of the shared sphere primitive', () => {
  assert.match(anatomy, /new THREE\.LatheGeometry\(profile, 24\)/);
  assert.match(anatomy, /bodyMesh\.geometry = blobGeometry/);
});

test('creature rigs include grounded anatomy and secondary animation', () => {
  assert.match(anatomy, /CapsuleGeometry/);
  assert.match(anatomy, /wingGeometry/);
  assert.match(anatomy, /Six two-stage legs/);
  assert.match(anatomy, /export function animateMonsterRig/);
  assert.match(anatomy, /Math\.sin\(time/);
});

test('legacy spore and clam placeholder scaling is removed by the anatomy pass', () => {
  assert.match(anatomy, /type === 'spore'[\s\S]*?bodyMesh\.scale\.set\(1, 1, 1\)[\s\S]*?hideBody\(\)/);
  assert.match(anatomy, /type === 'clam'[\s\S]*?bodyMesh\.scale\.set\(1, 1, 1\)[\s\S]*?hideBody\(\)/);
});

test('the roster receives species-authored details instead of generic family decoration', () => {
  assert.match(manager, /addSpeciesArtDetails\(\{/);
  assert.match(anatomy, /export function addSpeciesArtDetails/);
  assert.match(anatomy, /monsterPolish/);
  for (const type of ['poring', 'lunatic', 'fabre', 'willow', 'spore', 'bigfoot', 'nine_tail', 'horn', 'savage', 'boa', 'deviruchi', 'ghostring', 'crab', 'fish', 'shrimp', 'clam', 'marina']) {
    assert.match(anatomy, new RegExp(`type === '${type}'|type === 'poring'.*${type}`, 's'));
  }
  assert.doesNotMatch(anatomy, /family ===/);
  assert.doesNotMatch(anatomy, /EdgesGeometry|OutlinePass/);
});

test('species details build valid geometry without a browser', () => {
  const species = ['poring', 'lunatic', 'fabre', 'willow', 'spore', 'bigfoot', 'nine_tail', 'horn', 'savage', 'boa', 'deviruchi', 'ghostring', 'crab', 'fish', 'shrimp', 'clam', 'marina'];
  for (const type of species) {
    const bodyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x7799bb }),
    );
    const put = (geometry, material, x, y, z, rotation) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      if (rotation) mesh.rotation.set(...rotation);
      bodyMesh.add(mesh);
      return mesh;
    };
    const createMat = color => new THREE.MeshStandardMaterial({ color });
    const parts = addSpeciesArtDetails({
      THREE, type, size: 1, bodyMesh, bodyMat: bodyMesh.material, createMat, put,
    });
    assert.ok(parts.length >= 1, `${type} should receive authored detail`);
    for (const part of parts) {
      assert.equal(part.userData.monsterPolish, true);
      assert.ok(part.geometry?.attributes?.position?.count > 0, `${type} detail geometry should be valid`);
    }
  }
});
