import test from 'node:test';
import assert from 'node:assert/strict';
import { SKYRAIL_ACTIVITIES, canEnterSkyrail, getSkyrailStatus } from '../src/events/SkyrailBazaar.js';
import { readFileSync } from 'node:fs';
import { getSkyrailStatus as getServerSkyrailStatus } from '../server/events/SkyrailBazaar.js';

const atBangkok = iso => new Date(iso);

test('Skyrail Bazaar stays open all day while QA mode is enabled', () => {
  assert.equal(getSkyrailStatus(atBangkok('2026-08-13T10:59:59Z')).isOpen, true);
  assert.equal(getSkyrailStatus(atBangkok('2026-08-13T11:00:00Z')).isOpen, true);
  assert.equal(getSkyrailStatus(atBangkok('2026-08-13T16:59:59Z')).isOpen, true);
  assert.equal(getSkyrailStatus(atBangkok('2026-08-13T17:00:00Z')).isOpen, true);
  assert.ok(getSkyrailStatus(atBangkok('2026-08-13T02:00:00Z')).current);
});

test('schedule covers the full six-hour session without gaps', () => {
  assert.equal(SKYRAIL_ACTIVITIES.length, 12);
  assert.equal(SKYRAIL_ACTIVITIES[0].start, '18:00');
  assert.equal(SKYRAIL_ACTIVITIES.at(-1).end, '24:00');
  for (let i = 1; i < SKYRAIL_ACTIVITIES.length; i++) {
    assert.equal(SKYRAIL_ACTIVITIES[i - 1].end, SKYRAIL_ACTIVITIES[i].start);
  }
});

test('entry validation allows the event map throughout QA mode', () => {
  const closed = atBangkok('2026-08-13T02:00:00Z');
  assert.equal(canEnterSkyrail('skyrail_bazaar', closed), true);
  assert.equal(canEnterSkyrail('prontera', closed), true);
});

test('Prontera exposes a physical portal to Skyrail Bazaar', () => {
  const sceneSource = readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
  assert.match(sceneSource, /target:\s*'skyrail_bazaar'/);
  assert.match(sceneSource, /skyrail_bazaar:\s*0xff5ebc/);
});

test('client and standalone map server agree on QA availability', () => {
  for (const iso of ['2026-08-13T00:00:00Z', '2026-08-13T11:00:00Z', '2026-08-13T16:59:59Z']) {
    const client = getSkyrailStatus(new Date(iso));
    const server = getServerSkyrailStatus(new Date(iso));
    assert.equal(server.isOpen, client.isOpen);
    assert.equal(server.testAlwaysOpen, client.testAlwaysOpen);
    assert.equal(server.timeZone, client.timeZone);
  }
});
