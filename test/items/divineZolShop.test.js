import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DIVINE_ZOL_SHOP, ITEMS, getEquipSlot } from '../../src/engine/GameData.js';
import { itemIconPath } from '../../src/engine/ItemVisuals.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

test('divine shop has unique expensive ZOL-only equipment in every requested category', () => {
  assert.equal(DIVINE_ZOL_SHOP.length, 15);
  assert.equal(new Set(DIVINE_ZOL_SHOP.map(x => x.name)).size, 15);
  assert.deepEqual(new Set(DIVINE_ZOL_SHOP.map(x => x.category)), new Set(['hat', 'glasses', 'head', 'body', 'garment', 'wrist', 'pants', 'feet', 'weapon', 'shield', 'ring', 'accessory']));
  const slots = new Set();
  for (const entry of DIVINE_ZOL_SHOP) {
    const item = ITEMS[entry.name];
    assert.ok(item, entry.name);
    assert.equal(item.rarity, 'mythic');
    assert.equal(item.price, 0, 'must not be buyable for Zeny');
    assert.ok(entry.zolPrice >= 125000);
    assert.ok(item.levelReq >= 30 && item.levelReq <= 45);
    slots.add(getEquipSlot(entry.name));
    const icon = itemIconPath(entry.name);
    assert.ok(icon);
    const file = join(root, 'public', icon.replace(/^\//, ''));
    assert.ok(existsSync(file), file);
    const png = readFileSync(file);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
  }
  for (const slot of ['weapon', 'head', 'body', 'garment', 'shield', 'hat', 'glasses', 'wrist', 'pants', 'feet', 'ring', 'accessory']) assert.ok(slots.has(slot), slot);
});

test('divine NPC opens the guarded ZOL purchase flow and character visuals know divine gear', () => {
  const scene = readFileSync(join(root, 'src', 'engine', 'SceneManager.js'), 'utf8');
  const main = readFileSync(join(root, 'src', 'main.js'), 'utf8');
  const ui = readFileSync(join(root, 'src', 'ui', 'GameUI.js'), 'utf8');
  const character = readFileSync(join(root, 'src', 'engine', 'CharacterManager.js'), 'utf8');
  assert.match(scene, /npcType = 'divine_merchant'/);
  assert.match(main, /openDivineZolShop\(\)/);
  assert.match(ui, /stats\.zol = beforeZol - entry\.zolPrice/);
  assert.match(ui, /_divinePurchasePending/);
  assert.doesNotMatch(ui.match(/async _buyDivineItem[\s\S]*?\n  }/)?.[0] || '', /stats\.gold|s\.gold/);
  for (const name of ['Solaris Edge', 'Chronos Bow', 'Genesis Staff', 'Seraph Rod', 'Empyrean Plate', 'Aegis Prime']) assert.ok(character.includes(`'${name}'`), name);
  for (const name of ['Solaris Edge', 'Chronos Bow', 'Genesis Staff', 'Seraph Rod']) assert.match(ITEMS[name].forgeEffect, /^divine_/);
  assert.match(character, /_updateDivineAura\(\)/);
  const particles = readFileSync(join(root, 'src', 'engine', 'ParticleSystem.js'), 'utf8');
  assert.match(particles, /spawnDivineAttackEffect/);
  assert.match(particles, /TorusGeometry/);
});
