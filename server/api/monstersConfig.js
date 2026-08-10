// World monster CONFIG — the admin-editable source of truth for which monsters
// spawn on which map, their stats, and what they drop. Phase 1 of the
// server-authoritative monster system: this only owns the *configuration*
// (gameplay still runs client-side until the engine in Phase 2 is enabled).
//
// Tables are created + seeded at boot (idempotent, like ensureCheatTable /
// ensureSnapshotTable). The one-time seed reads the existing hard-coded values
// out of src/engine/GameData.js so the defaults exactly match what players see
// today. After seeding, GameData is never touched again — the DB is authority.
//
// Self-host only: talks straight to local Postgres via api/db.js.
import { query } from './db.js';

// The six live maps (id + display name), matching MAP_CONFIGS in
// src/engine/SceneManager.js. Svarrga is a peaceful mining city (no monsters).
export const MAPS = [
    { id: 'prontera', name: 'Prontera Field' },
    { id: 'payon', name: 'Payon Forest' },
    { id: 'glast_heim', name: 'Glast Heim' },
    { id: 'mjolnir', name: 'Mjolnir Mountains' },
    { id: 'abyss_lake', name: 'Abyss Lake' },
    { id: 'svarrga', name: 'Svarrga สรวงสวรรค์' },
];
const MAP_IDS = new Set(MAPS.map(m => m.id));
export function isValidMap(id) { return MAP_IDS.has(id); }

export async function ensureMonsterTables() {
    await query(`
        CREATE TABLE IF NOT EXISTS public.monster_defs (
            type text PRIMARY KEY,
            name text NOT NULL,
            emoji text,
            color bigint DEFAULT 0,
            hp integer DEFAULT 100, atk integer DEFAULT 10, def integer DEFAULT 5,
            exp integer DEFAULT 10, gold_min integer DEFAULT 0, gold_max integer DEFAULT 0,
            size real DEFAULT 0.6, speed real DEFAULT 0.5,
            environment text DEFAULT 'ground',
            is_boss boolean DEFAULT false,
            updated_at timestamptz DEFAULT now()
        )`);
    await query(`
        CREATE TABLE IF NOT EXISTS public.map_spawns (
            id bigserial PRIMARY KEY,
            map_id text NOT NULL,
            monster_type text NOT NULL,
            weight integer DEFAULT 10,
            min_level integer DEFAULT 1,
            is_water boolean DEFAULT false,
            UNIQUE (map_id, monster_type)
        )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_map_spawns_map ON public.map_spawns (map_id)`);
    await query(`
        CREATE TABLE IF NOT EXISTS public.map_config (
            map_id text PRIMARY KEY,
            land_count integer DEFAULT 12,
            water_count integer DEFAULT 4
        )`);
    await query(`
        CREATE TABLE IF NOT EXISTS public.monster_drops (
            id bigserial PRIMARY KEY,
            monster_type text NOT NULL,
            item_name text NOT NULL,
            emoji text,
            item_type text DEFAULT 'material',
            chance real DEFAULT 0.1,
            qty_min integer DEFAULT 1,
            qty_max integer DEFAULT 1
        )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_monster_drops_type ON public.monster_drops (monster_type)`);
    await query(`
        CREATE TABLE IF NOT EXISTS public.world_config (
            id integer PRIMARY KEY,
            version integer DEFAULT 1
        )`);
    await query(`INSERT INTO public.world_config (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`);
}

// One-time seed from GameData. No-op once monster_defs has any row, so it is
// safe to call every boot. Reads the existing spawn tables at SHARED level 999
// (the same value MonsterManager uses for the shared world) so the weights land
// on today's live values.
const SHARED_SPAWN_LEVEL = 999;

export async function seedMonstersIfEmpty() {
    const { rows } = await query('SELECT count(*)::int AS c FROM public.monster_defs');
    if (rows[0].c > 0) return false;

    let gd;
    try {
        gd = await import('../../src/engine/GameData.js');
    } catch (e) {
        console.error('[MonsterCfg] seed skipped — cannot import GameData:', e.message);
        return false;
    }

    const all = gd.getAllMonsters();
    for (const [type, d] of Object.entries(all)) {
        const gold = d.gold || {};
        await query(
            `INSERT INTO public.monster_defs
                (type,name,emoji,color,hp,atk,def,exp,gold_min,gold_max,size,speed,environment,is_boss)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (type) DO NOTHING`,
            [type, d.name || type, d.emoji || '', d.color || 0,
                d.hp || 100, d.atk || 10, d.def || 5, d.exp || 10,
                gold.min || 0, gold.max || 0, d.size || 0.6, d.speed || 0.5,
                d.environment || 'ground', d.isBoss === true]);

        for (const l of (d.loot || [])) {
            if (!l || !l.name) continue;
            await query(
                `INSERT INTO public.monster_drops (monster_type,item_name,emoji,item_type,chance)
                 VALUES ($1,$2,$3,$4,$5)`,
                [type, l.name, l.emoji || '', l.type || 'material', l.chance || 0.1]);
        }
    }

    for (const m of MAPS) {
        const isSvarrga = m.id === 'svarrga';
        const land = isSvarrga ? [] : gd.getSpawnTable(SHARED_SPAWN_LEVEL, m.id);
        const water = isSvarrga ? [] : gd.getWaterSpawnTable(SHARED_SPAWN_LEVEL);
        await query(
            `INSERT INTO public.map_config (map_id,land_count,water_count) VALUES ($1,$2,$3)
             ON CONFLICT (map_id) DO NOTHING`,
            [m.id, isSvarrga ? 0 : 12, isSvarrga ? 0 : 4]);
        for (const e of land) {
            await query(
                `INSERT INTO public.map_spawns (map_id,monster_type,weight,is_water) VALUES ($1,$2,$3,false)
                 ON CONFLICT (map_id,monster_type) DO NOTHING`,
                [m.id, e.type, e.weight]);
        }
        for (const e of water) {
            await query(
                `INSERT INTO public.map_spawns (map_id,monster_type,weight,is_water) VALUES ($1,$2,$3,true)
                 ON CONFLICT (map_id,monster_type) DO NOTHING`,
                [m.id, e.type, e.weight]);
        }
    }
    console.log('[MonsterCfg] 🌱 Seeded monster config from GameData (defs, spawns, drops)');
    return true;
}

// Idempotent live-world upgrade for the expanded Prontera mountain. Existing
// admin-tuned rows are preserved; only missing spawn entries are added.
export async function ensurePronteraMountainExpansion() {
    const mountainSpawns = [
        ['bigfoot', 10],
        ['nine_tail', 7],
        ['harpy', 6],
        ['gargoyle', 4],
    ];
    for (const [type, weight] of mountainSpawns) {
        await query(
            `INSERT INTO public.map_spawns (map_id,monster_type,weight,min_level,is_water)
             VALUES ('prontera',$1,$2,1,false)
             ON CONFLICT (map_id,monster_type) DO NOTHING`,
            [type, weight]
        );
    }
    await query(
        `INSERT INTO public.map_config (map_id,land_count,water_count)
         VALUES ('prontera',18,4)
         ON CONFLICT (map_id) DO UPDATE
         SET land_count = GREATEST(public.map_config.land_count, EXCLUDED.land_count)`
    );
}

// ---- world version (bumped on every admin edit; used by the engine + clients
// to know config changed) ----
export async function getWorldVersion() {
    const { rows } = await query('SELECT version FROM public.world_config WHERE id = 1');
    return rows[0] ? rows[0].version : 1;
}
export async function bumpWorldVersion() {
    const { rows } = await query('UPDATE public.world_config SET version = version + 1 WHERE id = 1 RETURNING version');
    return rows[0] ? rows[0].version : 1;
}

// ---- read helpers (used by admin API and, in Phase 2, the monster engine) ----
export async function getMonsterDefs() {
    const { rows } = await query('SELECT * FROM public.monster_defs ORDER BY environment, hp');
    return rows;
}
export async function getMapSpawns(mapId) {
    const [spawns, cfg] = await Promise.all([
        query(`SELECT s.*, d.name, d.emoji, d.environment
               FROM public.map_spawns s
               LEFT JOIN public.monster_defs d ON d.type = s.monster_type
               WHERE s.map_id = $1 ORDER BY s.is_water, s.weight DESC`, [mapId]),
        query('SELECT land_count, water_count FROM public.map_config WHERE map_id = $1', [mapId]),
    ]);
    const c = cfg.rows[0] || { land_count: 12, water_count: 4 };
    return { landCount: c.land_count, waterCount: c.water_count, spawns: spawns.rows };
}
export async function getMonsterDrops(type) {
    const { rows } = await query('SELECT * FROM public.monster_drops WHERE monster_type = $1 ORDER BY chance DESC', [type]);
    return rows;
}

// Full config bundle — everything the engine/clients need in one shot.
export async function getFullConfig() {
    const [defs, spawns, drops, mapCfg, version] = await Promise.all([
        query('SELECT * FROM public.monster_defs'),
        query('SELECT * FROM public.map_spawns'),
        query('SELECT * FROM public.monster_drops'),
        query('SELECT * FROM public.map_config'),
        getWorldVersion(),
    ]);
    return { version, defs: defs.rows, spawns: spawns.rows, drops: drops.rows, mapConfig: mapCfg.rows };
}
