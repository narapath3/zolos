import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('fusion payload accepts identity-free card ID and idempotency key only', async () => {
  const client = await readFile(new URL('../../src/network/GameSync.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../../server/server.js', import.meta.url), 'utf8');
  assert.match(client, /socket\.emit\(['"]card_fuse['"],\s*\{\s*cardId,\s*requestId\s*\}\)/);
  assert.match(server, /socket\.on\(['"]card_fuse['"]/);
  assert.doesNotMatch(server, /payload\.(?:stars|cost|quantity|userId)/);
  assert.match(server, /fuse_card/);
});
