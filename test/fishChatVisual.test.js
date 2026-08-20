import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const gameUI = read('../src/ui/GameUI.js');
const main = read('../src/main.js');
const css = read('../src/styles/index.css');

test('fish reward chat messages render trusted item art in both online and offline flows', () => {
  assert.match(gameUI, /addCombatLog\(message, type = 'system', itemMeta = null\)/);
  assert.match(gameUI, /itemIconMarkup\(itemName, item\?\.emoji \|\| '🐟'/);
  assert.match(gameUI, /combat-msg__item-icon/);
  assert.match(main, /ได้รับ .*item\.name.*'loot', item/);
  assert.match(main, /You caught a .*event\.item\.name.*'loot', event\.item/);
});

test('fish chat art is compact, responsive, and uses real fish assets', async () => {
  assert.match(css, /\.combat-msg--item\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(css, /\.combat-msg__item-icon[\s\S]*width:\s*24px/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.combat-msg__item-icon/);
  const { FISH_SPECIES } = await import('../src/engine/GameData.js');
  const { itemIconPath } = await import('../src/engine/ItemVisuals.js');
  for (const name of Object.keys(FISH_SPECIES)) {
    assert.match(itemIconPath(name), /^\/assets\/items\/fish\/[a-z0-9-]+\.png$/, name);
  }
});
