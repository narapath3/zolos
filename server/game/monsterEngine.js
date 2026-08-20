// Server-authoritative monster engine (Phase 2). When WORLD_MONSTERS is on the
// server OWNS every monster on every populated map: it spawns them from the
// admin-editable DB config, walks them (wander + aggro) on a fixed tick,
// broadcasts their state to all clients on the map, resolves damage
// authoritatively (shared HP → true RO co-op), and on death rolls drops +
// grants exp/gold SERVER-SIDE (anti-cheat). Clients render whatever the server
// sends and defer all rewards to it.
//
// Gated by a flag: if disabled, this module is never started and gameplay falls
// back to the legacy client-side spawner — instant rollback.
//
// Self-host only: DB writes go through the app's own pool (api/db.js).
import { query, tx } from '../api/db.js';
import { getFullConfig } from '../api/monstersConfig.js';
import { clampMonsterDamage } from '../securityPolicy.js';
import { getCardsBySource } from '../cards/CardCatalog.js';
import { resolveCardDrops } from '../cards/CardDrops.js';
import { getCardOverrides } from '../api/cardEconomy.js';
import { AMBIENT_WATER_TYPES } from '../../src/engine/GameData.js';

const TICK_MS = 100;               // 10 Hz simulation + broadcast
const SPAWN_RANGE = 12;            // matches client MonsterManager
const PRONTERA_SPAWN_RANGE = 50;   // expanded field + explorable mountain
const RESPAWN_MS = 4000;
const AGGRO_MS = 8000;             // how long a hit keeps a monster hunting
const AGGRO_LEASH_DISTANCE = 42;   // readable retreat window before revenge ends
const WANDER_RADIUS = 3.5;         // how far a monster roams from its spawn
const AMBIENT_WATER_SET = new Set(AMBIENT_WATER_TYPES);
const ATTACK_REACH = 1.8;
const ATTACK_CD_MS = 1300;
// Longest current player cast range is 10 world units. Keep a small network
// interpolation allowance without permitting arbitrary off-screen hits.
const MAX_PLAYER_HIT_RANGE = 12;
const HIT_WINDOW_MS = 500;
const MAX_HITS_PER_MONSTER_WINDOW = 2;

let io = null;
let onlinePlayers = null;          // Map<socketId, playerInfo>
let running = false;
let loopTimer = null;

// In-memory config (rebuilt on load/reload).
let cfg = { version: 0, defs: new Map(), dropsByType: new Map(), spawnsByMap: new Map(), mapCfg: new Map() };
// Admin per-card drop overrides { cardId: {chance,pity,enabled} }, refreshed with config.
let cardOverrides = {};
// mapId -> { monsters: Map<id, M>, dirty:boolean }
const worlds = new Map();

// ---------------- terrain (minimal port of SceneManager) ----------------
const riverZ = (x) => Math.sin(x * 0.08) * 10 - 2;
const isWaterAt = (x, z) => Math.abs(z - riverZ(x)) < 5.5;
const inArena = (mapId, x, z) => {
    if (mapId !== 'prontera') return false;
    const dx = x - (-14), dz = z - 14;
    return dx * dx + dz * dz < 7.5 * 7.5;
};
const environmentAt = (mapId, x, z) => {
    if (isWaterAt(x, z)) return 'water';
    if (x < -6 && z < -6) return 'cave';
    if (x > 6 && z > 6) return 'mountain';
    return 'ground';
};
function canMonsterOccupy(m, mapId, x, z, def) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || inArena(mapId, x, z)) return false;
    const required = m.isWater ? 'water' : (def?.environment || 'ground');
    return environmentAt(mapId, x, z) === required;
}
function pickLandPos(mapId, environment = 'ground') {
    for (let i = 0; i < 60; i++) {
        let x, z;
        if (mapId === 'prontera' && environment === 'mountain') {
            x = 17 + Math.random() * 31;
            z = 17 + Math.random() * 31;
        } else if (mapId === 'prontera' && environment === 'cave') {
            x = -17 - Math.random() * 31;
            z = -17 - Math.random() * 31;
        } else {
            const range = mapId === 'prontera' ? PRONTERA_SPAWN_RANGE : SPAWN_RANGE;
            const a = Math.random() * Math.PI * 2;
            const d = 4 + Math.random() * (range - 4);
            x = Math.cos(a) * d;
            z = Math.sin(a) * d;
            if (mapId === 'prontera' && environment === 'ground'
                && ((x > 6 && z > 6) || (x < -6 && z < -6))) continue;
        }
        if (!isWaterAt(x, z) && !inArena(mapId, x, z)) return { x, z };
    }
    return { x: (Math.random() - 0.5) * 16, z: -8 - Math.random() * 6 };
}
function pickWaterPos() {
    const x = -20 + Math.random() * 40;
    return { x, z: riverZ(x) + (Math.random() - 0.5) * 4 };
}

// ---------------- config ----------------
export async function loadConfig() {
    const full = await getFullConfig();
    const defs = new Map();
    for (const d of full.defs) defs.set(d.type, d);
    const dropsByType = new Map();
    for (const dr of full.drops) {
        if (!dropsByType.has(dr.monster_type)) dropsByType.set(dr.monster_type, []);
        dropsByType.get(dr.monster_type).push(dr);
    }
    const spawnsByMap = new Map();
    for (const s of full.spawns) {
        if (!spawnsByMap.has(s.map_id)) spawnsByMap.set(s.map_id, []);
        spawnsByMap.get(s.map_id).push(s);
    }
    const mapCfg = new Map();
    for (const m of full.mapConfig) mapCfg.set(m.map_id, m);
    cfg = { version: full.version, defs, dropsByType, spawnsByMap, mapCfg };
    try { cardOverrides = await getCardOverrides(); } catch { cardOverrides = {}; }
}

// ---------------- spawning ----------------
function weightedPick(entries) {
    const total = entries.reduce((s, e) => s + (e.weight || 0), 0);
    if (total <= 0) return entries[0];
    let roll = Math.random() * total;
    for (const e of entries) { roll -= e.weight; if (roll <= 0) return e; }
    return entries[entries.length - 1];
}

function makeMonster(id, type, isWater) {
    const def = cfg.defs.get(type);
    const hp = def ? def.hp : 100;
    const pos = isWater ? pickWaterPos() : pickLandPos(id.mapId, def?.environment || 'ground');
    return {
        id: id.str, type, isWater,
        x: pos.x, z: pos.z, rot: Math.random() * Math.PI * 2,
        spawnX: pos.x, spawnZ: pos.z,
        hp, maxHp: hp, alive: true,
        aggroChar: null, aggroUntil: 0, atkReadyAt: 0, attackSeq: 0,
        wanderUntil: 0, targetX: pos.x, targetZ: pos.z,
        dmgByChar: new Map(),
        hitCadenceByChar: new Map(),
        respawnAt: 0,
    };
}

// Build (or rebuild) a map's monster set from config.
export function spawnMap(mapId) {
    // Skyrail is a social event venue. Ignore even accidentally configured
    // database spawns so the island remains monster-free in server mode.
    if (mapId === 'skyrail_bazaar') {
        worlds.set(mapId, { monsters: new Map() });
        return;
    }
    const spawns = cfg.spawnsByMap.get(mapId) || [];
    const mc = cfg.mapCfg.get(mapId) || { land_count: 0, water_count: 0 };
    const land = spawns.filter(s => !s.is_water);
    const water = spawns.filter(s => s.is_water && !AMBIENT_WATER_SET.has(s.monster_type));
    const monsters = new Map();
    for (let i = 0; i < (mc.land_count || 0) && land.length; i++) {
        const pick = weightedPick(land);
        const m = makeMonster({ str: `land_${i}`, mapId }, pick.monster_type, false);
        monsters.set(m.id, m);
    }
    for (let i = 0; i < (mc.water_count || 0) && water.length; i++) {
        const pick = weightedPick(water);
        const m = makeMonster({ str: `water_${i}`, mapId }, pick.monster_type, true);
        monsters.set(m.id, m);
    }
    worlds.set(mapId, { monsters });
}

function ensureMapSpawned(mapId) {
    if (!worlds.has(mapId)) spawnMap(mapId);
}

// ---------------- helpers ----------------
function mapHasPlayers(mapId) {
    if (!onlinePlayers) return false;
    for (const p of onlinePlayers.values()) if (p.mapId === mapId) return true;
    return false;
}
function socketForChar(characterId) {
    if (!onlinePlayers || !io) return null;
    for (const [sid, p] of onlinePlayers) {
        if (p.characterId === characterId) return io.sockets.sockets.get(sid) || null;
    }
    return null;
}
// Nearest online player position on a map (for aggro chase), or null.
function playerPos(characterId, mapId) {
    if (!onlinePlayers) return null;
    for (const p of onlinePlayers.values()) {
        if (p.characterId === characterId && p.mapId === mapId && p.lastPos) return p.lastPos;
    }
    return null;
}

// ---------------- simulation ----------------
function stepMonster(m, mapId, now, dtSec) {
    if (!m.alive) return;
    const def = cfg.defs.get(m.type);
    const speed = def ? Math.max(0.7, def.speed) : 1;

    // Expired aggro returns the monster to neutral before the next wander tick.
    if (m.aggroChar && now >= m.aggroUntil) {
        m.aggroChar = null;
        m.aggroUntil = 0;
        m.atkReadyAt = 0;
        m.targetX = m.spawnX;
        m.targetZ = m.spawnZ;
    }

    // Aggro: chase + strike the player who provoked it.
    if (m.aggroChar && now < m.aggroUntil) {
        const pp = playerPos(m.aggroChar, mapId);
        if (pp) {
            const dx = pp.x - m.x, dz = pp.z - m.z;
            const dist = Math.hypot(dx, dz) || 0.001;
            if (dist > ATTACK_REACH) {
                // Keep chasing while the player retreats, but stop after a
                // generous readable leash instead of following across the map.
                if (dist > AGGRO_LEASH_DISTANCE) {
                    m.aggroChar = null;
                    m.aggroUntil = 0;
                    m.atkReadyAt = 0;
                    m.targetX = m.spawnX;
                    m.targetZ = m.spawnZ;
                    return;
                }
                const step = Math.min(dist, (speed + 1.4) * 1.5 * dtSec);
                let nextX = m.x + (dx / dist) * step;
                let nextZ = m.z + (dz / dist) * step;
                if (!canMonsterOccupy(m, mapId, nextX, nextZ, def)) {
                    // Arc around the obstacle instead of dropping aggro. This is
                    // especially important beside Prontera's curved river bank.
                    const sideX = -dz / dist;
                    const sideZ = dx / dist;
                    const sideStep = step * 1.35;
                    const candidates = [
                        [m.x + sideX * sideStep + (dx / dist) * step * 0.35,
                            m.z + sideZ * sideStep + (dz / dist) * step * 0.35],
                        [m.x - sideX * sideStep + (dx / dist) * step * 0.35,
                            m.z - sideZ * sideStep + (dz / dist) * step * 0.35],
                    ];
                    const detour = candidates.find(([x, z]) => canMonsterOccupy(m, mapId, x, z, def));
                    if (detour) [nextX, nextZ] = detour;
                    else { nextX = m.x; nextZ = m.z; }
                }
                if (nextX !== m.x || nextZ !== m.z) {
                    m.x = nextX;
                    m.z = nextZ;
                }
            } else if (now >= m.atkReadyAt) {
                m.atkReadyAt = now + ATTACK_CD_MS;
                m.attackSeq = (m.attackSeq + 1) & 0xffff;
                io.to(`map:${mapId}`).emit('mon_atk_fx', {
                    id: m.id, seq: m.attackSeq, targetCharacterId: m.aggroChar, x: pp.x, z: pp.z,
                });
                const sock = socketForChar(m.aggroChar);
                if (sock && def) sock.emit('mon_atk', { id: m.id, seq: m.attackSeq, atk: def.atk });
            }
            m.rot = Math.atan2(dx, dz);
            return;
        }
        m.aggroChar = null; // target gone
    }

    // Idle wander around the spawn point.
    if (now >= m.wanderUntil) {
        m.wanderUntil = now + 1200 + Math.random() * 2500;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * WANDER_RADIUS;
        let tx = m.spawnX + Math.cos(a) * d;
        let tz = m.spawnZ + Math.sin(a) * d;
        if (!canMonsterOccupy(m, mapId, tx, tz, def)) { tx = m.spawnX; tz = m.spawnZ; }
        const roamRange = mapId === 'prontera' ? PRONTERA_SPAWN_RANGE : SPAWN_RANGE;
        m.targetX = Math.max(-roamRange, Math.min(roamRange, tx));
        m.targetZ = Math.max(-roamRange, Math.min(roamRange, tz));
    }
    const dx = m.targetX - m.x, dz = m.targetZ - m.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.15) {
        const step = Math.min(dist, speed * dtSec * 1.25);
        const nextX = m.x + (dx / dist) * step;
        const nextZ = m.z + (dz / dist) * step;
        if (!canMonsterOccupy(m, mapId, nextX, nextZ, def)) {
            m.targetX = m.spawnX;
            m.targetZ = m.spawnZ;
            return;
        }
        m.x = nextX;
        m.z = nextZ;
        m.rot = Math.atan2(dx, dz);
    }
}

function broadcastMap(mapId, world) {
    const mons = [];
    for (const m of world.monsters.values()) {
        if (!m.alive || AMBIENT_WATER_SET.has(m.type)) continue;
        mons.push({
            id: m.id, t: m.type,
            x: Math.round(m.x * 100) / 100, z: Math.round(m.z * 100) / 100,
            r: Math.round(m.rot * 100) / 100,
            hp: m.hp, mhp: m.maxHp,
            // Presentation-only state; target ownership and combat timing stay
            // authoritative on the server.
            aggro: Boolean(m.aggroChar && Date.now() < m.aggroUntil),
        });
    }
    io.to(`map:${mapId}`).emit('mon_state', { v: cfg.version, mapId, mons });
}

function tick() {
    const now = Date.now();
    const dtSec = TICK_MS / 1000;
    for (const mapId of cfg.mapCfg.keys()) {
        if (!mapHasPlayers(mapId)) { worlds.delete(mapId); continue; } // free empty maps
        ensureMapSpawned(mapId);
        const world = worlds.get(mapId);
        for (const m of world.monsters.values()) {
            if (m.alive) stepMonster(m, mapId, now, dtSec);
            else if (m.respawnAt && now >= m.respawnAt) respawnMonster(m, mapId);
        }
        broadcastMap(mapId, world);
    }
}

function respawnMonster(m, mapId) {
    // Reroll type from the map's table so admin edits take effect on respawn.
    const spawns = (cfg.spawnsByMap.get(mapId) || []).filter(s =>
        !!s.is_water === m.isWater && !AMBIENT_WATER_SET.has(s.monster_type));
    if (spawns.length) m.type = weightedPick(spawns).monster_type;
    const def = cfg.defs.get(m.type);
    const pos = m.isWater ? pickWaterPos() : pickLandPos(mapId, def?.environment || 'ground');
    m.x = pos.x; m.z = pos.z; m.spawnX = pos.x; m.spawnZ = pos.z;
    m.hp = m.maxHp = def ? def.hp : 100;
    m.alive = true; m.respawnAt = 0;
    m.aggroChar = null; m.aggroUntil = 0;
    m.atkReadyAt = 0;
    m.dmgByChar = new Map();
    m.hitCadenceByChar = new Map();
}

// ---------------- damage + death (authoritative) ----------------
export function applyHit(player, payload) {
    if (!player || !payload || typeof payload.monsterId !== 'string') return;
    const mapId = player.mapId;
    const world = worlds.get(mapId);
    if (!world) return;
    const m = world.monsters.get(payload.monsterId);
    if (!m || !m.alive) return;

    const pos = player.lastPos;
    if (!pos || pos.mapId !== mapId || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const dx = pos.x - m.x;
    const dz = pos.z - m.z;
    if (dx * dx + dz * dz > MAX_PLAYER_HIT_RANGE * MAX_PLAYER_HIT_RANGE) return;

    const dmg = clampMonsterDamage(player.level || 1, Number(payload.damage) || 0);
    if (dmg <= 0) return;

    const charId = player.characterId;
    if (!charId) return;
    const now = Date.now();
    const recent = (m.hitCadenceByChar.get(charId) || []).filter(t => now - t < HIT_WINDOW_MS);
    if (recent.length >= MAX_HITS_PER_MONSTER_WINDOW) return;
    recent.push(now);
    m.hitCadenceByChar.set(charId, recent);

    m.dmgByChar.set(charId, (m.dmgByChar.get(charId) || 0) + dmg);

    // A hit provokes the monster toward the most recent attacker.
    m.aggroChar = charId || m.aggroChar;
    m.aggroUntil = Date.now() + AGGRO_MS;

    m.hp = Math.max(0, m.hp - dmg);
    if (m.hp <= 0) killMonster(world, m, mapId);
}

async function killMonster(world, m, mapId) {
    m.alive = false;
    m.respawnAt = Date.now() + RESPAWN_MS;
    io.to(`map:${mapId}`).emit('mon_dead', { id: m.id });

    // Freeze this life before the first database await. The same monster object
    // is reused on respawn and may reroll its type while rewards are still
    // being persisted on a slow database connection.
    const defeated = {
        id: m.id,
        type: m.type,
        contributors: [...m.dmgByChar.entries()],
        killNonce: `${Date.now()}:${(m._kills = (m._kills || 0) + 1)}`,
    };
    const def = cfg.defs.get(defeated.type);
    if (!def) return;

    // Contributors (everyone who dealt damage) → exp + gold each. Top-damage
    // dealer also gets the item drop (RO-style).
    const contributors = defeated.contributors;
    if (!contributors.length) return;
    let topChar = null, topDmg = -1;
    for (const [cid, d] of contributors) if (d > topDmg) { topDmg = d; topChar = cid; }

    for (const [cid] of contributors) {
        const gold = (def.gold_min || 0) + Math.floor(Math.random() * ((def.gold_max || 0) - (def.gold_min || 0) + 1));
        const sock = socketForChar(cid);
        // A contributor receives exactly one kill for this monster life. Commit
        // it before notifying the client and return the authoritative total so
        // delayed/replayed socket packets can never double-count on the HUD.
        try {
            const { rows } = await query(
                `UPDATE public.characters
                 SET gold = LEAST(COALESCE(gold, 0) + $2, 500000000),
                     total_kills = COALESCE(total_kills, 0) + 1
                 WHERE id = $1
                 RETURNING gold, total_kills`,
                [cid, gold],
            );
            const committed = rows[0];
            if (sock && committed) {
                sock.emit('mon_reward', {
                    id: defeated.id,
                    type: defeated.type,
                    name: def.name,
                    exp: def.exp || 0,
                    gold,
                    gold_total: Number(committed.gold) || 0,
                    total_kills: Number(committed.total_kills) || 0,
                });
            }
        } catch (error) {
            // Do not emit a reward receipt whose kill was not committed. The
            // monster itself still dies and respawns, while the DB error remains
            // visible for operators instead of silently losing progression.
            console.error(`[MonEngine] reward persistence failed for ${cid}:`, error.message);
        }
    }

    // Item drops → top-damage contributor.
    const drops = cfg.dropsByType.get(defeated.type) || [];
    for (const dr of drops) {
        if (Math.random() >= dr.chance) continue;
        const qty = (dr.qty_min || 1) + Math.floor(Math.random() * ((dr.qty_max || 1) - (dr.qty_min || 1) + 1));
        try {
            await grantItem(topChar, dr.item_name, dr.item_type || 'material', qty);
            const sock = socketForChar(topChar);
            if (sock) sock.emit('mon_loot', { id: defeated.id, item_name: dr.item_name, emoji: dr.emoji || '', item_type: dr.item_type || 'material', quantity: qty });
        } catch (e) {
            console.error('[MonEngine] grantItem failed:', e.message);
        }
    }

    // Card drops → EVERY contributor rolls independently (co-op friendly), each
    // with their own per-card pity tracked authoritatively in character_cards.
    // A unique nonce per death makes the award_card_drop idempotency keys stable
    // across accidental replays but distinct across separate kills of the reused
    // monster id.
    for (const [cid] of contributors) {
        awardMonsterCards(cid, defeated.type, mapId, defeated.id, defeated.killNonce).catch(e =>
            console.error('[MonEngine] card drop failed:', e.message));
    }
}

// Roll this monster's card table for one contributor and persist any wins to
// character_cards via the authoritative award_card_drop RPC (advisory-locked +
// idempotent). Emits a `card_reward` — the same shape world-boss cards use — so
// the client's applyTrustedCardReward path (reveal pop-up + album refresh) works
// unchanged.
async function awardMonsterCards(characterId, type, mapId, monsterUid, killNonce) {
    if (!characterId) return;
    const cards = getCardsBySource('monster', type);
    if (!cards.length) return;

    // Load current pity/owned for just this monster's cards.
    const ids = cards.map(c => c.id);
    const { rows } = await query(
        'SELECT card_id, owned, stars, pity FROM public.character_cards WHERE character_id = $1 AND card_id = ANY($2)',
        [characterId, ids]);
    const cardState = {};
    for (const r of rows) cardState[r.card_id] = { owned: r.owned, stars: r.stars, pity: r.pity };

    const resolved = resolveCardDrops({
        source: { kind: 'monster', id: type },
        cardState,
        eligible: true,
        dropRatePct: 0,
        random: Math.random,
        overrides: cardOverrides,
    });

    for (const roll of resolved.rolls) {
        const card = cards.find(c => c.id === roll.cardId);
        if (!card) continue;
        const before = cardState[roll.cardId] || { pity: 0 };
        const after = resolved.cardState[roll.cardId];
        try {
            const { rows: out } = await query(
                'SELECT public.award_card_drop($1,$2,$3,$4,$5,$6) AS result',
                [characterId, roll.cardId, before.pity, after.pity, roll.won,
                    `monster:${mapId}:${monsterUid}:${killNonce}:${characterId}:${roll.cardId}`]);
            const res = out[0]?.result;
            if (!res || !res.won) continue;
            const sock = socketForChar(characterId);
            if (sock) {
                sock.emit('card_reward', {
                    cardId: res.card_id,
                    owned: Number(res.owned) || 0,
                    stars: Number(res.stars) || 1,
                    pity: Number(res.pity) || 0,
                    source: { kind: 'monster', id: type, label: card.source.label },
                    isNew: res.is_new === true,
                });
            }
        } catch (e) {
            console.error('[MonEngine] award_card_drop failed:', e.message);
        }
    }
}

// Upsert an item into a character's inventory (mirrors the admin give-item path).
async function grantItem(characterId, itemName, itemType, qty) {
    if (!characterId || !itemName || qty <= 0) return;
    await tx(async (client) => {
        const cur = await client.query(
            'SELECT id, quantity FROM inventory WHERE character_id=$1 AND item_name=$2 LIMIT 1',
            [characterId, itemName]);
        if (!cur.rows[0]) {
            await client.query(
                'INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1,$2,$3,$4,$5)',
                [characterId, itemName, String(itemType).slice(0, 32), qty, {}]);
        } else {
            await client.query('UPDATE inventory SET quantity = quantity + $2 WHERE id = $1', [cur.rows[0].id, qty]);
        }
    });
}

// ---------------- lifecycle ----------------
export async function startMonsterEngine(deps) {
    io = deps.io;
    onlinePlayers = deps.onlinePlayers;
    await loadConfig();
    running = true;
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = setInterval(() => { try { tick(); } catch (e) { console.error('[MonEngine] tick error:', e.message); } }, TICK_MS);
    console.log(`[MonEngine] 🐲 server-authoritative monsters ON (config v${cfg.version})`);
}

// Called after an admin config edit: reload config and respawn every live map so
// the change takes effect immediately for everyone.
export async function reloadWorld() {
    if (!running) return;
    await loadConfig();
    for (const mapId of [...worlds.keys()]) spawnMap(mapId);
    console.log(`[MonEngine] ♻️ world reloaded (config v${cfg.version})`);
}

// Remove every live monster target that points at a dead/disconnected player.
// Returning monsters to their spawn also prevents them from camping the respawn
// point using the last position received before death.
export function clearAggroForCharacter(characterId) {
    if (!characterId) return 0;

    let cleared = 0;
    for (const world of worlds.values()) {
        for (const monster of world.monsters.values()) {
            if (monster.aggroChar !== characterId) continue;
            monster.aggroChar = null;
            monster.aggroUntil = 0;
            monster.atkReadyAt = 0;
            monster.targetX = monster.spawnX;
            monster.targetZ = monster.spawnZ;
            cleared += 1;
        }
    }
    return cleared;
}

export function isRunning() { return running; }
