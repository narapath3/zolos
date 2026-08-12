import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');

test('destroyed monsters release unique GPU resources but retain the shared skin texture', () => {
  const destroy = source.match(/\n    destroy\(\) \{([\s\S]*?)\n    \}\n\}/)?.[1] || '';
  assert.match(destroy, /this\.mesh\.traverse/);
  assert.match(destroy, /child\.geometry\.dispose\(\)/);
  assert.match(destroy, /material\.map !== sharedMonsterSkinTexture/);
  assert.match(destroy, /material\.map\.dispose\(\)/);
  assert.match(destroy, /material\.dispose\(\)/);
});

test('map clearing and server monster replacement use the disposal path', () => {
  const clearAll = source.match(/clearAll\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  const removeServer = source.match(/_removeServerMonster\(m\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(clearAll, /new Set\(\[\.\.\.this\.monsters, \.\.\.this\.waterMonsters\]\)\.forEach\(m => m\.destroy\(\)\)/);
  assert.match(removeServer, /m\.destroy\(\)/);
});
