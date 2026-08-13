import { tx, query } from './db.js';
import { ITEMS } from '../../src/engine/GameData.js';

export async function ensureNpcSaleEconomy() {
  await query(`CREATE TABLE IF NOT EXISTS public.npc_sale_requests (request_id text PRIMARY KEY, character_id text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
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
