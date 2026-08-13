import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const hud = html.match(/<div id="hud-bottom">([\s\S]*?)<\/div>\s*\n\s*<!-- Stats Panel -->/)?.[1] || '';

test('bottom dock exposes five primary actions and groups all legacy actions', () => {
  const directPrimary = [...hud.matchAll(/^      <(?:button class="hud-btn"|div class="hud-menu-group")/gm)];
  assert.equal(directPrimary.length, 5);
  for (const group of ['adventure', 'social', 'system']) {
    assert.match(hud, new RegExp(`data-hud-menu="${group}"`));
    assert.match(hud, new RegExp(`data-hud-panel="${group}"`));
  }
  for (const id of ['btn-inventory','btn-mycard','btn-warp','btn-market','btn-leaderboard','btn-chat-toggle','btn-players-list','btn-wiki','btn-daily-quests','btn-daily-reward','btn-almanac','btn-profile','btn-bug-report','btn-admin','btn-logout']) {
    assert.equal((hud.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});

test('Adventure Journal belongs to the adventure menu, not system settings', () => {
  const adventure = hud.match(/data-hud-panel="adventure"[\s\S]*?<\/div>/)?.[0] || '';
  const system = hud.match(/data-hud-panel="system"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(adventure, /id="btn-wiki"/);
  assert.doesNotMatch(system, /id="btn-wiki"/);
});

test('bottom dock uses SVG icons instead of emoji glyphs', () => {
  assert.equal((hud.match(/class="hud-icon"/g) || []).length, 18);
  assert.doesNotMatch(hud, /[🎒🃏🌀⚖🏆💬👥📖📜🎁🐟⚙🛡🚪]/u);
});

test('categorized menus support click-away, escape and accessible expanded state', () => {
  assert.match(ui, /closeHudMenus/);
  assert.match(ui, /event\.key === 'Escape'/);
  assert.match(ui, /setAttribute\('aria-expanded'/);
  assert.match(css, /\.hud-menu-popover\[hidden\]/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?#hud-bottom[\s\S]*?overflow: visible/);
});
