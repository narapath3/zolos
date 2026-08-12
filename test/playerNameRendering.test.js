import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('player-controlled names are rendered as text in login and admin UI', () => {
  const auth = read('../src/ui/AuthUI.js');
  const admin = read('../src/ui/AdminUI.js');

  assert.doesNotMatch(auth, /<span>Enter Game as \$\{username\}<\/span>/);
  assert.match(auth, /querySelector\('span'\)\.textContent = `Enter Game as \$\{username\}`/);
  assert.doesNotMatch(admin, /<strong[^>]*>\$\{this\.currentUsername\}<\/strong>/);
  assert.match(admin, /username\.textContent = this\.currentUsername/);
});

test('mention suggestions use DOM text instead of interpolated player HTML', () => {
  const ui = read('../src/ui/GameUI.js');
  assert.match(ui, /mentionBox\.replaceChildren\(\.\.\.names\.map/);
  assert.match(ui, /button\.dataset\.name = name/);
  assert.match(ui, /button\.textContent = `👤 \$\{name\}`/);
  assert.doesNotMatch(ui, /mentionBox\.innerHTML = names\.map/);
});
