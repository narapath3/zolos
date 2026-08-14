import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const particleSource = fs.readFileSync(new URL('../src/engine/ParticleSystem.js', import.meta.url), 'utf8');

test('footstep effects follow travelled stride distance instead of spawning every frame', () => {
  assert.match(mainSource, /footstepTravel \+= movedThisStep/);
  assert.match(mainSource, /footstepTravel >= stride/);
  assert.match(mainSource, /particles\?\.spawnFootstep\?\./);
});

test('water exit produces temporary wet marks and mobile particle counts stay bounded', () => {
  assert.match(mainSource, /previousFootstepEnvironment === 'water' && env !== 'water'/);
  assert.match(mainSource, /wetFootstepTime = 4\.5/);
  assert.match(particleSource, /this\.perfMonitor\.isLowEndDevice \? 2/);
  assert.match(particleSource, /this\.groundMarks\.push\(\{ mesh: mark, life: 2\.2/);
  assert.match(particleSource, /this\.groundMarks\.splice\(i, 1\)/);
});
