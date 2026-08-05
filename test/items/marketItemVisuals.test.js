import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('market buy, sell picker and sell form use canonical item artwork', () => {
  const helper = ui.match(/_itemIconHtml\(item\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(helper, /itemIconMarkup\(item, fallback, 'item-visual--market'\)/);
  assert.doesNotMatch(helper, /return item && item\.emoji/);

  const buy = ui.match(/async _renderMarket\(\) \{[\s\S]*?_renderMarketSellInventory\(\) \{/)?.[0] || '';
  assert.match(buy, /itemIconMarkup\(listing\.item_name, itemInfo\.emoji, 'item-visual--market-row'\)/);
  assert.doesNotMatch(buy, /<span>\$\{itemInfo\.emoji\}<\/span>/);

  const sell = ui.match(/_renderMarketSellInventory\(\) \{[\s\S]*?async _updateMarketSellForm/)?.[0] || '';
  assert.match(sell, /this\._itemIconHtml\(item\)/);
  assert.match(ui, /iconEl\.innerHTML = this\._itemIconHtml\(this\.selectedMarketItem\)/);
  assert.doesNotMatch(html, /id="market-sell-item-icon" class="detail-icon">📦/);
});
