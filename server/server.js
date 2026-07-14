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
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:4173,https://zolos.vercel.app,https://zolos-multiplayer.vercel.app').split(',').map(s => s.trim());
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
            // Allow all origins for now to fix connection issues
            callback(null, true);
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

// PlayerInfo shape:
// { userId, username, level, socketId, joinedAt, lastSaveData: null }

// ============ Socket.io Event Handlers ============
io.on('connection', (socket) => {
    console.log(`[Server] 🔌 Socket connected: ${socket.id}`);

    // --- JOIN ---
    socket.on('join', (data) => {
        if (!data || !data.userId) return;

        const { userId, username, level } = data;

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
            lastSaveData: null
        };

        // Join map-specific room
        socket.join(`map:${playerInfo.mapId}`);

        onlinePlayers.set(socket.id, playerInfo);
        userSocketMap.set(userId, socket.id);

        console.log(`[Server] ➕ Player joined: ${username} (${userId}) — Total: ${onlinePlayers.size}`);

        // Broadcast updated player list to everyone in this map
        broadcastPlayerList(playerInfo.mapId);
    });

    // --- POSITION BROADCAST ---
    socket.on('pos', (payload) => {
        if (!payload || !payload.userId) return;
        const mapId = payload.mapId || 'prontera_field';
        // Broadcast position to all OTHER clients in the SAME map
        socket.to(`map:${mapId}`).emit('pos', payload);
    });

    // --- CHAT ---
    socket.on('chat', (payload) => {
        if (!payload) return;
        const mapId = payload.mapId || 'prontera_field';
        // Broadcast chat to ALL clients in the SAME map
        io.to(`map:${mapId}`).emit('chat', payload);
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
            player.lastSaveData = data;
            pendingSaves.set(player.userId, data);
        }
    });

    // --- P2P TRADE ---
    socket.on('trade_request', (payload) => {
        if (!payload || !payload.targetUserId) return;
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('trade_request', payload);
        }
    });

    socket.on('trade_response', (payload) => {
        if (!payload || !payload.senderUserId) return;
        const targetSocketId = userSocketMap.get(payload.senderUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('trade_response', payload);
        }
    });

    socket.on('trade_cancel', (payload) => {
        if (!payload || !payload.targetUserId) return;
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('trade_cancel', payload);
        }
    });

    // --- P2P FRIEND ---
    socket.on('friend_request', (payload) => {
        if (!payload || !payload.targetUserId) return;
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('friend_request', payload);
        }
    });

    socket.on('friend_response', (payload) => {
        if (!payload || !payload.senderUserId) return;
        const targetSocketId = userSocketMap.get(payload.senderUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('friend_response', payload);
        }
    });

    // ============ PVP DUEL SYSTEM ============
    // Challenge flow mirrors trade_request/response. Damage is relayed
    // victim-authoritative (each client applies hits to its own HP). The
    // LOSER's client reports duel_end; the server settles MMR via Elo (K=32)
    // exactly once per duel and broadcasts the result to both players.

    // --- Challenge another player ---
    socket.on('duel_request', (payload) => {
        if (!payload || !payload.targetUserId) return;
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('duel_request', payload);
        }
    });

    // --- Accept / decline ---
    socket.on('duel_response', (payload) => {
        if (!payload || !payload.senderUserId) return;
        const challengerSocketId = userSocketMap.get(payload.senderUserId);
        if (!challengerSocketId) return;

        io.to(challengerSocketId).emit('duel_response', payload);

        if (payload.accepted && payload.targetUserId) {
            const duelId = `duel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const duel = {
                duelId,
                a: payload.senderUserId,   // challenger
                b: payload.targetUserId,   // accepter
                settled: false,
                startedAt: Date.now(),
            };
            activeDuels.set(payload.senderUserId, duel);
            activeDuels.set(payload.targetUserId, duel);

            // Arena spawn points (matches the arena built client-side at -14,14)
            const startPayload = {
                duelId,
                players: [
                    { userId: payload.senderUserId, spawn: { x: -17, z: 14 } },
                    { userId: payload.targetUserId, spawn: { x: -11, z: 14 } },
                ],
            };
            io.to(challengerSocketId).emit('duel_start', startPayload);
            const accepterSocketId = userSocketMap.get(payload.targetUserId);
            if (accepterSocketId) io.to(accepterSocketId).emit('duel_start', startPayload);
            console.log(`[Server] ⚔️ Duel started: ${payload.senderUserId} vs ${payload.targetUserId}`);
        }
    });

    // --- Relay a hit to the victim ---
    socket.on('duel_hit', (payload) => {
        if (!payload || !payload.targetUserId) return;
        const targetSocketId = userSocketMap.get(payload.targetUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('duel_hit', payload);
        }
    });

    // --- Loser reports defeat; server settles MMR once ---
    socket.on('duel_end', async (payload) => {
        if (!payload || !payload.winnerUserId || !payload.loserUserId) return;
        const duel = activeDuels.get(payload.loserUserId);
        if (!duel || duel.settled) return;
        // Validate the pair matches the registered duel
        const pair = [duel.a, duel.b];
        if (!pair.includes(payload.winnerUserId) || !pair.includes(payload.loserUserId)) return;
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

    // --- ADMIN ANNOUNCEMENT ---
    socket.on('admin:announcement', (data) => {
        // Broadcast announcement to ALL connected clients immediately
        io.emit('admin:announcement', data);
        console.log('[Server] Admin announcement broadcasted:', data.text);

        // Handle recurring intervals if specified
        if (data.interval && data.interval > 0) {
            const intervalMs = data.interval * 60 * 1000;
            console.log(`[Server] Scheduling recurring announcement every ${data.interval} minutes`);
            
            // Clear any existing interval for the same text to avoid duplicates
            if (socket.announcementIntervals && socket.announcementIntervals[data.text]) {
                clearInterval(socket.announcementIntervals[data.text]);
            }
            
            if (!socket.announcementIntervals) socket.announcementIntervals = {};
            
            socket.announcementIntervals[data.text] = setInterval(() => {
                io.emit('admin:announcement', {
                    ...data,
                    timestamp: Date.now(),
                    isRecurring: true
                });
                console.log('[Server] Recurring announcement broadcasted:', data.text);
            }, intervalMs);
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
                mapId: info.mapId
            });
        }
    }
    
    // Send map-specific list to players in that map
    io.to(`map:${mapId}`).emit('players_update', playersInMap);
    
    // Global count can still be broadcast to everyone
    io.emit('online_count', globalCount);
}

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

        // 1. Save character stats
        if (updates && Object.keys(updates).length > 0) {
            const allowedFields = [
                'name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp',
                'atk', 'def', 'gold', 'total_kills', 'play_time', 'last_map',
                'weapon', 'hat', 'glasses', 'body_color', 'hair_color', 'pants_color',
                'sound_enabled', 'graphics_quality', 'fps_enabled'
            ];
            const filtered = {};
            for (const key of Object.keys(updates)) {
                if (allowedFields.includes(key)) {
                    filtered[key] = updates[key];
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
