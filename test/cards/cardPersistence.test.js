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
  character.equippedGear = {};
  character.equipRefine = {};
  character.cardState = {};
  character.gameSettings = {};
  character.mesh = { position: { set() {} } };
  character.gender = 'male';
  character.setGender = value => { character.gender = value; };
  character.setBodyColor = () => {};
  character.setHairColor = () => {};
  character.setPantsColor = () => {};
  character.setHat = () => {};
  character.setGlasses = () => {};
  character.equipWeapon = () => {};
  character._applyJobAppearance = () => {};
  character.updateNameTag = () => {};
  return character;
}

test('loadStats restores saved card progress and canonicalizes legacy appearance sockets once', () => {
  const character = createCharacterLoadHarness();
  const applyAppearance = character.applyAppearance.bind(character);
  let applied = 0;
  character.applyAppearance = appearance => {
    applied += 1;
    return applyAppearance(appearance);
  };

  character.loadStats({
    id: 'saved-character', user_id: 'saved-user', name: 'Saver',
    appearance: {
      cards: { body: 'Poring Card', weapon: 'Andre Card' },
      cardState: { poring: { owned: 3, stars: 2, pity: 47 } },
    },
  });

  assert.equal(applied, 1);
  assert.deepEqual(character.cardState, {
    poring: { owned: 3, stars: 2, pity: 47 },
  });
  assert.equal(character.equippedCards.body, 'poring');
  assert.equal(character.equippedCards.weapon, 'willow');
});
