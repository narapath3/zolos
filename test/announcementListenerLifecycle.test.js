import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sync = fs.readFileSync(new URL('../src/network/AnnouncementSync.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('announcement listeners are replaced without removing unrelated socket listeners', () => {
  assert.match(sync, /setupAnnouncementListeners\([\s\S]*removeAnnouncementListeners\(\)/);
  assert.match(sync, /listenerSocket\.off\('admin:announcement', announcementHandler\)/);
  assert.match(sync, /listenerSocket\.off\('announcement:broadcast', broadcastHandler\)/);
  assert.doesNotMatch(sync, /\.off\('admin:announcement'\)\s*;/);
});

test('game initialization does not bind announcements from the roster callback', () => {
  const rosterCallback = main.match(/joinPresence\([\s\S]*?async \(players\) => \{([\s\S]*?)\n\s*\},\n\s*\(p\) =>/)?.[1] || '';
  assert.doesNotMatch(rosterCallback, /setupAnnouncementListeners/);
  assert.equal((main.match(/setupAnnouncementListeners\(/g) || []).length, 1);
});
