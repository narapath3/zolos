import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('inventory mutations are serialized per character and item', () => {
  const queue = source.match(/function enqueueInventoryMutation\(characterId, itemName, mutation\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(queue, /const key = `\$\{characterId\}\\u0000\$\{itemName\}`/);
  assert.match(queue, /previous\.catch\(\(\) => undefined\)\.then\(mutation\)/);
  assert.match(queue, /inventoryMutationQueues\.delete\(key\)/);
});

test('delta, absolute quantity and stats operations share the same queue', () => {
  for (const fn of ['saveInventoryItem', 'setInventoryItemQuantity', 'updateInventoryItemStats']) {
    const block = source.match(new RegExp(`export function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] || '';
    assert.match(block, /enqueueInventoryMutation\(characterId, itemName/);
  }
  assert.match(source, /async function saveInventoryItemNow/);
  assert.match(source, /async function setInventoryItemQuantityNow/);
  assert.match(source, /async function updateInventoryItemStatsNow/);
});
