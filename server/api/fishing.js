import { query, tx } from './db.js';
import { FISH_SPECIES, pickFishingCatch, getFishingMapConfig } from '../../src/engine/GameData.js';

const REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;

export async function ensureFishingEconomy() {
  await query(`CREATE TABLE IF NOT EXISTS public.fishing_catch_requests (
    request_id text PRIMARY KEY,
    character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
}

function rollFishingCatch(random = Math.random, mapId = 'prontera') {
  const selected = pickFishingCatch(mapId, random);
  if (!selected?.name || !FISH_SPECIES[selected.name]) throw new Error('ไม่มีข้อมูลปลาสำหรับรางวัล');
  return {
    name: selected.name,
    emoji: String(selected.emoji || '🐟').slice(0, 16),
    rarity: String(selected.rarity || 'common').slice(0, 24),
    price: Math.max(0, Math.floor(Number(selected.price) || 0)),
    desc: String(selected.desc || '').slice(0, 240),
    mapId: selected.mapId,
    mapName: selected.mapName,
    mapTier: selected.mapTier,
    mapDanger: selected.mapDanger,
  };
}

export function isFishingRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_RE.test(value);
}

export async function claimFishingReward({ characterId, userId, requestId, mapId = 'prontera', random = Math.random }) {
  if (!characterId || !userId || !isFishingRequestId(requestId)) {
    throw new Error('คำขอตกปลาไม่ถูกต้อง');
  }

  return tx(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('fishing:' || $1, 0))",
      [String(characterId)],
    );

    const prior = await client.query(
      'SELECT character_id, result FROM public.fishing_catch_requests WHERE request_id = $1 LIMIT 1',
      [requestId],
    );
    if (prior.rows[0]) {
      if (String(prior.rows[0].character_id) !== String(characterId)) {
        throw new Error('รหัสคำขอนี้ถูกใช้กับตัวละครอื่นแล้ว');
      }
      return prior.rows[0].result;
    }

    const owner = await client.query(
      'SELECT id FROM public.characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [characterId, userId],
    );
    if (!owner.rows[0]) throw new Error('ไม่พบตัวละครหรือไม่มีสิทธิ์');

    const fish = rollFishingCatch(random, mapId);
    const inventory = await client.query(
      `INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
       VALUES ($1, $2, 'fish', 1, '{}'::jsonb)
       ON CONFLICT (character_id, item_name) DO UPDATE
         SET item_type = 'fish', quantity = GREATEST(0, public.inventory.quantity) + 1
       RETURNING quantity`,
      [characterId, fish.name],
    );
    const quantity = Number(inventory.rows[0]?.quantity) || 1;
    const result = {
      ok: true,
      serverAuthoritative: true,
      requestId,
      item_name: fish.name,
      item_type: 'fish',
      quantity: 1,
      inventory_quantity: quantity,
      emoji: fish.emoji,
      rarity: fish.rarity,
      price: fish.price,
      desc: fish.desc,
      map_id: fish.mapId,
      map_name: fish.mapName,
      map_tier: fish.mapTier,
      map_danger: fish.mapDanger,
    };

    await client.query(
      'INSERT INTO public.fishing_catch_requests (request_id, character_id, result) VALUES ($1, $2, $3)',
      [requestId, characterId, result],
    );
    return result;
  });
}

export { rollFishingCatch, getFishingMapConfig };
