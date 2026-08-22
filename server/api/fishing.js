import { query, tx } from './db.js';
import { FISH_SPECIES, pickFishingCatch, getFishingMapConfig, getFishingRodConfig } from '../../src/engine/GameData.js';

const REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;
let fishingEconomyPromise = null;

export function ensureFishingEconomy() {
  if (fishingEconomyPromise) return fishingEconomyPromise;
  fishingEconomyPromise = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS public.fishing_catch_requests (
    request_id text PRIMARY KEY,
    character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS public.shop_purchase_requests (
    request_id text PRIMARY KEY,
    user_id text NOT NULL,
    character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
    )`);
  })().catch(error => {
    fishingEconomyPromise = null;
    throw error;
  });
  return fishingEconomyPromise;
}

function rollFishingCatch(random = Math.random, mapId = 'prontera', rodName = 'Fishing Rod') {
  const rod = getFishingRodConfig(rodName);
  if (!rod) throw new Error('ไม่พบคันเบ็ดที่ติดตั้ง');
  const selected = pickFishingCatch(mapId, random, { rodName });
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

  // Server startup initializes this asynchronously; await it here as well so a
  // player who catches immediately after connecting never races the CREATE TABLE.
  await ensureFishingEconomy();
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

    // Never trust the client to choose a rod or rarity. The equipped rod is
    // read from the owner-locked inventory row inside the same transaction.
    const equippedRod = await client.query(
      `SELECT item_name FROM public.inventory
       WHERE character_id = $1 AND item_type = 'fishing_rod'
         AND COALESCE(stats->>'equipped', 'false') = 'true'
       ORDER BY CASE item_name WHEN 'Golden Fishing Rod' THEN 3 WHEN 'Silver Fishing Rod' THEN 2 ELSE 1 END DESC
       LIMIT 1`,
      [characterId],
    );
    const rodName = equippedRod.rows[0]?.item_name || null;
    if (!getFishingRodConfig(rodName)) throw new Error('ต้องสวมคันเบ็ดก่อนตกปลา');

    const fish = rollFishingCatch(random, mapId, rodName);
    // Do not rely on the optional inventory unique constraint here. Some older
    // VPS databases predate the integrity migration, while the character
    // advisory lock already serializes claims for this character.
    const existingFish = await client.query(
      `SELECT id, quantity FROM public.inventory
       WHERE character_id = $1 AND item_name = $2
       ORDER BY id LIMIT 1 FOR UPDATE`,
      [characterId, fish.name],
    );
    let quantity = 1;
    if (existingFish.rows[0]) {
      const nextQuantity = Math.max(0, Math.floor(Number(existingFish.rows[0].quantity) || 0)) + 1;
      const updatedFish = await client.query(
        `UPDATE public.inventory
         SET item_type = 'fish', quantity = $2
         WHERE id = $1
         RETURNING quantity`,
        [existingFish.rows[0].id, nextQuantity],
      );
      quantity = Number(updatedFish.rows[0]?.quantity) || nextQuantity;
    } else {
      const insertedFish = await client.query(
        `INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
         VALUES ($1, $2, 'fish', 1, '{}'::jsonb)
         RETURNING quantity`,
        [characterId, fish.name],
      );
      quantity = Number(insertedFish.rows[0]?.quantity) || 1;
    }
    const almanacRow = await client.query(
      `SELECT id, stats FROM public.inventory
       WHERE character_id = $1 AND item_name = 'fishing_almanac' AND item_type = 'system'
       ORDER BY id LIMIT 1 FOR UPDATE`,
      [characterId],
    );
    const priorAlmanac = almanacRow.rows[0]?.stats && typeof almanacRow.rows[0].stats === 'object'
      ? almanacRow.rows[0].stats : {};
    const caught = Array.isArray(priorAlmanac.caught) ? priorAlmanac.caught.filter(name => typeof name === 'string' && FISH_SPECIES[name]) : [];
    const counts = priorAlmanac.counts && typeof priorAlmanac.counts === 'object' && !Array.isArray(priorAlmanac.counts)
      ? { ...priorAlmanac.counts } : {};
    const claimed = Array.isArray(priorAlmanac.claimed) ? priorAlmanac.claimed.filter(name => typeof name === 'string') : [];
    const firstDiscovery = !caught.includes(fish.name);
    if (firstDiscovery) caught.push(fish.name);
    counts[fish.name] = Math.min(2_147_483_647, Math.max(0, Math.floor(Number(counts[fish.name]) || 0)) + 1);
    const discoveryBonus = firstDiscovery
      ? ({ common: 50, uncommon: 150, rare: 500, legendary: 2000 }[fish.rarity] || 50)
      : 0;
    let gold = null;
    if (discoveryBonus > 0) {
      const goldResult = await client.query(
        `UPDATE public.characters SET gold = LEAST(COALESCE(gold, 0) + $2, 500000000), updated_at = now()
         WHERE id = $1 RETURNING gold`,
        [characterId, discoveryBonus],
      );
      gold = Number(goldResult.rows[0]?.gold) || 0;
    } else {
      const currentGold = await client.query('SELECT gold FROM public.characters WHERE id = $1 LIMIT 1', [characterId]);
      gold = Number(currentGold.rows[0]?.gold) || 0;
    }
    const almanac = { caught, claimed, counts };
    if (almanacRow.rows[0]) {
      await client.query('UPDATE public.inventory SET stats = $2 WHERE id = $1', [almanacRow.rows[0].id, almanac]);
    } else {
      await client.query(
        `INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
         VALUES ($1, 'fishing_almanac', 'system', 1, $2)`,
        [characterId, almanac],
      );
    }

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
      discovery_bonus: discoveryBonus,
      gold,
      almanac,
      rod_name: rodName,
      rod_tier: getFishingRodConfig(rodName).tier,
      rod_max_rarity: getFishingRodConfig(rodName).maxRarity,
    };

    await client.query(
      'INSERT INTO public.fishing_catch_requests (request_id, character_id, result) VALUES ($1, $2, $3)',
      [requestId, characterId, result],
    );
    return result;
  });
}

export { rollFishingCatch, getFishingMapConfig };
