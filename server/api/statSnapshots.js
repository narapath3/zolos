// Daily player stat snapshots — the "stock ticker" of the game.
//
// Once per day we freeze every character's cumulative values (level, exp, gold,
// zol, kills, play_time). The admin dashboard then shows each player's daily
// movement: today's live change = current − today's opening snapshot; a past
// day's change = that day's snapshot − the previous day's snapshot.
//
// Self-host only: talks straight to local Postgres via api/db.js.
import { query } from './db.js';

const METRICS = ['level', 'exp', 'gold', 'zol', 'total_kills', 'play_time'];

export async function ensureSnapshotTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS public.player_stat_snapshots (
            character_id text NOT NULL,
            snapshot_date date NOT NULL,
            name text,
            level integer, exp bigint, gold bigint, zol bigint,
            total_kills bigint, play_time bigint,
            captured_at timestamptz DEFAULT now(),
            PRIMARY KEY (character_id, snapshot_date)
        )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_snapshot_date
                 ON public.player_stat_snapshots (snapshot_date)`);
}

// Freeze today's opening values for every character. Idempotent per day:
// ON CONFLICT DO NOTHING means the first capture of the day wins (≈ day start),
// so it represents the "opening" — later calls the same day are no-ops.
// The "day" boundary is Thai midnight (Asia/Bangkok), so daily change lines up
// with the players' calendar day rather than UTC.
export const DAY_EXPR = "(now() AT TIME ZONE 'Asia/Bangkok')::date";

export async function captureDailySnapshots() {
    const { rowCount } = await query(`
        INSERT INTO public.player_stat_snapshots
            (character_id, snapshot_date, name, level, exp, gold, zol, total_kills, play_time)
        SELECT id, ${DAY_EXPR}, name, level, exp, gold, zol, total_kills, play_time
        FROM public.characters
        ON CONFLICT (character_id, snapshot_date) DO NOTHING`);
    if (rowCount > 0) {
        console.log(`[Snapshot] 📸 Captured ${rowCount} daily player snapshot(s) for today`);
    }
    return rowCount;
}

// Start the scheduler: capture immediately (baseline) then re-check hourly so a
// fresh snapshot lands soon after each local midnight. Cheap: one INSERT/hour.
export async function startSnapshotScheduler() {
    try {
        await ensureSnapshotTable();
        await captureDailySnapshots();
    } catch (e) {
        console.error('[Snapshot] init failed:', e.message);
    }
    setInterval(() => {
        captureDailySnapshots().catch(e => console.error('[Snapshot] hourly capture failed:', e.message));
    }, 60 * 60 * 1000);
}

export { METRICS };
