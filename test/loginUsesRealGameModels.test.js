import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');

test('login uses static artwork without constructing animated game models', () => {
  assert.doesNotMatch(auth, /LoginShowcase3D|LoginCanvasBg|_bgCanvas/);
  assert.doesNotMatch(html, /auth-bg-canvas|<canvas[^>]*auth/);
  assert.doesNotMatch(css, /#auth-bg-canvas|auth-has-live-game-art/);
});

test('static login artwork has dedicated desktop and portrait assets', () => {
  assert.match(css, /login_environment_ro_desktop_v1\.jpg/);
  assert.match(css, /login_environment_ro_mobile_v1\.jpg/);
  assert.ok(fs.existsSync(new URL('../src/assets/login_environment_ro_desktop_v1.jpg', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../src/assets/login_environment_ro_mobile_v1.jpg', import.meta.url)));
});
