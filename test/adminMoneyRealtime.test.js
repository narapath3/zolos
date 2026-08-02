import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin character edits are pushed to the exact online character', () => {
  const server = read('server/api/admin.js');
  assert.match(server, /player\.characterId/);
  assert.match(server, /emit\('admin_character_update'/);
  assert.match(server, /updates: changed/);
});

test('online client applies admin Gold and ZOL immediately before autosave', () => {
  const sync = read('src/network/GameSync.js');
  assert.match(sync, /socket\.on\('admin_character_update'/);
  assert.match(sync, /character\.stats\[key\] = Number\(value\)/);
  assert.match(sync, /updateHUD/);
  assert.match(sync, /updates\.gold/);
  assert.match(sync, /updates\.zol/);
});

test('in-game admin uses the realtime-aware admin API and exposes both currencies', () => {
  const ui = read('src/ui/AdminUI.js');
  assert.match(ui, /\/admin\/api\/players\/\$\{encodeURIComponent\(charId\)\}\/character/);
  assert.match(ui, /label: 'Gold', key: 'gold'/);
  assert.match(ui, /label: 'ZOL', key: 'zol'/);
});
