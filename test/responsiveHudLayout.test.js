import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles/index.css');
const gameUI = read('../src/ui/GameUI.js');
const scene = read('../src/engine/SceneManager.js');


test('responsive HUD derives action controls from shared safe-area anchors', () => {
  assert.match(css, /--zolos-bottom-nav-clearance:/);
  assert.match(css, /--zolos-action-zone-size:/);
  assert.match(css, /--zolos-action-bottom:/);
  assert.match(css, /#mobile-actions\s*\{[\s\S]*bottom: var\(--zolos-action-bottom\)/);
  assert.match(css, /#hud-bottom\s*\{[\s\S]*width: min\(600px, calc\(100vw - 16px\)\)/);
  assert.match(css, /#hud-bottom \.hud-menu-group\s*\{[\s\S]*flex: 1 1 0/);
});

test('HUD labels shrink inside their own buttons instead of overlapping neighbours', () => {
  assert.match(css, /\.hud-btn\s*\{[\s\S]*min-width: 0;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.hud-btn small\s*\{[\s\S]*max-width: 100%;[\s\S]*text-overflow: ellipsis/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.market-item-name-text[\s\S]*-webkit-line-clamp: 2/);
  assert.match(css, /\.btn-market-buy,[\s\S]*\.btn-market-cancel[\s\S]*width: 100%;[\s\S]*overflow-wrap: anywhere/);
});

test('stall modal uses iPad-safe wrapping and stacked owner actions', () => {
  assert.match(gameUI, /\.stall-listing\{display:grid;grid-template-columns:auto minmax\(0,1fr\) minmax\(56px,auto\)/);
  assert.match(gameUI, /\.stall-owner-actions\{display:grid;grid-template-columns:1fr/);
  assert.match(gameUI, /@media \(min-width:769px\) and \(max-width:1180px\) and \(pointer:coarse\)/);
  assert.match(gameUI, /class="stall-owner-actions"/);
});

test('in-world stall signs use high-DPI Thai-safe fitted canvas text', () => {
  assert.match(scene, /CANVAS_UI_FONT = '"Kanit", "Noto Sans Thai", Arial, sans-serif'/);
  assert.match(scene, /createHiDPICanvas\(width, height\)/);
  assert.match(scene, /drawFittedCanvasText\(ctx, `🏪 \$\{stall\.shop_name/);
  assert.match(scene, /drawFittedCanvasText\(ctx, `ร้านของ \$\{stall\.owner_name/);
  assert.doesNotMatch(scene, /ctx\.font = 'bold 44px Arial'/);
  assert.doesNotMatch(scene, /ctx\.font = 'bold 30px Arial'/);
  assert.match(scene, /ctx\.rect\(x - maxWidth \/ 2 - 2, baseline - size \* 1\.35/);
});

test('iPad landscape separates the auto rail from the skill and attack zone', () => {
  assert.match(css, /@media \(min-width: 769px\) and \(max-width: 1180px\) and \(orientation: landscape\)/);
  assert.match(css, /#auto-farm-container\s*\{[\s\S]*right: calc\(16px \+ var\(--safe-right\) \+ var\(--zolos-action-zone-size\) \+ 12px\)/);
  assert.match(css, /#mobile-actions\s*\{[\s\S]*right: calc\(16px \+ var\(--safe-right\)\)/);
  assert.match(css, /\.btn-auto,[\s\S]*\.btn-fishing\s*\{[\s\S]*width: clamp\(44px, 5vw, 52px\)/);
  assert.match(css, /#auto-farm-container > \.btn-auto,[\s\S]*#auto-farm-container > \.btn-fishing[\s\S]*position: relative;[\s\S]*flex: 0 0 auto/);
  assert.match(css, /#auto-farm-container\s*\{[\s\S]*isolation: isolate;[\s\S]*z-index: 1600 !important/);
});
