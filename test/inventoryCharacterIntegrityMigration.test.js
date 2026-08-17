import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../migrations/20260817_inventory_character_integrity.sql', import.meta.url);

test('inventory integrity migration adds the character equipment columns', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS shield TEXT/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS armor TEXT/i);
});

test('inventory integrity migration consolidates duplicates before enforcing uniqueness', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const updateIndex = sql.indexOf('UPDATE public.inventory');
  const deleteIndex = sql.indexOf('DELETE FROM public.inventory AS inventory');
  const constraintIndex = sql.indexOf('inventory_character_item_unique');
  assert.ok(updateIndex >= 0, 'must aggregate duplicate quantities');
  assert.ok(deleteIndex > updateIndex, 'must delete duplicate rows after aggregation');
  assert.ok(constraintIndex > deleteIndex, 'must add the unique constraint after cleanup');
  assert.match(sql, /SUM\(quantity\) OVER \(PARTITION BY character_id, item_name\)/i);
  assert.match(sql, /UNIQUE \(character_id, item_name\)/i);
});

test('inventory integrity migration removes empty stacks and is transaction-wrapped', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /^BEGIN;\s*$/m);
  assert.match(sql, /DELETE FROM public\.inventory\s+WHERE quantity <= 0/i);
  assert.match(sql, /COMMIT;\s*$/m);
});
