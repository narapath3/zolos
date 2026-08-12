import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('an auth callback cannot initialize a second game after startup', () => {
  assert.match(source, /async function showCharacterSelect\([^)]*\)\s*\{\s*if \(isGameStarted\) return/);
});
