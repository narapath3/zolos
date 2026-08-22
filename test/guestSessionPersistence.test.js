import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const supabaseClient = fs.readFileSync(new URL('../src/network/SupabaseClient.js', import.meta.url), 'utf8');
const authUI = fs.readFileSync(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');
const gameSync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('local Guest reuse selects the active guest identity instead of randomizing on every entry', () => {
  assert.match(supabaseClient, /function getReusableLocalGuestId\(\)/);
  assert.match(supabaseClient, /active_session_user_id/);
  assert.match(supabaseClient, /profile_\$\{activeUserId\}/);
  assert.match(supabaseClient, /char_\$\{activeUserId\}/);
  assert.match(supabaseClient, /export async function signInAnonymously\(\{ forceNew = false \} = \{\}\)/);
  assert.match(supabaseClient, /!forceNew && getReusableLocalGuestId\(\)/);
  assert.match(supabaseClient, /saveActiveSession\(userId\)/);
});

test('existing guest session can resume even when only the character record remains', () => {
  const localSessionBlock = supabaseClient.slice(
    supabaseClient.indexOf('export async function getSession()'),
    supabaseClient.indexOf('export function getProfile'),
  );
  assert.match(localSessionBlock, /const profile = localDb\.get\(`profile_\$\{activeUserId\}`\)/);
  assert.match(localSessionBlock, /const character = localDb\.get\(`char_\$\{activeUserId\}`\)/);
  assert.match(localSessionBlock, /if \(profile \|\| character\)/);
  assert.match(localSessionBlock, /if \(isOfflineMode \|\| !supabase\)/);
  const onlineSessionBlock = supabaseClient.slice(
    supabaseClient.indexOf('export async function getSession()'),
    supabaseClient.indexOf('export function getProfile'),
  );
  assert.match(onlineSessionBlock, /Do not revive a synthetic guest_/);
  assert.doesNotMatch(onlineSessionBlock, /return \{ user: \{ id: activeUserId, is_anonymous: true \} \}/);
});

test('all normal Guest entry points resume instead of silently creating a new identity', () => {
  assert.match(authUI, /btn-guest.*addEventListener\('click', \(\) => this\._handleGuest\(\)\)/);
  assert.match(authUI, /_splashGuestBtn\.addEventListener\('click', \(\) => this\._handleGuest\(\)\)/);
  assert.match(authUI, /เล่น Guest เดิม/);
  assert.match(authUI, /signInAnonymously\(\{ forceNew \}\)/);
  assert.match(authUI, /Resuming guest session/);
});

test('Guest job persistence still targets the same character identity', () => {
  assert.match(gameSync, /if \(isOfflineMode \|\| !supabase \|\| characterId\.startsWith\('guest_'\) \|\| characterId\.startsWith\('local_'\)\)/);
  assert.match(gameSync, /const char = localDb\.get\(`char_\$\{userId\}`\)/);
  assert.match(gameSync, /const merged = \{ \.\.\.char, \.\.\.updates/);
  assert.match(gameSync, /job: null/);
  assert.match(main, /userId = sessionData\.userId/);
  assert.match(main, /loadCharacter\(userId\)/);
});

test('Guest binding uses the current anonymous session and preserves its character identity', () => {
  assert.match(gameSync, /const currentUser = sessionData\?\.session\?\.user/);
  assert.match(gameSync, /currentUser\.is_anonymous !== true/);
  assert.match(gameSync, /supabase\.auth\.bindAnonymousAccount\(\{ email, password \}\)/);
  assert.match(gameSync, /characterId: guest\.characterId \|\| null/);
  assert.doesNotMatch(gameSync, /const charInsert = \{/);
  assert.match(main, /characterId: charData\.id/);
});

test('self-host bind refreshes the session token while retaining the same user id', () => {
  assert.match(supabaseClient, /supabase\.auth\.bindAnonymousAccount/);
  assert.match(gameSync, /data\.preserved !== true/);
  assert.match(gameSync, /saveActiveSession\(data\.user\.id\)/);
});
