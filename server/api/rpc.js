// RPC endpoint — calls the ported Postgres functions, injecting the
// JWT-verified user id as the first argument (replacing auth.uid()).
import { query, tx } from './db.js';
import { httpErr } from './auth.js';
import { randomUUID } from 'node:crypto';
import { cleanupExpiredVendingStalls } from './marketExpiry.js';

// name -> ordered arg names the CLIENT supplies (p_user_id is prepended from JWT)
const RPCS = {
    buy_market_item: ['p_listing_id'],
    send_card_mail: ['p_recipient_char_id', 'p_item_name', 'p_item_type', 'p_quantity', 'p_price', 'p_stats', 'p_request_id'],
    claim_card_mail: ['p_mail_id'],
    return_card_mail: ['p_mail_id'],
    admin_update_character: ['target_char_id', 'updates'],
    admin_delete_character: ['target_char_id'],
    admin_give_item: ['target_char_id', 'p_item_name', 'p_item_type', 'p_qty', 'p_stats'],
    create_market_listing: ['p_character_id', 'p_item_name', 'p_quantity', 'p_price'],
    cancel_market_listing: ['p_listing_id'],
    open_vending_stall: ['p_character_id', 'p_shop_name', 'p_appearance', 'p_requested_slot'],
    close_vending_stall: [],
};

async function createMarketListing(body, userId) {
    const characterId = String(body?.p_character_id || '');
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const quantity = Number(body?.p_quantity);
    const price = Number(body?.p_price);
    if (!characterId || !itemName || !Number.isInteger(quantity) || quantity < 1 || quantity > 999999) {
        return { ok: false, reason: 'bad_listing' };
    }
    if (!Number.isInteger(price) || price < 0 || price > 500_000_000) {
        return { ok: false, reason: 'bad_price' };
    }

    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id, name FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };

        const { rows: items } = await client.query(
            'SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 AND item_name = $2 FOR UPDATE',
            [characterId, itemName],
        );
        const item = items[0];
        if (!item || Number(item.quantity) < quantity) return { ok: false, reason: 'not_enough_items' };
        if (item.item_type === 'system') return { ok: false, reason: 'system_item' };

        if (Number(item.quantity) === quantity) {
            await client.query('DELETE FROM inventory WHERE id = $1', [item.id]);
        } else {
            await client.query('UPDATE inventory SET quantity = quantity - $2 WHERE id = $1', [item.id, quantity]);
        }

        const { rows: listings } = await client.query(
            `INSERT INTO marketplace
                (item_id, item_name, item_type, quantity, price, seller_id, seller_name, stats)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [randomUUID(), item.item_name, item.item_type, quantity, price, userId, character.name, item.stats || {}],
        );
        return { ok: true, serverAuthoritative: true, listing: listings[0] };
    });
}

function sanitizeStallAppearance(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const safe = {};
    for (const key of ['bodyColor', 'hairColor', 'pantsColor', 'gender']) {
        if (source[key] !== undefined) safe[key] = String(source[key]).slice(0, 32);
    }
    return safe;
}

async function openVendingStall(body, userId) {
    const characterId = String(body?.p_character_id || '');
    const shopName = String(body?.p_shop_name || 'ร้านค้า').trim().slice(0, 24) || 'ร้านค้า';
    const requested = body?.p_requested_slot;
    const requestedSlot = requested === null || requested === undefined || requested === '' ? null : Number(requested);
    if (!characterId || (requestedSlot !== null && (!Number.isInteger(requestedSlot) || requestedSlot < 0 || requestedSlot >= 8))) {
        return { ok: false, reason: 'invalid_slot' };
    }

    return tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('vending:slots', 0))");
        const { rows: chars } = await client.query(
            'SELECT id, name FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        const { rows: mineRows } = await client.query(
            'SELECT id, slot FROM vending_stalls WHERE user_id = $1 FOR UPDATE', [userId],
        );
        const mine = mineRows[0];
        const { rows: occupied } = await client.query(
            'SELECT slot, user_id FROM vending_stalls WHERE slot BETWEEN 0 AND 7',
        );
        let slot = -1;
        if (requestedSlot !== null) {
            if (occupied.some(row => Number(row.slot) === requestedSlot && row.user_id !== userId)) {
                return { ok: false, reason: 'taken' };
            }
            slot = requestedSlot;
        } else if (mine) {
            slot = Number(mine.slot);
        } else {
            const used = new Set(occupied.map(row => Number(row.slot)));
            for (let i = 0; i < 8; i++) { if (!used.has(i)) { slot = i; break; } }
            if (slot < 0) return { ok: false, reason: 'full' };
        }
        const { rows } = await client.query(
            `INSERT INTO vending_stalls
                (user_id, character_id, owner_name, shop_name, slot, appearance)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) DO UPDATE SET
                character_id = EXCLUDED.character_id, owner_name = EXCLUDED.owner_name,
                shop_name = EXCLUDED.shop_name, slot = EXCLUDED.slot,
                appearance = EXCLUDED.appearance, updated_at = now()
             RETURNING *`,
            [userId, characterId, character.name, shopName, slot, sanitizeStallAppearance(body?.p_appearance)],
        );
        return { ok: true, slot, moved: !!mine && Number(mine.slot) !== slot, stall: rows[0] };
    });
}

async function closeVendingStall(userId) {
    return tx(async (client) => {
        await client.query('DELETE FROM vending_stalls WHERE user_id = $1', [userId]);
        return { ok: true };
    });
}

async function cancelMarketListing(body, userId) {
    const listingId = String(body?.p_listing_id || '');
    if (!listingId) return { ok: false, reason: 'bad_listing' };

    return tx(async (client) => {
        const { rows: listings } = await client.query(
            'SELECT * FROM marketplace WHERE id = $1 AND seller_id = $2 FOR UPDATE',
            [listingId, userId],
        );
        const listing = listings[0];
        if (!listing) return { ok: false, reason: 'not_owner_or_gone' };

        const { rows: items } = await client.query(
            'SELECT id FROM inventory WHERE character_id = (SELECT id FROM characters WHERE user_id = $1 ORDER BY created_at LIMIT 1) AND item_name = $2 FOR UPDATE',
            [userId, listing.item_name],
        );
        const existing = items[0];
        if (existing) {
            await client.query('UPDATE inventory SET quantity = quantity + $2 WHERE id = $1', [existing.id, listing.quantity]);
        } else {
            const { rows: chars } = await client.query(
                'SELECT id FROM characters WHERE user_id = $1 ORDER BY created_at LIMIT 1',
                [userId],
            );
            if (!chars[0]) return { ok: false, reason: 'no_character' };
            await client.query(
                'INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, $2, $3, $4, $5)',
                [chars[0].id, listing.item_name, listing.item_type, listing.quantity, listing.stats || {}],
            );
        }
        await client.query('DELETE FROM marketplace WHERE id = $1', [listingId]);
        return { ok: true, serverAuthoritative: true, listing };
    });
}

export async function callRpc(fn, body, userId) {
    if (fn === 'create_market_listing') {
        if (!userId) throw httpErr(401, 'auth required');
        return createMarketListing(body, userId);
    }
    if (fn === 'cancel_market_listing') {
        if (!userId) throw httpErr(401, 'auth required');
        return cancelMarketListing(body, userId);
    }
    if (fn === 'open_vending_stall') {
        if (!userId) throw httpErr(401, 'auth required');
        return openVendingStall(body, userId);
    }
    if (fn === 'close_vending_stall') {
        if (!userId) throw httpErr(401, 'auth required');
        return closeVendingStall(userId);
    }
    const argNames = RPCS[fn];
    if (!argNames) throw httpErr(404, `unknown rpc: ${fn}`);
    if (!userId) throw httpErr(401, 'auth required');

    // Enforce the deadline again at the purchase boundary. This closes the tiny
    // gap between the exact 48-hour mark and the next scheduled cleanup tick.
    if (fn === 'buy_market_item') await cleanupExpiredVendingStalls();

    const params = [userId, ...argNames.map(n => (body && body[n] !== undefined) ? body[n] : null)];
    const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await query(`SELECT public.${fn}(${placeholders}) AS result`, params);
    return rows[0]?.result ?? null;
}
