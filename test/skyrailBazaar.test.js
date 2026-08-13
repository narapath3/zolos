import test from 'node:test';
import assert from 'node:assert/strict';
import { SKYRAIL_ACTIVITIES, SkyrailActivitySession, canEnterSkyrail, getSkyrailRoute, getSkyrailStatus } from '../src/events/SkyrailBazaar.js';
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
  assert.equal(SKYRAIL_ACTIVITIES.length, 4);
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

test('Prontera exposes a rocket launch on the circular summit lookout', () => {
  const sceneSource = readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
  assert.match(sceneSource, /target:\s*'skyrail_bazaar'/);
  assert.match(sceneSource, /x:\s*43,\s*z:\s*43,\s*target:\s*'skyrail_bazaar',\s*transport:\s*'rocket'/);
  assert.match(sceneSource, /rocket\.position\.set\(p\.x, this\.getTerrainHeight\(p\.x, p\.z\) \+ 0\.41, p\.z\)/);
  assert.match(sceneSource, /_createSkyrailRocket/);
  assert.match(sceneSource, /transportType = 'skyrailRocket'/);
  assert.match(sceneSource, /🚀 SKYRAIL LAUNCH/);
});

test('Skyrail rocket performs a launch sequence before loading the floating island', () => {
  const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /function launchSkyrailRocket\(rocket\)/);
  assert.match(mainSource, /vehicle\.position\.y = vehicleStartY \+ eased \* 24/);
  assert.match(mainSource, /rocket\.userData\.anim\.launchPower = 1/);
  assert.match(mainSource, /else loadMapAndSpawn\('skyrail_bazaar'/);
  assert.match(mainSource, /transportType === 'skyrailRocket'/);
});

test('Skyrail rocket has a visible dual-color engine plume during launch', () => {
  const sceneSource = readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
  assert.match(sceneSource, /skyrail-rocket-vehicle/);
  assert.match(sceneSource, /outerFlame/);
  assert.match(sceneSource, /coreFlame/);
  assert.match(sceneSource, /color: 0xff7a20/);
  assert.match(sceneSource, /color: 0xdffcff/);
  assert.match(sceneSource, /launchPower \* 5\.5/);
});

test('Skyrail is a purpose-built floating festival arena rather than generic terrain', () => {
  const sceneSource = readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
  assert.match(sceneSource, /_createSkyrailIslandGround/);
  assert.match(sceneSource, /skyrail-grand-island/);
  assert.match(sceneSource, /skyrail-bazaar-grand-arena/);
  assert.match(sceneSource, /EAST CHECKPOINT/);
  assert.match(sceneSource, /NORTH CHECKPOINT/);
  assert.match(sceneSource, /WEST CHECKPOINT/);
  assert.match(sceneSource, /SOUTH CHECKPOINT/);
  assert.match(sceneSource, /CELESTIAL FESTIVAL ARENA/);
  assert.match(sceneSource, /if \(this\.currentMap === 'skyrail_bazaar'\) \{[\s\S]*?this\.waterMesh = null/);
  assert.match(sceneSource, /this\.skyrailArena\?\.userData\?\.skyrailAnim/);
  assert.match(sceneSource, /`\$\{icon\} ACTIVE COURSE`/);
  assert.doesNotMatch(sceneSource, /COMING SOON/);
});

test('every advertised activity has a route made from real arena coordinates', () => {
  for (const activity of SKYRAIL_ACTIVITIES) assert.ok(getSkyrailRoute(activity.id).length > 0, activity.id);
  for (const removed of ['poring_race', 'fishing_storm', 'pet_parade', 'mimic_hunt', 'skyrail_defense', 'grand_jackpot']) {
    assert.equal(getSkyrailRoute(removed).length, 0);
  }
});

test('Skyrail Circuit can be completed by walking through the four physical pads', () => {
  const session = new SkyrailActivitySession();
  for (const position of [{ x: 19, z: 0 }, { x: 0, z: 19 }, { x: -19, z: 0 }, { x: 0, z: -19 }]) {
    session.update('skyrail_circuit', position, 0.1);
  }
  assert.equal(session.snapshot().completed, true);
  assert.equal(session.snapshot().current, 4);
});

test('Core Calibration requires an uninterrupted 15-second hold in the center', () => {
  const session = new SkyrailActivitySession();
  session.update('core_calibration', { x: 0, z: 0 }, 8);
  session.update('core_calibration', { x: 10, z: 0 }, 1);
  assert.equal(session.snapshot().dwellSeconds, 0);
  session.update('core_calibration', { x: 0, z: 0 }, 15);
  assert.equal(session.snapshot().completed, true);
});

test('Skyrail remains monster-free in local and authoritative server modes', () => {
  const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const monsterManager = readFileSync(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');
  const monsterEngine = readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');
  assert.match(monsterManager, /if \(this\.mapId === 'svarrga' \|\| this\.mapId === 'skyrail_bazaar'\) return/);
  assert.match(monsterManager, /this\.mapId !== 'skyrail_bazaar'/);
  assert.match(monsterEngine, /if \(mapId === 'skyrail_bazaar'\) \{[\s\S]*?monsters: new Map\(\)/);
  assert.match(monsterEngine, /emit\('mon_state', \{ v: cfg\.version, mapId, mons \}\)/);
  assert.match(mainSource, /sceneManager\?\.currentMap === 'skyrail_bazaar'[\s\S]*?monsters\.clearAll\(\)/);
  assert.match(mainSource, /payload\?\.mapId && payload\.mapId !== sceneManager\?\.currentMap/);
  assert.match(monsterManager, /currentMap === 'skyrail_bazaar'[\s\S]*?this\.clearAll\(\)/);
});

test('client and standalone map server agree on QA availability', () => {
  for (const iso of ['2026-08-13T00:00:00Z', '2026-08-13T11:00:00Z', '2026-08-13T16:59:59Z']) {
    const client = getSkyrailStatus(new Date(iso));
    const server = getServerSkyrailStatus(new Date(iso));
    assert.equal(server.isOpen, client.isOpen);
    assert.equal(server.activityId, client.current?.id || null);
    assert.equal(server.testAlwaysOpen, client.testAlwaysOpen);
    assert.equal(server.timeZone, client.timeZone);
  }
});
