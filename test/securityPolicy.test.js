import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clearSocketMappingIfCurrent,
  isAllowedOrigin,
  normalizePresence,
  resolveTrustedMap,
  sanitizeSaveUpdates,
  sanitizeInventoryBackup,
  validateMovement,
  shouldRateLimitEvent,
  clampMonsterDamage,
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

test('save snapshots clean and bound outfit loadout presets', () => {
  const { appearance } = sanitizeSaveUpdates({
    appearance: {
      loadouts: [
        { id: 'a', name: 'Mummy', slots: { weapon: 'Sword', body: 'Cotton Shirt', bogus: 'X' } },
        { name: 'x'.repeat(50), slots: { hat: null } },
        'not-an-object',
      ],
    },
  });
  const sets = appearance.loadouts;
  // Malformed (non-object) entry dropped; two valid ones kept.
  assert.equal(sets.length, 2);
  // Unknown slot key stripped, valid ones kept.
  assert.deepEqual(sets[0].slots, { weapon: 'Sword', body: 'Cotton Shirt' });
  assert.equal(sets[0].name, 'Mummy');
  // Name clamped to 24 chars; missing id backfilled.
  assert.equal(sets[1].name.length, 24);
  assert.ok(sets[1].id);
});

test('save snapshots cap outfit loadout presets at 30', () => {
  const { appearance } = sanitizeSaveUpdates({
    appearance: { loadouts: Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, slots: {} })) },
  });
  assert.equal(appearance.loadouts.length, 30);
});

test('save snapshots allow decreases used by combat and purchases', () => {
  const previous = { hp: 1000, sp: 500, gold: 5000 };
  assert.deepEqual(
    sanitizeSaveUpdates({ hp: 25, sp: 10, gold: 100 }, previous, 1000),
    { hp: 25, sp: 10, gold: 100 },
  );
});

test('save snapshots reject duplicate canonical card sockets instead of accepting aliases', () => {
  const previous = {};
  assert.deepEqual(
    sanitizeSaveUpdates({
      appearance: { cards: { weapon: 'Willow Card', body: 'willow' } },
    }, previous),
    {},
  );
});

test('save snapshots migrate valid legacy card sockets to canonical IDs', () => {
  const previous = {};
  assert.deepEqual(
    sanitizeSaveUpdates({
      appearance: { cards: { weapon: 'Willow Card', body: null } },
    }, previous),
    { appearance: { cards: { weapon: 'willow', body: null } } },
  );
});

test('save snapshots reject cards assigned to incompatible socket categories', () => {
  assert.deepEqual(
    sanitizeSaveUpdates({
      appearance: { cards: { shield: 'willow' } },
    }, {}),
    {},
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

test('sanitizeInventoryBackup filters malformed items and allows valid fields', () => {
  const inventoryInput = [
    { item_name: 'Poring Card', item_type: 'card', quantity: 3, stats: { card_id: 'poring', card_stars: 2 } },
    { item_name: 'Super Weapon', item_type: 'weapon', stats: { cards: ['willow', null, 'invalid_card_name'], custom_exploit: true } },
    { item_name: '', item_type: 'useless' },
  ];

  const sanitized = sanitizeInventoryBackup(inventoryInput);
  assert.equal(sanitized.length, 2);

  assert.equal(sanitized[0].item_name, 'Poring Card');
  assert.equal(sanitized[0].stats.card_id, 'poring');
  assert.equal(sanitized[0].stats.card_stars, 2);

  assert.equal(sanitized[1].item_name, 'Super Weapon');
  assert.deepEqual(sanitized[1].stats.cards, ['willow', null, null]);
  assert.equal(sanitized[1].stats.custom_exploit, undefined);
});

test('validateMovement validates velocities correctly', () => {
  assert.equal(
    validateMovement(
      { x: 0, y: 1.2, z: 0, mapId: 'prontera' },
      { x: 5, y: 1.2, z: 5, mapId: 'prontera' },
      1000
    ),
    true
  );

  assert.equal(
    validateMovement(
      { x: 0, y: 1.2, z: 0, mapId: 'prontera', teleported: true },
      { x: 200, y: 1.2, z: 200, mapId: 'prontera' },
      200
    ),
    true
  );

  assert.equal(
    validateMovement(
      { x: 0, y: 1.2, z: 0, mapId: 'prontera' },
      { x: 0, y: 1.2, z: 100, mapId: 'prontera' },
      1000
    ),
    false
  );

  assert.equal(
    validateMovement(
      { x: 0, y: 1.2, z: 0, mapId: 'prontera' },
      { x: 0, y: 1.2, z: 100, mapId: 'prontera' },
      100
    ),
    true
  );
});

test('shouldRateLimitEvent limits event frequency', () => {
  const tracker = {};
  assert.equal(shouldRateLimitEvent(tracker, 'attack', 2, 100, 1000), false);
  assert.equal(shouldRateLimitEvent(tracker, 'attack', 2, 100, 1020), false);
  assert.equal(shouldRateLimitEvent(tracker, 'attack', 2, 100, 1030), true);

  assert.equal(shouldRateLimitEvent(tracker, 'attack', 2, 100, 1150), false);
});

test('clampMonsterDamage clamps player PvE damage based on level', () => {
  assert.equal(clampMonsterDamage(1, 10000), 5500); // level 1: max is 1*500+5000 = 5500
  assert.equal(clampMonsterDamage(10, 8000), 8000); // level 10: max is 10*500+5000 = 10000
  assert.equal(clampMonsterDamage(10, 15000), 10000); // level 10: max is 10*500+5000 = 10000
  assert.equal(clampMonsterDamage(300, 200000), 155000); // level 300: max is 300*500+5000 = 155000
  assert.equal(clampMonsterDamage(10, -500), 0); // negative damage clamped to 0
});

test('server.js implements GET /admin/chat-log option and limits chat buffer', async () => {
  const source = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');

  // Verify the admin chat log express endpoint exists and is gated
  assert.match(source, /app\.get\(['"]\/admin\/chat-log['"]/);
  assert.match(source, /authorization/i);
  assert.match(source, /Bearer/i);
  assert.match(source, /supabase\.auth\.getUser/);
  assert.match(source, /\.select\(['"]is_admin['"]\)/);

  // Verify the chat socket event records messages in chat log buffer
  assert.match(source, /chatLog\.push\(\{/);
  assert.match(source, /userId:\s*player\.userId/);
  assert.match(source, /chatLog\.length\s*>\s*2000/);
  assert.match(source, /chatLog\.shift\(\)/);
});




