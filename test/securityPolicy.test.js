import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clearSocketMappingIfCurrent,
  isAllowedOrigin,
  normalizePresence,
  resolveTrustedMap,
  sanitizeSaveUpdates,
} from '../server/securityPolicy.js';

test('late cleanup from an old socket preserves the replacement socket mapping', () => {
  const sockets = new Map([['user-1', 'socket-new']]);

  assert.equal(clearSocketMappingIfCurrent(sockets, 'user-1', 'socket-old'), false);
  assert.equal(sockets.get('user-1'), 'socket-new');
  assert.equal(clearSocketMappingIfCurrent(sockets, 'user-1', 'socket-new'), true);
  assert.equal(sockets.has('user-1'), false);
});

test('save snapshots reject implausible progression increases', () => {
  const previous = { level: 10, exp: 1000, gold: 5000, zol: 5 };
  assert.deepEqual(
    sanitizeSaveUpdates(
      { level: 300, exp: 99999999, gold: 500000000, zol: 999999 },
      previous,
      180_000,
    ),
    {},
  );
});

test('save snapshots preserve legitimate progression and safe presentation fields', () => {
  const previous = { level: 10, exp: 1000, gold: 5000, zol: 5 };
  assert.deepEqual(
    sanitizeSaveUpdates(
      {
        level: 11,
        exp: 2500,
        gold: 7500,
        zol: 6,
        weapon: 'Sword',
        body_color: 12,
        sound_enabled: false,
        graphics_quality: 'low',
      },
      previous,
      180_000,
    ),
    {
      level: 11,
      exp: 2500,
      gold: 7500,
      zol: 6,
      weapon: 'Sword',
      body_color: 12,
      sound_enabled: false,
      graphics_quality: 'low',
    },
  );
});

test('save snapshots allow decreases used by combat and purchases', () => {
  const previous = { hp: 1000, sp: 500, gold: 5000 };
  assert.deepEqual(
    sanitizeSaveUpdates({ hp: 25, sp: 10, gold: 100 }, previous, 1000),
    { hp: 25, sp: 10, gold: 100 },
  );
});

test('trusted map comes from the server player record', () => {
  assert.equal(resolveTrustedMap({ mapId: 'prontera_field' }), 'prontera_field');
});

test('presence values are normalized and bounded', () => {
  assert.deepEqual(normalizePresence({ username: '  Hero  ', level: 99999, mapId: '../admin' }), {
    username: 'Hero',
    level: 300,
    mapId: 'prontera_field',
  });
});

test('origin policy rejects unrelated Vercel sites', () => {
  assert.equal(isAllowedOrigin('https://attacker.vercel.app', []), false);
  assert.equal(isAllowedOrigin('https://zolos.online', []), true);
  assert.equal(isAllowedOrigin('https://preview.example', ['https://preview.example']), true);
});

test('server does not treat client userId as a system-message capability', async () => {
  const source = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /payload\.userId\s*===\s*['"]system['"]/);
});

test('server does not fall back from service role to anon key', async () => {
  const source = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|[^;]*ANON_KEY/);
});

test('verified player display identity comes from the server profile', async () => {
  const source = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.match(source, /\.select\(['"]username,\s*is_admin['"]\)/);
  assert.match(source, /username\s*=\s*profile\.username/);
});
