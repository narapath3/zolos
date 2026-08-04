import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');

test('starter classes use canonical item art and accessible selected state', () => {
  const expected = {
    novice: 'novice-cutter.png', swordman: 'sword.png', mage: 'mage-staff.png',
    archer: 'bow.png', acolyte: 'holy-rod.png', thief: 'silver-dagger.png',
  };
  for (const [job, art] of Object.entries(expected)) {
    assert.match(html, new RegExp(`class-badge[^>]+data-class="${job}"`));
    assert.match(html, new RegExp(`/assets/items/equipment/${art.replace('.', '\\.')}"`));
    assert.ok(fs.existsSync(new URL(`../public/assets/items/equipment/${art}`, import.meta.url)));
  }
  assert.match(html, /aria-pressed="true"/);
  assert.match(auth, /setAttribute\('aria-pressed'/);
});

test('class cards expose production artwork, class palettes and interaction states', () => {
  assert.match(css, /\.class-art img/);
  assert.match(css, /\.class-badge\.active \.class-check/);
  assert.match(css, /\.class-badge:focus-visible/);
  for (const job of ['swordman', 'mage', 'archer', 'acolyte', 'thief']) assert.match(css, new RegExp(`class-${job}`));
});
