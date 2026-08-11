import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('Adventure Journal is the default codex view and is persisted per character', () => {
  assert.match(html, /data-tab="journal"/);
  assert.match(html, /id="adventure-journal"/);
  assert.match(ui, /this\.currentWikiTab = 'journal'/);
  assert.match(ui, /recordMonsterDefeat\(this\.adventureJournal, monsterName\)/);
  assert.match(sync, /item_name', 'adventure_journal'/);
  assert.match(main, /loadAdventureJournalFromDB\(charData\.id\)/);
});
