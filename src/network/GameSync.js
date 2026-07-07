// Game Sync — Save/Load character data to Supabase + Realtime Presence
import { supabase, isOfflineMode, localDb } from './SupabaseClient.js';

let presenceChannel = null;
let autoSaveInterval = null;
let onlinePlayersCallback = null;
let presenceUpdateInterval = null;
let mockPlayers = [];
let channelSubscribed = false;
let chatCallback = null;

// Track active player info for presence updating
let currentUserId = null;
let currentUsername = 'Adventurer';
let currentLevel = 1;

// ============ Character CRUD ============
export async function loadCharacter(userId) {
    if (isOfflineMode || !supabase || userId.startsWith('guest_') || userId.startsWith('local_')) {
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

    if (isOfflineMode || !supabase || userId.startsWith('guest_') || userId.startsWith('local_')) {
        localDb.set(`char_${userId}`, charData);
        // Update local leaderboard
        updateLocalLeaderboard(charData);
        // Give starting Sword
        await saveInventoryItem(charData.id, 'Sword', 'weapon', 1, { equipped: true });
        return charData;
    }

    const { data, error } = await supabase
        .from('characters')
        .insert(charData)
        .select()
        .single();

    if (error) throw error;

    // Give starting Sword
    await saveInventoryItem(data.id, 'Sword', 'weapon', 1, { equipped: true });
    return data;
}

export async function saveCharacter(characterId, updates) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        // CharacterId is activeUserId in offline mode or guest mode
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
        gold: char.gold || 0,
        play_time: char.play_time || 0,
        profiles: { username: char.name }
    };

    if (existingIndex >= 0) {
        lb[existingIndex] = entry;
    } else {
        lb.push(entry);
    }

    // Sort by level default and cap to 20 inside localdb representation
    lb.sort((a, b) => b.level - a.level || b.total_kills - a.total_kills);
    localDb.set('leaderboard', lb.slice(0, 20));
}

// ============ Inventory ============
export async function loadInventory(characterId) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
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
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        const inv = localDb.get(`inventory_${characterId}`) || [];
        const existing = inv.find(i => i.item_name === itemName);
        if (existing) {
            existing.quantity += quantity;
            if (existing.quantity <= 0) {
                const idx = inv.indexOf(existing);
                inv.splice(idx, 1);
            }
        } else if (quantity > 0) {
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
        const newQty = existing.quantity + quantity;
        if (newQty <= 0) {
            await supabase
                .from('inventory')
                .delete()
                .eq('id', existing.id);
        } else {
            await supabase
                .from('inventory')
                .update({ quantity: newQty })
                .eq('id', existing.id);
        }
    } else if (quantity > 0) {
        await supabase
            .from('inventory')
            .insert({ character_id: characterId, item_name: itemName, item_type: itemType, quantity, stats });
    }
}

export async function updateInventoryItemStats(characterId, itemName, stats) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        const inv = localDb.get(`inventory_${characterId}`) || [];
        const existing = inv.find(i => i.item_name === itemName);
        if (existing) {
            existing.stats = stats;
            localDb.set(`inventory_${characterId}`, inv);
        }
        return;
    }

    await supabase
        .from('inventory')
        .update({ stats })
        .eq('character_id', characterId)
        .eq('item_name', itemName);
}

// ============ Leaderboard ============
export async function fetchLeaderboard(category = 'level') {
    if (isOfflineMode || !supabase) {
        // Generate some default high scores if leaderboard is empty
        let lb = localDb.get('leaderboard');
        if (!lb || lb.length === 0) {
            lb = [
                { name: 'Lord_Knight', level: 99, total_kills: 9999, gold: 5000000, play_time: 154800, profiles: { username: 'Ragnarok' } },
                { name: 'Sniper_Alice', level: 85, total_kills: 4521, gold: 1200000, play_time: 75600, profiles: { username: 'ArcherGuy' } },
                { name: 'High_Priest', level: 76, total_kills: 1205, gold: 850000, play_time: 32400, profiles: { username: 'Support' } },
                { name: 'Assassin_Cross', level: 60, total_kills: 887, gold: 350000, play_time: 18000, profiles: { username: 'Katars' } },
            ];
            localDb.set('leaderboard', lb);
        }

        // Sort dynamically based on selected category
        const sorted = [...lb];
        if (category === 'gold') {
            sorted.sort((a, b) => (b.gold ?? 0) - (a.gold ?? 0));
        } else if (category === 'kills') {
            sorted.sort((a, b) => (b.total_kills ?? 0) - (a.total_kills ?? 0));
        } else if (category === 'playtime') {
            sorted.sort((a, b) => (b.play_time ?? 0) - (a.play_time ?? 0));
        } else {
            sorted.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.total_kills ?? 0) - (a.total_kills ?? 0));
        }
        return sorted.slice(0, 20);
    }

    let selectStr = 'name, level, total_kills, gold, play_time, user_id, profiles(username)';
    let query = supabase.from('characters').select(selectStr);

    if (category === 'gold') {
        query = query.order('gold', { ascending: false });
    } else if (category === 'kills') {
        query = query.order('total_kills', { ascending: false });
    } else if (category === 'playtime') {
        query = query.order('play_time', { ascending: false });
    } else {
        query = query.order('level', { ascending: false }).order('total_kills', { ascending: false });
    }

    let { data, error } = await query.limit(20);
    if (error) {
        console.warn('[Zolos] fetchLeaderboard error with profiles relation, retrying without profiles:', error.message);
        // Fallback when database has relationship key mapping cache issue
        let fallbackQuery = supabase
            .from('characters')
            .select('name, level, total_kills, gold, play_time, user_id');
        if (category === 'gold') {
            fallbackQuery = fallbackQuery.order('gold', { ascending: false });
        } else if (category === 'kills') {
            fallbackQuery = fallbackQuery.order('total_kills', { ascending: false });
        } else if (category === 'playtime') {
            fallbackQuery = fallbackQuery.order('play_time', { ascending: false });
        } else {
            fallbackQuery = fallbackQuery.order('level', { ascending: false }).order('total_kills', { ascending: false });
        }
        const res = await fallbackQuery.limit(20);
        data = res.data;
    }
    return data || [];
}

// ============ Realtime Presence & Broadcast ============
export function joinPresence(userId, username, level, onPlayersUpdate, onPlayerPositionUpdate, onChatCallback) {
    onlinePlayersCallback = onPlayersUpdate;
    chatCallback = onChatCallback;
    channelSubscribed = false;

    // Store player info for later use in updatePresence/broadcast
    currentUserId = userId;
    currentUsername = username;
    currentLevel = level;

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
                level: Math.floor(level + (Math.random() - 0.2) * 5),
                x: (Math.random() - 0.5) * 15,
                y: 0,
                z: (Math.random() - 0.5) * 15,
                rY: Math.random() * Math.PI * 2,
                state: 'idle'
            });
        }

        if (onlinePlayersCallback) onlinePlayersCallback(mockPlayers);
        if (onPlayerPositionUpdate) {
            mockPlayers.forEach(p => {
                if (p.userId !== 'player_me') onPlayerPositionUpdate(p);
            });
        }

        // Periodic simulation (join/leave/level up/wander)
        presenceUpdateInterval = setInterval(() => {
            // 20% chance to level up someone
            if (Math.random() < 0.2 && mockPlayers.length > 1) {
                const actorIdx = 1 + Math.floor(Math.random() * (mockPlayers.length - 1));
                mockPlayers[actorIdx].level++;
            }

            // 10% chance to leave
            if (mockPlayers.length > 2 && Math.random() < 0.1) {
                const leaveIdx = 1 + Math.floor(Math.random() * (mockPlayers.length - 1));
                const left = mockPlayers.splice(leaveIdx, 1)[0];
                // Notify via online players callback
                if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
            }

            // 10% chance to join
            if (mockPlayers.length < 5 && Math.random() < 0.1 && names.length > 0) {
                const name = names.shift();
                const newPlayer = {
                    userId: 'player_' + name.toLowerCase(),
                    username: name,
                    level: Math.max(1, Math.floor(level + (Math.random() - 0.2) * 4)),
                    x: (Math.random() - 0.5) * 15,
                    y: 0,
                    z: (Math.random() - 0.5) * 15,
                    rY: Math.random() * Math.PI * 2,
                    state: 'idle'
                };
                mockPlayers.push(newPlayer);
                if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
                if (onPlayerPositionUpdate) onPlayerPositionUpdate(newPlayer);
            }

            // Simulate wandering movement for mock players
            mockPlayers.forEach((p, idx) => {
                if (p.userId === 'player_me') return;

                // Move slightly
                if (Math.random() < 0.4) {
                    p.state = Math.random() < 0.3 ? 'attacking' : 'walking';
                    p.x += (Math.random() - 0.5) * 2;
                    p.z += (Math.random() - 0.5) * 2;
                    p.rY = Math.random() * Math.PI * 2;
                } else {
                    p.state = 'idle';
                }

                if (onPlayerPositionUpdate) {
                    onPlayerPositionUpdate(p);
                }
            });

            if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
        }, 3000);

        // Simulation for chat messages in offline mode
        setInterval(() => {
            if (chatCallback && mockPlayers.length > 1) {
                const randomReplies = [
                    'สวัสดีครับทุกคน! 😃',
                    'ตีตัวอะไรกันอยู่หรอ?',
                    'มอนในวิกินี้เยอะจัดเลยแฮะ',
                    'บอส Ghostring โหดมากกก 😱',
                    'หาตี้แอดเพื่อนกันหน่อย 🤝',
                    'บอทฟาร์มชิวจัดๆ ⚡',
                    'มีใครขายดาบ rare ไหม?',
                    'เก็บเลเวลแป๊บนะค้าบ',
                    'วันนี้ดวงดีจัง ดรอปการ์ดรึยังนะ 🍀'
                ];
                // Select a writer that isn't player_me
                const candidates = mockPlayers.filter(p => p.userId !== 'player_me');
                if (candidates.length > 0) {
                    const sender = candidates[Math.floor(Math.random() * candidates.length)];
                    const msg = randomReplies[Math.floor(Math.random() * randomReplies.length)];
                    // Step 9: Use object format
                    chatCallback({ username: sender.username, message: msg });
                }
            }
        }, 12000 + Math.random() * 8000);

        return;
    }

    // ===== ONLINE MODE =====
    console.log('[Zolos] 🌐 Connecting to realtime channel... userId:', userId, 'username:', username);

    // Clean up any existing channel
    if (presenceChannel) {
        try {
            presenceChannel.unsubscribe();
        } catch (e) { /* ignore */ }
        presenceChannel = null;
    }

    presenceChannel = supabase.channel('online-players', {
        config: {
            presence: { key: userId },
            broadcast: { self: false, ack: false }
        }
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
            console.log('[Zolos] 👥 Presence sync — online players:', players.length, players.map(p => p.username));
            if (onlinePlayersCallback) onlinePlayersCallback(players);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('[Zolos] ➕ Player joined:', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('[Zolos] ➖ Player left:', key, leftPresences);
        })
        .on('broadcast', { event: 'pos' }, ({ payload }) => {
            if (onPlayerPositionUpdate && payload && payload.userId !== userId) {
                onPlayerPositionUpdate(payload);
            }
        })
        .on('broadcast', { event: 'chat' }, ({ payload }) => {
            // Step 5: Ensure consistent object format for chat messages
            if (chatCallback && payload) {
                chatCallback({ username: payload.username, message: payload.message });
            }
        })
        .subscribe(async (status, err) => {
            console.log('[Zolos] 📡 Channel status:', status, err ? 'Error: ' + err : '');
            if (status === 'SUBSCRIBED') {
                channelSubscribed = true;
                console.log('[Zolos] ✅ Successfully subscribed! Tracking presence...');
                try {
                    await presenceChannel.track({
                        username: username,
                        level: level,
                        online_at: new Date().toISOString()
                    });
                    console.log('[Zolos] ✅ Presence tracked successfully for:', username);
                } catch (trackErr) {
                    console.error('[Zolos] ❌ Failed to track presence:', trackErr);
                }
            } else if (status === 'CHANNEL_ERROR') {
                channelSubscribed = false;
                console.error('[Zolos] ❌ Channel error:', err);
            } else if (status === 'TIMED_OUT') {
                channelSubscribed = false;
                console.error('[Zolos] ⏱️ Channel timed out, retrying...');
                // Retry after 3 seconds
                setTimeout(() => {
                    if (presenceChannel) {
                        presenceChannel.subscribe();
                    }
                }, 3000);
            }
        });
}

export function broadcastPosition(userId, username, level, position, rotationY, state, appearance) {
    if (isOfflineMode || !supabase || !presenceChannel || !channelSubscribed) return;
    const payload = { userId, username, level, x: position.x, y: position.y, z: position.z, rY: rotationY, state };
    if (appearance) payload.appearance = appearance;
    presenceChannel.send({
        type: 'broadcast',
        event: 'pos',
        payload
    });
}

export function broadcastChat(userId, username, level, message) {
    if (isOfflineMode || !supabase) {
        // Step 5: Echo back local message using object format
        if (chatCallback) {
            chatCallback({ username, message });
        }
        // Simulation for a quick response
        setTimeout(() => {
            if (chatCallback && mockPlayers.length > 1) {
                const replies = [
                    'โอเคเลยครับ!',
                    'สุดยอดฮะ 👍',
                    'ฮ่าๆๆๆ เก่งมาก',
                    'สู้ๆ นะ',
                    'เวลไปยาวๆ',
                    'แอดเพื่อนผมหน่อยย'
                ];
                const candidates = mockPlayers.filter(p => p.userId !== 'player_me');
                if (candidates.length > 0) {
                    const sender = candidates[Math.floor(Math.random() * candidates.length)];
                    const reply = replies[Math.floor(Math.random() * replies.length)];
                    // Step 5: Use object format
                    chatCallback({ username: sender.username, message: reply });
                }
            }
        }, 1500 + Math.random() * 1500);
        return;
    }

    if (presenceChannel && channelSubscribed) {
        presenceChannel.send({
            type: 'broadcast',
            event: 'chat',
            payload: { userId, username, level, message }
        });
    }
    // Step 5: Echo back local message immediately using object format
    if (chatCallback) {
        chatCallback({ username, message });
    }
}

export function updatePresence(level, newUsername = null) {
    currentLevel = level;
    if (newUsername) {
        currentUsername = newUsername;
    }

    if (isOfflineMode || !supabase) {
        const me = mockPlayers.find(p => p.userId === 'player_me');
        if (me) {
            me.level = level;
            if (newUsername) me.username = newUsername;
        }
        if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
        return;
    }

    if (presenceChannel && channelSubscribed) {
        presenceChannel.track({
            username: currentUsername,
            level: currentLevel,
            online_at: new Date().toISOString()
        });
    }
}

export function leavePresence() {
    channelSubscribed = false;

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

// ============ P2P MARKETPLACE ============

// Initialize local marketplace listings if empty
function initLocalMarketplace() {
    let listings = localDb.get('marketplace_listings');
    if (!listings) {
        localDb.set('marketplace_listings', []);
        listings = [];
    }
    return listings;
}

export async function fetchMarketPriceStats(itemName) {
    if (isOfflineMode || !supabase) {
        const history = localDb.get('market_history') || [];
        const itemHistory = history.filter(h => h.item_name === itemName);
        if (itemHistory.length === 0) return null;
        const sum = itemHistory.reduce((acc, curr) => acc + (curr.price / curr.quantity), 0);
        return { avgPrice: Math.round(sum / itemHistory.length) };
    }

    try {
        const { data, error } = await supabase
            .from('market_history')
            .select('price, quantity')
            .eq('item_name', itemName)
            .order('sold_at', { ascending: false })
            .limit(10);

        if (error || !data || data.length === 0) return null;
        const sum = data.reduce((acc, curr) => acc + (curr.price / curr.quantity), 0);
        return { avgPrice: Math.round(sum / data.length) };
    } catch (err) {
        return null;
    }
}

export async function fetchMarketListings() {
    if (isOfflineMode || !supabase) {
        return initLocalMarketplace();
    }

    // Always include local fallback listings (items that failed Supabase insert due to RLS etc.)
    const localListings = localDb.get('marketplace_listings') || [];

    try {
        const { data, error } = await supabase
            .from('marketplace')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[Zolos] Supabase marketplace query failed (table might not exist), falling back to Local/Mock:', error.message);
            return localListings.length > 0 ? localListings : initLocalMarketplace();
        }
        // Merge: Supabase results + local fallback listings (deduped by id)
        const remoteIds = new Set((data || []).map(d => d.id));
        const uniqueLocal = localListings.filter(l => !remoteIds.has(l.id));
        return [...(data || []), ...uniqueLocal];
    } catch (err) {
        console.warn('[Zolos] Catch error on fetching marketplace, falling back:', err.message);
        return localListings.length > 0 ? localListings : initLocalMarketplace();
    }
}



export async function listMarketItem(sellerCharId, sellerName, itemName, itemType, quantity, price, stats = {}) {
    const listingId = 'listing_' + Math.random().toString(36).substring(2, 10);
    const itemId = 'item_' + Math.random().toString(36).substring(2, 12);
    const listingData = {
        id: listingId,
        item_id: itemId,
        seller_id: sellerCharId,
        seller_name: sellerName,
        item_name: itemName,
        item_type: itemType,
        quantity,
        price,
        stats,
        created_at: new Date().toISOString()
    };

    if (isOfflineMode || !supabase || sellerCharId.startsWith('guest_') || sellerCharId.startsWith('local_')) {
        const listings = initLocalMarketplace();
        listings.unshift(listingData);
        localDb.set('marketplace_listings', listings);
        return listingData;
    }

    try {
        // Get the authenticated user's UUID for seller_id (must match auth.uid() for RLS)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.error('[Zolos] No authenticated user — cannot list on marketplace');
            listingData._failed = true;
            return listingData;
        }

        // For Supabase, let DB generate UUID id; use auth.uid() as seller_id
        const supabaseData = {
            item_id: itemId,
            item_name: itemName,
            item_type: itemType,
            quantity,
            price,
            seller_id: user.id,   // auth.uid() UUID
            seller_name: sellerName,
            stats,
        };

        const { data, error } = await supabase
            .from('marketplace')
            .insert(supabaseData)
            .select()
            .single();

        if (error) {
            console.error('[Zolos] ❌ Supabase marketplace insert FAILED:', error.code, error.message);
            // Mark as failed so UI knows not to deduct inventory
            listingData._failed = true;
            const listings = initLocalMarketplace();
            listings.unshift(listingData);
            localDb.set('marketplace_listings', listings);
            return listingData;
        }
        console.log('[Zolos] ✅ Marketplace listing created on Supabase:', data.id);
        return data;
    } catch (err) {
        console.error('[Zolos] ❌ Catch error on listing:', err.message);
        listingData._failed = true;
        const listings = initLocalMarketplace();
        listings.unshift(listingData);
        localDb.set('marketplace_listings', listings);
        return listingData;
    }
}

export async function cancelMarketListing(listingId, characterId) {
    let listing = null;
    let isLocalListing = false;

    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_') || listingId.startsWith('mock_') || listingId.startsWith('listing_')) {
        isLocalListing = true;
    }

    if (isLocalListing) {
        const listings = initLocalMarketplace();
        const idx = listings.findIndex(l => l.id === listingId);
        if (idx >= 0) {
            listing = listings[idx];
            listings.splice(idx, 1);
            localDb.set('marketplace_listings', listings);
        }
    } else {
        try {
            // Retrieve first
            const { data, error: fetchErr } = await supabase
                .from('marketplace')
                .select('*')
                .eq('id', listingId)
                .single();

            if (!fetchErr && data) {
                // Delete with select to verify actual row removal
                const { data: delData, error: deleteErr } = await supabase
                    .from('marketplace')
                    .delete()
                    .eq('id', listingId)
                    .select();

                if (deleteErr) throw deleteErr;
                if (!delData || delData.length === 0) {
                    throw new Error('Deletion failed (blocked by RLS or already deleted)');
                }
                listing = delData[0];
            }
        } catch (err) {
            console.warn('[Zolos] Supabase cancel failed, retrying locally:', err.message);
            const listings = initLocalMarketplace();
            const idx = listings.findIndex(l => l.id === listingId);
            if (idx >= 0) {
                listing = listings[idx];
                listings.splice(idx, 1);
                localDb.set('marketplace_listings', listings);
            }
        }
    }

    if (listing) {
        // Return item to seller
        await saveInventoryItem(characterId, listing.item_name, listing.item_type, listing.quantity, listing.stats);
        return true;
    }
    return false;
}

export async function buyMarketItem(listingId, buyerCharId, buyerName) {
    let listing = null;
    let isLocalListing = false;

    if (isOfflineMode || !supabase || buyerCharId.startsWith('guest_') || buyerCharId.startsWith('local_') || listingId.startsWith('mock_') || listingId.startsWith('listing_')) {
        isLocalListing = true;
    }

    if (isLocalListing) {
        const listings = initLocalMarketplace();
        const idx = listings.findIndex(l => l.id === listingId);
        if (idx >= 0) {
            listing = listings[idx];
            listings.splice(idx, 1);
            localDb.set('marketplace_listings', listings);
        }
    } else {
        try {
            // Retrieve first
            const { data, error: fetchErr } = await supabase
                .from('marketplace')
                .select('*')
                .eq('id', listingId)
                .single();

            if (!fetchErr && data) {
                // Delete with select to verify actual row removal
                const { data: delData, error: deleteErr } = await supabase
                    .from('marketplace')
                    .delete()
                    .eq('id', listingId)
                    .select();

                if (deleteErr) throw deleteErr;
                if (!delData || delData.length === 0) {
                    // RLS blocked the delete or listing was already bought by someone else
                    console.error('[Zolos] ❌ Buy failed: listing could not be deleted (RLS or race condition)');
                    return false;
                }
                listing = delData[0];
                console.log('[Zolos] ✅ Marketplace listing purchased from Supabase:', listing.id);
            }
        } catch (err) {
            // Do NOT fall back to local — the listing still exists on the server
            // Returning false lets the UI refund the buyer's gold
            console.error('[Zolos] ❌ Supabase buy failed:', err.message);
            return false;
        }
    }

    if (!listing) return false;

    // Record history
    if (isOfflineMode || !supabase) {
        const history = localDb.get('market_history') || [];
        history.push({ item_name: listing.item_name, quantity: listing.quantity, price: listing.price, sold_at: new Date().toISOString() });
        localDb.set('market_history', history);
    } else {
        try {
            await supabase.from('market_history').insert({
                item_name: listing.item_name,
                quantity: listing.quantity,
                price: listing.price
            });
        } catch (e) {
            console.warn('[Zolos] Failed to save market history:', e.message);
        }
    }

    // 1. Add item to buyer
    await saveInventoryItem(buyerCharId, listing.item_name, listing.item_type, listing.quantity, listing.stats);

    // 2. Give gold to seller
    const sellerId = listing.seller_id;
    const price = listing.price;

    if (sellerId.startsWith('guest_') || sellerId.startsWith('local_')) {
        // Seller is local/guest player (in same browser / offline db)
        const cachedChar = localDb.get(`char_${sellerId}`);
        if (cachedChar) {
            cachedChar.gold = (cachedChar.gold || 0) + price;
            localDb.set(`char_${sellerId}`, cachedChar);
            updateLocalLeaderboard(cachedChar);
        }
    } else if (!sellerId.startsWith('player_')) { // Not a mock player
        // Online seller
        try {
            // Fetch current seller character by user_id since listing.seller_id is now the user's UUID
            const { data: charData } = await supabase
                .from('characters')
                .select('gold')
                .eq('user_id', sellerId)
                .single();

            if (charData) {
                const newGold = (charData.gold || 0) + price;
                await supabase
                    .from('characters')
                    .update({ gold: newGold })
                    .eq('user_id', sellerId);
            }
        } catch (err) {
            console.warn('[Zolos] Failed to pay online seller (RLS restriction probably):', err.message);
        }
    }

    // 3. Broadcast system message or chat notification in presence if seller is online
    if (presenceChannel && channelSubscribed) {
        presenceChannel.send({
            type: 'broadcast',
            event: 'chat',
            payload: {
                userId: 'system',
                username: '📢 ระบบตลาด',
                level: 99,
                message: `ผู้เล่น [${buyerName}] ได้สั่งซื้อ [${listing.item_name}] x${listing.quantity} จาก [${listing.seller_name}] ในราคา ${listing.price} Zeny!`
            }
        });
    }

    return listing;
}


