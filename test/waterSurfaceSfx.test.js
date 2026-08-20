import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sound = fs.readFileSync(new URL('../src/engine/SoundManager.js', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('procedural footstep SFX exposes distinct grass, bridge, wet, and water surfaces', () => {
  assert.match(sound, /playFootstep\(surface = 'grass', \{ volume = 1 \} = \{\}\)/);
  assert.match(sound, /surface === 'bridge'/);
  assert.match(sound, /surface === 'water' \|\| surface === 'wet'/);
  assert.match(sound, /this\._lastFootstepAt/);
  assert.match(sound, /const cooldown = surface === 'bridge' \? 0\.16 : 0\.18/);
});

test('main movement keeps visual footprints while footstep audio stays disabled', () => {
  assert.match(main, /particles\?\.spawnFootstep\?\./);
  assert.doesNotMatch(main, /soundManager\?\.playFootstep\?\./);
  assert.match(main, /Footstep audio is intentionally disabled/);
});

test('SceneManager detects bridge and wet riverbank surfaces', () => {
  assert.match(scene, /getFootstepSurface\(position\)/);
  assert.match(scene, /Math\.abs\(position\.x\) < PRONTERA_BRIDGE_HALF_WIDTH/);
  assert.match(scene, /position\.z >= PRONTERA_BRIDGE_MIN_Z && position\.z <= PRONTERA_BRIDGE_MAX_Z/);
  assert.match(scene, /if \(this\.isInWater\(position\)\) return 'water'/);
  assert.match(scene, /return 'wet'/);
});

test('river night ambience is quality-scaled and animated after weather', () => {
  assert.match(scene, /_createRiverNightAmbience\(riverLength\)/);
  assert.match(scene, /this\.riverLanterns = \[\]/);
  assert.match(scene, /this\.riverNightMotes = null/);
  assert.match(scene, /this\.riverNightHaze = \[\]/);
  assert.match(scene, /const lanternCount = quality === 'high'/);
  assert.match(scene, /const moteCount = quality === 'high'/);
  assert.match(scene, /_updateRiverNightAtmosphere\(dt\)/);
  assert.match(scene, /this\.moonFillLight\.intensity/);
  assert.match(scene, /light\.intensity = night \*/);
});

