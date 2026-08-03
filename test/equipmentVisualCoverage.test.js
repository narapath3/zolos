import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, getEquipSlot } from '../src/engine/GameData.js';
import { EQUIPMENT_VISUAL_SPECS, getEquipmentVisualSpec } from '../src/engine/EquipmentVisualSpecs.js';

test('every equippable item has an explicit worn visual definition', () => {
  const missing = Object.keys(ITEMS).filter(name => {
    const slot = getEquipSlot(name);
    return slot && !getEquipmentVisualSpec(slot, name);
  });
  assert.deepEqual(missing, []);
});

test('visual registry contains no stale or miscategorized item', () => {
  const invalid = [];
  for (const [slot, entries] of Object.entries(EQUIPMENT_VISUAL_SPECS)) {
    for (const name of Object.keys(entries)) if (!ITEMS[name] || getEquipSlot(name) !== slot) invalid.push(`${slot}:${name}`);
  }
  assert.deepEqual(invalid, []);
});

test('rings and accessories are rendered as visible character gear', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8'));
  assert.match(source, /gearMeshes\.ring/);
  assert.match(source, /gearMeshes\.accessory/);
});
