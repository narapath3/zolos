import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('world boss HP HUD is gated by the active map for every server event', () => {
  assert.match(source, /_isOnBossMap\(\)\s*\{[\s\S]*sceneManager\.currentMap === bossState\.mapId/);
  assert.match(source, /onState\(p\)[\s\S]*?this\._syncBarVisibility\(\)/);
  assert.match(source, /onSpawn\(p\)[\s\S]*?this\._syncBarVisibility\(\)/);
  assert.match(source, /onHp\(p\)[\s\S]*?this\._syncBarVisibility\(\)/);
  assert.match(source, /_showBar\(\)[\s\S]*?!this\._isOnBossMap\(\)[\s\S]*?this\._hideBar\(\)/);
});

test('map reconciliation also updates the boss HUD after warping', () => {
  assert.match(source, /reconcileMesh\(\)[\s\S]*?this\._syncBarVisibility\(\)/);
});

test('boss HUD is compact, non-interactive, and identifies its map', () => {
  assert.match(source, /#boss-hpbar\{[^}]*width:min\(440px,72vw\)[^}]*pointer-events:none/);
  assert.match(source, /class="bh-location"/);
  assert.match(source, /bh-location'\)\.textContent = `📍 \$\{bossState\.mapName\}`/);
  assert.match(source, /bar\.setAttribute\('role', 'status'\)/);
});

test('boss reward dialog remains tappable on mobile above joystick controls', () => {
  const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
  assert.match(source, /#boss-summary\{[^}]*z-index:100000[^}]*pointer-events:auto!important[^}]*touch-action:manipulation/);
  assert.match(source, /#boss-summary \.bs-close\{[^}]*min-height:48px[^}]*pointer-events:auto!important[^}]*touch-action:manipulation/);
  assert.match(source, /<button type="button" class="bs-close">/);
  assert.match(source, /gameUI\?\.updateMobileControlsVisibility\?\.\(\)/);
  assert.match(ui, /target\.closest\('#boss-summary'\)/);
  assert.match(ui, /const bossSummary = document\.getElementById\('boss-summary'\)/);
});
