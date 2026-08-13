import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const playerApi = fs.readFileSync(new URL('../server/api/bugReports.js', import.meta.url), 'utf8');
const adminApi = fs.readFileSync(new URL('../server/api/admin.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/BugReportUI.js', import.meta.url), 'utf8');
const gameUi = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const character = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const gameData = fs.readFileSync(new URL('../src/engine/GameData.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');
const itemVisuals = fs.readFileSync(new URL('../src/engine/ItemVisuals.js', import.meta.url), 'utf8');

test('bug reports authenticate ownership and bound screenshot input', () => {
  assert.match(playerApi, /authFromReq\(req\)/);
  assert.match(playerApi, /WHERE user_id=\$1/);
  assert.match(playerApi, /SCREENSHOT_RE/);
  assert.match(playerApi, /950_000/);
  assert.doesNotMatch(playerApi, /req\.body\?\.character/);
});

test('approval locks the report and grants inventory and Zeny atomically once', () => {
  assert.match(adminApi, /SELECT \* FROM bug_reports WHERE id=\$1 FOR UPDATE/);
  assert.match(adminApi, /report\.status !== 'pending'/);
  assert.match(adminApi, /UPDATE characters SET gold=gold\+\$2/);
  assert.match(adminApi, /UPDATE inventory SET quantity=quantity\+\$2/);
  assert.match(adminApi, /await tx\(async \(client\)/);
});

test('player capture never waits for screen-sharing and supports image upload', () => {
  assert.doesNotMatch(ui, /getDisplayMedia/);
  assert.match(ui, /captureGameCanvas/);
  assert.match(ui, /data-file/);
  assert.match(ui, /imageFromFile/);
  assert.match(ui, /data-remove/);
  assert.match(ui, /toDataURL\('image\/jpeg', 0\.7\)/);
});

test('bug report dialog is mobile safe and hides game controls while open', () => {
  assert.match(ui, /safe-area-inset-bottom/);
  assert.match(ui, /100dvh/);
  assert.match(ui, /font-size:16px!important/);
  assert.match(ui, /visualViewport/);
  assert.match(ui, /modal-popup/);
  assert.match(ui, /updateMobileControlsVisibility/);
  assert.match(ui, /touch-action:manipulation/);
});

test('report history exposes clickable detail and explicit review states', () => {
  assert.match(playerApi, /details,screenshot_data,context,status/);
  assert.match(ui, /showHistoryDetail/);
  assert.match(ui, /อนุมัติแล้ว/);
  assert.match(ui, /ไม่อนุมัติ/);
  assert.match(ui, /รอตรวจสอบ/);
  assert.match(ui, /ข้อความจากแอดมิน/);
});

test('admin bug API enables configured cross-origin frontend access', () => {
  assert.match(adminApi, /import cors from 'cors'/);
  assert.match(adminApi, /allowedOrigins/);
  assert.match(adminApi, /r\.use\(cors/);
});

test('Bug Hunter Emblem toggles a persisted glowing red name title', () => {
  assert.match(gameData, /ITEMS\['Bug Hunter Emblem'\]/);
  assert.match(gameData, /type: 'title'/);
  assert.match(gameData, /price: 0/);
  assert.match(character, /bug_hunter: \{ text: '🐞 Bug Hunter'/);
  assert.match(character, /color: '#ff303f'/);
  assert.match(gameUi, /_toggleTitleItem/);
  assert.match(gameUi, /item\.stats\.equipped = enabled/);
  assert.match(gameUi, /setInventoryItemQuantity\(this\.characterId,item\.item_name,'title'/);
  assert.match(gameUi, /setTitle\(enabled \? definition\.id : null\)/);
});

test('Master Angler Trophy uses the same persisted title toggle', () => {
  assert.match(gameData, /ITEMS\['Master Angler Trophy'\]/);
  assert.match(gameData, /Master Angler Trophy'[\s\S]*?type: 'title'/);
  assert.match(gameUi, /'Master Angler Trophy': \{ id:'master_angler'/);
  assert.match(gameUi, /Only one floating name title may be active/);
  assert.doesNotMatch(gameUi, /this\.almanac\.claimed\.includes\('all'\)[\s\S]{0,150}setTitle\('master_angler'\)/);
  assert.match(gameUi, /i\.item_type === 'material' \|\| i\.item_type === 'tool' \|\| i\.item_type === 'title'/);
});

test('reward titles are easy to find in a dedicated mobile-safe inventory tab', () => {
  assert.match(html, /data-tab="title">🏅 Titles/);
  assert.match(gameUi, /this\.currentTab === 'title'/);
  assert.match(gameUi, /filtered\.sort\([\s\S]*?item_type === 'title'/);
  assert.match(gameUi, /inv-title-badge/);
  assert.match(css, /\.inv-title-badge/);
  assert.match(css, /\.inventory-tabs[\s\S]*?overflow-x: auto/);
});

test('title rewards use shield art, standard tab styling, and no consumable quantity', () => {
  assert.match(itemVisuals, /titles\/bug-hunter-emblem\.png/);
  assert.match(itemVisuals, /titles\/master-angler-trophy\.png/);
  assert.doesNotMatch(css, /\.inv-tab--titles\s*\{/);
  assert.match(gameUi, /item\.item_type === 'title' \? '' : `<span class="inv-qty">/);
  assert.match(gameUi, /'tool', 'title'/);
  assert.match(adminApi, /UPDATE inventory SET quantity=1,item_type='title'/);
});

test('title reward detail exposes a working permanent on-off control', () => {
  assert.match(gameUi, /const useBtn = document\.getElementById\('btn-use-item'\);[\s\S]*?let typeStr/);
  assert.match(gameUi, /typeStr = 'Permanent Title'/);
  assert.match(gameUi, /else if \(item\.item_type === 'title' \|\| \['Bug Hunter Emblem','Master Angler Trophy'\]\.includes\(item\.item_name\)\) \{[\s\S]*?useBtn\.style\.display = 'block';[\s\S]*?useBtn\.textContent = item\.stats\?\.equipped === true/);
});
