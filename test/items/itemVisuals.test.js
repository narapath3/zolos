import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEM_VISUALS, itemIconPath } from '../../src/engine/ItemVisuals.js';

test('canonical equipment visuals are unique real PNG assets', () => {
  const paths = Object.values(ITEM_VISUALS).map(entry => entry.icon);
  assert.equal(paths.length, 77);
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    const file = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
    assert.ok(fs.existsSync(file), `missing item icon: ${path}`);
    assert.ok(fs.statSync(file).size > 1000, `item icon is unexpectedly empty: ${path}`);
  }
  assert.equal(itemIconPath('Frost Cleaver'), '/assets/items/equipment/frost-cleaver.png');
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

test('settings equipment and every blacksmith item surface use canonical PNG art', () => {
  const gameUi = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
  const profile = fs.readFileSync(new URL('../../src/ui/PlayerProfileModal.js', import.meta.url), 'utf8');

  assert.match(gameUi, /itemIconMarkup\(name, it\.emoji \|\| slot\.icon, 'item-visual--equipped'\)/);
  assert.match(gameUi, /itemIconMarkup\(r\.result, res\.emoji \|\| '🗡️', 'item-visual--forge-result'\)/);
  assert.match(gameUi, /itemIconMarkup\(i, i\.emoji \|\| '📦', 'item-visual--forge-cell'\)/);
  assert.match(gameUi, /itemIconMarkup\(sel, sel\.emoji \|\| '🗡️', 'item-visual--forge-stage'\)/);
  assert.match(gameUi, /itemIconMarkup\(ore, ITEMS\[ore\]\?\.emoji \|\| '🔩', 'item-visual--forge-material'\)/);
  assert.match(profile, /itemIconMarkup\(itemName, itemData\?\.emoji \|\| '➖', 'item-visual--equipped'\)/);
});
