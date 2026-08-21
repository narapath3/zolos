import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFirstThirtyState, FIRST_THIRTY_STEPS, firstThirtyProgress, sanitizeFirstThirtyState, updateFirstThirtyState } from '../src/progression/FirstThirtyJourney.js';

const gameUI = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('First 30 Minutes starts with a safe, ordered journey', () => {
  const state = createFirstThirtyState();
  assert.equal(FIRST_THIRTY_STEPS.length, 8);
  assert.equal(state.activeStep, 'open_journal');
  assert.equal(firstThirtyProgress(state).percent, 0);
  assert.equal(FIRST_THIRTY_STEPS[1].kind, 'world');
  assert.equal(FIRST_THIRTY_STEPS[5].kind, 'map');
});

test('journey state completion is idempotent and advances to the next objective', () => {
  let state = createFirstThirtyState();
  state = updateFirstThirtyState(state, { type: 'complete', stepId: 'open_journal' }, '2026-08-21T00:00:00.000Z');
  state = updateFirstThirtyState(state, { type: 'complete', stepId: 'open_journal' }, '2026-08-21T00:01:00.000Z');
  assert.deepEqual(state.completed, ['open_journal']);
  assert.equal(state.activeStep, 'reach_guide_npc');
  assert.equal(state.firstStartedAt, '2026-08-21T00:00:00.000Z');
});

test('journey sanitization rejects unknown step ids and malformed receipts', () => {
  const state = sanitizeFirstThirtyState({
    activeStep: 'hack_step',
    completed: ['open_journal', 'hack_step', 'open_journal'],
    skipped: ['reach_guide_npc', 'open_journal'],
    rewardReceipts: ['ok', 42, '<script>', 'x'.repeat(200)],
  });
  assert.equal(state.activeStep, 'defeat_first_monster');
  assert.deepEqual(state.completed, ['open_journal']);
  assert.deepEqual(state.skipped, ['reach_guide_npc']);
  assert.deepEqual(state.rewardReceipts, ['ok', '<script>']);
});

test('Journey UI exposes map-aware navigation and viewport-safe spotlight contracts', () => {
  assert.match(gameUI, /data-testid="first-thirty-journey"/);
  assert.match(gameUI, /window\.startJourneyNavigation\(step\.position, step\.radius, step\.id\)/);
  assert.match(gameUI, /this\.openWarpMap\(step\.targetMap\)/);
  assert.match(gameUI, /targetTile\.scrollIntoView/);
  assert.match(gameUI, /getBoundingClientRect\(\)/);
  assert.match(main, /window\.startJourneyNavigation/);
  assert.match(main, /sceneManager\.worldToScreen\(target\)/);
  assert.match(main, /journey-world-marker/);
});

test('Home-screen guide is mounted outside the journal and exposes game-style controls', () => {
  assert.match(index, /id="home-journey-guide"[^>]*aria-live="polite"/);
  assert.match(gameUI, /_setupJourneyGuide\(\)/);
  assert.match(gameUI, /data-home-journey-action="next"/);
  assert.match(gameUI, /data-home-journey-action="collapse"/);
  assert.match(gameUI, /this\._renderJourneyGuide\(\)/);
  assert.match(gameUI, /_prepareJourneyTarget\(target\)/);
  assert.match(gameUI, /target\.closest\('#home-journey-guide'\)/);
});

test('Journey responsive styles keep touch actions, safe area and compact mobile layout', () => {
  assert.match(css, /\.journey-primary[^}]*touch-action:manipulation/);
  assert.match(css, /\.journey-spotlight-card[^}]*pointer-events:auto/);
  assert.match(css, /\.home-journey-guide\{[^}]*pointer-events:none/);
  assert.match(css, /\.home-journey-next\{[^}]*touch-action:manipulation/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /\.journey-active-card\{grid-template-columns:auto minmax\(0,1fr\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
