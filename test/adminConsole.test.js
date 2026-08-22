import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const admin = read('../server/admin/index.html');
const api = read('../server/api/admin.js');

test('standalone admin exposes the server-backed bug report moderation surface', () => {
  assert.match(admin, /data-tab="reports"/);
  assert.match(admin, /function renderReports\(\)/);
  assert.match(admin, /api\('\/bug-reports\?status=/);
  assert.match(admin, /window\.reviewBug=async/);
  assert.match(admin, /\/bug-reports\/\'\+encodeURIComponent\(id\)\+\'\/review/);
  assert.match(admin, /esc\(r\.details\|\|'-'\)/);
  assert.match(api, /r\.get\('\/bug-reports'/);
  assert.match(api, /r\.post\('\/bug-reports\/:id\/review'/);
});

test('admin item views use real-art helper rather than database emoji fields', () => {
  assert.match(admin, /function art\(name,type=''/);
  assert.match(admin, /d\.inventory\.map\(i=>`<tr><td>\$\{art\(i\.item_name,i\.item_type,true\)\}/);
  assert.match(admin, /d\.item_name,d\.item_type,true/);
  assert.doesNotMatch(admin, /\$\{d\.emoji/);
  assert.doesNotMatch(admin, /\$\{m\.emoji/);
});
