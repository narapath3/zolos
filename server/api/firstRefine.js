import { FIRST_REFINE_KIT } from '../../src/engine/GameData.js';
import { query, tx } from './db.js';

const REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;
const MAX_GOLD = 2_147_483_647;

export async function ensureFirstRefineEconomy() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.first_refine_supply_requests (
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
    throw new Error('คำขอชุดตีบวกเริ่มต้นไม่ถูกต้อง');
  }
}

function makeResult({ requestId, granted, gold, inventoryQuantity, reason = null }) {
  return {
    ok: true,
    serverAuthoritative: true,
    requestId,
    receiptId: FIRST_REFINE_KIT.receiptId,
    granted: granted === true,
    goldGranted: granted === true ? FIRST_REFINE_KIT.gold : 0,
    oreGranted: granted === true ? FIRST_REFINE_KIT.oreQuantity : 0,
    gold: Math.max(0, Math.min(MAX_GOLD, Math.floor(Number(gold) || 0))),
    item_name: FIRST_REFINE_KIT.oreName,
    item_type: 'material',
    inventory_quantity: Math.max(0, Math.floor(Number(inventoryQuantity) || 0)),
    reason: reason || undefined,
  };
}

/**
 * Claim the bounded, one-time supply used only to unblock the mandatory first
 * weapon refine. The caller must be the trusted socket identity; this function
 * still checks character ownership inside the same transaction.
 */
export async function claimFirstRefineSupply({ characterId, userId, requestId }) {
  validateRequest({ characterId, userId, requestId });
  return tx(async client => {
    const lockKey = `${characterId}:${FIRST_REFINE_KIT.receiptId}`;
    await client.query(
      'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))',
      [lockKey],
    );

    const prior = await client.query(
      `SELECT character_id, receipt_id, result
         FROM public.first_refine_supply_requests
        WHERE request_id = $1 OR (character_id = $2 AND receipt_id = $3)
        ORDER BY created_at ASC
        LIMIT 1`,
      [requestId, characterId, FIRST_REFINE_KIT.receiptId],
    );
    if (prior.rows[0]) {
      const row = prior.rows[0];
      if (row.character_id !== characterId || row.receipt_id !== FIRST_REFINE_KIT.receiptId) {
        throw new Error('รหัสรับชุดตีบวกถูกใช้กับตัวละครอื่น');
      }
      return row.result;
    }

    const owner = await client.query(
      `SELECT id, gold
         FROM public.characters
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [characterId, userId],
    );
    if (!owner.rows[0]) throw new Error('ไม่พบตัวละครหรือไม่มีสิทธิ์');

    const oreRows = await client.query(
      `SELECT id, quantity
         FROM public.inventory
        WHERE character_id = $1 AND item_name = $2
        FOR UPDATE`,
      [characterId, FIRST_REFINE_KIT.oreName],
    );
    const oreQuantity = oreRows.rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
    const currentGold = Math.max(0, Number(owner.rows[0].gold) || 0);
    const needsKit = currentGold < FIRST_REFINE_KIT.gold || oreQuantity < FIRST_REFINE_KIT.oreQuantity;
    if (!needsKit) {
      return makeResult({
        requestId,
        granted: false,
        gold: currentGold,
        inventoryQuantity: oreQuantity,
        reason: 'not_needed',
      });
    }

    const updatedCharacter = await client.query(
      `UPDATE public.characters
          SET gold = LEAST($1, COALESCE(gold, 0) + $2), updated_at = pg_catalog.now()
        WHERE id = $3
        RETURNING gold`,
      [MAX_GOLD, FIRST_REFINE_KIT.gold, characterId],
    );

    let updatedOreQuantity = oreQuantity;
    if (oreRows.rows[0]) {
      const firstOre = oreRows.rows[0];
      updatedOreQuantity += FIRST_REFINE_KIT.oreQuantity;
      await client.query(
        'UPDATE public.inventory SET quantity = quantity + $1 WHERE id = $2',
        [FIRST_REFINE_KIT.oreQuantity, firstOre.id],
      );
    } else {
      updatedOreQuantity = FIRST_REFINE_KIT.oreQuantity;
      await client.query(
        `INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
         VALUES ($1, $2, 'material', $3, '{}'::jsonb)`,
        [characterId, FIRST_REFINE_KIT.oreName, FIRST_REFINE_KIT.oreQuantity],
      );
    }

    const result = makeResult({
      requestId,
      granted: true,
      gold: updatedCharacter.rows[0].gold,
      inventoryQuantity: updatedOreQuantity,
    });
    await client.query(
      `INSERT INTO public.first_refine_supply_requests
         (request_id, character_id, receipt_id, result)
       VALUES ($1, $2, $3, $4)`,
      [requestId, characterId, FIRST_REFINE_KIT.receiptId, result],
    );
    return result;
  });
}

export { REQUEST_ID_RE };
