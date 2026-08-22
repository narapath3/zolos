import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeJobId, JOBS } from '../src/engine/GameData.js';
import { normalizePersistedJob, sanitizeSaveUpdates } from '../server/securityPolicy.js';

const gameUI = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const characterManager = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const dataApi = fs.readFileSync(new URL('../server/api/data.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const supabaseClient = fs.readFileSync(new URL('../src/network/SupabaseClient.js', import.meta.url), 'utf8');

test('job aliases normalize to the canonical runtime ids', () => {
  assert.equal(normalizeJobId('swordman'), 'swordsman');
  assert.equal(normalizeJobId('acolyte'), 'priest');
  assert.equal(normalizeJobId('PRIEST'), 'priest');
  assert.equal(normalizeJobId('not-a-job'), null);
  assert.ok(JOBS.swordsman && JOBS.priest);
});

test('server save snapshots preserve a valid job and normalize legacy aliases', () => {
  assert.equal(normalizePersistedJob('swordman'), 'swordsman');
  assert.equal(normalizePersistedJob('acolyte'), 'priest');
  assert.equal(normalizePersistedJob('hacker'), null);
  assert.deepEqual(sanitizeSaveUpdates({ job: 'acolyte' }, {}), { job: 'priest' });
  assert.deepEqual(sanitizeSaveUpdates({ job: 'swordsman' }, {}), { job: 'swordsman' });
  assert.deepEqual(sanitizeSaveUpdates({ job: null }, {}), {});
  assert.deepEqual(sanitizeSaveUpdates({ job: 'hacker' }, {}), {});
});

test('Guest job selection writes an immediate identity-scoped recovery hint', () => {
  assert.match(gameUI, /saveGuestJobHint\(this\.character\.userId \|\| this\.characterId, canonicalJobId\)/);
  assert.match(characterManager, /getGuestJobHint\(data\.user_id \|\| data\.id\)/);
  assert.match(characterManager, /const savedJob = normalizeJobId\(data\.job\) \|\| getGuestJobHint/);
  assert.match(supabaseClient, /zolos_guest_job_/);
});

test('self-host API and authoritative save path accept job without exposing stat mutation', () => {
  assert.match(dataApi, /import \{ normalizePersistedJob \} from '\.\.\/securityPolicy\.js'/);
  assert.match(dataApi, /invalid character job/);
  assert.match(dataApi, /SERVER_AUTHORITATIVE_CHARACTER_FIELDS/);
  assert.match(server, /const filtered = sanitizeSaveUpdates\(updates, owned, elapsedMs\)/);
  assert.match(server, /\.from\('characters'\)\n\s+\.update\(filtered\)/);
});
