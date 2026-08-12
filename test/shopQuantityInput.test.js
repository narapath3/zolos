import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameUi = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('buy shop keeps the typed quantity and only corrects it once entry finishes', () => {
  const total = gameUi.match(/_updateShopTotal\(writeBack = false\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.notEqual(total, '', '_updateShopTotal must take a writeBack flag');
  // The field may only be rewritten when the caller asks for it, never on input.
  assert.match(total, /if \(writeBack && qtyInput && qtyInput\.value !== String\(qty\)\) qtyInput\.value = qty;/);
  assert.doesNotMatch(
    total.replace(/if \(writeBack[^\n]*\n/, ''),
    /qtyInput\.value =/,
    'no unconditional write back to the quantity field',
  );

  assert.match(gameUi, /qtyInput\.addEventListener\('input', \(\) => this\._updateShopTotal\(false\)\)/);
  assert.match(gameUi, /qtyInput\.addEventListener\('change', \(\) => this\._updateShopTotal\(true\)\)/);
  assert.match(gameUi, /qtyInput\.addEventListener\('blur', \(\) => this\._updateShopTotal\(true\)\)/);
});

test('sell shop refreshes only the total while typing instead of re-clamping the field', () => {
  assert.match(gameUi, /qtyInput\.addEventListener\('input', \(\) => this\._updateSellShopTotal\(\)\)/);
  assert.match(gameUi, /qtyInput\.addEventListener\('change', \(\) => this\._updateSellShopDetail\(\)\)/);
  assert.match(gameUi, /qtyInput\.addEventListener\('blur', \(\) => this\._updateSellShopDetail\(\)\)/);
  // The stack-size clamp still exists, it just no longer runs per keystroke.
  const detail = gameUi.match(/_updateSellShopDetail\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(detail, /if \(parseInt\(qtyInput\.value\) > item\.quantity\) qtyInput\.value = item\.quantity;/);
});

test('selling still validates the quantity against the real inventory stack', () => {
  const perform = gameUi.match(/async _performSellShopAction\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(perform, /if \(sellQty <= 0\) return;/);
  assert.match(perform, /if \(!invItem \|\| invItem\.quantity < sellQty\)/);
});

test('the quantity field wins the row instead of being squeezed by its buttons', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // Both rows are class driven now — inline `flex: 1` on the input lost to the
  // buttons' inherited `width: 100%`.
  for (const id of ['shop-qty-input', 'sell-shop-qty-input']) {
    assert.match(html, new RegExp(`id="${id}" class="qty-field"`));
    assert.doesNotMatch(
      html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] || '',
      /style=/,
      `${id} must not carry inline layout styles`,
    );
  }
  assert.match(html, /<div class="qty-row">/);

  const field = css.match(/\.qty-row \.qty-field \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(field, /flex: 1 1 auto/);
  assert.ok(Number(field.match(/min-width: (\d+)px/)?.[1] || 0) >= 90);

  const button = css.match(/\.qty-row \.btn-secondary \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(button, /flex: 0 0 auto/);
  assert.match(button, /width: auto/);
});

test('quantity fields are legible and are not squeezed by native spin buttons', () => {
  const rule = css.match(/\.form-group input\[type="number"\] \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.notEqual(rule, '', 'number inputs need their own readable sizing');
  const size = Number(rule.match(/font-size: (\d+)px/)?.[1] || 0);
  assert.ok(size >= 14, `quantity font-size should be at least 14px, got ${size}px`);
  assert.match(rule, /appearance: textfield/);
  assert.match(
    css,
    /\.form-group input\[type="number"\]::-webkit-inner-spin-button[\s\S]*?appearance: none/,
  );
});
