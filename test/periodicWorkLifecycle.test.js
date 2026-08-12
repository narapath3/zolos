import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');

test('network HUD polling pauses offscreen and cannot overlap', () => {
  assert.match(ui, /if \(!document\.hidden\) this\.updateNetworkStatus\(\)/);
  assert.match(ui, /this\._networkStatusInFlight\) return/);
  assert.match(ui, /finally \{\s*this\._networkStatusInFlight = false/);
});

test('login ping monitor does not stack slow measurements', () => {
  assert.match(auth, /this\._pingInFlight \|\| document\.hidden/);
  assert.match(auth, /finally \{\s*this\._pingInFlight = false/);
});

test('autosave skips overlap and hidden-tab duplicate writes', () => {
  assert.match(sync, /if \(autoSaveInFlight \|\| \(typeof document !== 'undefined' && document\.hidden\)\) return/);
  assert.match(sync, /finally \{\s*autoSaveInFlight = false/);
  assert.match(sync, /catch \(error\) \{\s*console\.warn\('\[Zolos\] Autosave failed/);
});

test('stopped autosave sessions cannot send stale backup state or unlock early', () => {
  assert.match(sync, /let autoSaveGeneration = 0/);
  assert.match(sync, /const generation = autoSaveGeneration/);
  assert.match(sync, /if \(generation === autoSaveGeneration\) sendSaveState\(state\)/);
  const stop = sync.match(/export function stopAutoSave\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(stop, /autoSaveGeneration\+\+/);
  assert.doesNotMatch(stop, /autoSaveInFlight\s*=\s*false/);
});
