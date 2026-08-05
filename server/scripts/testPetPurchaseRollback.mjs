import { randomUUID } from 'node:crypto';
import { pool } from '../api/db.js';

const client = await pool.connect();
let characterId;
let requestId;
try {
  const chosen = await client.query(`SELECT id FROM public.characters ORDER BY updated_at ASC LIMIT 1`);
  if (!chosen.rows[0]) throw new Error('No character is available for the rollback test');
  characterId = chosen.rows[0].id;
  requestId = `pet:test:${randomUUID()}`;

  await client.query('BEGIN');
  const before = await client.query(`
    SELECT c.gold, COALESCE(i.quantity, 0)::int AS quantity, COALESCE(i.stats, '{}'::jsonb) AS stats
    FROM public.characters c
    LEFT JOIN public.inventory i ON i.character_id = c.id AND i.item_name = 'Poring Pet'
    WHERE c.id = $1 FOR UPDATE OF c
  `, [characterId]);
  await client.query(`UPDATE public.characters SET gold = GREATEST(gold, 10000) WHERE id = $1`, [characterId]);

  const first = await client.query(`SELECT public.purchase_pet($1,$2,$3,$4,$5) AS result`,
    [characterId, 'Poring Pet', 2000, 'poring', requestId]);
  const replay = await client.query(`SELECT public.purchase_pet($1,$2,$3,$4,$5) AS result`,
    [characterId, 'Poring Pet', 2000, 'poring', requestId]);
  const result = first.rows[0].result;
  if (JSON.stringify(result) !== JSON.stringify(replay.rows[0].result)) throw new Error('Idempotent replay returned a different result');
  if (Number(result.quantity) !== Number(before.rows[0].quantity) + 1) throw new Error('Pet quantity did not increase exactly once');
  const committed = await client.query(`SELECT gold FROM public.characters WHERE id = $1`, [characterId]);
  if (Number(committed.rows[0].gold) !== Math.max(Number(before.rows[0].gold), 10000) - 2000) throw new Error('Gold was not deducted exactly once');

  await client.query('ROLLBACK');
  const after = await client.query(`
    SELECT c.gold, COALESCE(i.quantity, 0)::int AS quantity, COALESCE(i.stats, '{}'::jsonb) AS stats
    FROM public.characters c
    LEFT JOIN public.inventory i ON i.character_id = c.id AND i.item_name = 'Poring Pet'
    WHERE c.id = $1
  `, [characterId]);
  const receipt = await client.query(`SELECT 1 FROM public.pet_purchase_requests WHERE idempotency_key = $1`, [requestId]);
  if (JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0]) || receipt.rowCount !== 0) throw new Error('Rollback left persistent data behind');
  console.log(JSON.stringify({ ok: true, characterId, quantityTested: result.quantity, goldAfterPurchase: result.gold, rollbackClean: true }));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* noop */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}
