import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIRST_REFINE_KIT, refineInfo } from '../src/engine/GameData.js';

const gameData = fs.readFileSync(new URL('../src/engine/GameData.js', import.meta.url), 'utf8');
const gameUI = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const economy = fs.readFileSync(new URL('../server/api/firstRefine.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/20260822_first_refine_supply.sql', import.meta.url), 'utf8');

test('first refine kit exactly covers the mandatory Sword +0 to +1 cost', () => {
  assert.deepEqual(refineInfo(0), { chance: 1, downgrade: 0, gold: 620, ore: 1 });
  assert.deepEqual(FIRST_REFINE_KIT, {
    version: 1,
    gold: 620,
    oreName: 'Oridecon',
    oreQuantity: 1,
    receiptId: 'first-refine-kit:v1',
  });
  assert.match(gameData, /FIRST_REFINE_KIT/);
  assert.match(gameData, /gold: 620/);
  assert.match(gameData, /oreName: 'Oridecon'/);
});

test('online first-refine supply is trusted, bounded and server-owned', () => {
  const handler = server.slice(server.indexOf("socket.on('first_refine_supply_claim'"), server.indexOf("socket.on('starter_card_claim'"));
  assert.match(handler, /trustedSender\(socket\)/);
  assert.match(handler, /player\.verified/);
  assert.match(handler, /player\.characterId/);
  assert.match(handler, /requestId !== stableRequestId/);
  assert.match(handler, /USE_LOCAL_DB/);
  assert.match(handler, /p_user_id: player\.userId/);
  assert.match(handler, /serverAuthoritative !== true/);
  assert.match(economy, /FOR UPDATE/);
  assert.match(economy, /user_id = \$2/);
  assert.match(economy, /pg_advisory_xact_lock/);
  assert.match(economy, /UNIQUE \(character_id, receipt_id\)/);
  assert.match(economy, /gold: updatedCharacter\.rows\[0\]\.gold/);
  assert.match(economy, /FIRST_REFINE_KIT\.gold/);
  assert.doesNotMatch(handler, /saveInventoryItem/);
});

test('hosted migration binds the claim to character owner and replay identity', () => {
  assert.match(migration, /p_user_id text/);
  assert.match(migration, /user_id::text = p_user_id/);
  assert.match(migration, /hashtextextended\(p_character_id \|\| ':' \|\| v_receipt_id/);
  assert.match(migration, /UNIQUE \(character_id, receipt_id\)/);
  assert.match(migration, /WHERE request_id = p_idempotency_key/);
  assert.match(migration, /receiptId', v_receipt_id/);
  assert.match(migration, /goldGranted', 620/);
  assert.match(migration, /oreGranted', 1/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_first_refine_supply\(text, text, text\)/i);
});

test('client accepts only a bounded committed result and persists local receipt once', () => {
  assert.match(sync, /function isCommittedFirstRefineSupply/);
  assert.match(sync, /result\.receiptId === FIRST_REFINE_KIT\.receiptId/);
  assert.match(sync, /result\.item_name === FIRST_REFINE_KIT\.oreName/);
  assert.match(sync, /result\.goldGranted <= FIRST_REFINE_KIT\.gold/);
  assert.match(sync, /result\.oreGranted <= FIRST_REFINE_KIT\.oreQuantity/);
  assert.match(sync, /first_refine_supply_\$\{cleanCharacterId\}_v1/);
  assert.match(sync, /if \(previous\) return previous/);
  assert.match(sync, /localDb\.set\(receiptKey, result\)/);
  assert.match(sync, /socket\.emit\('first_refine_supply_claim'/);
});

test('the kit is only offered during the active first-refine lesson; real refine guards remain', () => {
  assert.match(gameUI, /this\.firstThirtyJourney\.activeStep !== 'refine_first_weapon'/);
  assert.match(gameUI, /FIRST_REFINE_KIT\.gold/);
  assert.match(gameUI, /FIRST_REFINE_KIT\.oreName/);
  assert.match(gameUI, /if \(success\) this\._completeFirstThirtyStep\('refine_first_weapon'\)/);
  assert.match(gameUI, /if \(gold < info\.gold\)/);
  assert.match(gameUI, /if \(this\._invCount\(ore\) < info\.ore\)/);
  assert.match(gameUI, /Apprentice Forge Kit/);
  assert.match(gameUI, /ใช้ได้เฉพาะตีบวกครั้งแรก/);
});

test('future refine levels keep their normal escalating economy', () => {
  const levelOne = refineInfo(1);
  assert.equal(levelOne.chance, 1);
  assert.equal(levelOne.gold, 1280);
  assert.equal(levelOne.ore, 1);
  assert.ok(levelOne.gold > refineInfo(0).gold);
});
