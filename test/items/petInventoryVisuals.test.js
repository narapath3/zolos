import test from 'node:test';
import assert from 'node:assert/strict';
import { PET_SHOP, ITEMS } from '../../src/engine/GameData.js';
import { itemIconMarkup } from '../../src/engine/ItemVisuals.js';

test('every Pet Sanctuary item uses the canonical artwork atlas in inventory surfaces', () => {
  for (const entry of PET_SHOP) {
    const markup = itemIconMarkup(entry.name, ITEMS[entry.name].emoji);
    assert.match(markup, /item-visual--pet/);
    assert.match(markup, /item-visual__pet-art/);
    assert.doesNotMatch(markup, /item-visual--emoji/);
    assert.match(markup, /--pet-x:[\d.]+%;--pet-y:\d+%/);
  }
});
