import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFirstThirtyState, FIRST_THIRTY_STEPS, firstThirtyProgress, sanitizeFirstThirtyState, updateFirstThirtyState } from '../src/progression/FirstThirtyJourney.js';

const gameData = fs.readFileSync(new URL('../src/engine/GameData.js', import.meta.url), 'utf8');
const gameUI = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const gameSync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const serverAuth = fs.readFileSync(new URL('../server/api/auth.js', import.meta.url), 'utf8');
const serverIndex = fs.readFileSync(new URL('../server/api/index.js', import.meta.url), 'utf8');
const serverData = fs.readFileSync(new URL('../server/api/data.js', import.meta.url), 'utf8');
const serverRpc = fs.readFileSync(new URL('../server/api/rpc.js', import.meta.url), 'utf8');
const zolosClient = fs.readFileSync(new URL('../src/network/ZolosApiClient.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('First 30 Minutes starts with a safe, ordered journey', () => {
  const state = createFirstThirtyState();
  assert.equal(FIRST_THIRTY_STEPS.length, 18);
  assert.equal(state.activeStep, 'open_journal');
  assert.equal(firstThirtyProgress(state).percent, 0);
  assert.equal(FIRST_THIRTY_STEPS[1].kind, 'world');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'equip_starter_rod').kind, 'ui');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'reach_fishing_spot').kind, 'world');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'start_fishing').target, '#btn-fishing');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'catch_first_fish').kind, 'fishing');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'open_card_album').target, '#btn-mycard');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'socket_first_card').target, '#mycard-grid');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'open_weapon_forge').kind, 'world');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'refine_first_weapon').target, '#refine-go');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'open_pet_sanctuary').kind, 'world');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'summon_first_pet').target, '#btn-inventory');
  assert.equal(FIRST_THIRTY_STEPS.find(step => step.id === 'grow_pet_one_level').target, '#pet-hud');
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

test('fishing onboarding explains the real rod and button flow', () => {
  assert.match(gameUI, /equip_starter_rod/);
  assert.match(gameUI, /reach_fishing_spot/);
  assert.match(gameUI, /start_fishing/);
  assert.match(gameUI, /BAG → เลือก Fishing Rod → กด/);
  assert.match(main, /ต้องเปิด BAG แล้วสวมคันเบ็ด/);
  assert.match(gameUI, /_completeFirstThirtyStep\('equip_starter_rod'\)/);
  assert.match(main, /_completeFirstThirtyStep\?\.\('start_fishing'\)/);
  assert.match(gameSync, /Fishing Rod', 'fishing_rod'/);
});

test('starter rod lesson cannot be completed or skipped before the real equip action', () => {
  assert.match(gameUI, /_isStarterFishingRodEquipped\(\)/);
  assert.match(gameUI, /equip_starter_rod: \[this\._isStarterFishingRodEquipped\(\)/);
  assert.match(gameUI, /ต้องเปิด BAG แล้วกดใช้ไอเทม Fishing Rod เพื่อสวมใส่ก่อน/);
  assert.match(gameUI, /ต้องสวมคันเบ็ดไม้จริงก่อน/);
  assert.match(gameUI, /#inventory-grid \.inv-slot\[data-item-name="Fishing Rod"\]/);
  assert.match(gameUI, /slot\.dataset\.itemName = item\.item_name/);
  assert.match(gameUI, /active\.id === 'equip_starter_rod'\s*\?\s*'<span class="home-journey-locked-step">/);
  assert.match(gameUI, /equip_starter_rod: 'ยืนยันการสวมใส่'/);
});

test('starter rod navigation scrolls the real item into view before spotlighting it', () => {
  assert.match(gameUI, /_scrollJourneyTargetIntoView\(target/);
  assert.match(gameUI, /target\.scrollIntoView\(\{ behavior, block, inline: 'nearest' \}\)/);
  assert.match(gameUI, /step\.id === 'equip_starter_rod' \? 'center' : 'nearest'/);
  assert.match(gameUI, /step\.id === 'equip_starter_rod' \? 320 : 120/);
  assert.match(gameUI, /#inventory-grid \.inv-slot\[data-item-name="Fishing Rod"\]/);
});

test('extended onboarding is wired to real Card, refine, and pet outcomes', () => {
  assert.match(gameUI, /_completeFirstThirtyStep\('open_card_album'\)/);
  assert.match(gameUI, /_completeFirstThirtyStep\('socket_first_card'\)/);
  assert.match(gameUI, /_completeFirstThirtyStep\('open_weapon_forge', \{ prompt: false \}\)/);
  assert.match(gameUI, /if \(success\) this\._completeFirstThirtyStep\('refine_first_weapon'\)/);
  assert.match(gameUI, /_completeFirstThirtyStep\('open_pet_sanctuary', \{ prompt: false \}\)/);
  assert.match(gameUI, /_completeFirstThirtyStep\('summon_first_pet'\)/);
  assert.match(main, /_completeFirstThirtyStep\('grow_pet_one_level'\)/);
  assert.match(gameUI, /socket_first_card: \[this\._isFirstCardSocketed\(\)/);
  assert.match(gameUI, /refine_first_weapon: \[this\._hasRefinedWeapon\(\)/);
  assert.match(gameUI, /summon_first_pet: \[this\._isPetSummoned\(\)/);
  assert.match(gameUI, /grow_pet_one_level: \[this\._hasPetLevelled\(\)/);
  assert.match(main, /needsNpcInteraction = stepId === 'open_weapon_forge' \|\| stepId === 'open_pet_sanctuary'/);
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


test('Self-hosted signup atomically creates user and profile with safe conflict handling', () => {
  assert.match(serverAuth, /import \{ query, tx \} from '\.\/db\.js'/);
  assert.match(serverAuth, /user = await tx\(async \(client\) =>/);
  assert.match(serverAuth, /INSERT INTO profiles \(id, username, gender\)/);
  assert.match(serverAuth, /profiles_username_key/);
  assert.match(serverAuth, /อีเมลนี้ถูกใช้แล้ว/);
});

test('Guest binding resolves profile username conflicts without exposing raw database errors', () => {
  assert.match(gameSync, /async function resolveBindableUsername\(baseUsername\)/);
  assert.match(gameSync, /profiles_username_key/);
  assert.match(gameSync, /(?:let|const) username = await resolveBindableUsername\(baseUsername\)/);
  assert.match(gameUI, /const safeBindError = \(error\)/);
  assert.match(gameUI, /bindInFlight = true/);
  assert.doesNotMatch(gameUI, /ผิดพลาด: \$\{err\.message\}/);
});

test('Fishing rod shop exposes only paid rods and keeps the starter rod free', () => {
  assert.match(gameData, /'Fishing Rod': [^\n]*price: 0[^\n]*starterOnly: true/);
  assert.match(gameData, /'Silver Fishing Rod': [^\n]*price: 15000/);
  assert.match(gameData, /'Golden Fishing Rod': [^\n]*price: 75000/);
  assert.doesNotMatch(gameData, /\{ name: 'Fishing Rod', price:/);
  assert.match(gameData, /\{ name: 'Silver Fishing Rod', price: 15000 \}/);
  assert.match(gameData, /\{ name: 'Golden Fishing Rod', price: 75000 \}/);
  assert.match(gameUI, /if \(this\.currentShopTab === 'fishing'\) return itemData\.type === 'fishing_rod'/);
  assert.match(index, /data-tab="fishing">🎣 คันเบ็ด<\/button>/);
});

test('Fishing rod purchases use an atomic, catalog-bound self-host RPC', () => {
  assert.match(serverRpc, /purchase_shop_item/);
  assert.match(serverRpc, /SHOP_ITEMS\.find/);
  assert.match(serverRpc, /WHERE id = \$1 AND user_id = \$2 FOR UPDATE/);
  assert.match(serverRpc, /UPDATE characters SET gold = gold - \$2/);
  assert.match(serverRpc, /ON CONFLICT \(character_id, item_name\) DO UPDATE/);
  assert.match(serverRpc, /shop_purchase_requests/);
  assert.match(serverRpc, /request_conflict/);
  assert.match(gameUI, /isSelfHostMode && getFishingRodConfig\(item\.name\)/);
  assert.match(gameUI, /supabase\.rpc\('purchase_shop_item'/);
  assert.match(gameUI, /p_request_id: requestId/);
});

test('Self-host upsert defaults to the primary key so signup profile writes are idempotent', () => {
  assert.match(serverData, /if \(action === 'upsert'\)/);
  assert.match(serverData, /spec\.onConflict\s*\?/);
  assert.match(serverData, /cols\.has\('id'\) \? \['id'\] : \[\]/);
  assert.match(serverData, /ON CONFLICT \(\$\{cc\}\) DO UPDATE SET/);
  assert.match(serverData, /isStarterFishingRod = input\.item_name === 'Fishing Rod'/);
  assert.match(serverData, /starterStatsSafe = \(isStarterSword \|\| isStarterFishingRod\)/);
  assert.match(gameSync, /supabase\.from\('profiles'\)\.upsert\(\{ id: newUserId, username, gender \}\)/);
});

test('Guest retry recovers only an authenticated partial account and never merges a completed account', () => {
  assert.match(serverAuth, /async function recoverPartialSignup/);
  assert.match(serverAuth, /actor\.isAnonymous === true/);
  assert.match(serverAuth, /bcrypt\.compare/);
  assert.match(serverAuth, /SELECT 1 FROM characters WHERE user_id = \$1 LIMIT 1/);
  assert.match(serverAuth, /ON CONFLICT \(username\) DO NOTHING RETURNING/);
  assert.match(serverAuth, /throw httpErr\(409, 'อีเมลนี้ถูกใช้แล้ว'\)/);
  assert.doesNotMatch(serverAuth, /DELETE FROM users/);
  assert.match(serverIndex, /auth\.signUp\(req\.body \|\| \{\}, auth\.authFromReq\(req\)\)/);
  assert.match(zolosClient, /recovered: r\.recovered === true/);
  assert.match(gameSync, /signUpData\?\.recovered === true/);
  assert.match(gameSync, /สร้างตัวละครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง/);
  assert.match(gameUI, /อีเมลนี้เป็นของบัญชีอื่นแล้ว/);
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
