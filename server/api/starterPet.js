import { STARTER_PET } from '../../src/engine/GameData.js';
import { query, tx } from './db.js';

const REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;

export async function ensureStarterPetEconomy() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.starter_pet_claims (
      request_id text PRIMARY KEY,
      character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
      receipt_id text NOT NULL,
      result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (character_id, receipt_id)
    )
  `);
}

function validateRequest({ characterId, userId, requestId }) {
  if (!characterId || !userId || !REQUEST_ID_RE.test(String(requestId || ''))) {
    throw new Error('คำขอรับสัตว์เลี้ยงเริ่มต้นไม่ถูกต้อง');
  }
}

function normalizeInstances(stats) {
  return Array.isArray(stats?.instances) ? stats.instances.filter(Boolean) : [];
}

function makeResult({ requestId, granted, quantity, stats, instance = null }) {
  return {
    ok: true,
    serverAuthoritative: true,
    requestId,
    receiptId: STARTER_PET.receiptId,
    granted: granted === true,
    item_name: STARTER_PET.itemName,
    item_type: 'pet',
    pet_key: STARTER_PET.petKey,
    price: 0,
    quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
    stats: stats || { instances: [] },
    instance,
  };
}

/** Claim the free tutorial companion exactly once per character. */
export async function claimStarterPet({ characterId, userId, requestId }) {
  validateRequest({ characterId, userId, requestId });
  return tx(async client => {
    const lockKey = `${characterId}:${STARTER_PET.receiptId}`;
    await client.query(
      'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))',
      [lockKey],
    );

    const prior = await client.query(
      `SELECT character_id, receipt_id, result
         FROM public.starter_pet_claims
        WHERE request_id = $1 OR (character_id = $2 AND receipt_id = $3)
        ORDER BY created_at ASC
        LIMIT 1`,
      [requestId, characterId, STARTER_PET.receiptId],
    );
    if (prior.rows[0]) {
      const row = prior.rows[0];
      if (row.character_id !== characterId || row.receipt_id !== STARTER_PET.receiptId) {
        throw new Error('รหัสรับสัตว์เลี้ยงถูกใช้กับตัวละครอื่น');
      }
      return row.result;
    }

    const owner = await client.query(
      `SELECT id
         FROM public.characters
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [characterId, userId],
    );
    if (!owner.rows[0]) throw new Error('ไม่พบตัวละครหรือไม่มีสิทธิ์');

    const existing = await client.query(
      `SELECT id, quantity, stats
         FROM public.inventory
        WHERE character_id = $1 AND item_name = $2
        ORDER BY id
        LIMIT 1
        FOR UPDATE`,
      [characterId, STARTER_PET.itemName],
    );
    if (existing.rows[0] && Number(existing.rows[0].quantity) > 0) {
      const stats = existing.rows[0].stats || { instances: [] };
      const instances = normalizeInstances(stats);
      const result = makeResult({
        requestId,
        granted: false,
        quantity: Math.max(Number(existing.rows[0].quantity) || 1, instances.length || 1),
        stats: instances.length ? { ...stats, instances } : stats,
      });
      await client.query(
        `INSERT INTO public.starter_pet_claims (request_id, character_id, receipt_id, result)
         VALUES ($1, $2, $3, $4)`,
        [requestId, characterId, STARTER_PET.receiptId, result],
      );
      return result;
    }

    const uid = `pet_${STARTER_PET.petKey}_${cryptoHash(characterId + ':' + STARTER_PET.receiptId)}`;
    const instance = { uid, name: null, level: 1, xp: 0 };
    const stats = { instances: [instance] };
    let result;
    if (existing.rows[0]) {
      await client.query(
        `UPDATE public.inventory
            SET item_type = 'pet', quantity = 1, stats = $1
          WHERE id = $2`,
        [stats, existing.rows[0].id],
      );
      result = makeResult({ requestId, granted: true, quantity: 1, stats, instance });
    } else {
      await client.query(
        `INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
         VALUES ($1, $2, 'pet', 1, $3)`,
        [characterId, STARTER_PET.itemName, stats],
      );
      result = makeResult({ requestId, granted: true, quantity: 1, stats, instance });
    }

    await client.query(
      `INSERT INTO public.starter_pet_claims (request_id, character_id, receipt_id, result)
       VALUES ($1, $2, $3, $4)`,
      [requestId, characterId, STARTER_PET.receiptId, result],
    );
    return result;
  });
}

function cryptoHash(value) {
  // PostgreSQL-compatible short deterministic uid without trusting client data.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export { REQUEST_ID_RE };
