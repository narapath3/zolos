import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
const sync = await readFile(new URL('../../src/network/GameSync.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../migrations/20260812_card_trade_base_stars.sql', import.meta.url), 'utf8');
const localRpc = await readFile(new URL('../../server/api/rpc_functions.sql', import.meta.url), 'utf8');
const collectionSync = await readFile(new URL('../../migrations/20260812_card_trade_collection_sync.sql', import.meta.url), 'utf8');

test('online card trades send and persist only base star progression', () => {
  const send = ui.slice(ui.indexOf('async _sendCardTrade()'), ui.indexOf('// ============ Card Mailbox'));
  const receive = sync.slice(sync.indexOf('export async function executeDecentralizedReceiverTrade'), sync.indexOf('// ============ P2P FRIEND REQUEST'));
  assert.match(send, /cleanStats = \{ card_id: cardId, card_stars: 1, card_pity: 0 \}/);
  assert.doesNotMatch(send, /cleanStats\.card_stars = item\.stats\.card_stars/);
  assert.match(receive, /itemType === 'card'[\s\S]*card_stars: 1, card_pity: 0/);
  assert.match(receive, /saveInventoryItem\(receiverCharId, itemName, itemType, quantity, receivedStats\)/);
});

test('all card transfers use escrow and synchronize the authoritative collection', () => {
  const send = ui.slice(ui.indexOf('async _sendCardTrade()'), ui.indexOf('// ============ Card Mailbox'));
  assert.match(send, /if \(false\)[\s\S]*sendTradeRequestPacket\(/);
  assert.match(send, /sendCardMail\(target\.characterId/);
  assert.match(collectionSync, /BEFORE INSERT ON public\.card_mailbox/i);
  assert.match(collectionSync, /SET owned = owned - NEW\.quantity[\s\S]*owned >= NEW\.quantity/i);
  assert.match(collectionSync, /NEW\.status = 'claimed'[\s\S]*NEW\.recipient_char_id/i);
  assert.match(collectionSync, /NEW\.status = 'returned'[\s\S]*NEW\.sender_char_id/i);
  assert.equal((collectionSync.match(/ON CONFLICT \(character_id, card_id\) DO UPDATE/gi) || []).length, 2);
  assert.match(collectionSync, /WHERE status = 'pending'[\s\S]*SET owned = GREATEST\(0, cc\.owned - pending\.quantity\)/i);
});

test('mail claims reset recipient stars while rejected mail can restore sender stats', () => {
  assert.match(migration, /v_received_stats :=[\s\S]*'card_stars', 1,[\s\S]*'card_pity', 0/i);
  assert.match(migration, /VALUES \(v_recipient\.id,[\s\S]*v_received_stats\)/i);
  assert.doesNotMatch(migration, /UPDATE public\.inventory SET[\s\S]*stats\s*=/i);
  assert.match(localRpc, /jsonb_build_object\('card_id', v_mail\.stats->>'card_id', 'card_stars', 1, 'card_pity', 0\)/i);
  const returnable = ui.slice(ui.indexOf('const returnableMailStats'), ui.indexOf('// Online recipient'));
  assert.match(returnable, /\.\.\.\(item\.stats \|\| \{\}\)/);
});
