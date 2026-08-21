import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFirstThirtyState, FIRST_THIRTY_STEPS, firstThirtyProgress, sanitizeFirstThirtyState, updateFirstThirtyState } from '../src/progression/FirstThirtyJourney.js';

const gameUI = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const gameSync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
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
  assert.match(gameUI, /this\._journeyGuideCollapsed = true/);
  assert.match(gameUI, /data-home-journey-action="next"/);
  assert.match(gameUI, /data-home-journey-action="collapse"/);
  assert.match(gameUI, /this\._renderJourneyGuide\(\)/);
  assert.match(gameUI, /if \(!active\)[\s\S]*guide\.hidden = true/);
  assert.match(gameUI, /_prepareJourneyTarget\(target\)/);
  assert.match(gameUI, /_setJourneySpotlightState\(true\)/);
  assert.match(gameUI, /guide\.classList\.add\('is-spotlighting'\)/);
  assert.match(gameUI, /overlay\._journeyClose/);
  assert.match(gameUI, /const candidates = \[/);
  assert.match(gameUI, /!overlap\(candidate\.left, candidate\.top\)/);
  assert.match(gameUI, /target\.closest\('#home-journey-guide'\)/);
  assert.match(gameUI, /_closeAllMenuSurfaces\(except = null\)/);
  assert.match(gameUI, /document\.querySelectorAll\('\.side-panel, \.modal-popup'\)/);
  assert.match(gameUI, /document\.querySelectorAll\('dialog\[open\]'\)/);
  assert.match(gameUI, /_closeAllMenuSurfaces\(modal\)/);
  assert.match(gameUI, /_closeAllMenuSurfaces\('pet-boutique-modal'\)/);
  assert.match(gameUI, /_isMenuSurfaceOpen\(surface\)/);
  assert.match(gameUI, /const wasOpen = !panel\.hidden/);
  assert.match(gameUI, /panel\.hidden = wasOpen/);
  assert.match(gameUI, /if \(this\._isMenuSurfaceOpen\(modal\)\)/);
  assert.match(gameUI, /_journeyTutorialPresentation\(step\)/);
  assert.match(gameUI, /guide-open-journal\.jpg/);
  assert.match(gameUI, /guide-combat\.jpg/);
  assert.match(gameUI, /guide-fishing\.jpg/);
  assert.match(gameUI, /data-tutorial-pose/);
  assert.match(gameUI, /home-journey-speech/);
  assert.match(css, /home-journey-card--tutorial/);
  assert.match(css, /journey-art-image/);
  assert.match(css, /@media\(max-height:480px\)/);
});

test('Journey responsive styles keep touch actions, safe area and compact mobile layout', () => {
  assert.match(css, /\.journey-primary[^}]*touch-action:manipulation/);
  assert.match(css, /\.journey-spotlight-card[^}]*pointer-events:auto/);
  assert.match(css, /\.home-journey-guide\{[^}]*pointer-events:none/);
  assert.match(css, /\.home-journey-guide\.is-collapsed\{top:clamp\(120px,20vh,220px\)[^}]*width:min\(238px/);
  assert.match(css, /@media\(max-width:700px\)\{\.home-journey-guide\.is-collapsed\{top:clamp\(118px,18vh,190px\)/);
  assert.match(css, /@media\(max-height:480px\)\{\.home-journey-guide\.is-collapsed\{top:96px\}/);
  assert.match(css, /\.home-journey-next\{[^}]*touch-action:manipulation/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /\.journey-active-card\{grid-template-columns:auto minmax\(0,1fr\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.home-journey-guide\.is-spotlighting\{display:none!important/);
  assert.match(css, /@media\(max-width:700px\)\{#journey-spotlight\{z-index:2600/);
  assert.match(css, /@media \(min-width:769px\) and \(max-width:1180px\) and \(orientation:landscape\)/);
  assert.match(css, /--landscape-action-width/);
  assert.match(css, /#mobile-actions #btn-mobile-skill-1\{left:calc/);
  assert.match(css, /#auto-farm-container>\.btn-auto,#auto-farm-container>\.btn-fishing/);
  assert.match(gameUI, /setupAdaptiveLandscapeControls/);
  assert.match(gameUI, /isLandscapeMobile/);
  assert.match(gameUI, /const slots = \{/);
  assert.match(gameUI, /grid-template-columns/);
  assert.match(gameUI, /setImportant\(skillsArc, 'display', 'contents'\)/);
  assert.match(gameUI, /setImportant\(button, 'position', 'static'\)/);
  assert.match(gameUI, /requestAnimationFrame\(updateLayout\)/);
  assert.match(gameUI, /visualViewport/);
  assert.match(css, /\.journey-spotlight-card\{width:min\(330px,calc\(100vw - 20px\)\);margin:0\}/);
  assert.doesNotMatch(css, /\.journey-spotlight-card\{width:min\(330px,calc\(100vw - 20px\)\);left:10px!important;right:10px;top:auto!important;bottom:/);
});


test('Combat chapter uses a live Monster target instead of covering the world with Journal', () => {
  assert.match(gameUI, /step\.id === 'defeat_first_monster'/);
  assert.match(gameUI, /this\._closeAllMenuSurfaces\(\)/);
  assert.match(gameUI, /window\.startJourneyCombatGuidance\?\.\(\)/);
  assert.match(main, /window\.startJourneyCombatGuidance = \(\) =>/);
  assert.match(main, /journey-combat-target/);
  assert.match(main, /monsters\.findNearest/);
  assert.match(main, /sceneManager\.worldToScreen\(target\.mesh\.position\)/);
  assert.match(main, /if \(journeyCombatGuidance\) stopJourneyCombatGuidance\(\)/);
});

test('Combat chapter shows completion popup only after the first guided kill', () => {
  assert.match(gameUI, /_showJourneyCombatCompletion\(monsterName\)/);
  assert.match(gameUI, /wasFirstCombatLesson/);
  assert.match(gameUI, /completedCombatLesson/);
  assert.match(gameUI, /journey-combat-complete-popup/);
  assert.match(main, /stopJourneyCombatGuidance\(\);[\s\S]*gameUI\.handleMonsterKill/);
  assert.match(css, /#journey-combat-complete\{position:fixed;inset:0;z-index:2450;display:none;pointer-events:none/);
  assert.match(css, /\.journey-combat-complete-card\{[^}]*pointer-events:auto/);
});


test('Journey completion offers the next chapter automatically without reopening the Journal', () => {
  assert.match(gameUI, /_showJourneyNextPrompt\(completedStep\)/);
  assert.match(gameUI, /_continueFirstThirtyJourney\(\)/);
  assert.match(gameUI, /data-home-journey-action="continue-next"/);
  assert.match(gameUI, /data-home-journey-action="later-next"/);
  assert.match(gameUI, /journey-next-prompt/);
  assert.match(gameUI, /_hideJourneyNextPrompt\(true\)/);
  assert.match(css, /\.home-journey-guide\.is-next-prompt-hidden\{visibility:hidden!important/);
  assert.match(css, /#journey-next-prompt\{position:fixed;inset:0;z-index:2380/);
  assert.match(css, /\.journey-next-prompt-card\{[^}]*pointer-events:auto/);
});

test('Combat completion advances through the same next-chapter prompt without stacking overlays', () => {
  assert.match(gameUI, /this\._hideJourneyNextPrompt\(\);[\s\S]*this\._closeAllMenuSurfaces\(\);/);
  assert.match(gameUI, /ทำต่อบทถัดไป/);
  assert.match(gameUI, /close\(\{ continueJourney: true, showNextPrompt: false \}\)/);
  assert.match(gameUI, /this\._journeyCombatCompletionTimer = setTimeout\(\(\) => close\(\), 9000\)/);
});


test('Auto-advance prompt buttons are protected from world touch input on mobile', () => {
  assert.match(gameUI, /target\.closest\('#journey-next-prompt'\)/);
  assert.match(gameUI, /target\.closest\('#journey-combat-complete'\)/);
  assert.match(gameUI, /button\.addEventListener\('touchend', handlePromptAction/);
  assert.match(gameUI, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(css, /#journey-next-prompt,\.journey-next-prompt-card,\.journey-next-prompt-card button\{touch-action:manipulation/);
  assert.match(css, /#journey-next-prompt \.journey-next-prompt-continue,[\s\S]*pointer-events:auto/);
});


test('Journey spotlight visibly guides the player to the target button', () => {
  assert.match(gameUI, /journey-spotlight-ring-label/);
  assert.match(gameUI, /แตะตรงนี้/);
  assert.match(gameUI, /ringLabel\.style\.top/);
  assert.match(css, /\.journey-spotlight-ring::before\{[^}]*conic-gradient/);
  assert.match(css, /@keyframes journeyLightSweep/);
  assert.match(css, /\.journey-spotlight-ring-label\{[^}]*pointer-events:none/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.journey-spotlight-ring::before/);
});


test('Game viewport uses full-size dynamic viewport sizing across browser and PWA modes', () => {
  assert.match(index, /viewport-fit=cover/);
  assert.match(css, /html,body\{width:100%;min-width:100%;height:100%;min-height:100%/);
  assert.match(css, /\.game-viewport\{height:100dvh;min-height:100dvh/);
  assert.match(css, /#game-canvas\{position:absolute;inset:0;width:100vw!important/);
  assert.match(css, /@supports not \(height:100dvh\)/);
  const manifest = fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');
  assert.match(manifest, /"display": "fullscreen"/);
  assert.match(manifest, /"display_override": \["fullscreen", "standalone"\]/);
});


test('Tutorial Coach separates start guidance from the real target button spotlight', () => {
  assert.match(gameUI, /home-journey-card--coach/);
  assert.match(gameUI, /FIRST 30 MINUTES · COACH/);
  assert.match(gameUI, /เริ่มบทนี้/);
  assert.match(gameUI, /กดเริ่ม แล้วฉันจะชี้ปุ่มหรือจุดหมายให้ทันที/);
  assert.doesNotMatch(gameUI, /home-journey-speech.*ไกด์แนะนำ/);
  assert.match(gameUI, /document\.getElementById\('journey-spotlight'\)\?\._journeyClose\?\.\(\)/);
  assert.match(css, /\.home-journey-card--coach\{/);
  assert.match(css, /\.home-journey-coach-speech\{/);
  assert.match(css, /\.home-journey-coach-actions\{/);
});


test('Guest binding resolves profile username conflicts without exposing raw database errors', () => {
  assert.match(gameSync, /async function resolveBindableUsername\(baseUsername\)/);
  assert.match(gameSync, /profiles_username_key/);
  assert.match(gameSync, /const username = await resolveBindableUsername\(baseUsername\)/);
  assert.match(gameUI, /const safeBindError = \(error\)/);
  assert.match(gameUI, /bindInFlight = true/);
  assert.doesNotMatch(gameUI, /ผิดพลาด: \$\{err\.message\}/);
});

test('New players receive a prominent guide CTA that dismisses after opening', () => {
  assert.match(gameUI, /_journeyNewPlayerAttentionDismissed/);
  assert.match(gameUI, /active\.id === 'open_journal'/);
  assert.match(gameUI, /guide\.classList\.toggle\('is-new-player-guide', isNewPlayer\)/);
  assert.match(gameUI, /เริ่มแนะนำการเล่นสำหรับผู้เล่นใหม่/);
  assert.match(css, /#home-journey-guide\.is-new-player-guide::before/);
  assert.match(css, /content:'✨ เริ่มที่นี่'/);
  assert.match(css, /newPlayerLightSweep/);
  assert.match(css, /newPlayerCardPulse/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
