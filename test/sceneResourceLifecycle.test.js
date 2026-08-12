import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');

test('map changes release deduplicated environment geometry and materials', () => {
  const dispose = source.match(/_disposeEnvironmentObjects\(objects\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(dispose, /const geometries = new Set\(\)/);
  assert.match(dispose, /const materials = new Set\(\)/);
  assert.match(dispose, /this\.scene\.remove\(object\)/);
  assert.match(dispose, /child\.geometry\.dispose\(\)/);
  assert.match(dispose, /material\.dispose\(\)/);
  assert.match(dispose, /const retainedTextures = new Set/);
  assert.match(dispose, /this\._leafTextureCache\.values\(\)/);
  assert.match(dispose, /!retainedTextures\.has\(texture\)/);
  assert.match(dispose, /texture\.dispose\(\)/);
});

test('loadMap disposes the old environment before clearing its registry', () => {
  const load = source.match(/loadMap\(mapId\) \{([\s\S]*?)this\.currentMap = mapId/)?.[1] || '';
  assert.match(load, /this\._disposeEnvironmentObjects\(this\.envObjects\)/);
  assert.ok(load.indexOf('_disposeEnvironmentObjects') < load.indexOf('this.envObjects = []'));
  assert.doesNotMatch(load, /this\.envObjects\.forEach\(obj => this\.scene\.remove\(obj\)\)/);
});
