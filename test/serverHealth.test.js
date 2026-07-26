import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthPayload } from '../server/health.js';

test('health payload exposes a bounded Railway commit revision', () => {
  assert.deepEqual(
    buildHealthPayload({
      playerCount: 2,
      uptime: 42.9,
      revision: '3b21c0fc57bca074ce3795723c92aad336cab38a',
    }),
    {
      status: 'ok',
      server: 'zolos-map-server',
      players: 2,
      uptime: 42,
      revision: '3b21c0fc57bc',
    },
  );
});

test('health payload normalizes invalid runtime values safely', () => {
  assert.deepEqual(
    buildHealthPayload({
      playerCount: -10,
      uptime: Number.NaN,
      revision: 'not a commit / secret=value',
      fallbackVersion: '1.0.0',
      token: 'must-never-be-returned',
    }),
    {
      status: 'ok',
      server: 'zolos-map-server',
      players: 0,
      uptime: 0,
      revision: 'v1.0.0',
    },
  );
});
