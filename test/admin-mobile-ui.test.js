import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminUrl = new URL('../src/ui/AdminUI.js', import.meta.url);
const cssUrl = new URL('../src/styles/admin.css', import.meta.url);
const adminSource = fs.readFileSync(adminUrl, 'utf8');

test('admin shell exposes responsive hooks and imports its stylesheet', () => {
  assert.match(adminSource, /import ['"]\.\.\/styles\/admin\.css['"]/);

  for (const className of [
    'admin-panel',
    'admin-header',
    'admin-tabs',
    'admin-tab',
    'admin-content',
  ]) {
    assert.match(adminSource, new RegExp(className));
  }
});

test('admin mobile shell fills the viewport without horizontal overflow', () => {
  assert.equal(fs.existsSync(cssUrl), true, 'responsive Admin stylesheet must exist');
  const adminCss = fs.readFileSync(cssUrl, 'utf8');

  assert.match(adminCss, /@media\s*\(max-width:\s*720px\)/);
  assert.match(adminCss, /\.admin-panel[\s\S]*width:\s*100%/);
  assert.match(adminCss, /\.admin-tabs[\s\S]*overflow-x:\s*auto/);
  assert.match(adminCss, /env\(safe-area-inset-bottom/);
});

test('admin lists provide desktop tables and mobile cards', () => {
  const adminCss = fs.readFileSync(cssUrl, 'utf8');

  for (const className of [
    'admin-desktop-table',
    'admin-mobile-list',
    'admin-card',
    'admin-stat-grid',
    'admin-action-grid',
    'admin-filter-bar',
  ]) {
    assert.match(adminSource, new RegExp(className));
  }

  assert.match(adminCss, /\.admin-mobile-list\s*\{[\s\S]*display:\s*none/);
  assert.match(
    adminCss,
    /@media\s*\(max-width:\s*720px\)[\s\S]*\.admin-desktop-table[\s\S]*display:\s*none/
  );
  assert.match(
    adminCss,
    /@media\s*\(max-width:\s*720px\)[\s\S]*\.admin-mobile-list[\s\S]*display:\s*(?:grid|flex|block)/
  );
});
