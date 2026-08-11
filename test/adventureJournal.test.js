import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventureJournal, recordMonsterDefeat, masteryForKills, sanitizeAdventureJournal, summarizeJournal } from '../src/progression/AdventureJournal.js';

test('records discoveries and normalizes monster names', () => {
  const first = recordMonsterDefeat(createAdventureJournal(), '  Poring  ', '2026-01-01T00:00:00.000Z');
  assert.equal(first.firstDiscovery, true);
  assert.equal(first.journal.monsters.poring.kills, 1);
  const second = recordMonsterDefeat(first.journal, 'poring', '2026-01-02T00:00:00.000Z');
  assert.equal(second.firstDiscovery, false);
  assert.equal(second.journal.totalKills, 2);
});

test('unlocks mastery only at exact threshold crossing', () => {
  let journal = createAdventureJournal();
  let result;
  for (let i = 0; i < 10; i++) { result = recordMonsterDefeat(journal, 'Poring'); journal = result.journal; }
  assert.equal(result.tierUnlocked, 'bronze');
  assert.equal(masteryForKills(10).label, 'Bronze');
  assert.equal(recordMonsterDefeat(journal, 'Poring').tierUnlocked, null);
});

test('sanitizes totals and summarizes catalog progress', () => {
  const clean = sanitizeAdventureJournal({ totalKills: 999, monsters: { poring: { kills: 10 }, invalid: { kills: -2 } } });
  assert.equal(clean.totalKills, 10);
  const summary = summarizeJournal(clean, { poring: { name: 'Poring' }, lunatic: { name: 'Lunatic' } });
  assert.equal(summary.discovered, 1);
  assert.equal(summary.discoveryPercent, 50);
  assert.equal(summary.tierCounts.bronze, 1);
});
