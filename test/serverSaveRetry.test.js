import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

test('periodic saves stay queued until the exact snapshot is persisted', () => {
  const scheduler = source.match(/\/\/ Periodic batch save[\s\S]*?\}, SAVE_INTERVAL_MS\);/)?.[0] || '';
  assert.doesNotMatch(scheduler, /pendingSaves\.clear\(\)/);
  assert.match(scheduler, /const saved = await saveCharacterToSupabase\(saveData\)/);
  assert.match(scheduler, /saved && pendingSaves\.get\(userId\) === saveData/);
});

test('save failures are returned to callers instead of being treated as success', () => {
  const save = source.match(/async function saveCharacterToSupabase\(saveData\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(save, /return true/);
  assert.match(save, /catch \(err\)[\s\S]*return false/);
  assert.match(save, /if \(error\) throw error/);
});

test('disconnect only removes a successfully persisted current snapshot', () => {
  const disconnect = source.match(/\/\/ Save on disconnect[\s\S]*?clearSocketMappingIfCurrent/)?.[0] || '';
  assert.match(disconnect, /const saved = await saveCharacterToSupabase\(player\.lastSaveData\)/);
  assert.match(disconnect, /saved && pendingSaves\.get\(player\.userId\) === player\.lastSaveData/);
});
