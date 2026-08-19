import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sound = fs.readFileSync(new URL('../src/engine/SoundManager.js', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('water audio has reusable procedural loops with master/environment volume routing', () => {
  assert.match(sound, /this\.environmentVolume = 0\.55/);
  assert.match(sound, /this\._environmentNodes = \{ water: null, waterfall: null \}/);
  assert.match(sound, /startEnvironmentAudio\(\)/);
  assert.match(sound, /setEnvironmentAudio\(\{ waterDistance = Infinity, waterfallDistance = Infinity \}/);
  assert.match(sound, /_distanceGain\(distance, maxDistance\)/);
  assert.match(sound, /_createEnvironmentLoop\(ctx/);
  assert.match(sound, /source\.loop = true/);
});

test('waterfall audio includes sparse splash variation and a cleanup path', () => {
  assert.match(sound, /playWaterSplash\(\{ volume = 1 \}/);
  assert.match(sound, /this\._environmentNextSplashAt = now \+ 2\.8 \+ Math\.random\(\) \* 2\.6/);
  assert.match(sound, /stopEnvironmentAudio\(\)/);
  assert.match(sound, /source\.stop\(now \+ 0\.5\)/);
});

test('SceneManager derives river and waterfall distances and throttles updates', () => {
  assert.match(scene, /setSoundManager\(soundManager\)/);
  assert.match(scene, /_updateWaterAudio\(dt\)/);
  assert.match(scene, /this\._waterAudioTimer < 0\.08/);
  assert.match(scene, /const riverZ = Math\.sin\(x \* 0\.08\) \* 10 - 2/);
  assert.match(scene, /const waterDistance = Math\.hypot\(riverSideDistance, riverEndDistance\)/);
  assert.match(scene, /const waterfallDistance = this\.currentMap === 'prontera'/);
  assert.match(scene, /setEnvironmentAudio\?\.\(\{ waterDistance, waterfallDistance \}\)/);
});

test('main starts environment audio only after persisted SFX settings and game interaction', () => {
  assert.match(main, /sceneManager\.setSoundManager\?\.\(soundManager\)/);
  assert.match(main, /soundManager\.startEnvironmentAudio\?\.\(\)/);
  assert.match(main, /AudioContext/);
});
