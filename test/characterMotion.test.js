import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleLocomotionPose, sampleAttackPose } from '../src/engine/CharacterManager.js';
import fs from 'node:fs';

const characterSource = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('walk and run poses carry weight and use opposing limbs', () => {
  const walk = sampleLocomotionPose('walking', Math.PI / 2, 1);
  const run = sampleLocomotionPose('running', Math.PI / 2, 1);
  const walkStep = sampleLocomotionPose('walking', 0, 1);
  const runStep = sampleLocomotionPose('running', 0, 1);
  assert.ok(walk.leftLegX > 0 && walk.rightLegX < 0);
  assert.ok(walk.leftArmX < 0 && walk.rightArmX > 0);
  assert.notEqual(walk.leftLegZ, walk.rightLegZ);
  assert.ok(walkStep.leftLegY > 0.35 || walkStep.rightLegY > 0.35);
  assert.ok(Math.abs(run.leftLegX) > Math.abs(walk.leftLegX));
  assert.ok(Math.max(runStep.leftLegY, runStep.rightLegY) > Math.max(walkStep.leftLegY, walkStep.rightLegY));
  assert.ok(run.lean > walk.lean);
});

test('attack timelines trigger from real swings and do not loop during cooldown', () => {
  assert.doesNotMatch(characterSource, /state === 'attacking'[\s\S]{0,160}triggerAttack/);
  assert.match(mainSource, /p\.aseq !== rp\.lastAseq[\s\S]{0,400}triggerAttack/);
  assert.match(characterSource, /attackAnimElapsed >= this\.attackAnimDuration && this\.state === 'attacking'\) this\.state = 'idle'/);
});

test('attack poses have readable anticipation, impact and weapon-specific motion', () => {
  const windup = sampleAttackPose('melee', 0.2);
  const hit = sampleAttackPose('melee', 0.42);
  assert.ok(windup.rightX < 0);
  assert.ok(hit.rightX > windup.rightX);
  assert.notDeepEqual(sampleAttackPose('bow', 0.4), sampleAttackPose('gun', 0.4));
  assert.ok(sampleAttackPose('magic', 0.4).leftZ > 0);
});
