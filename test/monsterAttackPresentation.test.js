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

test('respawn clears every local revenge and unfinished attack state', () => {
  const reset = monsterSource.match(/reset\(position\) \{[\s\S]*?\r?\n    \}\r?\n\r?\n    destroy\(\)/)?.[0] || '';
  assert.match(reset, /this\._aggroUntil = 0/);
  assert.match(reset, /this\._atkCd = 0/);
  assert.match(reset, /this\._attackAnim = 0/);
  assert.match(reset, /this\.wanderTarget = null/);
  assert.match(reset, /this\._localContributed = false/);
  assert.match(serverSource, /m\.aggroChar = null; m\.aggroUntil = 0;[\s\S]{0,80}m\.atkReadyAt = 0/);
});
