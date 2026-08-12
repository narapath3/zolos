import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const character = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('unchanged remote equipment does not rebuild its GPU meshes every position packet', () => {
  const apply = character.match(/applyAppearance\(app\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(apply, /let gearChanged = false/);
  assert.match(apply, /if \(this\.equippedGear\[k\] !== next\) gearChanged = true/);
  assert.match(apply, /if \(gearChanged\) this\.updateGearVisuals\(\)/);
  assert.match(apply, /app\.weapon !== undefined && \(app\.weapon \|\| null\) !== this\.equippedWeapon/);
  assert.match(apply, /app\.hat !== undefined && \(app\.hat \|\| 'None'\) !== this\.equippedHat/);
  assert.doesNotMatch(apply, /if \(app\.gear !== undefined \|\| app\.shield !== undefined\) this\.updateGearVisuals/);
});

test('character disposal releases canvas sprites and model resources', () => {
  assert.match(character, /_disposeSprite\(sprite\)[\s\S]*sprite\.material\?\.map[\s\S]*\.dispose\(\)/);
  const destroy = character.match(/\n    destroy\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(destroy, /clearTimeout\(this\.streakTimeout\)/);
  assert.match(destroy, /this\._disposeSprite\(this\.nameSprite\)/);
  assert.match(destroy, /this\._disposeMesh\(this\.mesh\)/);
});

test('all main remote-player removal paths use CharacterManager disposal', () => {
  const helper = main.match(/function removeRemotePlayer\(userId\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(helper, /remote\.character\?\.destroy/);
  assert.match(helper, /remotePlayersMap\.delete\(userId\)/);
  assert.doesNotMatch(main, /sceneManager\.scene\.remove\(rp\.mesh\)/);
});
