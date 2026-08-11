import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scene = fs.readFileSync(new URL('../src/engine/LoginShowcase3D.js', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');

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
  assert.match(scene, /pet: 'ember_phoenix'/);
  assert.match(scene, /petLevel: 28 \+ index \* 4/);
});

test('login key art presents a four-job party with distinct divine weapons', () => {
  for (const job of ['swordsman', 'archer', 'mage', 'priest']) assert.match(scene, new RegExp(`job: '${job}'`));
  for (const weapon of ['Solaris Edge', 'Chronos Bow', 'Genesis Staff', 'Seraph Rod']) assert.match(scene, new RegExp(weapon));
  assert.match(scene, /this\.heroes = cast\.map/);
  assert.doesNotMatch(scene, /this\.manaField|this\.lightBeams/);
});

test('showcase actors patrol, run, attack and idle on independent timelines', async () => {
  const { getShowcaseAction } = await import('../src/engine/LoginShowcase3D.js');
  const states = new Set(Array.from({ length: 100 }, (_, i) => getShowcaseAction(i / 10, 0, 10).state));
  assert.deepEqual(states, new Set(['walking', 'running', 'attacking', 'idle']));
  assert.match(scene, /animateMonsterRig\(monster\._professionalRig/);
  assert.match(scene, /hero\.mesh\.position\.lerpVectors/);
  assert.match(scene, /monster\.showcaseHome/);
});

test('AuthUI runs the real 3D showcase instead of the illustrated canvas actor', () => {
  assert.match(auth, /new LoginShowcase3D\('auth-bg-canvas'\)/);
  assert.doesNotMatch(auth, /new LoginCanvasBg/);
});

test('AI environment art stays in CSS while WebGL renders only game actors', () => {
  assert.match(scene, /alpha: true/);
  assert.match(scene, /this\.scene\.background = null/);
  assert.doesNotMatch(scene, /_buildWorld|CircleGeometry\(24|DodecahedronGeometry|TextureLoader/);
  assert.match(css, /login_environment_ro_desktop_v1\.jpg/);
  assert.match(css, /login_environment_ro_mobile_v1\.jpg/);
  assert.match(css, /auth-has-live-game-art \.auth-bg-img \{[\s\S]*?opacity: 1/);
  assert.ok(fs.existsSync(new URL('../src/assets/login_environment_ro_desktop_v1.jpg', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../src/assets/login_environment_ro_mobile_v1.jpg', import.meta.url)));
});
