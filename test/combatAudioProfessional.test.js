import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const soundSource = fs.readFileSync(path.join(root, 'src/engine/SoundManager.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const characterSource = fs.readFileSync(path.join(root, 'src/engine/CharacterManager.js'), 'utf8');
const syncSource = fs.readFileSync(path.join(root, 'src/network/GameSync.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');

 test('combat audio exposes distinct professional weapon and skill profiles', () => {
  assert.match(soundSource, /const COMBAT_WEAPON_PROFILES = Object\.freeze\(\{/);
  for (const weapon of ['sword', 'blunt', 'bow', 'gun', 'staff', 'lightning', 'shadowslash', 'holyorb']) {
    assert.match(soundSource, new RegExp(`\\b${weapon}: \\{`));
  }
  assert.match(soundSource, /const COMBAT_SKILL_PROFILES = Object\.freeze\(\{/);
  for (const skill of ['bash', 'magnumBreak', 'fireBolt', 'frostNova', 'doubleStrafe', 'holyLight', 'blessing']) {
    assert.match(soundSource, new RegExp(`\\b${skill}: \\{`));
  }
});

test('combat audio is layered into whoosh, identity, element, and priority accents', () => {
  assert.match(soundSource, /_playCombatNoise\(ctx, t, 0\.095/);
  assert.match(soundSource, /_scheduleTone\(ctx, \{/);
  assert.match(soundSource, /_playElementAccent\(ctx/);
  assert.match(soundSource, /if \(critical\)/);
  assert.match(soundSource, /_playFinisherAccent\(ctx/);
  assert.match(soundSource, /phase === 'impact' \|\| phase === 'finisher'/);
});

test('combat audio has mobile-safe voice limiting, cooldowns, and priority ducking', () => {
  assert.match(soundSource, /this\._combatVoiceEnds = \[\];/);
  assert.match(soundSource, /this\._combatLastAt = new Map\(\)/);
  assert.match(soundSource, /const voiceLimit = priority >= 2 \? 14 : 12/);
  assert.match(soundSource, /if \(now - last < cooldown && priority < 2\) return false/);
  assert.match(soundSource, /setTargetAtTime\(0\.58, now, 0\.012\)/);
  assert.match(soundSource, /setTargetAtTime\(1, now \+ 0\.16, 0\.11\)/);
});

test('legacy weapon and skill entry points route through the professional combat action', () => {
  assert.match(soundSource, /playWeaponAttack\(weaponClass = 'sword', opts = \{\}\)/);
  assert.match(soundSource, /return this\.playCombatAction\(\{/);
  assert.match(soundSource, /playSkillSound\(skillId, opts = \{\}\)/);
  assert.match(soundSource, /const phase = opts\.phase \|\| 'cast'/);
  assert.match(soundSource, /skillSoundsEnabled/);
});

test('local skill lifecycle emits cast, impact, and finisher phases', () => {
  assert.match(characterSource, /playSkillSound\(skillId, \{ phase: 'cast' \}\)/);
  assert.match(characterSource, /phase: finisher \? 'finisher' : 'impact'/);
  assert.match(characterSource, /soundManager\?\.playSkillSound\?\.\(skillId, \{ phase: 'impact'/);
  assert.match(mainSource, /phase: 'release'/);
  assert.match(mainSource, /phase: 'impact'/);
  assert.match(mainSource, /finisher: !!event\.finisher/);
});

test('remote attack hit audio preserves distance attenuation and finisher metadata', () => {
  assert.match(mainSource, /const isFinisher = payload\.fin === 1/);
  assert.match(mainSource, /soundManager\?\.playCombatAction\?\.\(\{/);
  assert.match(mainSource, /phase: 'impact'/);
  assert.match(mainSource, /volume: remoteVolume \* 0\.78/);
  assert.match(syncSource, /isFinisher = false/);
  assert.match(syncSource, /fin: isFinisher \? 1 : 0/);
  assert.match(serverSource, /fin: payload\.fin === 1 \? 1 : 0/);
});
