import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('every fish catch increments a persisted lifetime counter', () => {
  assert.match(source, /this\.almanac = \{ caught: \[\], claimed: \[\], counts: \{\} \}/);
  assert.match(source, /this\.almanac\.counts\[name\] = \(Number\(this\.almanac\.counts\[name\]\) \|\| 0\) \+ 1/);
  assert.match(source, /Math\.max\(1, dbCount, localCount\)/);
  assert.match(source, /if \(!firstDiscovery\)[\s\S]*?_saveFishingAlmanac/);
});

test('caught fish slots open accessible detail with lifetime and owned counts', () => {
  assert.match(source, /data-almanac-fish/);
  assert.match(source, /role="\$\{has \? 'button' : 'presentation'\}"/);
  assert.match(source, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(source, /จับสะสมทั้งหมด/);
  assert.match(source, /มีในกระเป๋า/);
  assert.match(source, /data-almanac-market-price/);
});

test('sell-to-player opens the existing market sell flow with the owned fish selected', () => {
  assert.match(source, /async _sellFishFromAlmanac\(name\)/);
  assert.match(source, /row\.item_type === 'fish'/);
  assert.match(source, /this\.marketTab = 'sell'/);
  assert.match(source, /this\.selectedMarketItem = item/);
  assert.match(source, /await this\._updateMarketSellForm\(\)/);
  assert.match(source, /listing && !listing\._failed/);
});
