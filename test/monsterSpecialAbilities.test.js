import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const particleSource = fs.readFileSync(new URL('../src/engine/ParticleSystem.js', import.meta.url), 'utf8');

test('monster families have balanced special skill profiles', () => {
  assert.match(serverSource, /fire_breath: \{ family: 'dragon'/);
  assert.match(serverSource, /arcane_nova: \{ family: 'demon'/);
  assert.match(serverSource, /ground_slam: \{ family: 'construct'/);
  assert.match(serverSource, /poison_burst: \{ family: 'insect'/);
  assert.match(serverSource, /water_burst: \{ family: 'aquatic'/);
  assert.match(serverSource, /castMs:/);
  assert.match(serverSource, /cooldownMs:/);
  assert.match(serverSource, /radius:/);
});

test('special skills use server telegraph and delayed impact lifecycle', () => {
  assert.match(serverSource, /function tryStartMonsterSpecial/);
  assert.match(serverSource, /resolveAt: now \+ special\.castMs/);
  assert.match(serverSource, /emit\('mon_skill_fx'/);
  assert.match(serverSource, /emit\('mon_skill_impact'/);
  assert.match(serverSource, /m\.pendingSpecial/);
  assert.match(serverSource, /m\.specialReadyAt = now \+ special\.cooldownMs/);
});

test('AoE damage is server-authoritative and sent privately to players in radius', () => {
  assert.match(serverSource, /for \(const player of onlinePlayers\.values\(\)\)/);
  assert.match(serverSource, /pending\.radius \* pending\.radius/);
  assert.match(serverSource, /clampMonsterDamage\(player\.level \|\| 1, rawDamage\)/);
  assert.match(serverSource, /socketForChar\(player\.characterId\)\?\.emit\('mon_skill_hit'/);
  assert.match(serverSource, /emit\('mon_skill_hit', \{/);
});

test('client receives telegraph, impact, and private skill-hit events', () => {
  assert.match(syncSource, /socket\.on\('mon_skill_fx'/);
  assert.match(syncSource, /socket\.on\('mon_skill_impact'/);
  assert.match(syncSource, /socket\.on\('mon_skill_hit'/);
  assert.match(mainSource, /window\.onMonSkillFx/);
  assert.match(mainSource, /window\.onMonSkillImpact/);
  assert.match(mainSource, /window\.onMonSkillHit/);
});

test('special skill FX has readable telegraph and impact variants', () => {
  assert.match(particleSource, /spawnMonsterSkillTelegraph/);
  assert.match(particleSource, /type: 'monster-telegraph'/);
  assert.match(particleSource, /spawnMonsterSkillImpact/);
  assert.match(particleSource, /skill === 'fire_breath'/);
  assert.match(particleSource, /skill === 'arcane_nova'/);
  assert.match(particleSource, /skill === 'ground_slam'/);
  assert.match(particleSource, /wave\.type === 'monster-telegraph'/);
});

test('special skill damage remains separate from normal monster attack damage', () => {
  assert.match(serverSource, /mon_atk_fx/);
  assert.match(serverSource, /mon_skill_fx/);
  assert.match(serverSource, /mon_skill_hit/);
  assert.match(mainSource, /character\.takeDamage\(damage, \{ preMitigated: true \}\)/);
});
