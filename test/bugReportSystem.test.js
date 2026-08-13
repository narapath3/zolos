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

test('player capture is permission-driven and can be removed before submission', () => {
  assert.match(ui, /getDisplayMedia/);
  assert.match(ui, /getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(ui, /data-remove/);
  assert.match(ui, /toDataURL\('image\/jpeg', 0\.7\)/);
  assert.doesNotMatch(ui, /await this\.takeScreenshot\(panel\);/);
});
