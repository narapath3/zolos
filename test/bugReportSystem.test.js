import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const playerApi = fs.readFileSync(new URL('../server/api/bugReports.js', import.meta.url), 'utf8');
const adminApi = fs.readFileSync(new URL('../server/api/admin.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/ui/BugReportUI.js', import.meta.url), 'utf8');

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
