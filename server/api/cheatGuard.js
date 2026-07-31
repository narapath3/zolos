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

// Return a list of reasons this character is a HIGH-CONFIDENCE cheat, or [].
export function detectCheat(c) {
    const level = Number(c.level) || 0, exp = Number(c.exp) || 0;
    const kills = Number(c.total_kills) || 0, play = Number(c.play_time) || 0; // play_time in seconds
    const atk = Number(c.atk) || 0, def = Number(c.def) || 0, maxHp = Number(c.max_hp) || 0;
    const reasons = [];

    // "Never played" gate: under 60s of playtime AND zero kills. Nobody can
    // legitimately level or earn on a character they have not played.
    const neverPlayed = kills === 0 && play < 60;
    if (neverPlayed && level >= 10) reasons.push(`level ${level} but 0 kills & <60s played`);
    if (neverPlayed && exp >= 100_000) reasons.push(`exp ${exp} but 0 kills & <60s played`);

    // Injected combat stats: base atk/def are 10/5, base max_hp 100. Values this
    // high with almost no playtime and barely any kills are injected.
    if (play < 120 && kills < 5 && (atk > 5000 || def > 5000 || maxHp > 200_000)) {
        reasons.push(`injected stats atk${atk}/def${def}/hp${maxHp} with <120s played`);
    }
    return reasons;
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

// Scan every character; reset + log any high-confidence cheat. Returns count.
export async function sweepCheaters() {
    const { rows } = await query(`
        SELECT c.id, c.user_id, c.name, c.level, c.exp, c.total_kills, c.play_time,
               c.atk, c.def, c.max_hp, c.gold, c.zol,
               COALESCE(p.is_admin, false) AS is_admin
        FROM public.characters c
        LEFT JOIN public.profiles p ON p.id = c.user_id`);

    let acted = 0;
    for (const c of rows) {
        if (c.is_admin) continue; // never touch admin accounts
        const reasons = detectCheat(c);
        if (!reasons.length) continue;

        const before = {
            level: c.level, exp: c.exp, gold: c.gold, zol: c.zol,
            atk: c.atk, def: c.def, max_hp: c.max_hp,
            total_kills: c.total_kills, play_time: c.play_time,
        };
        try {
            await query(
                `UPDATE public.characters SET
                    level=$2, exp=$3, hp=$4, max_hp=$5, sp=$6, max_sp=$7,
                    atk=$8, def=$9, gold=$10, zol=$11, updated_at=now()
                 WHERE id=$1`,
                [c.id, SAFE.level, SAFE.exp, SAFE.hp, SAFE.max_hp, SAFE.sp, SAFE.max_sp,
                    SAFE.atk, SAFE.def, SAFE.gold, SAFE.zol]);
            await query(
                `INSERT INTO public.cheat_actions (character_id, user_id, name, reason, before_data, action)
                 VALUES ($1,$2,$3,$4,$5,'auto-reset')`,
                [c.id, c.user_id, c.name, reasons.join('; '), JSON.stringify(before)]);
            console.warn(`[CheatGuard] 🚨 auto-reset ${c.name} (${c.id}): ${reasons.join('; ')}`);
            acted++;
        } catch (e) {
            console.error(`[CheatGuard] failed on ${c.id}:`, e.message);
        }
    }
    if (acted) console.log(`[CheatGuard] auto-reset ${acted} cheating account(s)`);
    return acted;
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
