import test from 'node:test';
import assert from 'node:assert/strict';
import { getEquipSlot } from '../../src/engine/GameData.js';

test('leg, foot and wrist equipment are assigned to their visual body part', () => {
  assert.equal(getEquipSlot('Leather Pants'), 'pants');
  assert.equal(getEquipSlot('Plate Legguards'), 'pants');
  assert.equal(getEquipSlot('Speed Boots'), 'feet');
  assert.equal(getEquipSlot('Dragon Greaves'), 'feet');
  assert.equal(getEquipSlot('Leather Bracer'), 'wrist');
  assert.equal(getEquipSlot('Steel Bracer'), 'wrist');
  assert.equal(getEquipSlot('Guardian Wristguard'), 'wrist');
});
