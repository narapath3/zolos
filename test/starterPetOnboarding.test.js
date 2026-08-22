import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STARTER_PET, ITEMS, PET_SHOP } from '../src/engine/GameData.js';

const gameData = fs.readFileSync(new URL('../src/engine/GameData.js', import.meta.url), 'utf8');
const gameUI = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const combat = fs.readFileSync(new URL('../src/engine/CombatSystem.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const economy = fs.readFileSync(new URL('../server/api/starterPet.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/20260822_starter_pet.sql', import.meta.url), 'utf8');

test('starter companion is a real catalogued pet but is not a shop listing', () => {
  assert.equal(STARTER_PET.itemName, 'Starter Poring Pet');
  assert.equal(STARTER_PET.petKey, 'poring');
  assert.equal(STARTER_PET.price, 0);
  assert.equal(ITEMS[STARTER_PET.itemName].type, 'pet');
  assert.equal(ITEMS[STARTER_PET.itemName].starterOnly, true);
  assert.equal(PET_SHOP.some(entry => entry.name === STARTER_PET.itemName), false);
  assert.match(gameData, /not sold as a free shop item/);
});

test('starter pet online claim is trusted, bounded and replay-safe', () => {
  const handler = server.slice(server.indexOf("socket.on('starter_pet_claim'"), server.indexOf("socket.on('pet_purchase'"));
  assert.match(handler, /trustedSender\(socket\)/);
  assert.match(handler, /player\.verified/);
  assert.match(handler, /player\.characterId/);
  assert.match(handler, /player\.userId/);
  assert.match(handler, /requestId !== stableRequestId/);
  assert.match(handler, /claimStarterPet/);
  assert.match(handler, /claim_starter_pet/);
  assert.match(handler, /serverAuthoritative !== true/);
  assert.match(handler, /result\.price !== 0/);
  assert.match(handler, /result\.granted === true/);
  assert.match(economy, /pg_advisory_xact_lock/);
  assert.match(economy, /user_id = \$2/);
  assert.match(economy, /UNIQUE \(character_id, receipt_id\)/);
  assert.match(economy, /STARTER_PET\.receiptId/);
  assert.doesNotMatch(handler, /saveInventoryItem/);
});

test('hosted starter-pet migration keeps client writes closed and binds ownership', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.starter_pet_claims/);
  assert.match(migration, /p_user_id text/);
  assert.match(migration, /user_id::text = p_user_id/);
  assert.match(migration, /hashtextextended\(p_character_id \|\| ':' \|\| v_receipt_id/);
  assert.match(migration, /WHERE request_id = p_idempotency_key/);
  assert.match(migration, /'Starter Poring Pet'/);
  assert.match(migration, /'pet_key', 'poring'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_starter_pet\(text, text, text\)/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_starter_pet\(text, text, text\) TO service_role/i);
});

test('client obtains the pet before showing the real summon step and validates server data', () => {
  assert.match(sync, /function isCommittedStarterPet/);
  assert.match(sync, /result\.receiptId === STARTER_PET\.receiptId/);
  assert.match(sync, /result\.item_name === STARTER_PET\.itemName/);
  assert.match(sync, /result\.quantity <= 200/);
  assert.match(sync, /starter_pet_\$\{cleanCharacterId\}_v1/);
  assert.match(sync, /if \(previous\) return previous/);
  assert.match(sync, /socket\.emit\('starter_pet_claim'/);
  assert.match(gameUI, /if \(this\.currentTab === 'pet'\) this\._ensureStarterPet\(\)/);
  assert.match(gameUI, /if \(this\.firstThirtyJourney\.activeStep === 'summon_first_pet'\) this\._ensureStarterPet\(\)/);
  assert.match(gameUI, /this\._allPetInstances\(\)\.length > 0/);
  assert.match(gameUI, /this\._completeFirstThirtyStep\('summon_first_pet'\)/);
});

test('chapter 17 still requires a real summon and chapter 18 still requires actual pet XP', () => {
  assert.match(gameUI, /summon_first_pet: \[this\._isPetSummoned\(\)/);
  assert.match(gameUI, /grow_pet_one_level: \[this\._hasPetLevelled\(\)/);
  assert.match(gameUI, /c\.equippedPetUid = uid/);
  assert.match(gameUI, /this\._completeFirstThirtyStep\('summon_first_pet'\)/);
  assert.match(combat, /if \(this\.character\.equippedPet && this\.character\.addPetXp\)/);
});
