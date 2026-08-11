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
  const { getShowcaseAction, getLoginMvPhase } = await import('../src/engine/LoginShowcase3D.js');
  const states = new Set(Array.from({ length: 100 }, (_, i) => getShowcaseAction(i / 10, 0, 10).state));
  assert.deepEqual(states, new Set(['walking', 'running', 'attacking', 'idle']));
  assert.match(scene, /animateMonsterRig\(monster\._professionalRig/);
  assert.match(scene, /hero\.showcaseDesired\.lerpVectors/);
  assert.match(scene, /monster\.showcaseHome/);
  assert.equal(getLoginMvPhase(90.9, 180), 'combat');
  assert.equal(getLoginMvPhase(91, 180), 'party');
  assert.equal(getLoginMvPhase(162, 180), 'finale');
  const beforeRun = getShowcaseAction(2.399, 0, 10).travel;
  const afterRun = getShowcaseAction(2.401, 0, 10).travel;
  assert.ok(Math.abs(afterRun - beforeRun) < 0.01, 'walk-to-run travel must remain continuous');
});

test('login motion uses frame-rate independent damping and avoids unused shadow maps', () => {
  assert.match(scene, /1 - Math\.exp\(-dt \* 9\)/);
  assert.match(scene, /this\.renderer\.shadowMap\.enabled = false/);
  assert.match(scene, /document\.hidden/);
});

test('soundtrack finale writes ZOLOS ONLINE progressively with game actors', () => {
  assert.match(scene, /const label = 'ZOLOS ONLINE'/);
  assert.match(scene, /repeatingTitleProgress/);
  assert.match(scene, /this\.soundtrack\.currentTime/);
  assert.match(auth, /this\._bgCanvas\.setSoundtrack\(this\._bgm\)/);
});

test('login monsters hide both health bar layers and magic bursts into ZOLOS', () => {
  assert.match(scene, /monster\.hpBarBg\.visible = false/);
  assert.match(scene, /monster\.hpBarFill\.visible = false/);
  assert.match(scene, /const word = 'ZOLOS'/);
  assert.match(scene, /_updateZolosFirework/);
  assert.match(scene, /index === 2 && p < 0\.38/);
  assert.match(scene, /const mvLoop = musicTime % 16/);
  assert.match(scene, /_updateZolosFirework\(mvLoop \/ 8/);
  assert.match(scene, /size: 0\.2/);
  assert.match(scene, /repeatingCast = index === 2 && mvLoop < 8/);
  assert.doesNotMatch(scene, /p > 0\.88 \? \(1 - p\)/);
  assert.match(scene, /monsterLooksAtCamera/);
  assert.match(scene, /looksAtCamera \? 0/);
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
