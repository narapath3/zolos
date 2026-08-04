import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('inventory, buy shop and sell shop reserve a full non-shrinking preview frame', () => {
  for (const id of ['detail-icon', 'shop-detail-icon', 'sell-shop-detail-icon']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(css, new RegExp(`#${id}[\\s\\S]*?flex: 0 0 84px`));
  }
  assert.match(css, /\.item-visual \{[\s\S]*?flex: 0 0 auto/);
});

test('large item artwork stays inside its frame and copy can wrap beside it', () => {
  assert.match(css, /#detail-icon,[\s\S]*?width: 84px;[\s\S]*?height: 84px;[\s\S]*?overflow: hidden/);
  assert.match(css, /#detail-icon \.item-visual--detail,[\s\S]*?width: 72px;[\s\S]*?height: 72px/);
  assert.match(css, /#detail-icon \+ \.detail-info-block,[\s\S]*?min-width: 0/);
  assert.match(css, /overflow-wrap: anywhere/);
});
