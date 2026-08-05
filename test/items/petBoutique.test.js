import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ITEMS, PET_SHOP, SHOP_ITEMS, petModelOf } from '../../src/engine/GameData.js';
import { buildPet } from '../../src/engine/PetModels.js';

const scene = fs.readFileSync(new URL('../../src/engine/SceneManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');

test('pet sanctuary is a separate twelve-species catalog with real models', () => {
  assert.equal(PET_SHOP.length, 12);
  assert.equal(new Set(PET_SHOP.map(x => x.name)).size, 12);
  assert.equal(SHOP_ITEMS.some(x => ITEMS[x.name]?.type === 'pet'), false);
  for (const entry of PET_SHOP) {
    assert.equal(ITEMS[entry.name].type, 'pet');
    assert.ok(petModelOf(entry.name));
    assert.ok(buildPet(petModelOf(entry.name)));
  }
});

test('Prontera has a clickable showcase boutique and dedicated gallery UI', () => {
  assert.match(scene, /_createPetBoutique\(\)/);
  assert.match(scene, /buildPet\(key\)/);
  assert.match(scene, /petShowcaseModels/);
  assert.match(main, /npcType === 'pet_boutique'/);
  assert.match(ui, /openPetBoutique\(\)/);
  assert.match(ui, /petPortraitMarkup/);
  assert.match(ui, /Pet Sanctuary/);
});
