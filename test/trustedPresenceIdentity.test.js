import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

test('verified join derives character level and name from the owned database row', () => {
  const join = source.match(/socket\.on\('join'[\s\S]*?\n    \}\);/)?.[0] || '';
  assert.match(join, /\.select\('id, level, name'\)/);
  assert.match(join, /username: verifiedCharacter\?\.name \|\| username/);
  assert.match(join, /level: verifiedCharacter\?\.level \|\| level/);
});

test('verified presence updates can change map but not identity or progression', () => {
  const update = source.match(/socket\.on\('update_presence'[\s\S]*?\n    \}\);/)?.[0] || '';
  assert.match(update, /username: player\.verified \? player\.username/);
  assert.match(update, /level: player\.verified \? player\.level/);
  assert.match(update, /mapId: data\.mapId \?\? player\.mapId/);
});
