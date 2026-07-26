import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isRawCharacterUid,
  isTradeCharacterOnline,
  mergeTradeRecipients,
  resolveTradeRecipientInput,
} from '../src/ui/CardTradeRecipient.js';

const gameUiSource = readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const gameSyncSource = readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('database identity enriches the matching online recipient', () => {
  const results = mergeTradeRecipients(
    [{ username: 'Poring', userId: 'account-adb19b2f', level: 31 }],
    [{
      username: 'Poring',
      userId: 'account-adb19b2f',
      characterId: 'char_k9x4m2p8',
      level: 31,
    }],
    'char_self0001',
  );

  assert.deepEqual(results, [{
    username: 'Poring',
    userId: 'account-adb19b2f',
    characterId: 'char_k9x4m2p8',
    level: 31,
    online: true,
  }]);
});

test('selected autocomplete target bypasses UID and name resolution', async () => {
  let calls = 0;
  const selectedTarget = {
    username: 'Poring',
    userId: 'account-adb19b2f',
    characterId: 'char_k9x4m2p8',
    online: true,
  };

  const result = await resolveTradeRecipientInput({
    rawInput: 'K9X4M2P8',
    selectedTarget,
    searchByName: async () => { calls += 1; return []; },
    resolveByUid: async () => { calls += 1; return null; },
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: true, source: 'selected', target: selectedTarget });
});

test('free-hand player name resolves the exact database character', async () => {
  const exact = {
    username: 'Poring',
    userId: 'account-adb19b2f',
    characterId: 'char_k9x4m2p8',
  };
  const result = await resolveTradeRecipientInput({
    rawInput: 'poring',
    searchByName: async () => [
      { username: 'PoringKing', characterId: 'char_wrong001' },
      exact,
    ],
    resolveByUid: async () => {
      throw new Error('name must not use UID resolution');
    },
  });

  assert.deepEqual(result, { ok: true, source: 'name', target: exact });
});

test('only a full eight-character code uses UID resolution', async () => {
  assert.equal(isRawCharacterUid('ADB19B2F'), true);
  assert.equal(isRawCharacterUid('#adb19b2f'), true);
  assert.equal(isRawCharacterUid('Dead'), false);

  const target = {
    username: 'Poring',
    userId: 'account-adb19b2f',
    characterId: 'char_adb19b2f',
  };
  const result = await resolveTradeRecipientInput({
    rawInput: '#ADB19B2F',
    searchByName: async () => {
      throw new Error('UID must not use name search');
    },
    resolveByUid: async uid => {
      assert.equal(uid, 'ADB19B2F');
      return target;
    },
  });

  assert.deepEqual(result, { ok: true, source: 'uid', target });
});

test('unresolved names and UIDs return specific failure reasons', async () => {
  assert.deepEqual(await resolveTradeRecipientInput({
    rawInput: 'Nobody',
    searchByName: async () => [],
    resolveByUid: async () => null,
  }), { ok: false, reason: 'name_not_found' });

  assert.deepEqual(await resolveTradeRecipientInput({
    rawInput: 'ZZZZ9999',
    searchByName: async () => [],
    resolveByUid: async () => null,
  }), { ok: false, reason: 'uid_not_found' });
});

test('online delivery requires the exact active character, not only its account', () => {
  const roster = [{
    userId: 'shared-account',
    characterId: 'char_active001',
    username: 'Active',
  }];

  assert.equal(isTradeCharacterOnline(roster, {
    userId: 'shared-account',
    characterId: 'char_active001',
  }), true);
  assert.equal(isTradeCharacterOnline(roster, {
    userId: 'shared-account',
    characterId: 'char_other002',
  }), false);
});

test('live trade packets carry and validate the target character identity', () => {
  assert.match(gameUiSource, /isTradeCharacterOnline\(this\.onlinePlayers,\s*target\)/);
  assert.match(gameUiSource, /cleanStats,\s*target\.characterId/);
  assert.match(gameUiSource, /payload\.targetCharacterId !== this\.characterId/);
  assert.match(gameSyncSource, /targetCharacterId:\s*targetCharacterId/);
  assert.match(gameSyncSource, /payload\.targetCharacterId === characterId/);
});
