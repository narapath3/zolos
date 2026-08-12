import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('login uses dedicated production artwork for landscape and portrait', () => {
  assert.match(css, /login_environment_ro_desktop_v1\.jpg/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)[\s\S]*login_environment_ro_mobile_v1\.jpg/);
  for (const name of ['login_environment_ro_desktop_v1.jpg', 'login_environment_ro_mobile_v1.jpg']) {
    const file = new URL(`../src/assets/${name}`, import.meta.url);
    assert.ok(fs.existsSync(file), `missing ${name}`);
    const size = fs.statSync(file).size;
    assert.ok(size > 100_000 && size < 700_000, `${name} is outside the production size budget`);
  }
});

test('brand is live text instead of baked into the wallpaper', () => {
  assert.match(html, /data-text="ZOLOS\.ONLINE">ZOLOS\.ONLINE</);
  assert.match(css, /\.auth-logo \.game-title-new\s*\{[^}]*display:\s*block\s*!important/s);
});
