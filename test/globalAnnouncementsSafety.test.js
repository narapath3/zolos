import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/GlobalAnnouncements.js', import.meta.url), 'utf8');

test('global feed replaces exact socket handlers on reinitialization', () => {
  assert.match(source, /init\(socket\)\s*\{\s*this\._removeSocketListeners\(\)/);
  assert.match(source, /this\.socket\.off\(event, handler\)/);
  assert.match(source, /destroy\(\)[\s\S]*this\._removeSocketListeners\(\)/);
});

test('global feed escapes server supplied display fields and validates colors', () => {
  assert.match(source, /function escapeFeedText\(/);
  for (const field of ['playerName', 'itemName', 'rarity', 'bossName', 'achievementName', 'guildName', 'milestone', 'message']) {
    assert.match(source, new RegExp(`${field}: escapeFeedText\\(announcement\\.${field}\\)`));
  }
  assert.match(source, /\^#\[0-9a-f\]\{3,8\}\$/i);
});
