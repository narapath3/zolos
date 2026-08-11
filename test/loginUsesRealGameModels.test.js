import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scene = fs.readFileSync(new URL('../src/engine/LoginShowcase3D.js', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');

test('login showcase imports the exact runtime hero and monster builders', () => {
  assert.match(scene, /import \{ CharacterManager \} from '\.\/CharacterManager\.js'/);
  assert.match(scene, /import \{ Monster \} from '\.\/MonsterManager\.js'/);
  assert.match(scene, /new CharacterManager\(this\.scene\)/);
  assert.match(scene, /new Monster\(this\.scene, type, position\)/);
  assert.doesNotMatch(scene, /drawHero|drawMonster|ImageGen/);
});

test('hero advertises only gear that exists in the live game', () => {
  for (const item of ['Solaris Edge', 'Aegis Prime', 'Celestial Sovereign Helm', 'Empyrean Plate', 'Wings of Aeon', 'Titan Bracers', 'Astral Legguards', 'Worldwalker Greaves']) {
    assert.match(scene, new RegExp(item));
  }
  assert.match(scene, /pet: 'ember_phoenix', petLevel: 40/);
});

test('AuthUI runs the real 3D showcase instead of the illustrated canvas actor', () => {
  assert.match(auth, /new LoginShowcase3D\('auth-bg-canvas'\)/);
  assert.doesNotMatch(auth, /new LoginCanvasBg/);
});
