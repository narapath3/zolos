import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameUi = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const gameSync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const economy = fs.readFileSync(new URL('../server/api/oreEconomy.js', import.meta.url), 'utf8');

test('ore conversion no longer mutates ZOL or inventory before server confirmation', () => {
  const block = gameUi.match(/async _convertOreToZol\(\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  openDivineZolShop/)?.[0] || '';
  assert.match(block, /await requestOreConversion/);
  assert.doesNotMatch(block, /saveInventoryItem\(this\.characterId, 'Celestial Ore'/);
  assert.ok(block.indexOf('await requestOreConversion') < block.indexOf('this.character.stats.zol ='));
});

test('server owns conversion amount and operation is atomic and idempotent', () => {
  assert.match(server, /socket\.on\('ore_convert'/);
  assert.match(economy, /CELESTIAL_ORE_TO_ZOL = 100/);
  assert.match(economy, /v_ore \* \$\{CELESTIAL_ORE_TO_ZOL\}/);
  assert.match(economy, /FOR UPDATE/);
  assert.match(economy, /ore_conversion_requests/);
  assert.match(economy, /DELETE FROM public\.inventory[\s\S]*UPDATE public\.characters/);
  assert.match(gameSync, /pendingOreConversions/);
});
