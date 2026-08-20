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
  assert.match(mainSource, /spawnMonsterAttackEffect/);
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
  assert.match(monsterSource, /const AGGRO_LEASH_DISTANCE = 42/);
});

test('angry stars appear on rage and clear on death or respawn', () => {
  assert.match(monsterSource, /_createAngryStars\(size\)/);
  assert.match(monsterSource, /stars\.name = 'angry-stars'/);
  assert.match(monsterSource, /this\._setAngryStarsVisible\(next\)/);
  assert.match(monsterSource, /_animateAngryStars\(dt\)/);
  assert.match(monsterSource, /this\._angryStars\.visible = false/);
  assert.match(monsterSource, /this\._angryStarTime = 0/);
  assert.match(monsterSource, /this\.setEnraged\(false\);/);
  assert.match(monsterSource, /this\._aggroUntil = 0/);
});

test('aggro chase keeps moving around blocked terrain instead of cancelling revenge', () => {
  assert.match(monsterSource, /isMonsterNavObstacle/);
  assert.match(monsterSource, /const angles = \[0, Math\.PI \/ 7/);
  assert.match(monsterSource, /const score = progress - lateral \* 0\.22/);
  assert.match(serverSource, /function chooseChaseStep\(m, mapId, dx, dz, dist, step\)/);
  assert.match(serverSource, /const angles = \[0, Math\.PI \/ 7/);
  assert.match(serverSource, /const detour = chooseChaseStep/);
  assert.match(serverSource, /if \(dist > AGGRO_LEASH_DISTANCE\)/);
  assert.match(serverSource, /const chaseSpeed = Math\.max\(BULL_RUSH_SPEED/);
  assert.match(serverSource, /const BULL_RUSH_SPEED = 7\.5/);
  assert.match(serverSource, /BULL_RUSH_ATTACK_REACH = 2\.2/);
  assert.match(serverSource, /mv: Boolean\(m\.moving\)/);
  assert.match(serverSource, /rush: Boolean\(m\.bullRush\)/);
});

test('bull rush speed and dust trail are bounded presentation contracts', () => {
  assert.match(serverSource, /const BULL_RUSH_SPEED = 7\.5/);
  assert.match(serverSource, /const chaseSpeed = Math\.max\(BULL_RUSH_SPEED/);
  assert.match(monsterSource, /_spawnRushDust\(dt\)/);
  assert.match(monsterSource, /_rushDustCooldown/);
  assert.match(monsterSource, /spawnMonsterRushDust/);
  assert.match(particleSource, /spawnMonsterRushDust\(position, direction = null, intensity = 1\)/);
  assert.match(particleSource, /if \(this\.perfMonitor\.isLowEndDevice\) return/);
  assert.match(particleSource, /particleScale < 0\.6 \? 2 : \(particleScale < 0\.85 \? 3 : 4\)/);
  assert.match(particleSource, /this\.splashEffects\.push\(\{ mesh, velocity, life:/);
});

test('local and server attack presentations count down instead of staying frozen', () => {
  assert.match(monsterSource, /if \(this\._attackAnim > 0\) this\._attackAnim = Math\.max\(0, this\._attackAnim - dt\)/);
  assert.match(monsterSource, /this\._applyThreatPose\(this\.isMoving, bounce\)/);
  assert.match(monsterSource, /animateMonsterRig\(this\._professionalRig, this\.animTimer, this\.isMoving, this\._attackAnim > 0\)/);
  assert.match(mainSource, /lastMonsterAttackFx/);
  assert.match(mainSource, /spawnMonsterHitImpact/);
  assert.match(serverSource, /seq: m\.attackSeq/);
  assert.match(monsterSource, /setServerTarget\(x, z, rot, serverMoving = false, bullRush = false\)/);
  assert.match(monsterSource, /this\._srvMotionHold = bullRush \? 0\.42 : 0\.24/);
  assert.match(monsterSource, /const bullRush = this\._bullRushActive === true/);
  assert.match(monsterSource, /const rushLean = bullRush \? -0\.34/);
  assert.match(monsterSource, /s\.mv === true, s\.rush === true/);
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
