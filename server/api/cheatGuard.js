// Automatic cheat guard — detects IMPOSSIBLE progression and neutralizes it.
//
// Policy (chosen by the operator): high-confidence detection only + auto-RESET
// (never auto-delete). Every rule requires the account to be essentially
// UNPLAYED — near-zero play_time and zero kills — yet hold progression that can
// only come from playing. A legit player always accrues play_time/kills while
// leveling, so these rules have near-zero false-positive risk. Caught accounts
// are reset to a fresh character and logged to cheat_actions for admin review
// (the admin can still hard-delete from the dashboard).
//
// Self-host only: writes go through the server's own DB pool (api/db.js), so
// this is the server acting on its own data — not an external SQL client.
import { query } from './db.js';

// Fresh-character baseline (matches createCharacter defaults).
const SAFE = { level: 1, exp: 0, hp: 100, max_hp: 100, sp: 50, max_sp: 50, atk: 10, def: 5, gold: 0, zol: 0 };

// Absolute game ceilings — anything above these can't come from normal play
// (buy_market_item caps gold at 500M; save sanitizer caps stats). These are
// self-evident and need NO timestamp, so they can't misfire on clock skew.
const CAP = { gold: 500_000_000, zol: 2_000_000_000, level: 300, atk: 1_000_000, def: 1_000_000 };

// Classify a character. Returns { reset:[], flag:[] }:
//   reset — clearly an unplayed injected account → safe to auto-reset.
//   flag  — suspicious (beyond the game's hard caps) → admin reviews, no auto-action.
//
// NOTE: rules deliberately use only play_time/kills (server-tracked) and
// absolute caps — NEVER created_at. created_at is client-supplied and has been
// observed in the future (clock skew), which made an earlier age-based rule
// falsely reset a legit new player. Time-relative detection needs a trustworthy
// server timestamp (e.g. the daily snapshots) — not created_at.
export function detectCheat(c) {
    const level = Number(c.level) || 0, exp = Number(c.exp) || 0;
    const kills = Number(c.total_kills) || 0, play = Number(c.play_time) || 0; // seconds
    const atk = Number(c.atk) || 0, def = Number(c.def) || 0, maxHp = Number(c.max_hp) || 0;
    const gold = Number(c.gold) || 0, zol = Number(c.zol) || 0;
    const reset = [], flag = [];

    // ---- TIER 1: auto-reset (impossible → certainly injected) ----
    // "Never played" gate: <60s playtime AND zero kills. Can't level/earn without playing.
    const neverPlayed = kills === 0 && play < 60;
    if (neverPlayed && level >= 10) reset.push(`level ${level} but 0 kills & <60s played`);
    if (neverPlayed && exp >= 100_000) reset.push(`exp ${exp} but 0 kills & <60s played`);
    if (play < 120 && kills < 5 && (atk > 5000 || def > 5000 || maxHp > 200_000))
        reset.push(`injected stats atk${atk}/def${def}/hp${maxHp} with <120s played`);

    // ---- TIER 2: flag for review (beyond the game's absolute caps) ----
    if (gold > CAP.gold) flag.push(`gold ${gold} over cap ${CAP.gold}`);
    if (zol > CAP.zol) flag.push(`zol ${zol} over cap`);
    if (level > CAP.level) flag.push(`level ${level} over max ${CAP.level}`);
    if (atk > CAP.atk || def > CAP.def) flag.push(`atk ${atk}/def ${def} over cap`);
    return { reset, flag };
}

export async function ensureCheatTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS public.cheat_actions (
            id bigserial PRIMARY KEY,
            character_id text,
            user_id uuid,
            name text,
            reason text,
            before_data jsonb,
            action text,
            created_at timestamptz DEFAULT now()
        )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cheat_actions_created
                 ON public.cheat_actions (created_at DESC)`);
}

// Reset one character to a fresh baseline. Used by the sweep and the admin
// "reset" button. Returns the pre-reset snapshot.
export async function resetCharacter(c) {
    await query(
        `UPDATE public.characters SET
            level=$2, exp=$3, hp=$4, max_hp=$5, sp=$6, max_sp=$7,
            atk=$8, def=$9, gold=$10, zol=$11, updated_at=now()
         WHERE id=$1`,
        [c.id, SAFE.level, SAFE.exp, SAFE.hp, SAFE.max_hp, SAFE.sp, SAFE.max_sp,
            SAFE.atk, SAFE.def, SAFE.gold, SAFE.zol]);
}

// Scan every character. Tier-1 → auto-reset + log; Tier-2 → flag + log (deduped
// so a suspect isn't re-logged more than once per 24h). Returns counts.
export async function sweepCheaters() {
    const { rows } = await query(`
        SELECT c.id, c.user_id, c.name, c.level, c.exp, c.total_kills, c.play_time,
               c.atk, c.def, c.max_hp, c.gold, c.zol, c.created_at,
               COALESCE(p.is_admin, false) AS is_admin
        FROM public.characters c
        LEFT JOIN public.profiles p ON p.id = c.user_id`);

    let reset = 0, flagged = 0;
    for (const c of rows) {
        if (c.is_admin) continue; // never touch admin accounts
        const { reset: resetReasons, flag: flagReasons } = detectCheat(c);
        const before = {
            level: c.level, exp: c.exp, gold: c.gold, zol: c.zol,
            atk: c.atk, def: c.def, max_hp: c.max_hp,
            total_kills: c.total_kills, play_time: c.play_time,
        };
        try {
            if (resetReasons.length) {
                await resetCharacter(c);
                await query(
                    `INSERT INTO public.cheat_actions (character_id, user_id, name, reason, before_data, action)
                     VALUES ($1,$2,$3,$4,$5,'auto-reset')`,
                    [c.id, c.user_id, c.name, resetReasons.join('; '), JSON.stringify(before)]);
                console.warn(`[CheatGuard] 🚨 auto-reset ${c.name} (${c.id}): ${resetReasons.join('; ')}`);
                reset++;
            } else if (flagReasons.length) {
                // dedup: skip if already flagged (and not yet resolved) in the last 24h
                const dup = await query(
                    `SELECT 1 FROM public.cheat_actions
                     WHERE character_id=$1 AND action='flag' AND created_at > now() - interval '24 hours' LIMIT 1`,
                    [c.id]);
                if (dup.rowCount) continue;
                await query(
                    `INSERT INTO public.cheat_actions (character_id, user_id, name, reason, before_data, action)
                     VALUES ($1,$2,$3,$4,$5,'flag')`,
                    [c.id, c.user_id, c.name, flagReasons.join('; '), JSON.stringify(before)]);
                console.warn(`[CheatGuard] ⚠️ flagged ${c.name} (${c.id}): ${flagReasons.join('; ')}`);
                flagged++;
            }
        } catch (e) {
            console.error(`[CheatGuard] failed on ${c.id}:`, e.message);
        }
    }
    if (reset || flagged) console.log(`[CheatGuard] auto-reset ${reset}, flagged ${flagged}`);
    return { reset, flagged };
}

// Scan on boot, then every 5 minutes.
export async function startCheatGuard() {
    try {
        await ensureCheatTable();
        await sweepCheaters();
    } catch (e) {
        console.error('[CheatGuard] init failed:', e.message);
    }
    setInterval(() => {
        sweepCheaters().catch(e => console.error('[CheatGuard] sweep failed:', e.message));
    }, 5 * 60 * 1000);
}
