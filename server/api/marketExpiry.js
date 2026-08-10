// Server-authoritative lifetime for player vending stalls.
//
// Once a stall has been open for 48 hours, every unsold listing is returned to
// the owner's inventory and both the listings and physical stall are removed in
// one database transaction. A crash can therefore never leave a listing
// deleted without first returning its item.
import { tx, query } from './db.js';

export const VENDING_STALL_TTL_HOURS = 48;
export const VENDING_STALL_TTL_MS = VENDING_STALL_TTL_HOURS * 60 * 60 * 1000;
export const MARKET_EXPIRY_INTERVAL_MS = 60 * 1000;

let scheduler = null;

function positiveQuantity(value, fallback = 1) {
    const qty = Math.floor(Number(value));
    return Number.isFinite(qty) && qty > 0 ? qty : fallback;
}

function objectStats(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Convert a listed pet back to the inventory instance representation used by
// the client. The stable uid also makes a retry safe to inspect/debug.
export function petInstancesForReturnedListing(listing) {
    const stats = objectStats(listing?.stats);
    if (Array.isArray(stats.instances) && stats.instances.length) {
        return stats.instances.map((instance, index) => ({
            ...objectStats(instance),
            uid: instance?.uid || `market_return_${listing.id}_${index}`,
        }));
    }
    return Array.from({ length: positiveQuantity(listing?.quantity) }, (_, index) => ({
        uid: `market_return_${listing.id}_${index}`,
        name: stats.petName || null,
        level: Math.max(1, Math.floor(Number(stats.petLevel) || 1)),
        xp: Math.max(0, Math.floor(Number(stats.petXp) || 0)),
    }));
}

export function mergeReturnedPetStats(existingStats, existingQuantity, listing) {
    const current = objectStats(existingStats);
    const instances = Array.isArray(current.instances)
        ? current.instances.map(instance => ({ ...objectStats(instance) }))
        : [];

    // Preserve legacy pets whose old row has quantity but no instances array.
    const missingLegacyInstances = Math.max(0, positiveQuantity(existingQuantity, 0) - instances.length);
    for (let i = 0; i < missingLegacyInstances; i += 1) {
        instances.push({ uid: `legacy_pet_${listing.id}_${i}`, name: null, level: 1, xp: 0 });
    }
    instances.push(...petInstancesForReturnedListing(listing));
    return { ...current, instances };
}

async function returnListingToInventory(client, characterId, listing) {
    const qty = positiveQuantity(listing.quantity);
    const { rows } = await client.query(
        `SELECT id, quantity, stats
         FROM public.inventory
         WHERE character_id = $1 AND item_name = $2
         ORDER BY created_at ASC, id ASC
         LIMIT 1
         FOR UPDATE`,
        [characterId, listing.item_name],
    );
    const existing = rows[0] || null;

    if (listing.item_type === 'pet') {
        const stats = mergeReturnedPetStats(existing?.stats, existing?.quantity || 0, listing);
        const newQuantity = stats.instances.length;
        if (existing) {
            await client.query(
                `UPDATE public.inventory
                 SET item_type = 'pet', quantity = $1, stats = $2::jsonb
                 WHERE id = $3`,
                [newQuantity, JSON.stringify(stats), existing.id],
            );
        } else {
            await client.query(
                `INSERT INTO public.inventory
                    (character_id, item_name, item_type, quantity, stats)
                 VALUES ($1, $2, 'pet', $3, $4::jsonb)`,
                [characterId, listing.item_name, newQuantity, JSON.stringify(stats)],
            );
        }
        return qty;
    }

    if (existing) {
        await client.query(
            `UPDATE public.inventory
             SET quantity = GREATEST(0, quantity) + $1
             WHERE id = $2`,
            [qty, existing.id],
        );
    } else {
        await client.query(
            `INSERT INTO public.inventory
                (character_id, item_name, item_type, quantity, stats)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [characterId, listing.item_name, listing.item_type, qty,
                JSON.stringify(objectStats(listing.stats))],
        );
    }
    return qty;
}

export async function ensureMarketExpirySchema() {
    // Older rows may predate updated_at. Treat creation as the lifetime start.
    await query(`UPDATE public.vending_stalls
                 SET updated_at = created_at
                 WHERE updated_at IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vending_stalls_expiry
                 ON public.vending_stalls ((COALESCE(updated_at, created_at)))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_marketplace_seller
                 ON public.marketplace (seller_id)`);
}

export async function cleanupExpiredVendingStalls({ io } = {}) {
    const result = await tx(async client => {
        const { rows: stalls } = await client.query(`
            SELECT id, user_id, character_id, owner_name, shop_name
            FROM public.vending_stalls
            WHERE COALESCE(updated_at, created_at)
                  <= NOW() - INTERVAL '${VENDING_STALL_TTL_HOURS} hours'
            ORDER BY COALESCE(updated_at, created_at) ASC
            FOR UPDATE SKIP LOCKED`);

        let listingCount = 0;
        let itemCount = 0;
        let skippedStalls = 0;
        const expiredStallIds = [];

        for (const stall of stalls) {
            // Prefer the character that opened the shop. For a legacy/bad row,
            // fall back only to another character owned by the same account.
            const { rows: ownedCharacters } = await client.query(
                `SELECT id FROM public.characters
                 WHERE user_id = $1
                 ORDER BY (id = $2) DESC, created_at ASC
                 LIMIT 1
                 FOR UPDATE`,
                [stall.user_id, stall.character_id],
            );
            const characterId = ownedCharacters[0]?.id;
            if (!characterId) {
                skippedStalls += 1;
                console.warn(`[MarketExpiry] Cannot expire stall ${stall.id}: owner has no character`);
                continue;
            }

            const { rows: listings } = await client.query(
                `SELECT * FROM public.marketplace
                 WHERE seller_id = $1
                 ORDER BY created_at ASC, id ASC
                 FOR UPDATE`,
                [stall.user_id],
            );
            for (const listing of listings) {
                itemCount += await returnListingToInventory(client, characterId, listing);
            }

            // Deletes occur only after all inventory writes succeed. Any error
            // rolls the entire transaction back automatically.
            await client.query('DELETE FROM public.marketplace WHERE seller_id = $1', [stall.user_id]);
            await client.query('DELETE FROM public.vending_stalls WHERE id = $1', [stall.id]);
            listingCount += listings.length;
            expiredStallIds.push(stall.id);
        }

        return {
            expiredStalls: expiredStallIds.length,
            expiredStallIds,
            returnedListings: listingCount,
            returnedItems: itemCount,
            skippedStalls,
        };
    });

    if (result.expiredStalls > 0) {
        console.log(`[MarketExpiry] Closed ${result.expiredStalls} expired stall(s), returned ${result.returnedListings} listing(s) / ${result.returnedItems} item(s)`);
        io?.emit('stalls_update');
    }
    return result;
}

export async function startMarketExpiryScheduler({ io } = {}) {
    if (scheduler) return scheduler;
    await ensureMarketExpirySchema();
    await cleanupExpiredVendingStalls({ io });
    scheduler = setInterval(() => {
        cleanupExpiredVendingStalls({ io })
            .catch(error => console.error('[MarketExpiry] cleanup failed:', error.message));
    }, MARKET_EXPIRY_INTERVAL_MS);
    scheduler.unref?.();
    return scheduler;
}
