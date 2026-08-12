import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('GameUI owns and releases recurring UI resources', () => {
  assert.match(source, /this\._networkStatusInterval\s*=\s*setInterval\(/);
  assert.match(source, /this\._onlinePlayersInterval\s*=\s*setInterval\(/);

  const destroy = source.match(/destroy\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(destroy, /this\._itemPortraitObserver\?\.disconnect\?\.\(\)/);
  assert.match(destroy, /clearInterval\(this\._networkStatusInterval\)/);
  assert.match(destroy, /clearInterval\(this\._onlinePlayersInterval\)/);
});
