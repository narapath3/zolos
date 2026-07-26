import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterManager } from '../src/engine/CharacterManager.js';

function materialWithColor(color) {
  return { color: new THREE.Color(color) };
}

function createAppearanceHarness({
  stored = { body: 0x4060c0, hair: 0xc04040, pants: 0x3a3a5a },
  rendered = stored,
} = {}) {
  const character = Object.create(CharacterManager.prototype);
  character.gender = 'male';
  character.bodyColor = stored.body;
  character.hairColor = stored.hair;
  character.pantsColor = stored.pants;
  character.body = { material: materialWithColor(rendered.body) };
  character.leftArm = { material: materialWithColor(rendered.body) };
  character.rightArm = { material: materialWithColor(rendered.body) };
  character.hair = { material: materialWithColor(rendered.hair) };
  character.leftLeg = { material: materialWithColor(rendered.pants) };
  character.rightLeg = { material: materialWithColor(rendered.pants) };
  character.equippedHat = 'Wizard Hat';
  character.equippedGlasses = 'None';
  character.equippedWeapon = 'Wooden Sword';
  character.equippedShield = null;
  character.equippedGear = {
    head: 'Iron Helm',
    body: 'Dragon Scale Mail',
    garment: null,
    ring: null,
    wrist: null,
    pants: 'Leather Pants',
    feet: null,
    accessory: null,
  };
  character.equippedPet = null;
  character.petLevel = 1;
  character.petName = null;
  character.equipRefine = {};
  character.equippedCards = {};
  character.cardState = {};
  character.stats = { job: 'mage' };
  character.title = 'master_angler';
  return character;
}

function createRemoteHarness() {
  const character = createAppearanceHarness();
  character.mesh = new THREE.Group();
  character.setHat = value => { character.equippedHat = value || 'None'; };
  character.setGlasses = value => { character.equippedGlasses = value || 'None'; };
  character.equipWeapon = value => { character.equippedWeapon = value || null; };
  character.updateGearVisuals = () => {};
  character.setPet = value => { character.equippedPet = value || null; };
  character.setTitle = value => { character.title = value || null; };
  character.updateNameTag = () => {};
  character._applyJobAppearance = () => {};
  return character;
}

test('getAppearance broadcasts the colors rendered on the owner model', () => {
  const source = createAppearanceHarness({
    stored: { body: 0x336633, hair: 0x111111, pants: 0x6b4a2a },
    rendered: { body: 0x050505, hair: 0x332266, pants: 0x101060 },
  });

  const snapshot = source.getAppearance();

  assert.equal(snapshot.bodyColor, 0x050505);
  assert.equal(snapshot.hairColor, 0x332266);
  assert.equal(snapshot.pantsColor, 0x101060);
});

test('setBodyColor recolors only the torso and arms', () => {
  const character = createAppearanceHarness();
  const unrelated = {
    material: materialWithColor(0x4060c0),
  };
  character.mesh = {
    children: [character.body, character.leftArm, character.rightArm, unrelated],
  };

  character.setBodyColor(0x050505);

  assert.equal(character.body.material.color.getHex(), 0x050505);
  assert.equal(character.leftArm.material.color.getHex(), 0x050505);
  assert.equal(character.rightArm.material.color.getHex(), 0x050505);
  assert.equal(unrelated.material.color.getHex(), 0x4060c0);
});

test('applying an owner snapshot reproduces its appearance state', () => {
  const source = createAppearanceHarness({
    stored: { body: 0x336633, hair: 0x111111, pants: 0x6b4a2a },
    rendered: { body: 0x050505, hair: 0x332266, pants: 0x101060 },
  });
  const remote = createRemoteHarness();

  const snapshot = source.getAppearance();
  remote.applyAppearance(snapshot);

  assert.deepEqual(remote.getAppearance(), snapshot);
});
