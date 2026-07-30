// RPC endpoint — calls the ported Postgres functions, injecting the
// JWT-verified user id as the first argument (replacing auth.uid()).
import { query } from './db.js';
import { httpErr } from './auth.js';

// name -> ordered arg names the CLIENT supplies (p_user_id is prepended from JWT)
const RPCS = {
    buy_market_item: ['p_listing_id'],
    send_card_mail: ['p_recipient_char_id', 'p_item_name', 'p_item_type', 'p_quantity', 'p_price', 'p_stats'],
    claim_card_mail: ['p_mail_id'],
    return_card_mail: ['p_mail_id'],
    admin_update_character: ['target_char_id', 'updates'],
    admin_delete_character: ['target_char_id'],
    admin_give_item: ['target_char_id', 'p_item_name', 'p_item_type', 'p_qty', 'p_stats'],
};

export async function callRpc(fn, body, userId) {
    const argNames = RPCS[fn];
    if (!argNames) throw httpErr(404, `unknown rpc: ${fn}`);
    if (!userId) throw httpErr(401, 'auth required');

    const params = [userId, ...argNames.map(n => (body && body[n] !== undefined) ? body[n] : null)];
    const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await query(`SELECT public.${fn}(${placeholders}) AS result`, params);
    return rows[0]?.result ?? null;
}
