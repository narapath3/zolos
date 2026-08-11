import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderer = fs.readFileSync(new URL('../src/ui/MonsterPortraitRenderer.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('Monster Codex portraits render the real in-game Monster model', () => {
  assert.match(renderer, /new Monster\(scene, monsterKey/);
  assert.match(renderer, /toDataURL\('image\/webp'/);
  assert.match(renderer, /requestIdleCallback/);
  assert.match(ui, /data-monster-model=/);
  assert.doesNotMatch(ui.match(/_wikiMonsterPortrait[\s\S]*?_wikiItemPortrait/)?.[0] || '', /monster\.emoji/);
});
