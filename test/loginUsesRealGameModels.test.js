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
  assert.match(scene, /this\.manaField/);
  assert.match(scene, /this\.lightBeams/);
});

test('AuthUI runs the real 3D showcase instead of the illustrated canvas actor', () => {
  assert.match(auth, /new LoginShowcase3D\('auth-bg-canvas'\)/);
  assert.doesNotMatch(auth, /new LoginCanvasBg/);
});

test('AI environment art is limited to responsive scenery behind real models', () => {
  assert.match(scene, /login_environment_ro_desktop_v1\.jpg/);
  assert.match(scene, /login_environment_ro_mobile_v1\.jpg/);
  assert.match(scene, /this\.scene\.background = texture/);
  assert.match(css, /login_environment_ro_desktop_v1\.jpg/);
  assert.match(css, /login_environment_ro_mobile_v1\.jpg/);
  assert.ok(fs.existsSync(new URL('../src/assets/login_environment_ro_desktop_v1.jpg', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../src/assets/login_environment_ro_mobile_v1.jpg', import.meta.url)));
});
