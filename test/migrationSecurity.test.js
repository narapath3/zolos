import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../migrations/20260724_security_hardening.sql', import.meta.url);
const followupUrl = new URL('../migrations/20260724_security_hardening_followup.sql', import.meta.url);
const cardCollectionUrl = new URL('../migrations/20260724_card_collection.sql', import.meta.url);

function functionDefinition(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

test('security migration is non-destructive and contains no account identifiers', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
});

test('security migration enables RLS on core exposed tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['profiles', 'characters', 'inventory', 'marketplace', 'vending_stalls']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
  }
});

test('security migration keeps is_admin outside client write grants', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const grants = sql.match(/GRANT\s+(?:INSERT|UPDATE)\s*\([^;]+\)\s+ON\s+public\.profiles[^;]+;/gi) || [];
  assert.ok(grants.length >= 2);
  for (const grant of grants) assert.doesNotMatch(grant, /\bis_admin\b/i);
});

test('security migration restricts every admin RPC to authenticated callers', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const signature of [
    'admin_delete_character(text)',
    'admin_update_character(text, jsonb)',
    'admin_reset_character(text)',
  ]) {
    const escaped = signature.replace(/[()]/g, '\\$&').replace(', ', '\\s*,\\s*');
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${escaped} FROM PUBLIC`, 'i'));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO authenticated`, 'i'));
  }
});

test('follow-up migration revokes direct anon RPC grants and fixes search paths', async () => {
  const sql = await readFile(followupUrl, 'utf8');
  for (const signature of [
    'admin_delete_character(text)',
    'admin_update_character(text, jsonb)',
    'admin_reset_character(text)',
  ]) {
    const escaped = signature.replace(/[()]/g, '\\$&').replace(', ', '\\s*,\\s*');
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${escaped} FROM (?:PUBLIC,\\s*)?anon`, 'i'));
    assert.match(sql, new RegExp(`ALTER FUNCTION public\\.${escaped}\\s+SET search_path`, 'i'));
  }
});

test('follow-up migration removes duplicate policies introduced by hardening', async () => {
  const sql = await readFile(followupUrl, 'utf8');
  for (const policy of [
    'profiles_public_read',
    'profiles_insert_own',
    'profiles_update_own',
    'characters_public_read',
    'characters_write_own',
    'inventory_public_read',
    'inventory_write_own',
    'marketplace_public_read',
    'marketplace_write_own',
    'vending_stalls_public_read',
    'vending_stalls_write_own',
  ]) {
    assert.match(sql, new RegExp(`DROP POLICY IF EXISTS ${policy}`, 'i'));
  }
});

test('card collection exposes read-own rows only and indexes the policy ownership lookup', async () => {
  const sql = await readFile(cardCollectionUrl, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.character_cards\s*\(/i);
  assert.match(sql, /ALTER TABLE public\.character_cards ENABLE ROW LEVEL SECURITY/i);
  assert.match(
    sql,
    /CREATE POLICY character_cards_read_own[\s\S]*FOR SELECT TO authenticated[\s\S]*c\.user_id\s*=\s*\(SELECT auth\.uid\(\)\)/i,
  );
  assert.match(sql, /CREATE INDEX IF NOT EXISTS characters_user_id_idx\s+ON public\.characters \(user_id\)/i);
  assert.match(sql, /GRANT SELECT ON public\.character_cards TO authenticated/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.character_cards FROM anon, authenticated/i);
  assert.doesNotMatch(sql, /CREATE POLICY[\s\S]{0,120}FOR (?:INSERT|UPDATE|DELETE|ALL)/i);
});

test('card award RPC is service-role-only, row-locked, schema-qualified, and idempotent', async () => {
  const sql = await readFile(cardCollectionUrl, 'utf8');
  const fn = functionDefinition(sql, 'award_card_drop');

  assert.match(fn, /SECURITY DEFINER/i);
  assert.match(fn, /SET search_path = ''/i);
  assert.match(fn, /FROM public\.character_cards[\s\S]*FOR UPDATE/i);
  assert.match(fn, /FROM public\.card_reward_requests/i);
  assert.match(fn, /INSERT INTO public\.card_reward_requests/i);
  assert.match(fn, /UPDATE public\.character_cards/i);
  assert.match(fn, /p_expected_pity IS NULL/i);
  assert.match(fn, /p_new_pity IS NULL/i);
  assert.match(fn, /p_won IS NULL/i);
  assert.doesNotMatch(fn, /(?<!public\.)\b(?:character_cards|card_reward_requests|characters)\b\s+(?:AS\s+)?[a-z_]/i);

  const signature = 'public.award_card_drop(uuid, text, integer, integer, boolean, text)';
  assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon, authenticated`, 'i'));
  assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} TO service_role`, 'i'));
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.award_card_drop[^;]*TO (?:anon|authenticated)/i);
});

test('fusion RPC is atomic and private without adding fusion networking', async () => {
  const sql = await readFile(cardCollectionUrl, 'utf8');
  const fn = functionDefinition(sql, 'fuse_card');

  assert.match(fn, /SECURITY DEFINER/i);
  assert.match(fn, /SET search_path = ''/i);
  assert.match(fn, /FROM public\.character_cards[\s\S]*FOR UPDATE/i);
  assert.match(fn, /FROM public\.card_fusion_requests/i);
  assert.match(fn, /INSERT INTO public\.card_fusion_requests/i);
  assert.match(fn, /UPDATE public\.character_cards/i);
  assert.match(fn, /v_row\.owned - 1 < p_cost/i);

  const signature = 'public.fuse_card(uuid, text, smallint, integer, text)';
  assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon, authenticated`, 'i'));
  assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, '\\$&')} TO service_role`, 'i'));
});
