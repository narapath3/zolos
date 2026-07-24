import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterManager } from '../../src/engine/CharacterManager.js';

const CARD_SLOTS = [
  'weapon', 'shield', 'hat', 'glasses', 'head', 'body',
  'garment', 'ring', 'wrist', 'pants', 'feet', 'accessory',
];

function createCharacterLoadHarness() {
  const character = Object.create(CharacterManager.prototype);
  character.stats = {};
  character.equippedCards = Object.fromEntries(CARD_SLOTS.map(slot => [slot, null]));
  character.equippedGear = { head: 'Top Helm', body: 'Top Armor' };
  character.equippedShield = 'Top Shield';
  character.equipRefine = { weapon: 4, body: 3 };
  character.cardState = {};
  character.gameSettings = {};
  character.mesh = { position: { set() {} } };
  character.gender = 'male';
  character.bodyColor = 0;
  character.hairColor = 0;
  character.pantsColor = 0;
  character.equippedWeapon = null;
  character.equippedHat = null;
  character.equippedGlasses = null;
  character.equippedPet = 'Top Pet';
  character.setGender = value => { character.gender = value; };
  character.setBodyColor = value => { character.bodyColor = value; };
  character.setHairColor = value => { character.hairColor = value; };
  character.setPantsColor = value => { character.pantsColor = value; };
  character.setHat = value => { character.equippedHat = value; };
  character.setGlasses = value => { character.equippedGlasses = value; };
  character.equipWeapon = value => { character.equippedWeapon = value; };
  character.setPet = value => { character.equippedPet = value; };
  character.setTitle = value => { character.title = value; };
  character.updateGearVisuals = () => {};
  character._applyJobAppearance = () => {};
  character.updateNameTag = () => {};
  return character;
}

test('loadStats restores cards without letting conflicting appearance clobber local character fields', () => {
  const character = createCharacterLoadHarness();

  character.loadStats({
    id: 'saved-character', user_id: 'saved-user', name: 'Saver',
    job: 'swordsman', gender: 'female', weapon: 'Top Sword',
    armor: 'Top Armor', shield: 'Top Shield',
    body_color: 0x112233, hair_color: 0x223344, pants_color: 0x334455,
    appearance: {
      job: 'mage', gender: 'male', weapon: 'Appearance Bow',
      bodyColor: 0xabcdef, hairColor: 0x123456, pantsColor: 0x654321,
      gear: { head: 'Appearance Crown', body: 'Appearance Robe' },
      shield: 'Appearance Shield', refine: { weapon: 0, body: 0 },
      pet: 'Appearance Pet', title: 'master_angler',
      cards: { body: 'Poring Card', weapon: 'Andre Card' },
      cardState: { poring: { owned: 3, stars: 2, pity: 47 } },
    },
  });

  assert.deepEqual(character.cardState, {
    poring: { owned: 3, stars: 2, pity: 47 },
  });
  assert.equal(character.equippedCards.body, 'poring');
  assert.equal(character.equippedCards.weapon, 'willow');
  assert.equal(character.stats.job, 'swordsman');
  assert.equal(character.gender, 'female');
  assert.equal(character.equippedWeapon, 'Top Sword');
  assert.equal(character.bodyColor, 0x112233);
  assert.equal(character.hairColor, 0x223344);
  assert.equal(character.pantsColor, 0x334455);
  assert.deepEqual(character.equippedGear, { head: 'Top Helm', body: 'Top Armor' });
  assert.equal(character.equippedShield, 'Top Shield');
  assert.deepEqual(character.equipRefine, { weapon: 4, body: 3 });
  assert.equal(character.equippedPet, 'Top Pet');
  assert.equal(character.title, undefined);
});
