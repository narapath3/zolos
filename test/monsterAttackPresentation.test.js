import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMonsterAttackStyle } from '../src/engine/MonsterManager.js';

const monsterSource = fs.readFileSync(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');
const particleSource = fs.readFileSync(new URL('../src/engine/ParticleSystem.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');

test('monster families receive distinct attack presentations', () => {
  assert.equal(getMonsterAttackStyle({ family: 'dragon' }), 'energy');
  assert.equal(getMonsterAttackStyle({ family: 'construct' }), 'slam');
  assert.equal(getMonsterAttackStyle({ family: 'beast' }), 'lunge');
  assert.equal(getMonsterAttackStyle({ family: 'slime' }), 'burst');
  assert.match(mainSource, /spawnMonsterAttackEffect/);
  assert.match(particleSource, /style === 'energy'/);
  assert.match(particleSource, /style === 'slam'/);
  assert.match(particleSource, /style === 'lunge'/);
});

test('server-owned monsters broadcast the same skill action on every populated map', () => {
  assert.match(serverSource, /io\.to\(`map:\$\{mapId\}`\)\.emit\('mon_atk_fx'/);
  assert.match(syncSource, /socket\.on\('mon_atk_fx'/);
  assert.match(mainSource, /window\.onMonAtkFx/);
  assert.match(mainSource, /getServerMonster\?\.\(payload\.id\)/);
  assert.match(monsterSource, /triggerAttackPresentation\(\)/);
});

test('every damaged monster enters a visible red enraged state', () => {
  assert.match(monsterSource, /setEnraged\(active, duration = 8\)/);
  assert.match(monsterSource, /new THREE\.Color\(0xff2028\)/);
  assert.match(monsterSource, /this\.setEnraged\(true, 8\)/);
  assert.match(monsterSource, /this\._updateEnragedState\(\)/);
  assert.match(monsterSource, /this\._remasterAura\?\.material/);
  assert.match(monsterSource, /ringMat\.opacity = next \? Math\.max\(0\.28/);
  assert.match(monsterSource, /if \(player && player\.mesh && this\.alive\)/);
});

test('enraged monsters use a universal threat pose even without a species limb rig', () => {
  assert.match(monsterSource, /_applyThreatPose\(moving, bounce = 0\)/);
  assert.match(monsterSource, /enraged \? \(moving \? -0\.18 : -0\.08\)/);
  assert.match(monsterSource, /forwardLunge/);
  assert.match(monsterSource, /this\.bodyMesh\.position\.z/);
  assert.match(monsterSource, /this\._aggroState = 'attack'/);
  assert.match(monsterSource, /this\._attackStyle = getMonsterAttackStyle\(this\)/);
});

test('aggro chase keeps moving around blocked terrain instead of cancelling revenge', () => {
  assert.match(monsterSource, /Do not freeze at a fence, rock, or curved river edge/);
  assert.match(monsterSource, /const sideX = -adz \/ pdist/);
  assert.match(monsterSource, /const detour = candidates\.find/);
  assert.match(serverSource, /Arc around the obstacle instead of dropping aggro/);
  assert.match(serverSource, /const sideX = -dz \/ dist/);
  assert.match(serverSource, /const detour = candidates\.find/);
});

test('local and server attack presentations count down instead of staying frozen', () => {
  assert.match(monsterSource, /if \(this\._attackAnim > 0\) this\._attackAnim = Math\.max\(0, this\._attackAnim - dt\)/);
  assert.match(monsterSource, /this\._applyThreatPose\(this\.isMoving, bounce\)/);
  assert.match(monsterSource, /animateMonsterRig\(this\._professionalRig, this\.animTimer, this\.isMoving, this\._attackAnim > 0\)/);
});

test('server aggro state is replicated as presentation-only state and clears on expiry', () => {
  assert.match(serverSource, /aggro: Boolean\(m\.aggroChar && Date\.now\(\) < m\.aggroUntil\)/);
  assert.match(serverSource, /Expired aggro returns the monster to neutral/);
  assert.match(monsterSource, /setServerEnraged\?\.\(Boolean\(s\.aggro\)\)/);
  assert.match(monsterSource, /setEnraged\(true, Infinity\)/);
});

test('respawn clears every local revenge and unfinished attack state', () => {
  const reset = monsterSource.match(/reset\(position\) \{[\s\S]*?\r?\n    \}\r?\n\r?\n    destroy\(\)/)?.[0] || '';
  assert.match(reset, /this\._aggroUntil = 0/);
  assert.match(reset, /this\._atkCd = 0/);
  assert.match(reset, /this\._attackAnim = 0/);
  assert.match(reset, /this\._aggroState = 'idle'/);
  assert.match(reset, /this\.wanderTarget = null/);
  assert.match(reset, /this\._localContributed = false/);
  assert.match(serverSource, /m\.aggroChar = null; m\.aggroUntil = 0;[\s\S]{0,80}m\.atkReadyAt = 0/);
});
