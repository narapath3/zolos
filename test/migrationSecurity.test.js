import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../migrations/20260724_security_hardening.sql', import.meta.url);

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
