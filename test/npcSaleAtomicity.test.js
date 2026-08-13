import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server/api/npcSale.js', import.meta.url), 'utf8');
const socket = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('NPC sale locks ownership and inventory inside one transaction', () => {
  assert.match(server, /return tx\(async client/);
  assert.match(server, /user_id=\$2 FOR UPDATE/);
  assert.match(server, /item_name=\$2 FOR UPDATE/);
  assert.match(server, /UPDATE public\.characters SET gold=/);
  assert.match(server, /npc_sale_requests/);
});

test('server derives sale price from its own catalog and rejects unsafe types', () => {
  assert.match(server, /ITEMS\[itemName\]/);
  assert.match(server, /Math\.floor\(Number\(meta\.price\) \* 0\.8\)/);
  assert.match(server, /\['pet', 'card', 'system'\]/);
  assert.match(socket, /socket\.on\('npc_sell'/);
});

test('online UI waits for committed sale result before removing inventory', () => {
  const action = ui.match(/async _performSellShopAction\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(action, /await requestNpcSale/);
  assert.ok(action.indexOf('await requestNpcSale') < action.indexOf('invItem.quantity = result.remaining'));
  assert.match(action, /this\.character\.stats\.gold = result\.gold/);
});
