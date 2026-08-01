// One-time backfill: reconcile the authoritative `character_cards` table from the
// legacy `inventory` card rows. Cards used to be a purely client-side concept
// (rolled with Math.random, stored in inventory + appearance.cardState); the
// server card layer (character_cards) only ever held world-boss cards. Now that
// the server owns ALL card sources, every card a player already holds must exist
// in character_cards or it would be treated as stale and purged on next login.
//
// Safe to run repeatedly. It never LOWERS an existing owned/stars value
// (GREATEST), and leaves pity untouched.
//
// Usage:
//   node --env-file=.env scripts/backfill_cards.mjs --dry-run   # preview only
//   node --env-file=.env scripts/backfill_cards.mjs             # apply
import { query } from '../api/db.js';
import { getCard } from '../cards/CardCatalog.js';

const DRY = process.argv.includes('--dry-run');

async function main() {
    const { rows } = await query(
        "SELECT character_id, item_name, quantity, stats FROM inventory WHERE item_type = 'card'");
    console.log(`Read ${rows.length} inventory card rows.`);

    // Aggregate per (character_id, card_id): owned = Σ quantity, stars = max.
    const agg = new Map(); // key `${cid}|${cardId}` -> { characterId, cardId, owned, stars }
    let unknown = 0;
    for (const r of rows) {
        const card = getCard(r.item_name);
        if (!card) { unknown++; continue; }
        const key = `${r.character_id}|${card.id}`;
        const stars = Math.min(5, Math.max(1, Math.floor(Number(r.stats?.card_stars) || 1)));
        const owned = Math.max(0, Math.floor(Number(r.quantity) || 0));
        const prev = agg.get(key);
        if (prev) {
            prev.owned += owned;
            prev.stars = Math.max(prev.stars, stars);
        } else {
            agg.set(key, { characterId: r.character_id, cardId: card.id, owned, stars });
        }
    }
    console.log(`Aggregated to ${agg.size} (character, card) pairs (${unknown} rows had unknown card names, skipped).`);

    const before = await query('SELECT count(*)::int n FROM character_cards');
    console.log(`character_cards rows before: ${before.rows[0].n}`);

    if (DRY) {
        console.log('[dry-run] no writes performed.');
        const sample = [...agg.values()].slice(0, 8);
        console.table(sample);
        process.exit(0);
    }

    let written = 0;
    for (const e of agg.values()) {
        if (e.owned <= 0) continue;
        await query(
            `INSERT INTO public.character_cards (character_id, card_id, owned, stars, pity)
             VALUES ($1, $2, $3, $4, 0)
             ON CONFLICT (character_id, card_id) DO UPDATE
               SET owned = GREATEST(public.character_cards.owned, EXCLUDED.owned),
                   stars = GREATEST(public.character_cards.stars, EXCLUDED.stars)`,
            [e.characterId, e.cardId, e.owned, e.stars]);
        written++;
    }

    const after = await query('SELECT count(*)::int n FROM character_cards');
    console.log(`Upserted ${written} rows. character_cards rows after: ${after.rows[0].n}`);
    process.exit(0);
}

main().catch(e => { console.error('backfill failed:', e); process.exit(1); });
