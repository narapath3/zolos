import { tx, query } from './db.js';
import { ITEMS } from '../../src/engine/GameData.js';

export async function ensureNpcSaleEconomy() {
  await query(`CREATE TABLE IF NOT EXISTS public.npc_sale_requests (request_id text PRIMARY KEY, character_id text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await query(`CREATE TABLE IF NOT EXISTS public.npc_pet_sale_requests (request_id text PRIMARY KEY, character_id text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
}

export async function sellItemToNpc({ characterId, userId, itemName, quantity, requestId }) {
  const qty = Number(quantity), meta = ITEMS[itemName];
  if (!characterId || !userId || !itemName || !requestId || !Number.isSafeInteger(qty) || qty < 1 || qty > 999999) throw new Error('คำสั่งขายไม่ถูกต้อง');
  if (!meta || ['pet', 'card', 'system'].includes(meta.type) || !Number.isFinite(Number(meta.price))) throw new Error('ไอเทมนี้ขายให้ NPC ไม่ได้');
  const unitPrice = Math.max(1, Math.floor(Number(meta.price) * 0.8));
  return tx(async client => {
    const prior = await client.query('SELECT result FROM public.npc_sale_requests WHERE request_id=$1', [requestId]);
    if (prior.rows[0]) return prior.rows[0].result;
    const owner = await client.query('SELECT id FROM public.characters WHERE id=$1 AND user_id=$2 FOR UPDATE', [characterId, userId]);
    if (!owner.rows[0]) throw new Error('ไม่พบตัวละครหรือไม่มีสิทธิ์');
    const found = await client.query('SELECT id,quantity,item_type,stats FROM public.inventory WHERE character_id=$1 AND item_name=$2 FOR UPDATE', [characterId, itemName]);
    const row = found.rows[0];
    if (!row || Number(row.quantity) < qty) throw new Error('จำนวนไอเทมไม่เพียงพอ');
    if (['pet', 'card', 'system'].includes(row.item_type) || row.stats?.equipped === true) throw new Error('ไอเทมนี้ขายไม่ได้');
    const remaining = Number(row.quantity) - qty;
    if (remaining === 0) await client.query('DELETE FROM public.inventory WHERE id=$1', [row.id]);
    else await client.query('UPDATE public.inventory SET quantity=$1 WHERE id=$2', [remaining, row.id]);
    const totalGold = unitPrice * qty;
    const updated = await client.query('UPDATE public.characters SET gold=LEAST(2147483647,COALESCE(gold,0)+$1),updated_at=now() WHERE id=$2 RETURNING gold', [totalGold, characterId]);
    const result = { requestId, item_name:itemName, quantity:qty, remaining, unit_price:unitPrice, gold_gained:totalGold, gold:Number(updated.rows[0].gold) };
    await client.query('INSERT INTO public.npc_sale_requests(request_id,character_id,result) VALUES($1,$2,$3)', [requestId, characterId, result]);
    return result;
  });
}

function petInstancesForSale(row) {
  const stats = row?.stats && typeof row.stats === 'object' && !Array.isArray(row.stats) ? row.stats : {};
  if (Array.isArray(stats.instances)) {
    return stats.instances.filter(instance => instance && typeof instance === 'object' && typeof instance.uid === 'string' && /^[A-Za-z0-9:_-]{1,40}$/.test(instance.uid));
  }
  const quantity = Math.max(0, Math.min(200, Number(row?.quantity) || 0));
  const base = String(row?.id || 'legacy').replace(/[^A-Za-z0-9]/g, '').slice(-28) || 'legacy';
  return Array.from({ length: quantity }, (_, index) => ({
    uid: `legacy_${base}_${index}`.slice(0, 40),
    name: typeof stats.petName === 'string' ? stats.petName.slice(0, 24) : null,
    level: Math.max(1, Math.min(40, Number(stats.petLevel) || 1)),
    xp: Math.max(0, Math.min(100000000, Number(stats.petXp) || 0)),
  }));
}

export async function sellPetInstanceToNpc({ characterId, userId, itemName, petUid, requestId }) {
  const meta = ITEMS[itemName];
  if (!characterId || !userId || !itemName || !requestId || !petUid
    || !/^[A-Za-z0-9:_-]{1,40}$/.test(String(petUid))
    || !/^[A-Za-z0-9:_-]{1,160}$/.test(String(requestId))) {
    throw new Error('คำสั่งขายสัตว์เลี้ยงไม่ถูกต้อง');
  }
  if (!meta || meta.type !== 'pet' || !Number.isFinite(Number(meta.price))) throw new Error('สัตว์เลี้ยงนี้ขายให้ NPC ไม่ได้');
  return tx(async client => {
    const prior = await client.query('SELECT character_id,result FROM public.npc_pet_sale_requests WHERE request_id=$1', [requestId]);
    if (prior.rows[0]) {
      if (String(prior.rows[0].character_id) !== String(characterId)) throw new Error('request id ใช้งานกับตัวละครอื่นแล้ว');
      return prior.rows[0].result;
    }
    const owner = await client.query('SELECT id FROM public.characters WHERE id=$1 AND user_id=$2 FOR UPDATE', [characterId, userId]);
    if (!owner.rows[0]) throw new Error('ไม่พบตัวละครหรือไม่มีสิทธิ์');
    const found = await client.query('SELECT id,quantity,item_type,stats FROM public.inventory WHERE character_id=$1 AND item_name=$2 FOR UPDATE', [characterId, itemName]);
    const row = found.rows[0];
    if (!row || row.item_type !== 'pet') throw new Error('ไม่พบสัตว์เลี้ยง');
    const stats = row.stats && typeof row.stats === 'object' && !Array.isArray(row.stats) ? row.stats : {};
    if (stats.equipped === true && stats.equippedUid === petUid) throw new Error('ต้องเก็บสัตว์เลี้ยงก่อนขาย');
    const instances = petInstancesForSale(row);
    const idx = instances.findIndex(instance => instance.uid === String(petUid));
    if (idx < 0) throw new Error('ไม่พบสัตว์เลี้ยงตัวนี้ในกระเป๋า');
    const [instance] = instances.splice(idx, 1);
    const activeUid = typeof stats.equippedUid === 'string' ? stats.equippedUid : null;
    const nextStats = {
      ...stats,
      instances,
      equipped: Boolean(activeUid && instances.some(item => item.uid === activeUid)),
      equippedUid: instances.some(item => item.uid === activeUid) ? activeUid : null,
    };
    if (instances.length) await client.query('UPDATE public.inventory SET quantity=$1,stats=$2 WHERE id=$3', [instances.length, nextStats, row.id]);
    else await client.query('DELETE FROM public.inventory WHERE id=$1', [row.id]);
    const level = Math.max(1, Math.min(40, Number(instance.level) || 1));
    const unitPrice = Math.max(1, Math.floor(Number(meta.price) * 0.8 * (1 + (level - 1) * 0.12)));
    const updated = await client.query('UPDATE public.characters SET gold=LEAST(2147483647,COALESCE(gold,0)+$1),updated_at=now() WHERE id=$2 RETURNING gold', [unitPrice, characterId]);
    const result = { requestId, item_name: itemName, sold_uid: instance.uid, remaining: instances.length, unit_price: unitPrice, gold_gained: unitPrice, gold: Number(updated.rows[0]?.gold || 0) };
    await client.query('INSERT INTO public.npc_pet_sale_requests(request_id,character_id,result) VALUES($1,$2,$3)', [requestId, characterId, result]);
    return result;
  });
}
