// Game Sync — Save/Load character data to Supabase + Realtime Presence
import { supabase, isOfflineMode, localDb } from './SupabaseClient.js';

let presenceChannel = null;
let autoSaveInterval = null;
let onlinePlayersCallback = null;
let presenceUpdateInterval = null;
let mockPlayers = [];

// ============ Character CRUD ============
export async function loadCharacter(userId) {
    if (isOfflineMode || !supabase) {
        const char = localDb.get(`char_${userId}`);
        if (char) return char;
        return await createCharacter(userId);
    }

    const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code === 'PGRST116') {
        // No character found, create one
        return await createCharacter(userId);
    }
    if (error) throw error;
    return data;
}

export async function createCharacter(userId) {
    const charData = {
        id: userId.startsWith('local_') || userId.startsWith('guest_') ? userId : 'char_' + Math.random().toString(36).substring(2, 10),
        user_id: userId,
        name: userId.startsWith('guest_') ? 'Guest' : 'Novice',
        level: 1,
        exp: 0,
        hp: 100,
        max_hp: 100,
        sp: 50,
        max_sp: 50,
        atk: 10,
        def: 5,
        gold: 0,
        total_kills: 0,
        play_time: 0,
        last_map: 'prontera_field',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (isOfflineMode || !supabase) {
        localDb.set(`char_${userId}`, charData);
        // Update local leaderboard
        updateLocalLeaderboard(charData);
        return charData;
    }

    const { data, error } = await supabase
        .from('characters')
        .insert(charData)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function saveCharacter(characterId, updates) {
    if (isOfflineMode || !supabase) {
        // CharacterId is activeUserId in offline mode
        const userId = characterId;
        const char = localDb.get(`char_${userId}`);
        if (char) {
            const merged = { ...char, ...updates, updated_at: new Date().toISOString() };
            localDb.set(`char_${userId}`, merged);
            updateLocalLeaderboard(merged);
        }
        return;
    }

    const { error } = await supabase
        .from('characters')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', characterId);

    if (error) console.error('Save error:', error);
}

function updateLocalLeaderboard(char) {
    const lb = localDb.get('leaderboard') || [];
    const existingIndex = lb.findIndex(e => e.name === char.name);
    const entry = {
        name: char.name,
        level: char.level,
        total_kills: char.total_kills,
        profiles: { username: char.name }
    };

    if (existingIndex >= 0) {
        lb[existingIndex] = entry;
    } else {
        lb.push(entry);
    }

    // Sort and cap
    lb.sort((a, b) => b.level - a.level || b.total_kills - a.total_kills);
    localDb.set('leaderboard', lb.slice(0, 10));
}

// ============ Inventory ============
export async function loadInventory(characterId) {
    if (isOfflineMode || !supabase) {
        return localDb.get(`inventory_${characterId}`) || [];
    }

    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('character_id', characterId);

    if (error) throw error;
    return data || [];
}

export async function saveInventoryItem(characterId, itemName, itemType, quantity, stats = {}) {
    if (isOfflineMode || !supabase) {
        const inv = localDb.get(`inventory_${characterId}`) || [];
        const existing = inv.find(i => i.item_name === itemName);
        if (existing) {
            existing.quantity += quantity;
        } else {
            inv.push({
                id: 'inv_' + Math.random().toString(36).substring(2, 10),
                character_id: characterId,
                item_name: itemName,
                item_type: itemType,
                quantity,
                stats
            });
        }
        localDb.set(`inventory_${characterId}`, inv);
        return;
    }

    // Check if item already exists
    const { data: existing } = await supabase
        .from('inventory')
        .select('*')
        .eq('character_id', characterId)
        .eq('item_name', itemName)
        .single();

    if (existing) {
        await supabase
            .from('inventory')
            .update({ quantity: existing.quantity + quantity })
            .eq('id', existing.id);
    } else {
        await supabase
            .from('inventory')
            .insert({ character_id: characterId, item_name: itemName, item_type: itemType, quantity, stats });
    }
}

// ============ Leaderboard ============
export async function fetchLeaderboard() {
    if (isOfflineMode || !supabase) {
        // Generate some default high scores if leaderboard is empty
        let lb = localDb.get('leaderboard');
        if (!lb || lb.length === 0) {
            lb = [
                { name: 'Lord_Knight', level: 99, total_kills: 9999, profiles: { username: 'Ragnarok' } },
                { name: 'Sniper_Alice', level: 85, total_kills: 4521, profiles: { username: 'ArcherGuy' } },
                { name: 'High_Priest', level: 76, total_kills: 1205, profiles: { username: 'Support' } },
                { name: 'Assassin_Cross', level: 60, total_kills: 887, profiles: { username: 'Katars' } },
            ];
            localDb.set('leaderboard', lb);
        }
        return lb;
    }

    const { data } = await supabase
        .from('characters')
        .select('name, level, total_kills, user_id, profiles(username)')
        .order('level', { ascending: false })
        .order('total_kills', { ascending: false })
        .limit(20);

    return data || [];
}

// ============ Realtime Presence ============
export function joinPresence(userId, username, level, onPlayersUpdate) {
    onlinePlayersCallback = onPlayersUpdate;

    if (isOfflineMode || !supabase) {
        // Simulate real online players
        const names = ['XyzRef', 'PoringsLayer', 'PoringHunter', 'MerchantSatoshi', 'WarlockZee', 'SniperSky'];
        mockPlayers = [
            { userId: 'player_me', username, level }
        ];

        // Pick 2-4 random initial mock online players
        const activeCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < activeCount; i++) {
            const idx = Math.floor(Math.random() * names.length);
            const name = names.splice(idx, 1)[0];
            mockPlayers.push({
                userId: 'player_' + name.toLowerCase(),
                username: name,
                level: Math.floor(level + (Math.random() - 0.2) * 5)
            });
        }

        if (onlinePlayersCallback) onlinePlayersCallback(mockPlayers);

        // Periodic simulation (join/leave/level up)
        presenceUpdateInterval = setInterval(() => {
            // 20% chance to level up someone
            if (Math.random() < 0.2 && mockPlayers.length > 1) {
                const actorIdx = 1 + Math.floor(Math.random() * (mockPlayers.length - 1));
                mockPlayers[actorIdx].level++;
            }

            // 10% chance to leave
            if (mockPlayers.length > 2 && Math.random() < 0.1) {
                const leaveIdx = 1 + Math.floor(Math.random() * (mockPlayers.length - 1));
                mockPlayers.splice(leaveIdx, 1);
            }

            // 10% chance to join
            if (mockPlayers.length < 5 && Math.random() < 0.1 && names.length > 0) {
                const name = names.shift();
                mockPlayers.push({
                    userId: 'player_' + name.toLowerCase(),
                    username: name,
                    level: Math.max(1, Math.floor(level + (Math.random() - 0.2) * 4))
                });
            }

            if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
        }, 10000);

        return;
    }

    presenceChannel = supabase.channel('online-players', {
        config: { presence: { key: userId } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const players = [];
            for (const [key, values] of Object.entries(state)) {
                if (values.length > 0) {
                    players.push({
                        userId: key,
                        username: values[0].username,
                        level: values[0].level
                    });
                }
            }
            if (onlinePlayersCallback) onlinePlayersCallback(players);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({ username, level });
            }
        });
}

export function updatePresence(level) {
    if (isOfflineMode || !supabase) {
        const me = mockPlayers.find(p => p.userId === 'player_me');
        if (me) me.level = level;
        if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
        return;
    }

    if (presenceChannel) {
        presenceChannel.track({ level });
    }
}

export function leavePresence() {
    if (presenceUpdateInterval) {
        clearInterval(presenceUpdateInterval);
        presenceUpdateInterval = null;
    }

    if (presenceChannel) {
        presenceChannel.unsubscribe();
        presenceChannel = null;
    }
}

// ============ Auto-Save ============
export function startAutoSave(getStateCallback, intervalMs = 15000) {
    stopAutoSave();
    autoSaveInterval = setInterval(async () => {
        const state = getStateCallback();
        if (state && state.characterId) {
            await saveCharacter(state.characterId, state.updates);
        }
    }, intervalMs);
}

export function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

