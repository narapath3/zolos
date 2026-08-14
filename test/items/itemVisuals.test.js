import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEM_VISUALS, itemIconPath } from '../../src/engine/ItemVisuals.js';

test('canonical equipment visuals are unique real PNG assets', () => {
  const paths = Object.values(ITEM_VISUALS).map(entry => entry.icon);
  assert.ok(paths.length >= 150);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    const file = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
    assert.ok(fs.existsSync(file), `missing item icon: ${path}`);
    assert.ok(fs.statSync(file).size > 1000, `item icon is unexpectedly empty: ${path}`);
  }
  assert.equal(itemIconPath('Frost Cleaver'), '/assets/items/equipment/frost-cleaver.png');
  assert.equal(itemIconPath('Golden Koi'), '/assets/items/fish/golden-koi.png');
  assert.equal(itemIconPath('Leviathan'), '/assets/items/fish/leviathan.png');
});

test('all 73 fishing collectibles use canonical transparent PNG art in the almanac', async () => {
  const { FISH_SPECIES } = await import('../../src/engine/GameData.js');
  assert.equal(Object.keys(FISH_SPECIES).length, 73);
  for (const name of Object.keys(FISH_SPECIES)) {
    const icon = itemIconPath(name);
    assert.match(icon, /^\/assets\/items\/fish\/[a-z0-9-]+\.png$/);
    const file = fileURLToPath(new URL(`../../public${icon}`, import.meta.url));
    const png = fs.readFileSync(file);
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${name} must be a PNG`);
  }
  const gameUi = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
  assert.match(gameUi, /itemIconMarkup\(name, '', 'item-visual--fish'\)/);
  assert.match(gameUi, /_wikiItemPortrait\(key, item\)/);
  assert.match(gameUi, /itemIconMarkup\(itemName, item\.emoji \|\| ''/);
});

test('shop, inventory and equipped summaries share the canonical renderer', () => {
  const gameUi = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
  const character = fs.readFileSync(new URL('../../src/engine/CharacterManager.js', import.meta.url), 'utf8');
  assert.match(gameUi, /itemIconMarkup\(item\.name, itemData\.emoji, 'slot-emoji'\)/);
  assert.match(gameUi, /itemIconMarkup\(item, ITEMS\[item\.item_name\]\?\.emoji \|\| item\.emoji\)/);
  assert.match(gameUi, /itemIconMarkup\(item\.name, item\.emoji, 'item-visual--equipped'\)/);
  assert.match(character, /'Frost Cleaver': \{ kind: 'axe'/);
  assert.match(character, /'Soulreaper': \{ kind: 'scythe'/);
});

test('real item art falls back to canonical unknown-loot art and the active sell shop uses it', () => {
  const gameUi = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
  const visuals = fs.readFileSync(new URL('../../src/engine/ItemVisuals.js', import.meta.url), 'utf8');
  assert.match(visuals, /unknown-loot\.png/);
  assert.match(visuals, /this\.onerror=null/);
  assert.doesNotMatch(visuals, /item-visual__fallback/);
  assert.match(gameUi, /itemIconMarkup\(item, item\.emoji \|\| itemData\.emoji \|\| '📦'\)/);
  assert.match(gameUi, /sell-shop-detail-icon'\)\.innerHTML = itemIconMarkup/);
  assert.doesNotMatch(gameUi, /sell-shop-detail-icon'\)\.textContent = item\.emoji/);
});

test('settings equipment and every blacksmith item surface use canonical PNG art', () => {
  const gameUi = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
  const profile = fs.readFileSync(new URL('../../src/ui/PlayerProfileModal.js', import.meta.url), 'utf8');

  assert.match(gameUi, /itemIconMarkup\(name, '', 'item-visual--equipped'\)/);
  for (const className of ['item-visual--forge-result', 'item-visual--forge-cell', 'item-visual--forge-stage', 'item-visual--forge-material']) {
    assert.match(gameUi, new RegExp(className));
  }
  assert.match(profile, /itemIconMarkup\(itemName, itemData\?\.emoji/);
});
