import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/ParticleSystem.js', import.meta.url), 'utf8');

test('expired particle effects release geometry and material resources', () => {
  const dispose = source.match(/_disposeEffectObject\(object\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(dispose, /this\.scene\.remove\(object\)/);
  assert.match(dispose, /child\.geometry\.dispose\(\)/);
  assert.match(dispose, /material\.dispose\(\)/);

  const update = source.match(/update\(deltaTime\) \{([\s\S]*?)\/\/ ============ Performance Control/)?.[1] || '';
  assert.equal((update.match(/this\._disposeEffectObject\(/g) || []).length, 8);
  assert.doesNotMatch(update, /this\.scene\.remove\(/);
});

test('ParticleSystem destroy clears live objects before shared procedural textures', () => {
  const destroy = source.match(/\n    destroy\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(destroy, /objects\.forEach\(object => this\._disposeEffectObject\(object\)\)/);
  assert.match(destroy, /Object\.values\(this\.textures \|\| \{\}\)\.forEach\(texture => texture\?\.dispose\?\.\(\)\)/);
  assert.ok(destroy.indexOf('objects.forEach') < destroy.indexOf('Object.values(this.textures'));
});
