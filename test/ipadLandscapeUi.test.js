import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrapCanvasText } from '../src/engine/CharacterManager.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const gameUiSource = read('../src/ui/GameUI.js');
const css = read('../src/styles/index.css');

test('canvas chat wrapping hard-wraps Thai text without spaces', () => {
  const context = { measureText: value => ({ width: Array.from(value).length * 10 }) };
  const message = 'กล่องข้อความภาษาไทยต้องไม่ยาวจนทับเมนูบนไอแพด';
  const lines = wrapCanvasText(context, message, 80);

  assert.ok(lines.length > 1);
  assert.ok(lines.every(line => context.measureText(line).width <= 80));
  assert.equal(lines.join(''), message);
});

test('canvas chat wrapping keeps Thai combining marks with their grapheme', () => {
  const context = { measureText: value => ({ width: Array.from(value).length * 10 }) };
  const lines = wrapCanvasText(context, 'กำลังซื้อสินค้าใหม่', 30);

  assert.ok(lines.length > 1);
  assert.ok(lines.every(line => !/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/u.test(line)));
});

test('player stall uses shrinkable responsive classes instead of nowrap inline text', () => {
  assert.match(gameUiSource, /class="stall-header-copy"/);
  assert.match(gameUiSource, /class="stall-shop-name"/);
  assert.match(gameUiSource, /class="stall-listing-name"/);
  assert.match(gameUiSource, /\.stall-shop-name\{[^}]*overflow-wrap:anywhere/);
  assert.match(gameUiSource, /\.stall-listing-name\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(gameUiSource, /white-space:nowrap;">\$\{disp\}/);
});

test('iPad landscape reserves a stable lane above the bottom HUD for combat messages', () => {
  assert.match(
    css,
    /@media\s*\(min-width:\s*769px\)\s*and\s*\(max-width:\s*1180px\)\s*and\s*\(orientation:\s*landscape\)/,
  );
  assert.match(css, /#combat-log\s*\{[^}]*bottom:\s*calc\(var\(--tablet-hud-clearance\)/s);
  assert.match(css, /--tablet-hud-clearance:/);
}
);
