// ============================================================
// ZOLOS Map Server — Node.js + Socket.io (Railway.app)
// Real-time WebSocket server for player synchronization
// ============================================================
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';

// ============ Configuration ============
const PORT = parseInt(process.env.PORT) || 3001;
const HOST = '0.0.0.0';
// Exact-origin allowlist. Accept BOTH env names — the deploy guide documents
// CORS_ORIGIN (singular) while the code historically read CORS_ORIGINS, and
// that mismatch meant a configured value was silently ignored.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173,http://localhost:4173,https://zolos.online,https://www.zolos.online,https://zolos.vercel.app,https://zolos-multiplayer.vercel.app').split(',').map(s => s.trim()).filter(Boolean);
// Base domains whose subdomains are all allowed. Covers the apex + www of the
// live site and Vercel preview deploys (zolos-<hash>.vercel.app) without having
// to enumerate every one. localhost stays open for dev.
const CORS_ALLOWED_HOSTS = ['zolos.online', 'vercel.app', 'localhost', '127.0.0.1'];

function isAllowedOrigin(origin) {
    if (CORS_ORIGINS.includes(origin)) return true;
    try {
        const host = new URL(origin).hostname;
        return CORS_ALLOWED_HOSTS.some(base => host === base || host.endsWith('.' + base));
    } catch { return false; }
}

// Add wildcard support for easier debugging
if (process.env.CORS_ALLOW_ALL === 'true') {
    console.log('[Server] ⚠️ CORS_ALLOW_ALL is enabled');
}
const SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Supabase (Database-only, service role for server-side writes, with fallback configurations)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const isServiceRole = !!(process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log(`[Server] ✅ Supabase connected (${isServiceRole ? 'service role' : 'anon/fallback key'})`);
} else {
    console.warn('[Server] ⚠️ No Supabase credentials — save-to-DB disabled');
}

// ============ Express + Socket.io Setup ============
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // No Origin header: non-browser clients (health checks, native apps).
            // Browsers always send one, so this can't be used to bypass the list.
            if (!origin) return callback(null, true);
            if (process.env.CORS_ALLOW_ALL === 'true') return callback(null, true);
            if (isAllowedOrigin(origin)) return callback(null, true);
            console.warn(`[Server] 🚫 CORS rejected origin: ${origin}`);
            callback(new Error('Origin not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling']
});

// Health check endpoint (Railway uses this)
app.get('/', (_req, res) => {
    const playerCount = onlinePlayers.size;
    res.json({
        status: 'ok',
        server: 'zolos-map-server',
        players: playerCount,
        uptime: Math.floor(process.uptime())
    });
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

// Identity helper: every relayed payload is re-stamped with the socket's
// server-trusted userId. Never echo a client-supplied identity field — the JWT
// check at `join` is worthless if any later event can just claim another id.
function trustedSender(socket) {
    return onlinePlayers.get(socket.id) || null;
}

// PlayerInfo shape:
// { userId, username, level, socketId, joinedAt, lastSaveData: null }

// ============ Chat Moderation ============
// Server-authoritative so it can't be bypassed from the browser console.
// Longer phrases first so they censor fully before their sub-words match.
const PROFANITY = [
    'ควยเย็ดแม่', 'เย็ดแม่', 'เย็ด', 'ควย', 'ควย', 'สัส', 'สาด', 'ไอสัส', 'ไอ้สัส',
    'เหี้ย', 'ไอเหี้ย', 'ไอ้เหี้ย', 'หน้าหี', 'หี', 'แตด', 'ดอกทอง', 'กะหรี่', 'อีดอก',
    'สถุน', 'ระยำ', 'ชาติหมา', 'จัญไร', 'สันดาน', 'พ่อมึงตาย', 'แม่มึงตาย', 'ไอ้ควาย',
    'fuck', 'fuk', 'fvck', 'shit', 'bitch', 'dick', 'cunt', 'pussy', 'asshole', 'motherfucker', 'nigger',
].sort((a, b) => b.length - a.length);
const PROFANITY_RE = PROFANITY.map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));

function censorProfanity(text) {
    let out = text;
    for (const re of PROFANITY_RE) out = out.replace(re, m => '*'.repeat(m.length));
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
// and broadcasts rewards (applied client-side, then persisted via normal
// auto-save). If it isn't killed within BOSS_FIGHT_MS it flees and reschedules.
const BOSS_INTERVAL_MS = parseInt(process.env.BOSS_INTERVAL_MS) || 12 * 60 * 1000; // spawn every 12 min
const BOSS_FIGHT_MS = parseInt(process.env.BOSS_FIGHT_MS) || 6 * 60 * 1000;        // 6 min to kill
const BOSS_NAMES = [
    'Valdris จอมมารเพลิง',
    'Ignarok ราชันมังกร',
    'Golem แห่งหุบเหวลึก',
    'Morgath ผู้กลืนวิญญาณ',
    'Kaltharu อสูรน้ำแข็ง',
    'Zul\'garoth เทพสังหาร',
];
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
    name: '',
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
        name: worldBoss.name,
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
    worldBoss.name = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
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
        name: worldBoss.name,
        hp: worldBoss.hp,
        maxHp: worldBoss.maxHp,
        mapId: worldBoss.mapId,
        mapName: worldBoss.mapName,
        x: worldBoss.x,
        z: worldBoss.z,
    });
    console.log(`[Server] 👹 World Boss spawned: ${worldBoss.name} at ${worldBoss.mapName} (${maxHp} HP, ${online} online)`);
}

function computeBossRanking() {
    const entries = [...worldBoss.damage.entries()]
        .map(([userId, v]) => ({ userId, name: v.name, dmg: Math.round(v.dmg) }))
        .filter(e => e.dmg > 0)
        .sort((a, b) => b.dmg - a.dmg);
    return entries.map((e, i) => {
        const rank = i + 1;
        // Everyone earns gold/exp scaled by contribution; podium gets bonuses + items.
        let gold = 400 + Math.floor(e.dmg / 8);
        let exp = 150 + Math.floor(e.dmg / 12);
        let item = null;
        if (rank === 1) { gold += 3000; exp += 1800; item = 'Dragon Heart'; }
        else if (rank === 2) { gold += 1800; exp += 1100; item = 'Mythril Shard'; }
        else if (rank === 3) { gold += 1100; exp += 700; item = 'Mythril Shard'; }
        else if (rank <= 10) { gold += 500; exp += 300; }
        return { rank, userId: e.userId, name: e.name, dmg: e.dmg, gold, exp, item };
    });
}

function endWorldBoss(killerName) {
    const ranking = computeBossRanking();
    const name = worldBoss.name;
    worldBoss.active = false;
    worldBoss.hp = 0;
    worldBoss.spawnAt = Date.now() + BOSS_INTERVAL_MS;
    worldBoss.damage = new Map();
    io.emit('boss_dead', {
        name,
        mapId: worldBoss.mapId,
        mapName: worldBoss.mapName,
        killerName: killerName || (ranking[0] && ranking[0].name) || 'นักผจญภัย',
        ranking,
    });
    console.log(`[Server] 💀 World Boss defeated: ${name} — ${ranking.length} contributors (killer: ${killerName})`);
}

function fleeWorldBoss() {
    const name = worldBoss.name;
    worldBoss.active = false;
    worldBoss.hp = 0;
    worldBoss.spawnAt = Date.now() + BOSS_INTERVAL_MS;
    worldBoss.damage = new Map();
    io.emit('boss_flee', { name, mapId: worldBoss.mapId, mapName: worldBoss.mapName });
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

    // Send the current online count immediately. Sockets that only connect to
    // watch the count (e.g. the auth/login screen, before they `join`) otherwise
    // never receive a value until the next join/leave, so they'd show 0.
    socket.emit('online_count', onlinePlayers.size);

    // --- JOIN ---
    socket.on('join', async (data) => {
        if (!data || !data.userId) return;

        let { userId, username, level } = data;

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

        // Remove any existing connection for same userId (reconnect scenario)
        const existingSocketId = userSocketMap.get(userId);
        if (existingSocketId && existingSocketId !== socket.id) {
            const existingSock = io.sockets.sockets.get(existingSocketId);
            if (existingSock) {
                existingSock.disconnect(true);
            }
            onlinePlayers.delete(existingSocketId);
        }

        const playerInfo = {
            userId,
            username: username || 'Adventurer',
            level: level || 1,
            socketId: socket.id,
            mapId: data.mapId || 'prontera_field',
            joinedAt: Date.now(),
            lastSaveData: null,
            verified,
            ping: null, // round-trip latency in ms, measured via srv_ping/srv_pong
        };

        // Join map-specific room
        socket.join(`map:${playerInfo.mapId}`);

        onlinePlayers.set(socket.id, playerInfo);
        userSocketMap.set(userId, socket.id);

        // Admin status only for VERIFIED accounts (never trust the client).
        playerInfo.isAdmin = false;
        if (verified && supabase) {
            supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
                .then(({ data }) => { if (data && data.is_admin === true) playerInfo.isAdmin = true; })
                .catch(() => { /* default non-admin */ });
        }

        console.log(`[Server] ➕ Player joined: ${username} (${userId})${verified ? ' ✓' : ''} — Total: ${onlinePlayers.size}`);

        // Broadcast updated player list to everyone in this map
        broadcastPlayerList(playerInfo.mapId);

        // Send the current world-boss state so the newcomer sees the countdown
        // (or an in-progress fight) immediately.
        socket.emit('boss_state', bossPublicState());
    });

    // --- POSITION BROADCAST ---
    socket.on('pos', (payload) => {
        if (!payload) return;
        const self = trustedSender(socket);
        if (!self) return; // must be a joined player
        const mapId = payload.mapId || self.mapId || 'prontera_field';
        // Remember the sender's latest position so friends can warp to them —
        // even across maps (positions are only relayed within a map room).
        if (typeof payload.x === 'number' && typeof payload.z === 'number') {
            self.lastPos = { x: payload.x, y: payload.y, z: payload.z, mapId };
        }
        // Broadcast to all OTHER clients in the SAME map, stamped with the
        // server's identity for this socket so a client can't puppet another
        // player's avatar by claiming their userId.
        socket.to(`map:${mapId}`).emit('pos', { ...payload, userId: self.userId, mapId });
    });

    // --- SHARED MONSTER HP --- relay a monster hit to everyone else on the map
    // so their copy of that (deterministically-spawned) monster drains the same
    // HP. Pure relay: the server keeps no monster state; sender is excluded.
    socket.on('monster_hit', (payload) => {
        if (!payload || typeof payload.monsterId !== 'string') return;
        const self = trustedSender(socket);
        if (!self) return;
        const mapId = payload.mapId || self.mapId || 'prontera_field';
        const damage = Math.max(0, Math.min(1e7, Number(payload.damage) || 0));
        if (damage <= 0) return;
        socket.to(`map:${mapId}`).emit('monster_hit', { monsterId: payload.monsterId, damage });
    });

    // --- LATENCY PONG --- reply to our periodic srv_ping; RTT = now - echoed ts
    socket.on('srv_pong', (t) => {
        const info = onlinePlayers.get(socket.id);
        if (!info) return;
        const rtt = Date.now() - (typeof t === 'number' ? t : Date.now());
        if (rtt >= 0 && rtt < 60000) {
            info.ping = Math.round(info.ping == null ? rtt : info.ping * 0.5 + rtt * 0.5);
        }
    });

    // --- CHAT ---
    socket.on('chat', (payload) => {
        if (!payload || typeof payload.message !== 'string') return;
        const player = onlinePlayers.get(socket.id);
        if (!player) return; // must be a joined player

        const mapId = payload.mapId || 'prontera_field';
        const isSystem = payload.userId === 'system';

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
            userId: isSystem ? 'system' : player.userId,
            username: isSystem ? '📢 ระบบตลาด' : player.username,
            level: isSystem ? 99 : player.level,
            message: msg,
            mapId,
        };
        io.to(`map:${mapId}`).emit('chat', out);
    });

    // --- PRESENCE UPDATE ---
    socket.on('update_presence', (data) => {
        if (!data) return;
        const player = onlinePlayers.get(socket.id);
        if (player) {
            const oldMapId = player.mapId;
            if (data.level !== undefined) player.level = data.level;
            if (data.username) player.username = data.username;
            
            if (data.mapId && data.mapId !== oldMapId) {
                socket.leave(`map:${oldMapId}`);
                player.mapId = data.mapId;
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
            // SECURITY: stamp the save with the socket's server-trusted userId so
            // the DB write can be gated on ownership. A client cannot save to a
            // character it doesn't own by lying about characterId.
            const trusted = { ...data, _ownerUserId: player.userId };
            player.lastSaveData = trusted;
            pendingSaves.set(player.userId, trusted);
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

    socket.on('trade_request', (payload) => {
        const sender = trustedSender(socket);
        if (!sender || !payload || !payload.targetUserId) return;
        relayRequest('trade_request', payload, sender);
    });

    socket.on('trade_response', (payload) => {
        const sender = trustedSender(socket);
        if (!sender || !payload || !payload.senderUserId) return;
        relayResponse('trade_response', payload, sender);
    });

    // Cancel travels the same direction as the request (asker → target).
    socket.on('trade_cancel', (payload) => {
        const sender = trustedSender(socket);
        if (!sender || !payload || !payload.targetUserId) return;
        relayRequest('trade_cancel', payload, sender);
    });

    socket.on('friend_request', (payload) => {
        const sender = trustedSender(socket);
        if (!sender || !payload || !payload.targetUserId) return;
        relayRequest('friend_request', payload, sender);
    });

    socket.on('friend_response', (payload) => {
        const sender = trustedSender(socket);
        if (!sender || !payload || !payload.senderUserId) return;
        relayResponse('friend_response', payload, sender);
    });

    // --- WARP TO FRIEND ---
    // Requester wants to teleport to an online player. We answer directly from
    // the target's last-known position (tracked from their `pos` broadcasts),
    // including which map they're on, so cross-map warps work too.
    socket.on('warp_request', (payload) => {
        if (!payload || !payload.targetUserId) return;
        const requester = onlinePlayers.get(socket.id);
        if (!requester) return;
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        const target = targetSocketId ? onlinePlayers.get(targetSocketId) : null;
        if (!target) {
            socket.emit('warp_result', { ok: false, reason: 'offline', targetUserId: payload.targetUserId });
            return;
        }
        const pos = target.lastPos;
        socket.emit('warp_result', {
            ok: true,
            targetUserId: target.userId,
            targetName: target.username,
            mapId: (pos && pos.mapId) || target.mapId || 'prontera',
            x: pos ? pos.x : null,
            y: pos ? pos.y : null,
            z: pos ? pos.z : null,
        });
        console.log(`[Server] 🌀 Warp: ${requester.username} → ${target.username}`);
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
        // ...and that the reporter is one of the two participants, so a
        // bystander can't settle other people's duels.
        if (!pair.includes(reporter.userId)) return;
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
    socket.on('boss_hit', (payload) => {
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

        worldBoss.hp = Math.max(0, worldBoss.hp - dmg);
        const rec = worldBoss.damage.get(player.userId) || { name: player.username, dmg: 0 };
        rec.name = player.username;
        rec.dmg += dmg;
        worldBoss.damage.set(player.userId, rec);

        if (worldBoss.hp <= 0) {
            endWorldBoss(player.username);
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
        if (!player || !payload || !payload.monsterName) return;
        
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
                await saveCharacterToSupabase(player.lastSaveData);
                pendingSaves.delete(player.userId);
            }

            userSocketMap.delete(player.userId);
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
            playersInMap.push({
                userId: info.userId,
                username: info.username,
                level: info.level,
                mapId: info.mapId,
                ping: info.ping ?? null
            });
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
        allPlayers.push({ userId: info.userId, username: info.username, level: info.level, mapId: info.mapId, ping: info.ping ?? null });
    }
    io.emit('players_global', allPlayers);
}

// ===== Latency (ping) measurement =====
// Every few seconds, ping each socket and refresh the global roster so the
// Online panel shows live latency. The client replies to 'srv_ping' (echoing
// the timestamp) with 'srv_pong'.
setInterval(() => {
    const now = Date.now();
    for (const [socketId] of onlinePlayers) {
        const s = io.sockets.sockets.get(socketId);
        if (s) s.emit('srv_ping', now);
    }
    // Push the freshly-measured pings out to everyone's Online panel.
    const allPlayers = [];
    for (const [, info] of onlinePlayers) {
        allPlayers.push({ userId: info.userId, username: info.username, level: info.level, mapId: info.mapId, ping: info.ping ?? null });
    }
    if (allPlayers.length) io.emit('players_global', allPlayers);
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
    if (!supabase || !saveData || !saveData.characterId) return;

    try {
        const { characterId, updates, inventory, dailyQuests, friendsList } = saveData;

        // SECURITY GATE: only write if this character is owned by the socket's
        // server-trusted user. Blocks cross-account stat/inventory overwrites
        // (the server uses the service-role key, which bypasses RLS).
        const ownerUserId = saveData._ownerUserId;
        if (!ownerUserId) return;
        const { data: owned, error: ownErr } = await supabase
            .from('characters').select('id').eq('id', characterId).eq('user_id', ownerUserId).maybeSingle();
        if (ownErr || !owned) {
            console.warn(`[Server] 🚫 save_state ownership mismatch: char ${characterId} not owned by ${ownerUserId}`);
            return;
        }

        // 1. Save character stats
        if (updates && Object.keys(updates).length > 0) {
            const allowedFields = [
                'name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp',
                'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'last_map',
                'weapon', 'hat', 'glasses', 'shield', 'armor', 'body_color', 'hair_color', 'pants_color', 'gender',
                'sound_enabled', 'graphics_quality', 'fps_enabled'
            ];
            const filtered = {};
            for (const key of Object.keys(updates)) {
                if (allowedFields.includes(key)) {
                    let val = updates[key];
                    // Server-side stat clamping — aligned with the DB CHECK
                    // constraints (level<=300, gold<=500M) so a cheat-range save
                    // is capped here and never bounces the whole write.
                    if (key === 'level') val = Math.max(1, Math.min(300, parseInt(val) || 1));
                    if (key === 'gold') val = Math.max(0, Math.min(500000000, parseInt(val) || 0));
                    if (key === 'zol') val = Math.max(0, Math.min(2147483647, parseInt(val) || 0));
                    if (key === 'exp') val = Math.max(0, Math.min(2147483647, parseInt(val) || 0));
                    if (key === 'atk') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
                    if (key === 'def') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
                    filtered[key] = val;
                }
            }
            if (Object.keys(filtered).length > 0) {
                filtered.updated_at = new Date().toISOString();
                const { error } = await supabase
                    .from('characters')
                    .update(filtered)
                    .eq('id', characterId);
                if (error) {
                    console.error(`[Server] ❌ Save character error (${characterId}):`, error.message);
                } else {
                    console.log(`[Server] 💾 Saved character: ${characterId}`);
                }
            }
        }

        // 2. Save daily quests (as system inventory item)
        if (dailyQuests) {
            try {
                const { data: existing } = await supabase
                    .from('inventory')
                    .select('id')
                    .eq('character_id', characterId)
                    .eq('item_name', 'daily_quests')
                    .eq('item_type', 'system')
                    .maybeSingle();

                if (existing) {
                    await supabase.from('inventory').update({ stats: dailyQuests }).eq('id', existing.id);
                } else {
                    await supabase.from('inventory').insert({
                        character_id: characterId,
                        item_name: 'daily_quests',
                        item_type: 'system',
                        quantity: 1,
                        stats: dailyQuests
                    });
                }
            } catch (e) {
                console.error('[Server] ❌ Save daily quests error:', e.message);
            }
        }

        // 3. Save friends list (as system inventory item)
        if (friendsList) {
            try {
                const { data: existing } = await supabase
                    .from('inventory')
                    .select('id')
                    .eq('character_id', characterId)
                    .eq('item_name', 'friends_list')
                    .eq('item_type', 'system')
                    .maybeSingle();

                if (existing) {
                    await supabase.from('inventory').update({ stats: { list: friendsList } }).eq('id', existing.id);
                } else {
                    await supabase.from('inventory').insert({
                        character_id: characterId,
                        item_name: 'friends_list',
                        item_type: 'system',
                        quantity: 1,
                        stats: { list: friendsList }
                    });
                }
            } catch (e) {
                console.error('[Server] ❌ Save friends list error:', e.message);
            }
        }

        // 4. Save full inventory (Safety backup)
        if (inventory && Array.isArray(inventory)) {
            try {
                // Batch update inventory items that have stats
                const itemsWithStats = inventory.filter(i => i.stats && Object.keys(i.stats).length > 0);
                for (const item of itemsWithStats) {
                    await supabase
                        .from('inventory')
                        .update({ stats: item.stats })
                        .eq('character_id', characterId)
                        .eq('item_name', item.item_name);
                }
            } catch (e) {
                console.error('[Server] ❌ Save inventory backup error:', e.message);
            }
        }
    } catch (err) {
        console.error('[Server] ❌ saveCharacterToSupabase failed:', err.message);
    }
}

// Periodic batch save (every 3 minutes)
setInterval(async () => {
    if (pendingSaves.size === 0) return;
    console.log(`[Server] ⏰ Periodic save — ${pendingSaves.size} player(s) to save...`);

    const saves = [...pendingSaves.entries()];
    pendingSaves.clear();

    for (const [userId, saveData] of saves) {
        await saveCharacterToSupabase(saveData);
    }

    console.log('[Server] ✅ Periodic save complete');
}, SAVE_INTERVAL_MS);

// ============ Start Server ============
httpServer.listen(PORT, HOST, () => {
    console.log(`[Server] 🚀 Zolos Map Server running on ${HOST}:${PORT}`);
    console.log(`[Server] 📡 CORS origins: ${CORS_ORIGINS.join(', ')}`);
    console.log(`[Server] 💾 Save interval: ${SAVE_INTERVAL_MS / 1000}s`);
    console.log(`[Server] 🗄️  Supabase: ${supabase ? 'Connected' : 'Disabled'}`);
});
