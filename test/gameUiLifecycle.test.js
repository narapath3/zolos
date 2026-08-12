import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const petPreviewSource = fs.readFileSync(new URL('../src/engine/PetPreview.js', import.meta.url), 'utf8');
const jobPreviewSource = fs.readFileSync(new URL('../src/engine/JobPreview.js', import.meta.url), 'utf8');
const profileSource = fs.readFileSync(new URL('../src/ui/PlayerProfileModal.js', import.meta.url), 'utf8');

test('GameUI owns and releases recurring UI resources', () => {
  assert.match(source, /this\._networkStatusInterval\s*=\s*setInterval\(/);
  assert.match(source, /this\._onlinePlayersInterval\s*=\s*setInterval\(/);

  const destroy = source.match(/destroy\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(destroy, /this\._itemPortraitObserver\?\.disconnect\?\.\(\)/);
  assert.match(destroy, /clearInterval\(this\._networkStatusInterval\)/);
  assert.match(destroy, /clearInterval\(this\._onlinePlayersInterval\)/);
  assert.match(destroy, /this\.playerProfileModal\?\.destroy\?\.\(\)/);
  for (const timer of ['_equipToastTimer', '_duelOverlayTimer', '_chatIdleTimer', '_journalSaveTimer', '_cardTradeSuggestTimer', 'tradeTimeout']) {
    assert.match(destroy, new RegExp(`clearTimeout\\(this\\.${timer}\\)`));
  }
});

test('GameUI owns global HUD and chat listeners across teardown', () => {
  assert.match(source, /this\._globalListenerRemovers\s*=\s*\[\]/);
  assert.match(source, /_listenGlobal\(target, type, handler, options\)\s*\{[\s\S]*addEventListener\(type, handler, options\)[\s\S]*removeEventListener\(type, handler, options\)/);
  const destroy = source.match(/destroy\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(destroy, /this\._globalListenerRemovers\.splice\(0\)/);
  assert.match(source, /this\._listenGlobal\(document, 'pointerdown'/);
  assert.match(source, /this\._listenGlobal\(window, 'keydown'/);
  assert.match(source, /if \(window\.gameUI === this\) window\.gameUI = null/);
});

test('pet boutique cancels animation frames and releases its WebGL resources', () => {
  assert.match(source, /this\._petViewer\?\.destroy\?\.\(\)/);
  assert.match(petPreviewSource, /this\.animationFrameId\s*=\s*requestAnimationFrame\(this\._loop\)/);
  assert.match(petPreviewSource, /cancelAnimationFrame\(this\.animationFrameId\)/);
  assert.match(petPreviewSource, /this\.renderer\.dispose\(\)/);
  assert.match(petPreviewSource, /this\.renderer\.forceContextLoss\?\.\(\)/);
});

test('profile preview releases its character, scene resources, and WebGL context', () => {
  assert.match(profileSource, /destroy\(\)\s*\{[\s\S]*this\.jobPreview\?\.dispose\?\.\(\)/);
  assert.match(jobPreviewSource, /this\.char\?\.destroy\?\.\(\)/);
  assert.match(jobPreviewSource, /this\.scene\?\.traverse\(/);
  assert.match(jobPreviewSource, /this\.renderer\?\.dispose\?\.\(\)/);
  assert.match(jobPreviewSource, /this\.renderer\?\.forceContextLoss\?\.\(\)/);
});
