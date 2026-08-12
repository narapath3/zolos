import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const petPreviewSource = fs.readFileSync(new URL('../src/engine/PetPreview.js', import.meta.url), 'utf8');

test('GameUI owns and releases recurring UI resources', () => {
  assert.match(source, /this\._networkStatusInterval\s*=\s*setInterval\(/);
  assert.match(source, /this\._onlinePlayersInterval\s*=\s*setInterval\(/);

  const destroy = source.match(/destroy\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(destroy, /this\._itemPortraitObserver\?\.disconnect\?\.\(\)/);
  assert.match(destroy, /clearInterval\(this\._networkStatusInterval\)/);
  assert.match(destroy, /clearInterval\(this\._onlinePlayersInterval\)/);
});

test('pet boutique cancels animation frames and releases its WebGL resources', () => {
  assert.match(source, /this\._petViewer\?\.destroy\?\.\(\)/);
  assert.match(petPreviewSource, /this\.animationFrameId\s*=\s*requestAnimationFrame\(this\._loop\)/);
  assert.match(petPreviewSource, /cancelAnimationFrame\(this\.animationFrameId\)/);
  assert.match(petPreviewSource, /this\.renderer\.dispose\(\)/);
  assert.match(petPreviewSource, /this\.renderer\.forceContextLoss\?\.\(\)/);
});
