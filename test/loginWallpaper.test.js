import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('login uses dedicated production artwork for landscape and portrait', () => {
  assert.match(css, /login_bg_desktop_v2\.webp/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)[\s\S]*login_bg_mobile_v2\.webp/);
  for (const name of ['login_bg_desktop_v2.png', 'login_bg_mobile_v2.png']) {
    const file = new URL(`../src/assets/${name}`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing ${name}`);
    assert.ok(fs.statSync(file).size > 1_000_000, `${name} is unexpectedly small`);
  }
  for (const name of ['login_bg_desktop_v2.webp', 'login_bg_mobile_v2.webp']) {
    const file = new URL(`../src/assets/${name}`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing optimized ${name}`);
    assert.ok(fs.statSync(file).size < 350_000, `${name} is too heavy for login`);
  }
});

test('brand is live text instead of baked into the wallpaper', () => {
  assert.match(html, /data-text="ZOLOS\.ONLINE">ZOLOS\.ONLINE</);
  assert.match(css, /\.auth-logo \.game-title-new\s*\{[^}]*display:\s*block\s*!important/s);
});
