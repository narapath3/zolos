import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { itemIconMarkup, itemIconPath } from '../src/engine/ItemVisuals.js';

test('cards use their real catalog artwork', () => {
  assert.equal(itemIconPath('Poring Card'), '/assets/cards/poring.png');
  assert.match(itemIconMarkup('Poring Card'), /assets\/cards\/poring\.png/);
});

test('items without authored art request a 3D portrait and never use emoji fallback', () => {
  const markup = itemIconMarkup('Jellopy', '📦');
  assert.match(markup, /data-item-model="Jellopy"/);
  assert.doesNotMatch(markup, /📦/);
});

test('renderer supplies recognizable 3D categories and a real image fallback', () => {
  const source = fs.readFileSync(new URL('../src/ui/ItemPortraitRenderer.js', import.meta.url), 'utf8');
  assert.match(source, /potion\|juice\|milk/);
  assert.match(source, /pickaxe/);
  assert.match(source, /ore\|stone\|crystal/);
  assert.match(source, /toDataURL\('image\/webp'/);
  assert.ok(fs.existsSync(new URL('../public/assets/items/fallback/unknown-loot.png', import.meta.url)));
});

test('loading tips, weather, profile pets and announcements no longer render emoji icons', () => {
  const loading = fs.readFileSync(new URL('../src/ui/LoadingOverlay.js', import.meta.url), 'utf8');
  const weather = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
  const profile = fs.readFileSync(new URL('../src/ui/PlayerProfileModal.js', import.meta.url), 'utf8');
  const announcements = fs.readFileSync(new URL('../src/ui/GlobalAnnouncements.js', import.meta.url), 'utf8');
  assert.doesNotMatch(loading.match(/this\.tips = \[[\s\S]*?\];/)?.[0] || '', /icon:/);
  assert.match(loading, /currentTip\.art/);
  assert.match(weather, /weather-art--\$\{p\.icon\}/);
  assert.match(profile, /itemIconMarkup\(petItemName/);
  assert.doesNotMatch(announcements, /announcement\.icon/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="pet-hud-emoji" aria-hidden="true"><\/span>/);
});


test('admin item and monster/drop surfaces use committed real-art markup', () => {
  const admin = fs.readFileSync(new URL('../server/admin/index.html', import.meta.url), 'utf8');
  const inGameAdmin = fs.readFileSync(new URL('../src/ui/AdminUI.js', import.meta.url), 'utf8');
  assert.match(admin, /function art\(name,type=''/);
  assert.match(admin, /pet-sanctuary-atlas-v1\.png/);
  assert.match(admin, /function monsterArt\(\)/);
  assert.doesNotMatch(admin, /\$\{m\.emoji\|\|' '\}/);
  assert.doesNotMatch(admin, /\$\{d\.emoji\|\|' '\}/);
  assert.doesNotMatch(admin, /id="dp-emoji"/);
  assert.match(inGameAdmin, /import \{ itemIconMarkup \}/);
  assert.match(inGameAdmin, /const itemArt = itemIconMarkup/);
});
