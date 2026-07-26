import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles/index.css');
const loginCss = read('../src/styles/login-new.css');
const cardsCss = read('../src/styles/cards.css');
const adminCss = read('../src/styles/admin.css');

test('semantic RO typography preserves a readable Thai body face', () => {
  assert.match(css, /--font-display:\s*'Chakra Petch'/);
  assert.match(css, /--font-body:\s*'Kanit'/);
  assert.match(css, /--font-effect:\s*'Press Start 2P'/);
  assert.match(css, /--font-ui:\s*var\(--font-body\)/);
  assert.match(css, /--font-main:\s*var\(--font-display\)/);
});

test('global text roles distinguish display, prose, ellipsis and critical values', () => {
  assert.match(css, /\.ui-title[\s\S]*font-family:\s*var\(--font-display\)/);
  assert.match(css, /\.ui-copy[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.ui-ellipsis[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.ui-critical-value[\s\S]*white-space:\s*nowrap/);
});

test('viewport rules account for safe areas and shrinkable flex text', () => {
  assert.match(css, /--safe-left:\s*max\([^;]*safe-area-inset-left/);
  assert.match(css, /--safe-right:\s*max\([^;]*safe-area-inset-right/);
  assert.match(css, /\.panel[\s\S]*max-inline-size:\s*calc\(100dvw/);
  assert.match(css, /:where\([^)]*\)[^{]*\{[^}]*min-width:\s*0/s);
});

test('touch inputs prevent Safari focus zoom and buttons may grow', () => {
  assert.match(css, /@media\s*\(pointer:\s*coarse\)[\s\S]*font-size:\s*16px/);
  assert.match(css, /:where\(button,[^}]*min-height:\s*44px/s);
  assert.match(css, /-webkit-text-size-adjust:\s*100%/);
  assert.match(css, /:where\(img,\s*svg,\s*video\)[\s\S]*max-width:\s*100%/);
});

test('major stylesheets consume the semantic type and overflow system', () => {
  assert.match(loginCss, /var\(--font-display\)/);
  assert.match(loginCss, /overflow-wrap:\s*anywhere/);
  assert.match(cardsCss, /min-width:\s*0/);
  assert.match(cardsCss, /overflow-wrap:\s*anywhere/);
  assert.match(adminCss, /var\(--font-body\)/);
  assert.match(adminCss, /overflow-wrap:\s*anywhere/);
});

test('small-phone and tablet rules use dynamic viewport-safe sizing', () => {
  assert.match(css, /@media\s*\(max-width:\s*430px\)/);
  assert.match(css, /@media\s*\(min-width:\s*600px\)\s*and\s*\(max-width:\s*1180px\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /100dvw/);
});
