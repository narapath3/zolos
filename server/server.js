// ============================================================
// ZOLOS Map Server — Node.js + Socket.io (Railway.app)
// Real-time WebSocket server for player synchronization
// Redeploy marker: 2026-07-24 (force Railway rebuild after card-module crash fix)
// ============================================================
import express from 'express';
import { createServer } from 'http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import { createPgClient } from './api/pgClient.js';
import { createApiRouter } from './api/index.js';
import { createAdminRouter } from './api/admin.js';
import * as ipMonitor from './api/ipMonitor.js';
import { startSnapshotScheduler } from './api/statSnapshots.js';
import { startMarketExpiryScheduler } from './api/marketExpiry.js';
import { startCheatGuard } from './api/cheatGuard.js';
import { ensureMonsterTables, seedMonstersIfEmpty, ensurePronteraMountainExpansion } from './api/monstersConfig.js';
import { ensureCardEconomy, getCardEconomy, getStardust } from './api/cardEconomy.js';
import { ensureOreEconomy } from './api/oreEconomy.js';
import { ensurePetEconomy, PET_CATALOG } from './api/petEconomy.js';
import { startMonsterEngine, reloadWorld, applyHit as monEngineApplyHit, isRunning as monEngineRunning, clearAggroForCharacter } from './game/monsterEngine.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    applyBossContribution,
    awardBossCardRewards,
    buildBossRanking,
    WORLD_BOSSES,
} from './cardRewards.js';
import {
    clearSocketMappingIfCurrent,
    isAllowedOrigin,
    normalizePresence,
    resolveTrustedMap,
    sanitizeSaveUpdates,
    serializeOnlinePlayer,
    sanitizeInventoryBackup,
    validateMovement,
    shouldRateLimitEvent,
    clampMonsterDamage,
} from './securityPolicy.js';
import { getCard } from './cards/CardCatalog.js';
import { FUSION_COSTS } from './cards/CardProgression.js';
import { buildHealthPayload } from './health.js';

// ============ Configuration ============
const PORT = parseInt(process.env.PORT) || 3001;
const HOST = '0.0.0.0';
// Exact-origin allowlist. Accept BOTH env names — the deploy guide documents
// CORS_ORIGIN (singular) while the code historically read CORS_ORIGINS, and
// that mismatch meant a configured value was silently ignored.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',').map(s => s.trim()).filter(Boolean);

// Add wildcard support for easier debugging
if (process.env.CORS_ALLOW_ALL === 'true') {
    console.log('[Server] ⚠️ CORS_ALLOW_ALL is enabled');
}
const SAVE_INTERVAL_MS = 30 * 1000; // 30s — local Postgres is cheap; shrinks the server-crash data-loss window

// Data backend. USE_LOCAL_DB=true → self-hosted local Postgres (via a
// supabase-js-compatible adapter); otherwise Supabase service-role.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USE_LOCAL_DB = process.env.USE_LOCAL_DB === 'true';
// Server-authoritative monster engine (Phase 2). Off by default → legacy
// client-side spawner runs. Requires local DB (the config + inventory writes).
const WORLD_MONSTERS = USE_LOCAL_DB && process.env.WORLD_MONSTERS === 'true';
let supabase = null;
if (USE_LOCAL_DB) {
    supabase = createPgClient();
    console.log('[Server] 🏠 Using local Postgres (self-host)');
} else if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('[Server] ✅ Supabase connected (service role)');
} else {
    console.warn('[Server] ⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — save-to-DB disabled');
}

// ============ Express + Socket.io Setup ============
const app = express();
// Behind Caddy (reverse proxy on 127.0.0.1). Trust the loopback hop so
// req.ip resolves to each client's REAL IP from X-Forwarded-For. Without this,
// every request looks like it comes from 127.0.0.1, so express-rate-limit
// buckets ALL players together (429s that block character loads) and warns
// with ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. 'loopback' trusts only 127.0.0.1/::1
// — a client can't spoof XFF because Caddy overwrites it.
app.set('trust proxy', 'loopback');
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // No Origin header: non-browser clients (health checks, native apps).
            // Browsers always send one, so this can't be used to bypass the list.
            if (!origin) return callback(null, true);
            if (process.env.CORS_ALLOW_ALL === 'true') return callback(null, true);
            if (isAllowedOrigin(origin, CORS_ORIGINS)) return callback(null, true);
            console.warn(`[Server] 🚫 CORS rejected origin: ${origin}`);
            callback(new Error('Origin not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Tolerant heartbeat: a 5s timeout dropped players on brief mobile/Wi-Fi
    // jitter, and each drop→reconnect turned them into "ghosts" until re-join.
    // 20s (socket.io's default) keeps flaky connections alive through hiccups.
    pingInterval: 20000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling']
});

// Mount the self-hosted API (auth + data + rpc) on the same server, so
// rt.zolos.online/api/* is served here alongside socket.io — no extra
// service, DNS record, or Caddy change needed. Only active data-wise when
// USE_LOCAL_DB=true (the API always uses local Postgres).
app.use('/api', createApiRouter());

// Health check endpoint (Railway uses this)
app.get('/', (_req, res) => {
    res.json(buildHealthPayload({
        playerCount: onlinePlayers.size,
        uptime: process.uptime(),
        revision: process.env.RAILWAY_GIT_COMMIT_SHA,
        fallbackVersion: process.env.npm_package_version,
    }));
});

// Gated admin endpoint to retrieve server chat logs
app.get('/admin/chat-log', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    if (!supabase) {
        return res.status(503).json({ error: 'Supabase not connected' });
    }
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        const { data: profile, error: dbError } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .maybeSingle();

        if (dbError || !profile || !profile.is_admin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        res.json(chatLog);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============ In-Memory State ============
// Map<socketId, PlayerInfo>
const onlinePlayers = new Map();
// Map<userId, socketId> — quick lookup for P2P messaging
const userSocketMap = new Map();
// Map<userId, SaveData> — pending save data
const pendingSaves = new Map();
// Map<userId, DuelInfo> — both participants map to the same duel object
const activeDuels = new Map();
// Map<`${challengerId}->${targetId}`, timestamp> — duel challenges awaiting a
// reply. A duel may only be registered if the server saw the challenge itself,
// so a client can't fabricate a duel between two arbitrary players.
const pendingDuelChallenges = new Map();
const DUEL_CHALLENGE_TTL_MS = 60 * 1000;
const pendingFriendRequests = new Map();
const FRIEND_REQUEST_TTL_MS = 2 * 60 * 1000;

// ============ Admin Dashboard ============
// Static SPA at /admin and its JSON API at /admin/api. The API is is_admin-gated
// (JWT → profiles.is_admin) and can read/edit any player, view the economy, and
// watch suspicious IPs. Mounted here because it needs the live in-memory maps.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/admin/api', createAdminRouter({ io, onlinePlayers, userSocketMap, reloadWorld }));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
const chatLog = [];

// Identity helper: every relayed payload is re-stamped with the socket's
// server-trusted userId. Never echo a client-supplied identity field — the JWT
// check at `join` is worthless if any later event can just claim another id.
function trustedSender(socket) {
    return onlinePlayers.get(socket.id) || null;
}

function fusionErrorMessage(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('not enough duplicate')) return 'การ์ดซ้ำไม่เพียงพอสำหรับการหลอม';
    if (message.includes('maximum') || message.includes('cannot')) return 'การ์ดนี้ไม่สามารถหลอมได้';
    if (message.includes('concurrently')) return 'ข้อมูลการ์ดเปลี่ยนแปลงแล้ว กรุณาลองใหม่';
    if (message.includes('idempotency')) return 'รหัสคำขอหลอมการ์ดไม่ถูกต้อง';
    if (message.includes('not found')) return 'ไม่พบข้อมูลการ์ดของตัวละคร';
    return 'หลอมการ์ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}

// PlayerInfo shape:
// { userId, username, level, socketId, joinedAt, lastSaveData: null }

// ============ Chat Moderation ============
// Server-authoritative so it can't be bypassed from the browser console.
// Longer phrases first so they censor fully before their sub-words match.
const PROFANITY = [
    'motherfucker', 'ควยเย็ดแม่', 'เย็ดแม่มึง', 'ไอ้ชาติหมา', 'พ่อมึงตาย', 'แม่มึงตาย',
    'ไอ้หน้าหี', 'ไอหน้าหี', 'ไอ้เหี้ย', 'อีดอกทอง', 'เย็ดแม่', 'ไอเหี้ย',
    'ไอ้ระยำ', 'ไอ้สลิด', 'ไอ้ควาย', 'ชาติหมา', 'asshole', 'อีระยำ',
    'ไอ้สัส', 'ดอกทอง', 'อีควาย', 'กะหรี่', 'เควี่ย', 'สันดาน', 'nigger',
    'ไอสัส', 'อีดอก', 'เหี้ย', 'จัญไร', 'bitch', 'pussy', 'แตดๆ',
    'เย็ด', 'สถุน', 'ระยำ', 'fuck', 'fvck', 'shit', 'dick', 'cunt',
    'ควย', 'สัส', 'สาด', 'สัด', 'แตด', 'fuk', 'หี'
].sort((a, b) => b.length - a.length);
const PROFANITY_RE = PROFANITY.map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));

function censorProfanity(text) {
    let out = text;
    for (const re of PROFANITY_RE) out = out.replace(re, '***');
    return out;
}

// Per-socket rate limit: max messages per window + block instant duplicates.
const CHAT_MAX_PER_WINDOW = 6;
const CHAT_WINDOW_MS = 6000;
const CHAT_DUP_MS = 3000;

// ============ World Boss (server-authoritative) ============
// A giant boss spawns on a rotating set of outlying maps, never in the main
// city. Everyone shares one HP pool; each hit is relayed to the server which
// tracks per-player damage. When the boss dies the server ranks contributors
// and broadcasts the unchanged gold/EXP ranking. Card rolls and persistence
// are completed server-side before a private card_reward event is emitted.
const BOSS_INTERVAL_MS = parseInt(process.env.BOSS_INTERVAL_MS) || 12 * 60 * 1000; // spawn every 12 min
const BOSS_FIGHT_MS = parseInt(process.env.BOSS_FIGHT_MS) || 6 * 60 * 1000;        // 6 min to kill
// Keep world bosses away from Prontera, the main hub. Each selected centre is
// clear of portals and major map landmarks so the oversized boss has room.
const BOSS_SPAWN_LOCATIONS = [
    { mapId: 'payon', mapName: 'Payon Forest', x: 0, z: 0 },
    { mapId: 'glast_heim', mapName: 'Glast Heim', x: 0, z: 0 },
    { mapId: 'mjolnir', mapName: 'Mjolnir Mountains', x: 0, z: 0 },
    { mapId: 'abyss_lake', mapName: 'Abyss Lake', x: 0, z: 0 },
];
const worldBoss = {
    active: false,
    boss: null,
    rewardId: null,
    hp: 0,
    maxHp: 0,
    mapId: null,
    mapName: '',
    x: 0,
    z: 0,
    spawnAt: Date.now() + BOSS_INTERVAL_MS, // next spawn (epoch ms)
    endsAt: 0,                               // flee deadline while active
    damage: new Map(),                       // userId -> { name, dmg }
    _lastHpBcast: 0,
};

function bossPublicState() {
    return {
        active: worldBoss.active,
        id: worldBoss.boss?.id || null,
        name: worldBoss.boss?.name || '',
        hp: worldBoss.hp,
        maxHp: worldBoss.maxHp,
        mapId: worldBoss.mapId,
        mapName: worldBoss.mapName,
        x: worldBoss.x,
        z: worldBoss.z,
    };
}

function spawnWorldBoss() {
    const online = onlinePlayers.size;
    const location = BOSS_SPAWN_LOCATIONS[Math.floor(Math.random() * BOSS_SPAWN_LOCATIONS.length)];
    // HP scales with population so it's always a few minutes of teamwork.
    const maxHp = Math.min(45000, 7000 + online * 3500);
    worldBoss.active = true;
    worldBoss.boss = WORLD_BOSSES[Math.floor(Math.random() * WORLD_BOSSES.length)];
    worldBoss.rewardId = randomUUID();
    worldBoss.maxHp = maxHp;
    worldBoss.hp = maxHp;
    worldBoss.mapId = location.mapId;
    worldBoss.mapName = location.mapName;
    worldBoss.x = location.x;
    worldBoss.z = location.z;
    worldBoss.endsAt = Date.now() + BOSS_FIGHT_MS;
    worldBoss.damage = new Map();
    worldBoss._lastHpBcast = 0;
    io.emit('boss_spawn', {
        id: worldBoss.boss.id,
        name: worldBoss.boss.name,
        hp: worldBoss.hp,
        maxHp: worldBoss.maxHp,
        mapId: worldBoss.mapId,
        mapName: worldBoss.mapName,
        x: worldBoss.x,
        z: worldBoss.z,
    });
    console.log(`[Server] 👹 World Boss spawned: ${worldBoss.boss.name} at ${worldBoss.mapName} (${maxHp} HP, ${online} online)`);
}

async function endWorldBoss(killerName) {
    const ranking = buildBossRanking(worldBoss.damage);
    const boss = worldBoss.boss;
    const rewardId = worldBoss.rewardId;
    const maxHp = worldBoss.maxHp;
    const name = boss.name;
    worldBoss.active = false;
    worldBoss.hp = 0;
    worldBoss.spawnAt = Date.now() + BOSS_INTERVAL_MS;
    worldBoss.damage = new Map();

    await awardBossCardRewards({
        supabase,
        io,
        userSocketMap,
        onlinePlayers,
        boss,
        maxHp,
        ranking,
        rewardId,
    });

    const publicRanking = ranking.map(({ characterId: _characterId, ...row }) => row);
    io.emit('boss_dead', {
        id: boss.id,
        name,
        mapId: worldBoss.mapId,
        mapName: worldBoss.mapName,
        killerName: killerName || (ranking[0] && ranking[0].name) || 'นักผจญภัย',
        ranking: publicRanking,
    });
    console.log(`[Server] 💀 World Boss defeated: ${name} — ${ranking.length} contributors (killer: ${killerName})`);
}

function fleeWorldBoss() {
    const boss = worldBoss.boss;
    const name = boss?.name || '';
    worldBoss.active = false;
    worldBoss.hp = 0;
    worldBoss.spawnAt = Date.now() + BOSS_INTERVAL_MS;
    worldBoss.damage = new Map();
    io.emit('boss_flee', { id: boss?.id || null, name, mapId: worldBoss.mapId, mapName: worldBoss.mapName });
    console.log(`[Server] 🌫️ World Boss fled (survived): ${name}`);
}

// Scheduler: drives spawn / flee transitions.
setInterval(() => {
    const now = Date.now();
    if (!worldBoss.active) {
        if (now >= worldBoss.spawnAt) spawnWorldBoss();
    } else if (now >= worldBoss.endsAt) {
        fleeWorldBoss();
    }
}, 1000);

// Periodic resync so boss state stays aligned for everyone after reconnects.
setInterval(() => {
    io.emit('boss_state', bossPublicState());
}, 30000);

// Periodic online-count refresh — safety net so the auth screen and HUD stay
// accurate even if a join/leave broadcast was missed.
setInterval(() => {
    io.emit('online_count', onlinePlayers.size);
}, 15000);

// ============ Socket.io Event Handlers ============
io.on('connection', (socket) => {
    console.log(`[Server] 🔌 Socket connected: ${socket.id}`);

    // Real client IP (Caddy forwards it in X-Forwarded-For). Kept for the admin
    // security panel + stamped onto the player record once they join.
    const clientIp = ipMonitor.normalizeIp(
        socket.handshake.headers['x-forwarded-for'] || socket.handshake.address);
    socket._clientIp = clientIp;
    ipMonitor.recordConnect(clientIp);

    // Send the current online count immediately. Sockets that only connect to
    // watch the count (e.g. the auth/login screen, before they `join`) otherwise
    // never receive a value until the next join/leave, so they'd show 0.
    socket.emit('online_count', onlinePlayers.size);

    // --- JOIN ---
    socket.on('join', async (data) => {
        if (!data || !data.userId) return;

        let { userId } = data;
        const normalizedPresence = normalizePresence(data);
        let { username, level } = normalizedPresence;

        // AUTHENTICATE: verify the Supabase JWT so the client can't impersonate
        // another account by simply claiming its userId. On success, the
        // server-verified id is authoritative. A real-looking userId claimed
        // WITHOUT a valid token is rejected (downgraded to a throwaway id) so it
        // can never gain that account's admin rights or overwrite its saves.
        let verified = false;
        if (data.accessToken && supabase) {
            try {
                const { data: u, error } = await supabase.auth.getUser(data.accessToken);
                if (!error && u && u.user) { userId = u.user.id; verified = true; }
            } catch (e) { /* invalid token */ }
        }
        const isGuestId = String(userId).startsWith('guest_') || String(userId).startsWith('local_');
        if (!verified && !isGuestId) {
            console.warn(`[Server] 🚫 Unverified claim of real account ${userId} — downgrading`);
            userId = 'unverified_' + socket.id;
        }

        let profile = null;
        let verifiedCharacter = null;
        if (verified && supabase) {
            const { data: verifiedProfile } = await supabase
                .from('profiles')
                .select('username, is_admin')
                .eq('id', userId)
                .maybeSingle();
            profile = verifiedProfile;
            if (profile?.username) {
                username = profile.username;
            }
            if (data.characterId) {
                const { data: ownedCharacter } = await supabase
                    .from('characters')
                    .select('id, level, name')
                    .eq('id', data.characterId)
                    .eq('user_id', userId)
                    .maybeSingle();
                verifiedCharacter = ownedCharacter;
            }
        }

        // Remove any existing connection for same userId (reconnect scenario)
        const existingSocketId = userSocketMap.get(userId);
        if (existingSocketId && existingSocketId !== socket.id) {
            const existingSock = io.sockets.sockets.get(existingSocketId);
            if (existingSock) {
                existingSock.disconnect(true);
            }
            const oldPlayer = onlinePlayers.get(existingSocketId);
            if (oldPlayer) {
                onlinePlayers.delete(existingSocketId);
                broadcastPlayerList(oldPlayer.mapId);
            }
        }

        const playerInfo = {
            userId,
            username: verifiedCharacter?.name || username || 'Adventurer',
            level: verifiedCharacter?.level || level || 1,
            socketId: socket.id,
            mapId: normalizedPresence.mapId,
            joinedAt: Date.now(),
            lastSaveData: null,
            verified,
            characterId: verifiedCharacter?.id || null,
            isAdmin: profile?.is_admin === true,
            ping: null, // round-trip latency in ms, measured via srv_ping/srv_pong
            device: data.device || 'desktop',
            lastPos: { x: 0, y: 1.2, z: 10, mapId: normalizedPresence.mapId },
            lastPosTime: Date.now(),
            ip: socket._clientIp || 'unknown',
        };
        if (socket._clientIp) ipMonitor.recordConnect(socket._clientIp, playerInfo.username);

        // Join map-specific room
        socket.join(`map:${playerInfo.mapId}`);

        onlinePlayers.set(socket.id, playerInfo);
        userSocketMap.set(userId, socket.id);

        console.log(`[Server] ➕ Player joined: ${username} (${userId})${verified ? ' ✓' : ''} — Total: ${onlinePlayers.size}`);

        // Broadcast updated player list to everyone in this map
        broadcastPlayerList(playerInfo.mapId);

        // Send the current world-boss state so the newcomer sees the countdown
        // (or an in-progress fight) immediately.
        socket.emit('boss_state', bossPublicState());

        // Tell the client which monster model is authoritative: server-owned
        // (Phase 2) or the legacy client-side spawner. Clients switch rendering
        // accordingly, so flipping the flag needs no client redeploy.
        socket.emit('world_mode', { serverMonsters: WORLD_MONSTERS });
    });

    // --- POSITION BROADCAST ---
    socket.on('pos', (payload) => {
        if (!payload) return;
        const self = trustedSender(socket);
        if (!self) return; // must be a joined player

        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'pos', 25, 1000)) return;

        const mapId = resolveTrustedMap(self);
        // Remember the sender's latest position so friends can warp to them —
        // even across maps (positions are only relayed within a map room).
        if (Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
            const now = Date.now();
            const elapsed = now - (self.lastPosTime || now);
            const isValid = validateMovement(self.lastPos, { x: payload.x, y: payload.y, z: payload.z, mapId }, elapsed);
            if (isValid) {
                self.lastPos = { x: payload.x, y: payload.y, z: payload.z, mapId };
                self.lastPosTime = now;
            } else {
                if (socket._clientIp) ipMonitor.recordSuspicious(socket._clientIp, `speed-hack ${self.username}`);
                return;
            }
        } else return;
        // Broadcast to all OTHER clients in the SAME map, stamped with the
        // server's identity for this socket so a client can't puppet another
        // player's avatar by claiming their userId.
        socket.to(`map:${mapId}`).emit('pos', { ...payload, userId: self.userId, mapId });
    });

    // --- SHARED MONSTER HP --- relay a monster hit to everyone else on the map
    // so their copy of that (deterministically-spawned) monster drains the same
    // HP. Pure relay: the server keeps no monster state; sender is excluded.
    // Legacy path — only used when the authoritative engine is OFF.
    socket.on('monster_hit', (payload) => {
        if (!payload || typeof payload.monsterId !== 'string') return;
        const self = trustedSender(socket);
        if (!self) return;

        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'monster_hit', 12, 1000)) return;

        const mapId = resolveTrustedMap(self);
        const rawDamage = Number(payload.damage) || 0;
        const damage = clampMonsterDamage(self.level, rawDamage);
        if (damage <= 0) return;
        socket.to(`map:${mapId}`).emit('monster_hit', { monsterId: payload.monsterId, damage });
    });

    // --- AUTHORITATIVE MONSTER HIT (Phase 2) --- the client reports a hit; the
    // server subtracts the clamped damage from the shared server-owned monster
    // and, on death, grants exp/gold/drops itself. No client trust for rewards.
    socket.on('mon_hit', (payload) => {
        if (!monEngineRunning()) return;
        const self = trustedSender(socket);
        if (!self) return;
        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'mon_hit', 14, 1000)) return;
        try { monEngineApplyHit(self, payload); } catch (e) { console.error('[MonEngine] applyHit:', e.message); }
    });

    // --- SKILL EFFECTS --- relay a skill cast to the map so everyone renders the
    // effect at the caster's avatar. Server stamps the sender's userId so the
    // receiver anchors the effect on the right hero.
    socket.on('skill_cast', (payload) => {
        if (!payload || typeof payload.skillId !== 'string') return;
        const self = trustedSender(socket);
        if (!self) return;
        const mapId = resolveTrustedMap(self);
        const out = { skillId: payload.skillId, userId: self.userId };
        if (Number.isFinite(payload.tx) && Number.isFinite(payload.tz)) { out.tx = payload.tx; out.tz = payload.tz; }
        socket.to(`map:${mapId}`).emit('skill_cast', out);
    });

    // --- ATTACK HIT EFFECTS --- relay a player's melee/ranged hit so everyone
    // on the map sees the slash arc, hit sparks, and damage number at the target.
    socket.on('attack_hit', (payload) => {
        if (!payload) return;
        const self = trustedSender(socket);
        if (!self) return;

        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'attack_hit', 12, 1000)) return;

        const mapId = resolveTrustedMap(self);
        const rawDmg = typeof payload.dmg === 'number' ? payload.dmg : 0;
        const clampedDmg = clampMonsterDamage(self.level, rawDmg);
        const out = {
            userId: self.userId,
            tc: typeof payload.tc === 'number' ? payload.tc : undefined, // critical flag
            dmg: clampedDmg,
            wsc: typeof payload.wsc === 'string' ? payload.wsc : 'melee',
        };
        if (Number.isFinite(payload.tx) && Number.isFinite(payload.tz)) {
            out.tx = payload.tx;
            out.tz = payload.tz;
        }
        socket.to(`map:${mapId}`).emit('attack_hit', out);
    });

    // --- LATENCY PONG --- reply to our periodic srv_ping; RTT = now - echoed ts
    socket.on('srv_pong', (t) => {
        const info = onlinePlayers.get(socket.id);
        if (!info) return;
        const rtt = Date.now() - (typeof t === 'number' ? t : Date.now());
        if (Number.isFinite(rtt) && rtt >= 0 && rtt < 60000) {
            info.ping = Math.round(info.ping == null ? rtt : info.ping * 0.5 + rtt * 0.5);
        }
    });

    // --- CLIENT-SIDE PING --- echo timestamp so client can measure its own RTT
    socket.on('client_ping', (t) => {
        socket.emit('client_pong', t);
    });

    // --- CHAT ---
    socket.on('chat', (payload) => {
        if (!payload || typeof payload.message !== 'string') return;
        const player = onlinePlayers.get(socket.id);
        if (!player) return; // must be a joined player

        const mapId = resolveTrustedMap(player);

        let msg = payload.message.trim();
        if (!msg) return;
        if (msg.length > 200) msg = msg.slice(0, 200);

        // Rate limit EVERY message from this socket (covers spoofed 'system'
        // messages too, so the system channel can't dodge the filter/limit).
        const now = Date.now();
        if (!socket._chatTimes) socket._chatTimes = [];
        socket._chatTimes = socket._chatTimes.filter(t => now - t < CHAT_WINDOW_MS);
        if (socket._chatTimes.length >= CHAT_MAX_PER_WINDOW) {
            socket.emit('chat_blocked', { reason: 'rate' });
            return;
        }
        if (socket._lastChat && socket._lastChat.msg === msg && now - socket._lastChat.at < CHAT_DUP_MS) {
            socket.emit('chat_blocked', { reason: 'dup' });
            return;
        }
        socket._chatTimes.push(now);
        socket._lastChat = { msg, at: now };

        msg = censorProfanity(msg);

        // Never trust client identity. Player messages use the server's known
        // username; the system/market channel is forced to a FIXED label so a
        // client can't pick a custom name to impersonate an admin or player.
        const out = {
            userId: player.userId,
            username: player.username,
            level: player.level,
            message: msg,
            mapId,
        };
        // Record in chat log
        chatLog.push({
            userId: player.userId,
            username: player.username,
            message: msg,
            mapId,
            timestamp: Date.now()
        });
        if (chatLog.length > 2000) {
            chatLog.shift();
        }

        io.to(`map:${mapId}`).emit('chat', out);
    });

    // --- PRESENCE UPDATE ---
    socket.on('update_presence', (data) => {
        if (!data) return;
        const player = onlinePlayers.get(socket.id);
        if (player) {
            const oldMapId = player.mapId;
            const normalized = normalizePresence({
                // Verified identity/progression comes from the database. The
                // client may only move maps; trusting repeated +2 updates lets
                // an attacker walk server level to 300 and inflate PvE damage.
                username: player.verified ? player.username : (data.username ?? player.username),
                level: player.verified ? player.level : (data.level ?? player.level),
                mapId: data.mapId ?? player.mapId,
            }, player.level);
            player.level = normalized.level;
            player.username = normalized.username;

            if (normalized.mapId !== oldMapId) {
                socket.leave(`map:${oldMapId}`);
                player.mapId = normalized.mapId;
                player.lastPos = { x: 0, y: 1.2, z: 10, mapId: player.mapId, teleported: true };
                player.lastPosTime = Date.now();
                socket.join(`map:${player.mapId}`);
                broadcastPlayerList(oldMapId);
                broadcastPlayerList(player.mapId);
            } else {
                broadcastPlayerList(player.mapId);
            }
        }
    });

    // --- SAVE STATE (client sends periodic snapshots) ---
    socket.on('save_state', (data) => {
        if (!data || !data.characterId) return;
        const player = onlinePlayers.get(socket.id);
        if (player) {
            if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
            if (shouldRateLimitEvent(socket._rateLimitTracker, 'save_state', 3, 10000)) return;

            // SECURITY: stamp the save with the socket's server-trusted userId so
            // the DB write can be gated on ownership. A client cannot save to a
            // character it doesn't own by lying about characterId.
            const trusted = { ...data, _ownerUserId: player.userId, _clientIp: socket._clientIp };
            player.lastSaveData = trusted;
            pendingSaves.set(player.userId, trusted);
        }
    });

    socket.on('ore_convert', async (payload) => {
        const player = trustedSender(socket);
        const requestId = payload?.requestId;
        const reject = (message) => socket.emit('ore_conversion_error', { requestId, message });
        if (!player?.verified || !player.characterId || !supabase) return reject('ไม่สามารถยืนยันตัวละครได้ กรุณาเข้าเกมใหม่');
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(requestId)) return reject('รหัสคำขอไม่ถูกต้อง');
        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'ore_convert', 3, 10000)) return reject('กดเร็วเกินไป กรุณารอสักครู่');
        try {
            const { data, error } = await supabase.rpc('convert_celestial_ore_to_zol', {
                p_character_id: player.characterId,
                p_idempotency_key: requestId,
            });
            if (error) throw error;
            socket.emit('ore_conversion_result', { ...data, requestId });
        } catch (error) {
            const message = String(error?.message || '');
            if (message.toLowerCase().includes('no celestial ore')) return reject('ไม่มี Celestial Ore สำหรับแปลง');
            console.error('[Server] Ore conversion failed:', message);
            reject('แปลงแร่ไม่สำเร็จ แร่ยังอยู่ครบ กรุณาลองใหม่');
        }
    });

    socket.on('pet_purchase', async (payload) => {
        const player = trustedSender(socket);
        const itemName = typeof payload?.itemName === 'string' ? payload.itemName : '';
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
        const reject = (message) => socket.emit('pet_purchase_error', { requestId, itemName, message });
        if (!player?.verified || !player.characterId || !supabase) {
            return reject('ไม่สามารถยืนยันตัวละครได้ กรุณาเข้าเกมใหม่');
        }
        if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(requestId)) return reject('รหัสคำสั่งซื้อไม่ถูกต้อง');
        const catalogPet = PET_CATALOG[itemName];
        if (!catalogPet) return reject('ไม่พบสัตว์เลี้ยงนี้ในร้าน');
        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'pet_purchase', 4, 10000)) {
            return reject('กดซื้อเร็วเกินไป กรุณารอสักครู่');
        }
        try {
            const { data, error } = await supabase.rpc('purchase_pet', {
                p_character_id: player.characterId,
                p_item_name: itemName,
                p_price: catalogPet.price,
                p_pet_key: catalogPet.pet,
                p_idempotency_key: requestId,
            });
            if (error || !data) throw error || new Error('empty purchase result');
            socket.emit('pet_purchase_result', { ...data, requestId });
        } catch (error) {
            const message = String(error?.message || '').toLowerCase();
            if (message.includes('insufficient gold')) return reject('Zeny ไม่พอสำหรับสัตว์เลี้ยงตัวนี้');
            if (message.includes('pet storage full')) return reject('ช่องเก็บสัตว์เลี้ยงชนิดนี้เต็มแล้ว');
            console.error('[Server] Pet purchase failed:', error?.message || error);
            reject('ซื้อสัตว์เลี้ยงไม่สำเร็จ เงินยังไม่ถูกหัก กรุณาลองใหม่');
        }
    });

    // Fusion is a server-authoritative transaction. The browser supplies only
    // a canonical card id and an idempotency key; owner, character, stars and
    // duplicate cost are all resolved from server-trusted state.
    socket.on('card_fuse', async (payload) => {
        const { cardId, requestId } = payload || {};
        const player = trustedSender(socket);
        const reject = (message) => socket.emit('card_fusion_error', {
            cardId: typeof cardId === 'string' ? cardId : null,
            requestId: typeof requestId === 'string' ? requestId : null,
            message,
        });

        if (!player?.verified || !player.characterId || !supabase) {
            reject('ไม่สามารถยืนยันตัวละครเพื่อหลอมการ์ดได้');
            return;
        }
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(requestId)) {
            reject('รหัสคำขอหลอมการ์ดไม่ถูกต้อง');
            return;
        }

        const card = typeof cardId === 'string' ? getCard(cardId) : null;
        if (!card || card.id !== cardId) {
            reject('ไม่พบการ์ดที่ต้องการหลอม');
            return;
        }

        try {
            const { data: row, error: rowError } = await supabase
                .from('character_cards')
                .select('owned, stars, pity')
                .eq('character_id', player.characterId)
                .eq('card_id', card.id)
                .maybeSingle();
            if (rowError || !row) throw new Error('ไม่พบข้อมูลการ์ดของตัวละคร');

            const stars = Number(row.stars);
            const cost = FUSION_COSTS[stars];
            if (!Number.isInteger(stars) || stars < 1 || stars >= FUSION_COSTS.length || !Number.isInteger(cost) || cost <= 0) {
                throw new Error('การ์ดนี้ไม่สามารถหลอมได้');
            }

            // Dust mode: the player is short on natural duplicates and pays the
            // shortfall with Stardust. The RPC recomputes how many dupes vs dust
            // are actually used — the client can't under-pay.
            const useDust = payload?.useDust === true;
            let result, error;
            if (useDust) {
                const econ = await getCardEconomy();
                const dustEach = econ[card.rarity]?.dust_per_dupe || 0;
                ({ data: result, error } = await supabase.rpc('fuse_card_dust', {
                    p_character_id: player.characterId,
                    p_card_id: card.id,
                    p_expected_stars: stars,
                    p_dupe_cost: cost,
                    p_dust_each: dustEach,
                    p_idempotency_key: requestId,
                }));
            } else {
                ({ data: result, error } = await supabase.rpc('fuse_card', {
                    p_character_id: player.characterId,
                    p_card_id: card.id,
                    p_expected_stars: stars,
                    p_cost: cost,
                    p_idempotency_key: requestId,
                }));
            }
            if (error || !result || result.card_id !== card.id) {
                throw error || new Error('ผลการหลอมการ์ดไม่ถูกต้อง');
            }

            const committed = {
                cardId: result.card_id,
                owned: Number(result.owned),
                stars: Number(result.stars),
                pity: Number(result.pity) || 0,
                requestId,
            };
            if (result.stardust !== undefined) committed.stardust = Number(result.stardust) || 0;
            if (!Number.isInteger(committed.owned) || !Number.isInteger(committed.stars) || committed.owned < 0 || committed.stars < 1 || committed.stars > 5) {
                throw new Error('ผลการหลอมการ์ดไม่ถูกต้อง');
            }

            // RPC commits before this emit. A replay emits the same receipt.
            socket.emit('card_fusion_result', committed);
        } catch (error) {
            console.error('[Server] card fusion failed:', error.message);
            reject(fusionErrorMessage(error));
        }
    });

    // Refine excess duplicate cards into Stardust (the dupe sink). Server owns
    // the rate (economy[rarity].refine_dust) and enforces keeping ≥1 copy.
    socket.on('card_refine', async (payload) => {
        const { cardId, count, requestId } = payload || {};
        const reject = (message) => socket.emit('card_refine_error', {
            cardId: typeof cardId === 'string' ? cardId : null,
            requestId: typeof requestId === 'string' ? requestId : null,
            message,
        });
        const player = trustedSender(socket);
        if (!player?.verified || !player.characterId || !supabase) {
            reject('ไม่สามารถยืนยันตัวละครเพื่อถลุงการ์ดได้');
            return;
        }
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(requestId)) {
            reject('รหัสคำขอไม่ถูกต้อง');
            return;
        }
        const n = Number(count);
        if (!Number.isInteger(n) || n < 1 || n > 9999) {
            reject('จำนวนการ์ดที่ถลุงไม่ถูกต้อง');
            return;
        }
        const card = typeof cardId === 'string' ? getCard(cardId) : null;
        if (!card || card.id !== cardId) {
            reject('ไม่พบการ์ดที่ต้องการถลุง');
            return;
        }
        try {
            const econ = await getCardEconomy();
            const dustEach = econ[card.rarity]?.refine_dust || 0;
            const { data: result, error } = await supabase.rpc('refine_cards', {
                p_character_id: player.characterId,
                p_card_id: card.id,
                p_count: n,
                p_dust_each: dustEach,
                p_idempotency_key: requestId,
            });
            if (error || !result || result.card_id !== card.id) {
                throw error || new Error('ผลการถลุงการ์ดไม่ถูกต้อง');
            }
            socket.emit('card_refine_result', {
                cardId: result.card_id,
                owned: Number(result.owned) || 0,
                stardust: Number(result.stardust) || 0,
                requestId,
            });
        } catch (error) {
            console.error('[Server] card refine failed:', error.message);
            reject(fusionErrorMessage(error));
        }
    });

    // Client asks for its Stardust balance + the current economy rates (on load
    // and after any card change). Read-only, server-trusted character id.
    socket.on('card_econ', async () => {
        const player = trustedSender(socket);
        if (!player?.verified || !player.characterId || !supabase) return;
        try {
            const [stardust, economy] = await Promise.all([getStardust(player.characterId), getCardEconomy()]);
            socket.emit('card_econ', { stardust, economy });
        } catch (e) {
            console.error('[Server] card_econ failed:', e.message);
        }
    });

    // --- P2P TRADE / FRIEND ---
    // These are pure relays, so the only thing the receiver can trust is what
    // the server stamps on. Note the field naming is asymmetric, and matches
    // what the client filters on (GameSync.js):
    //   requests  — receiver checks `targetUserId === me`; sender is `senderUserId`
    //   responses — receiver checks `senderUserId === me` (the original asker),
    //               so there `senderUserId` is the DESTINATION and the replier
    //               is carried in `targetUserId`.
    // Each direction therefore stamps a different field, but the rule is the
    // same: the id identifying THIS socket is always overwritten server-side.

    // Emitter is the initiator → deliver to payload.targetUserId.
    function relayRequest(eventName, payload, sender) {
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        if (!targetSocketId) return;
        io.to(targetSocketId).emit(eventName, {
            ...payload,
            senderUserId: sender.userId,
            senderName: sender.username,
        });
    }

    // Emitter is the replier → deliver back to payload.senderUserId (the asker).
    function relayResponse(eventName, payload, sender) {
        const targetSocketId = userSocketMap.get(payload.senderUserId);
        if (!targetSocketId) return;
        io.to(targetSocketId).emit(eventName, {
            ...payload,
            targetUserId: sender.userId,
            targetName: sender.username,
        });
    }

    const isBoundedString = (value, max = 160) => typeof value === 'string'
        && value.length > 0 && value.length <= max;
    const isTradeId = value => isBoundedString(value, 220) && /^trade:[A-Za-z0-9:_-]+$/.test(value);
    const hasSafeTradeStats = stats => {
        if (!stats) return true;
        if (typeof stats !== 'object' || Array.isArray(stats)) return false;
        try { return JSON.stringify(stats).length <= 8192; } catch { return false; }
    };
    const isSafeTradeRequest = payload => payload && typeof payload === 'object'
        && isBoundedString(payload.targetUserId, 160)
        && (!payload.targetCharacterId || isBoundedString(payload.targetCharacterId, 160))
        && isBoundedString(payload.itemName, 120)
        && isBoundedString(payload.itemType, 40)
        && Number.isInteger(payload.quantity) && payload.quantity >= 1 && payload.quantity <= 9999
        && Number.isSafeInteger(payload.price) && payload.price >= 0 && payload.price <= 2_147_483_647
        && isTradeId(payload.requestId)
        && hasSafeTradeStats(payload.stats);
    const isTradeEnvelope = payload => payload && typeof payload === 'object'
        && isBoundedString(payload.senderUserId, 160)
        && payload.requestPayload && isTradeId(payload.requestPayload.requestId);

    socket.on('trade_request', (payload) => {
        const sender = trustedSender(socket);
        if (!sender?.verified || !sender.characterId || !isSafeTradeRequest(payload)) return;
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'trade_request', 5, 10000)) return;
        relayRequest('trade_request', { ...payload, senderCharacterId: sender.characterId }, sender);
    });

    socket.on('trade_response', (payload) => {
        const sender = trustedSender(socket);
        if (!sender?.verified || !isTradeEnvelope(payload) || typeof payload.accepted !== 'boolean') return;
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'trade_response', 8, 10000)) return;
        relayResponse('trade_response', payload, sender);
    });

    // Cancel travels the same direction as the request (asker → target).
    socket.on('trade_cancel', (payload) => {
        const sender = trustedSender(socket);
        if (!sender?.verified || !isBoundedString(payload?.targetUserId, 160)
            || !isTradeId(payload?.requestPayload?.requestId)) return;
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'trade_cancel', 8, 10000)) return;
        relayRequest('trade_cancel', payload, sender);
    });

    socket.on('friend_request', (payload) => {
        const sender = trustedSender(socket);
        if (!sender?.verified || !isBoundedString(payload?.targetUserId, 160)
            || !isBoundedString(payload?.requestId, 220) || payload.targetUserId === sender.userId) return;
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'friend_request', 5, 30000)) return;
        pendingFriendRequests.set(`${sender.userId}->${payload.targetUserId}`, {
            requestId: payload.requestId,
            issuedAt: Date.now(),
        });
        relayRequest('friend_request', { ...payload, senderLevel: sender.level }, sender);
    });

    socket.on('friend_response', (payload) => {
        const sender = trustedSender(socket);
        if (!sender?.verified || !isBoundedString(payload?.senderUserId, 160)
            || typeof payload.accepted !== 'boolean' || !isBoundedString(payload?.requestPayload?.requestId, 220)) return;
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'friend_response', 8, 30000)) return;
        const key = `${payload.senderUserId}->${sender.userId}`;
        const pending = pendingFriendRequests.get(key);
        pendingFriendRequests.delete(key);
        if (!pending || pending.requestId !== payload.requestPayload.requestId
            || Date.now() - pending.issuedAt > FRIEND_REQUEST_TTL_MS) return;
        relayResponse('friend_response', payload, sender);
    });

    // --- WARP TO FRIEND ---
    // Requester wants to teleport to an online player. We answer directly from
    // the target's last-known position (tracked from their `pos` broadcasts),
    // including which map they're on, so cross-map warps work too.
    socket.on('warp_request', (payload) => {
        console.log(`[Server] 🌀 [Warp DEBUG] warp_request received from ${socket.id}:`, payload);
        if (!isBoundedString(payload?.targetUserId, 160)
            || !isBoundedString(payload?.requestId, 220)) {
            console.log(`[Server] 🌀 [Warp DEBUG] warp_request: missing payload or targetUserId`);
            return;
        }
        const requester = onlinePlayers.get(socket.id);
        if (!requester?.verified) {
            console.log(`[Server] 🌀 [Warp DEBUG] warp_request: requester not found for socket ${socket.id}`);
            return;
        }
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'warp_request', 4, 10000)) return;
        console.log(`[Server] 🌀 [Warp DEBUG] Requester: ${requester.username} (id: ${requester.userId})`);

        // Look up the target player — try userId first, then fall back to
        // scanning by username so warp works even if the UI passed a name.
        let targetSocketId = userSocketMap.get(payload.targetUserId);
        let target = targetSocketId ? onlinePlayers.get(targetSocketId) : null;
        console.log(`[Server] 🌀 [Warp DEBUG] userSocketMap lookup for '${payload.targetUserId}': found=${!!target}`);
        if (!target) {
            for (const [, p] of onlinePlayers) {
                if (p.username === payload.targetUserId || p.userId === payload.targetUserId) {
                    target = p;
                    break;
                }
            }
            console.log(`[Server] 🌀 [Warp DEBUG] Fallback scan result: found=${!!target}`);
        }
        if (!target) {
            console.warn(`[Server] 🌀 Warp failed: target ${payload.targetUserId} not found or offline.`);
            console.log(`[Server] 🌀 [Warp DEBUG] Emitting warp_result ok:false (offline)`);
            socket.emit('warp_result', { ok: false, reason: 'offline', targetUserId: payload.targetUserId, requestId: payload.requestId });
            return;
        }
        console.log(`[Server] 🌀 [Warp DEBUG] Target found: ${target.username} on map ${target.mapId || 'prontera'}`);

        const targetMapId = target.mapId || 'prontera';
        const pos = target.lastPos;
        // Use the target's stored coordinates when available; fall back to
        // safe spawn defaults so the warp never stalls with null coords.
        const hasCoords = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
            && (pos.y === undefined || Number.isFinite(pos.y));
        console.log(`[Server] 🌀 [Warp DEBUG] Target coords: hasCoords=${hasCoords}, lastPos=${JSON.stringify(pos)}`);

        socket.emit('warp_result', {
            ok: true,
            targetUserId: target.userId,
            targetName: target.username,
            mapId: targetMapId,
            x: hasCoords ? pos.x : 0,
            y: hasCoords ? pos.y : 1.2,
            z: hasCoords ? pos.z : 10,
            requestId: payload.requestId,
        });
        requester.lastPos = {
            x: hasCoords ? pos.x : 0,
            y: hasCoords ? pos.y : 1.2,
            z: hasCoords ? pos.z : 10,
            mapId: targetMapId,
            teleported: true,
        };
        requester.lastPosTime = Date.now();
        console.log(`[Server] 🌀 Warp: ${requester.username} → ${target.username} (map: ${targetMapId}, coords: ${hasCoords ? 'live' : 'default'})`);
        console.log(`[Server] 🌀 [Warp DEBUG] warp_result emitted to requester ${requester.username}`);
    });

    // ============ PVP DUEL SYSTEM ============
    // Challenge flow mirrors trade_request/response. Damage is relayed
    // victim-authoritative (each client applies hits to its own HP). The
    // LOSER's client reports duel_end; the server settles MMR via Elo (K=32)
    // exactly once per duel and broadcasts the result to both players.

    // --- Challenge another player ---
    socket.on('duel_request', (payload) => {
        const sender = trustedSender(socket);
        if (!sender || !payload || !payload.targetUserId) return;
        if (payload.targetUserId === sender.userId) return; // no self-duels
        // Record the challenge so the accept can be checked against it.
        pendingDuelChallenges.set(`${sender.userId}->${payload.targetUserId}`, Date.now());
        relayRequest('duel_request', payload, sender);
    });

    // --- Accept / decline ---
    socket.on('duel_response', (payload) => {
        const accepter = trustedSender(socket);
        if (!accepter || !payload || !payload.senderUserId) return;

        // The replier is THIS socket — never payload.targetUserId. Previously
        // both ids came from the client, so anyone could register a duel between
        // two arbitrary players and then settle its Elo with duel_end.
        const challengerId = payload.senderUserId;
        const key = `${challengerId}->${accepter.userId}`;
        const issuedAt = pendingDuelChallenges.get(key);
        if (!issuedAt || Date.now() - issuedAt > DUEL_CHALLENGE_TTL_MS) {
            pendingDuelChallenges.delete(key);
            return; // no such challenge (or it expired) — ignore
        }
        pendingDuelChallenges.delete(key);

        const challengerSocketId = userSocketMap.get(challengerId);
        if (!challengerSocketId) return;

        relayResponse('duel_response', payload, accepter);

        if (payload.accepted) {
            // Refuse if either side is already in a duel.
            if (activeDuels.has(challengerId) || activeDuels.has(accepter.userId)) return;

            const duelId = `duel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const duel = {
                duelId,
                a: challengerId,      // challenger
                b: accepter.userId,   // accepter (server-verified)
                settled: false,
                startedAt: Date.now(),
            };
            activeDuels.set(duel.a, duel);
            activeDuels.set(duel.b, duel);

            // Arena spawn points (matches the arena built client-side at -14,14)
            const startPayload = {
                duelId,
                players: [
                    { userId: duel.a, spawn: { x: -17, z: 14 } },
                    { userId: duel.b, spawn: { x: -11, z: 14 } },
                ],
            };
            io.to(challengerSocketId).emit('duel_start', startPayload);
            io.to(socket.id).emit('duel_start', startPayload);
            console.log(`[Server] ⚔️ Duel started: ${duel.a} vs ${duel.b}`);
        }
    });

    // --- Relay a hit to the victim ---
    socket.on('duel_hit', (payload) => {
        const attacker = trustedSender(socket);
        if (!attacker || !payload || !payload.targetUserId) return;

        if (!socket._rateLimitTracker) socket._rateLimitTracker = {};
        if (shouldRateLimitEvent(socket._rateLimitTracker, 'duel_hit', 12, 1000)) return;

        // Only hit the opponent of a duel this socket is actually in, so a
        // client can't spray duel_hit at players it isn't fighting.
        const duel = activeDuels.get(attacker.userId);
        if (!duel || duel.settled) return;
        const opponentId = duel.a === attacker.userId ? duel.b : duel.a;
        if (payload.targetUserId !== opponentId) return;

        const targetSocketId = userSocketMap.get(opponentId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('duel_hit', {
                ...payload,
                attackerUserId: attacker.userId,
                damage: Math.max(0, Math.min(5000, Number(payload.damage) || 0)),
            });
        }
    });

    // --- Loser reports defeat; server settles MMR once ---
    socket.on('duel_end', async (payload) => {
        const reporter = trustedSender(socket);
        if (!reporter || !payload || !payload.winnerUserId || !payload.loserUserId) return;
        const duel = activeDuels.get(payload.loserUserId);
        if (!duel || duel.settled) return;
        // Validate the pair matches the registered duel
        const pair = [duel.a, duel.b];
        if (!pair.includes(payload.winnerUserId) || !pair.includes(payload.loserUserId)) return;
        if (payload.winnerUserId === payload.loserUserId) return;
        // ...and that the reporter is one of the two participants, so a
        // bystander can't settle other people's duels.
        if (reporter.userId !== payload.loserUserId) return;
        duel.settled = true;
        activeDuels.delete(duel.a);
        activeDuels.delete(duel.b);

        const result = await settleDuelMMR(payload.winnerUserId, payload.loserUserId);
        const resultPayload = {
            duelId: duel.duelId,
            winnerUserId: payload.winnerUserId,
            loserUserId: payload.loserUserId,
            ...result, // { winnerMmr, loserMmr, delta } or {} if DB unavailable
        };
        for (const uid of pair) {
            const sid = userSocketMap.get(uid);
            if (sid) io.to(sid).emit('duel_result', resultPayload);
        }
        console.log(`[Server] 🏆 Duel settled: ${payload.winnerUserId} beat ${payload.loserUserId} (Δ${result.delta ?? '?'})`);
    });

    // ============ WORLD BOSS ============
    // Client reports damage it dealt; server owns the shared HP pool and the
    // per-player damage tally. Per-hit damage is clamped as light anti-cheat.
    socket.on('boss_hit', async (payload) => {
        if (!worldBoss.active || worldBoss.hp <= 0 || !payload) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || player.mapId !== worldBoss.mapId) return;
        const dmg = Math.max(0, Math.min(5000, Number(payload.damage) || 0));
        if (dmg <= 0) return;

        // Anti-spam: cap per-player throughput to a sane per-second budget so a
        // bot can't machine-gun boss_hit to steal the #1 reward. Real attacks
        // land a few times a second; 8 hits / 20k dmg per second is generous.
        const nowH = Date.now();
        if (!socket._bossWin || nowH - socket._bossWin.t > 1000) socket._bossWin = { t: nowH, dmg: 0, hits: 0 };
        socket._bossWin.hits++;
        socket._bossWin.dmg += dmg;
        if (socket._bossWin.hits > 8 || socket._bossWin.dmg > 20000) return;

        const contribution = applyBossContribution({
            boss: worldBoss,
            player,
            damage: dmg,
        });
        if (!contribution.accepted) return;

        if (contribution.defeated) {
            await endWorldBoss(player.username);
        } else {
            const now = Date.now();
            if (now - worldBoss._lastHpBcast > 220) {
                worldBoss._lastHpBcast = now;
                io.emit('boss_hp', { hp: worldBoss.hp, maxHp: worldBoss.maxHp, lastHitBy: player.username });
            }
        }
    });

    // --- VENDING STALLS ---
    // A stall opened/closed anywhere → everyone refreshes their stall view
    // (the stall data itself lives in Supabase; this is just the change ping).
    socket.on('stall_change', () => {
        io.emit('stalls_update');
    });

    // --- ADMIN ANNOUNCEMENT ---
    socket.on('admin:announcement', (data) => {
        // SECURITY: only a verified admin (profiles.is_admin, resolved server-side
        // at join) may broadcast. This closes the hole where anyone could emit
        // this event from the browser console to spam the scrolling banner.
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.isAdmin) {
            console.warn(`[Server] 🚫 Rejected admin:announcement from non-admin socket ${socket.id} (${player?.username || 'unknown'})`);
            return;
        }
        if (!data || typeof data.text !== 'string' || !data.text.trim()) return;

        // Sanitize: cap length + clamp the recurring interval
        const clean = {
            text: data.text.slice(0, 300),
            type: data.type,
            duration: Math.min(60000, Math.max(1000, Number(data.duration) || 8000)),
            timestamp: Date.now(),
        };
        const interval = Math.min(120, Math.max(0, Number(data.interval) || 0));

        io.emit('admin:announcement', clean);
        console.log(`[Server] 📢 Admin announcement by ${player.username}:`, clean.text);

        // Handle recurring intervals if specified (admin only, already gated)
        if (interval > 0) {
            const intervalMs = interval * 60 * 1000;
            if (socket.announcementIntervals && socket.announcementIntervals[clean.text]) {
                clearInterval(socket.announcementIntervals[clean.text]);
            }
            if (!socket.announcementIntervals) socket.announcementIntervals = {};
            socket.announcementIntervals[clean.text] = setInterval(() => {
                io.emit('admin:announcement', { ...clean, timestamp: Date.now(), isRecurring: true });
            }, intervalMs);
        }
    });

    // --- PLAYER DEATH ANNOUNCEMENT ---
    socket.on('player_dead', (payload) => {
        const player = onlinePlayers.get(socket.id);
        if (!player) return;

        // A dead/respawning player must never remain a valid server-authoritative
        // monster target. Clear this before handling the optional announcement so
        // malformed/older clients cannot accidentally keep aggro alive.
        clearAggroForCharacter(player.characterId);

        if (!payload || !payload.monsterName) return;

        // Only announce if player was above level 5
        if (player.level > 5) {
            const mapId = player.mapId || 'prontera_field';
            const message = `ผู้เล่น [${player.username}] ถูก [${payload.monsterName}] สังหาร!`;

            io.to(`map:${mapId}`).emit('chat', {
                userId: 'system',
                username: '📢 แจ้งเตือน',
                level: 99,
                message: message,
                color: 'red',
                mapId: mapId
            });
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', async (reason) => {
        // Clear all recurring announcement intervals for this socket
        if (socket.announcementIntervals) {
            Object.values(socket.announcementIntervals).forEach(interval => clearInterval(interval));
            socket.announcementIntervals = null;
        }

        const player = onlinePlayers.get(socket.id);
        if (player) {
            console.log(`[Server] ➖ Player left: ${player.username} (${player.userId}) — reason: ${reason}`);

            // Drop any duel challenges this player issued or received, so they
            // don't linger and let a stale accept start a duel later.
            for (const key of pendingDuelChallenges.keys()) {
                const [from, to] = key.split('->');
                if (from === player.userId || to === player.userId) pendingDuelChallenges.delete(key);
            }

            // If mid-duel, the disconnector forfeits: opponent wins
            const duel = activeDuels.get(player.userId);
            if (duel && !duel.settled) {
                duel.settled = true;
                const opponent = duel.a === player.userId ? duel.b : duel.a;
                activeDuels.delete(duel.a);
                activeDuels.delete(duel.b);
                const result = await settleDuelMMR(opponent, player.userId);
                const sid = userSocketMap.get(opponent);
                if (sid) {
                    io.to(sid).emit('duel_result', {
                        duelId: duel.duelId,
                        winnerUserId: opponent,
                        loserUserId: player.userId,
                        forfeit: true,
                        ...result,
                    });
                }
                console.log(`[Server] 🏳️ Duel forfeit by disconnect: ${player.userId}`);
            }

            // Save on disconnect
            if (player.lastSaveData) {
                const saved = await saveCharacterToSupabase(player.lastSaveData);
                if (saved && pendingSaves.get(player.userId) === player.lastSaveData) {
                    pendingSaves.delete(player.userId);
                }
            }

            clearSocketMappingIfCurrent(userSocketMap, player.userId, socket.id);
            onlinePlayers.delete(socket.id);

            // Broadcast updated player list
            broadcastPlayerList(player.mapId);
        }
    });
});

// ============ Helpers ============
function broadcastPlayerList(mapId) {
    if (!mapId) return;

    const playersInMap = [];
    let globalCount = 0;

    for (const [, info] of onlinePlayers) {
        globalCount++;
        if (info.mapId === mapId) {
            playersInMap.push(serializeOnlinePlayer(info));
        }
    }

    // Send map-specific list to players in that map (used for rendering the
    // other heroes standing in the same city).
    io.to(`map:${mapId}`).emit('players_update', playersInMap);

    // Global count can still be broadcast to everyone
    io.emit('online_count', globalCount);

    // Also broadcast the FULL cross-map roster so the Online Players panel can
    // list everyone regardless of which city/map they're in. Emitted right
    // after players_update so it deterministically wins on the client.
    const allPlayers = [];
    for (const [, info] of onlinePlayers) {
        allPlayers.push(serializeOnlinePlayer(info));
    }
    io.emit('players_global', allPlayers);
}

// ===== Latency (ping) measurement =====
// Every few seconds, ping each socket. After a short delay (to let pong
// replies arrive), refresh the global roster so the Online panel shows
// live latency. The client replies to 'srv_ping' with 'srv_pong'.
setInterval(() => {
    const now = Date.now();
    for (const [socketId] of onlinePlayers) {
        const s = io.sockets.sockets.get(socketId);
        if (s) s.emit('srv_ping', now);
    }
    // Delay: give clients ~1.5s to reply with srv_pong before broadcasting
    setTimeout(() => {
        const allPlayers = [];
        for (const [, info] of onlinePlayers) {
            allPlayers.push(serializeOnlinePlayer(info));
        }
        if (allPlayers.length) io.emit('players_global', allPlayers);
    }, 1500);
}, 4000);

// ============ PVP MMR (Elo, K=32) ============
// Reads both players' MMR from `characters`, applies Elo, writes back new
// MMR + win/loss counters. Returns {winnerMmr, loserMmr, delta} or {} when
// the DB is unavailable.
async function settleDuelMMR(winnerUserId, loserUserId) {
    if (!supabase) return {};
    try {
        const { data: rows, error } = await supabase
            .from('characters')
            .select('id, user_id, mmr, pvp_wins, pvp_losses')
            .in('user_id', [winnerUserId, loserUserId]);
        if (error || !rows || rows.length < 2) {
            console.error('[Server] ❌ MMR read failed:', error?.message);
            return {};
        }
        const w = rows.find(r => r.user_id === winnerUserId);
        const l = rows.find(r => r.user_id === loserUserId);
        if (!w || !l) return {};

        const wMmr = Number(w.mmr) || 1000;
        const lMmr = Number(l.mmr) || 1000;
        const K = 32;
        const expectedWin = 1 / (1 + Math.pow(10, (lMmr - wMmr) / 400));
        const delta = Math.max(1, Math.round(K * (1 - expectedWin)));

        const winnerMmr = wMmr + delta;
        const loserMmr = Math.max(0, lMmr - delta);

        await supabase.from('characters')
            .update({ mmr: winnerMmr, pvp_wins: (Number(w.pvp_wins) || 0) + 1 })
            .eq('id', w.id);
        await supabase.from('characters')
            .update({ mmr: loserMmr, pvp_losses: (Number(l.pvp_losses) || 0) + 1 })
            .eq('id', l.id);

        return { winnerMmr, loserMmr, delta };
    } catch (e) {
        console.error('[Server] ❌ settleDuelMMR failed:', e.message);
        return {};
    }
}

// ============ Periodic Save to Supabase ============
async function saveCharacterToSupabase(saveData) {
    if (!supabase || !saveData || !saveData.characterId) return false;

    try {
        const { characterId, updates, inventory, dailyQuests, friendsList } = saveData;

        // SECURITY GATE: only write if this character is owned by the socket's
        // server-trusted user. Blocks cross-account stat/inventory overwrites
        // (the server uses the service-role key, which bypasses RLS).
        const ownerUserId = saveData._ownerUserId;
        if (!ownerUserId) return true;
        const { data: owned, error: ownErr } = await supabase
            .from('characters')
            .select('id, level, exp, hp, max_hp, sp, max_sp, atk, def, gold, zol, total_kills, play_time, updated_at')
            .eq('id', characterId)
            .eq('user_id', ownerUserId)
            .maybeSingle();
        if (ownErr || !owned) {
            console.warn(`[Server] 🚫 save_state ownership mismatch: char ${characterId} not owned by ${ownerUserId}`);
            if (saveData._clientIp) ipMonitor.recordSuspicious(saveData._clientIp, `save-ownership-mismatch ${characterId}`);
            return true;
        }

        // 1. Save character stats
        if (updates && Object.keys(updates).length > 0) {
            const previousUpdatedAt = Date.parse(owned.updated_at || '');
            const elapsedMs = Number.isFinite(previousUpdatedAt)
                ? Math.max(1000, Date.now() - previousUpdatedAt)
                : SAVE_INTERVAL_MS;
            const filtered = sanitizeSaveUpdates(updates, owned, elapsedMs);
            const rejectedFields = Object.keys(updates).filter(key => !(key in filtered));
            if (rejectedFields.length > 0) {
                console.warn(`[Server] 🚫 Rejected unsafe save fields for ${characterId}: ${rejectedFields.join(', ')}`);
            }
            if (Object.keys(filtered).length > 0) {
                filtered.updated_at = new Date().toISOString();
                const { error } = await supabase
                    .from('characters')
                    .update(filtered)
                    .eq('id', characterId);
                if (error) {
                    throw error;
                } else {
                    console.log(`[Server] 💾 Saved character: ${characterId}`);
                }
            }
        }

        // 2. Save daily quests (as system inventory item)
        if (dailyQuests) {
            try {
                const { data: existing, error: lookupError } = await supabase
                    .from('inventory')
                    .select('id')
                    .eq('character_id', characterId)
                    .eq('item_name', 'daily_quests')
                    .eq('item_type', 'system')
                    .maybeSingle();
                if (lookupError) throw lookupError;

                let mutation;
                if (existing) {
                    mutation = await supabase.from('inventory').update({ stats: dailyQuests }).eq('id', existing.id);
                } else {
                    mutation = await supabase.from('inventory').insert({
                        character_id: characterId,
                        item_name: 'daily_quests',
                        item_type: 'system',
                        quantity: 1,
                        stats: dailyQuests
                    });
                }
                if (mutation.error) throw mutation.error;
            } catch (e) {
                throw new Error(`Save daily quests failed: ${e.message}`);
            }
        }

        // 3. Save friends list (as system inventory item)
        if (friendsList) {
            try {
                const { data: existing, error: lookupError } = await supabase
                    .from('inventory')
                    .select('id')
                    .eq('character_id', characterId)
                    .eq('item_name', 'friends_list')
                    .eq('item_type', 'system')
                    .maybeSingle();
                if (lookupError) throw lookupError;

                let mutation;
                if (existing) {
                    mutation = await supabase.from('inventory').update({ stats: { list: friendsList } }).eq('id', existing.id);
                } else {
                    mutation = await supabase.from('inventory').insert({
                        character_id: characterId,
                        item_name: 'friends_list',
                        item_type: 'system',
                        quantity: 1,
                        stats: { list: friendsList }
                    });
                }
                if (mutation.error) throw mutation.error;
            } catch (e) {
                throw new Error(`Save friends list failed: ${e.message}`);
            }
        }

        // 4. Save full inventory (Safety backup)
        if (inventory && Array.isArray(inventory)) {
            try {
                const sanitized = sanitizeInventoryBackup(inventory);
                // Batch update inventory items that have stats
                const itemsWithStats = sanitized.filter(i => i.stats && Object.keys(i.stats).length > 0);
                for (const item of itemsWithStats) {
                    const { error } = await supabase
                        .from('inventory')
                        .update({ stats: item.stats })
                        .eq('character_id', characterId)
                        .eq('item_name', item.item_name);
                    if (error) throw error;
                }
            } catch (e) {
                throw new Error(`Save inventory backup failed: ${e.message}`);
            }
        }
        return true;
    } catch (err) {
        console.error('[Server] ❌ saveCharacterToSupabase failed:', err.message);
        return false;
    }
}

// Periodic batch save (every 3 minutes)
setInterval(async () => {
    if (pendingSaves.size === 0) return;
    console.log(`[Server] ⏰ Periodic save — ${pendingSaves.size} player(s) to save...`);

    const saves = [...pendingSaves.entries()];

    for (const [userId, saveData] of saves) {
        const saved = await saveCharacterToSupabase(saveData);
        // A newer save_state may arrive while the database request is pending.
        // Delete only the exact snapshot we successfully persisted.
        if (saved && pendingSaves.get(userId) === saveData) pendingSaves.delete(userId);
    }

    console.log('[Server] ✅ Periodic save complete');
}, SAVE_INTERVAL_MS);

// ============ Start Server ============
httpServer.listen(PORT, HOST, () => {
    console.log(`[Server] 🚀 Zolos Map Server running on ${HOST}:${PORT}`);
    console.log(`[Server] 📡 CORS origins: ${CORS_ORIGINS.join(', ')}`);
    console.log(`[Server] 💾 Save interval: ${SAVE_INTERVAL_MS / 1000}s`);
    console.log(`[Server] 🗄️  Supabase: ${supabase ? 'Connected' : 'Disabled'}`);
    // Daily player-movement snapshots (self-host DB only).
    if (USE_LOCAL_DB) {
        startSnapshotScheduler().catch(e => console.error('[Snapshot] scheduler failed:', e.message));
        startMarketExpiryScheduler({ io }).catch(e => console.error('[MarketExpiry] scheduler failed:', e.message));
        startCheatGuard().catch(e => console.error('[CheatGuard] scheduler failed:', e.message));
        // World-monster config (Phase 1): create + seed tables from GameData.
        // Phase 2: if WORLD_MONSTERS is on, start the authoritative engine.
        (async () => {
            try {
                await ensureMonsterTables();
                await seedMonstersIfEmpty();
                await ensurePronteraMountainExpansion();
                await ensureCardEconomy();
                await ensureOreEconomy();
                await ensurePetEconomy();
                if (WORLD_MONSTERS) await startMonsterEngine({ io, onlinePlayers });
            } catch (e) { console.error('[MonsterCfg] init failed:', e.message); }
        })();
    }
});
