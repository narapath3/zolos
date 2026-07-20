// Game Sync — Save/Load character data to Supabase + Realtime via Socket.io
import { supabase, isOfflineMode, localDb, getDeterministicGuestName, isPlaceholderName, saveActiveSession } from './SupabaseClient.js';
import { getSocket, isSocketConnected, isSocketMode, connectSocket, disconnectSocket } from './SocketClient.js';
export { getDeterministicGuestName, isPlaceholderName };

let autoSaveInterval = null;
let onlinePlayersCallback = null;
let presenceUpdateInterval = null;
let mockPlayers = [];
let socketListenersAttached = false;
let chatCallback = null;

// Track active player info for presence updating
let currentUserId = null;
let currentUsername = 'Adventurer';
let currentLevel = 1;

// ============ Character CRUD ============
export async function loadCharacter(userId) {
    if (isOfflineMode || !supabase || userId.startsWith('guest_') || userId.startsWith('local_')) {
        let char = localDb.get(`char_${userId}`);
        if (char) {
            if (isPlaceholderName(char.name)) {
                const profile = localDb.get(`profile_${userId}`);
                if (profile && profile.username && !isPlaceholderName(profile.username)) {
                    char.name = profile.username;
                } else {
                    char.name = getDeterministicGuestName(userId);
                    localDb.set(`profile_${userId}`, { id: userId, username: char.name, created_at: new Date().toISOString() });
                }
                localDb.set(`char_${userId}`, char);
                updateLocalLeaderboard(char);
            }
            return char;
        }
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

    let char = data;
    // Part 2.2: Profile name always takes priority over character name
    try {
        const { getProfile, supabase: supabaseClient } = await import('./SupabaseClient.js');
        const profile = await getProfile(userId);
        if (profile && profile.username && !isPlaceholderName(profile.username)) {
            char.name = profile.username;
            // Sync character table if it was stale
            if (data.name !== profile.username) {
                await supabase.from('characters').update({ name: char.name }).eq('id', char.id);
            }
        } else {
            let isAnon = false;
            if (supabaseClient) {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user && user.is_anonymous) isAnon = true;
            }
            if (userId.startsWith('guest_') || isAnon) {
                char.name = getDeterministicGuestName(userId);
                // Ensure profile exists for guests
                await supabase.from('profiles').upsert({ id: userId, username: char.name });
                if (data.name !== char.name) {
                    await supabase.from('characters').update({ name: char.name }).eq('id', char.id);
                }
            }
        }
    } catch (e) {
        console.warn('Failed to update character name from profile on load:', e);
    }
    return char;
}

// Read-only fetch of another player's character for the profile popup. Unlike
// loadCharacter this never creates a row. characters is publicly readable
// (RLS SELECT USING true), so any player's stats + equipped gear are viewable.
export async function fetchPublicCharacter(userId) {
    if (!supabase || isOfflineMode || !userId || userId.startsWith('guest_') || userId.startsWith('local_')) return null;
    try {
        // Try fetching all fields first. If it fails (likely due to missing columns in DB), 
        // fallback to a safer set of core fields.
        const allFields = 'name, level, exp, hp, max_hp, sp, max_sp, atk, def, gold, zol, total_kills, play_time, weapon, hat, glasses, gender, last_map, job, str, agi, int, body_color, hair_color, pants_color, shield, armor, title';
        const { data, error } = await supabase
            .from('characters')
            .select(allFields)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (error) {
            console.warn('[Zolos] Failed to fetch full character data, retrying with core fields:', error.message);
            const coreFields = 'name, level, exp, hp, max_hp, sp, max_sp, atk, def, gold, zol, total_kills, play_time, weapon, hat, glasses, gender, last_map, job, body_color, hair_color, pants_color';
            const { data: coreData, error: coreError } = await supabase
                .from('characters')
                .select(coreFields)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (coreError) return null;
            return coreData;
        }
        return data;
    } catch (e) {
        return null;
    }
}

export async function createCharacter(userId) {
    let name = getDeterministicGuestName(userId);
    let gender = 'male';
    try {
        const { getProfile, supabase: supabaseClient } = await import('./SupabaseClient.js');
        const profile = await getProfile(userId);
        if (profile && profile.gender) gender = profile.gender;
        if (profile && profile.username && !isPlaceholderName(profile.username)) {
            name = profile.username;
        } else {
            let isAnon = false;
            if (supabaseClient) {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user && user.is_anonymous) isAnon = true;
            }
            if (userId.startsWith('guest_') || isAnon) {
                name = getDeterministicGuestName(userId);
                if (supabaseClient && !isOfflineMode) {
                    await supabaseClient.from('profiles').upsert({ id: userId, username: name });
                }
            }
        }
    } catch (e) {
        console.warn("Failed to get profile for name, using fallback:", e);
        name = getDeterministicGuestName(userId);
        try {
            const { supabase: supabaseClient } = await import('./SupabaseClient.js');
            if (supabaseClient && !isOfflineMode) {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user && user.is_anonymous) {
                    name = getDeterministicGuestName(userId);
                    await supabaseClient.from('profiles').upsert({ id: userId, username: name });
                }
            }
        } catch (innerErr) {
            // Ignore and use default
        }
    }

    const charData = {
        id: userId.startsWith('local_') || userId.startsWith('guest_') ? userId : 'char_' + Math.random().toString(36).substring(2, 10),
        user_id: userId,
        name: name,
        gender: gender,
        level: 1,
        exp: 0,
        hp: 100,
        max_hp: 100,
        sp: 50,
        max_sp: 50,
        atk: 10,
        def: 5,
        gold: 0,
        zol: 0,
        total_kills: 0,
        play_time: 0,
        last_map: 'prontera_field',
        // Game settings defaults
        sound_enabled: true,
        graphics_quality: 'medium',
        fps_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Save default settings to localStorage
    try {
        const settingsKey = `zolos_settings_${charData.id}`;
        if (!localStorage.getItem(settingsKey)) {
            localStorage.setItem(settingsKey, JSON.stringify({
                sound_enabled: charData.sound_enabled,
                graphics_quality: charData.graphics_quality,
                fps_enabled: charData.fps_enabled
            }));
        }
    } catch (e) { /* localStorage unavailable */ }

    if (isOfflineMode || !supabase || userId.startsWith('guest_') || userId.startsWith('local_')) {
        localDb.set(`char_${userId}`, charData);
        // Update local leaderboard
        updateLocalLeaderboard(charData);
        // Give starting Sword
        await saveInventoryItem(charData.id, 'Sword', 'weapon', 1, { equipped: true });
        return charData;
    }

    // Strip client-side settings fields that don't exist in the DB schema
    const dbCharData = { ...charData };
    delete dbCharData.fps_enabled;
    delete dbCharData.sound_enabled;
    delete dbCharData.graphics_quality;

    const { data, error } = await supabase
        .from('characters')
        .insert(dbCharData)
        .select()
        .single();

    if (error) throw error;

    // Give starting Sword
    await saveInventoryItem(data.id, 'Sword', 'weapon', 1, { equipped: true });
    return data;
}

export async function saveCharacter(characterId, updates) {
    // Persist game settings to localStorage first so it applies to both online and offline modes
    try {
        const settingsKey = `zolos_settings_${characterId}`;
        const existingSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
        if (updates.fps_enabled !== undefined) existingSettings.fps_enabled = updates.fps_enabled;
        if (updates.sound_enabled !== undefined) existingSettings.sound_enabled = updates.sound_enabled;
        if (updates.graphics_quality !== undefined) existingSettings.graphics_quality = updates.graphics_quality;
        localStorage.setItem(settingsKey, JSON.stringify(existingSettings));
    } catch (e) { /* localStorage unavailable */ }

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

    // Strip client-side settings fields that don't exist in the DB schema
    // to prevent PGRST204 errors that would abort the entire save
    const dbUpdates = { ...updates };

    // Core stats (always in DB)
    // Only include fields that actually exist in the DB schema
    const allowedFields = [
        'name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp',
        'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'last_map',
        'job',
        'weapon', 'hat', 'glasses', 'body_color', 'hair_color', 'pants_color', 'gender',
        'sound_enabled', 'graphics_quality', 'fps_enabled'
    ];

    // Optional appearance fields (may not be in DB yet)
    // We only include these if they are present in the updates object
    const appearanceFields = [
        'weapon', 'hat', 'glasses', 'body_color', 'hair_color', 'pants_color', 'gender'
    ];

    // Filter the updates to only include fields we know are safe or intended for DB
    const filteredUpdates = {};
    for (const key of Object.keys(dbUpdates)) {
        if (allowedFields.includes(key) || appearanceFields.includes(key)) {
            let val = dbUpdates[key];
            // Part 5.3: Client-side stat validation/clamping
            if (key === 'level') val = Math.max(1, Math.min(999, parseInt(val) || 1));
            if (key === 'gold') val = Math.max(0, Math.min(2147483647, parseInt(val) || 0));
            if (key === 'atk') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
            if (key === 'def') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
            
            filteredUpdates[key] = val;
        }
    }

    console.log(`[Zolos] 💾 Attempting DB save for character ${characterId}. Fields:`, Object.keys(filteredUpdates));
    const { data, error, status } = await supabase
        .from('characters')
        .update({ ...filteredUpdates, updated_at: new Date().toISOString() })
        .eq('id', characterId)
        .select();

    if (error) {
        console.error(`[Zolos] ❌ Save error (Status ${status}):`, error.message, error.details, error.hint);
        if (error.code === '42501') {
            console.error('[Zolos] 🔐 RLS Policy violation: You do not have permission to update this character.');
        }
        // Fallback for unmigrated database: retry saving only the core 100% supported fields
        if (error.code === 'PGRST204') {
            console.warn('[Zolos] Database schema mismatch (PGRST204). Retrying save with core columns only...');
            const coreFields = [
                'name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp',
                'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'last_map'
            ];
            const coreUpdates = {};
            for (const key of coreFields) {
                if (filteredUpdates[key] !== undefined) {
                    coreUpdates[key] = filteredUpdates[key];
                }
            }
            const { error: retryError } = await supabase
                .from('characters')
                .update({ ...coreUpdates, updated_at: new Date().toISOString() })
                .eq('id', characterId);
            if (retryError) {
                console.error('[Zolos] Core retry save failure:', retryError);
            } else {
                console.log('[Zolos] ✅ Core retry save succeeded!');
            }
        }
    } else {
        if (data && data.length > 0) {
            console.log('[Zolos] ✅ Save successful! Rows affected:', data.length);
        } else {
            console.warn('[Zolos] ⚠️ Save returned no error, but 0 rows were updated. Check if characterId exists and matches user_id.');
        }
    }
}

/**
 * Save character data to Supabase using user_id instead of character row id.
 * This is necessary to satisfy RLS policies that check auth.uid() = user_id.
 * @param {string} userId - The Supabase auth user UUID
 * @param {Object} updates - Fields to update
 */
export async function saveCharacterByUserId(userId, updates) {
    // Persist game settings to localStorage first
    try {
        const settingsKey = `zolos_settings_${userId}`;
        const existingSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
        if (updates.fps_enabled !== undefined) existingSettings.fps_enabled = updates.fps_enabled;
        if (updates.sound_enabled !== undefined) existingSettings.sound_enabled = updates.sound_enabled;
        if (updates.graphics_quality !== undefined) existingSettings.graphics_quality = updates.graphics_quality;
        localStorage.setItem(settingsKey, JSON.stringify(existingSettings));

        // Also save to characterId key for backward compatibility/CharacterManager load logic
        const charId = updates.characterId || updates.id;
        if (charId) {
            localStorage.setItem(`zolos_settings_${charId}`, JSON.stringify(existingSettings));
        }
    } catch (e) { /* localStorage unavailable */ }

    if (isOfflineMode || !supabase || userId.startsWith('guest_') || userId.startsWith('local_')) {
        const char = localDb.get(`char_${userId}`);
        if (char) {
            const merged = { ...char, ...updates, updated_at: new Date().toISOString() };
            localDb.set(`char_${userId}`, merged);
            updateLocalLeaderboard(merged);
        }
        return;
    }

    // Only include fields that actually exist in the DB schema
    const allowedFields = [
        'name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp',
        'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'last_map',
        'job',
        'weapon', 'hat', 'glasses', 'body_color', 'hair_color', 'pants_color', 'gender',
        'sound_enabled', 'graphics_quality', 'fps_enabled'
    ];

    const filteredUpdates = {};
    for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
            let val = updates[key];
            // Part 5.3: Client-side stat validation/clamping
            if (key === 'level') val = Math.max(1, Math.min(999, parseInt(val) || 1));
            if (key === 'gold') val = Math.max(0, Math.min(2147483647, parseInt(val) || 0));
            if (key === 'atk') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
            if (key === 'def') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
            
            filteredUpdates[key] = val;
        }
    }

    console.log(`[Zolos] 💾 Saving by user_id ${userId}. Fields:`, Object.keys(filteredUpdates));
    console.log(`[Zolos] 📤 Supabase Update Payload:`, JSON.stringify(filteredUpdates));
    
    // Use basic update without .select() to avoid potential RLS read issues during update
    const { error, count } = await supabase
        .from('characters')
        .update({ ...filteredUpdates, updated_at: new Date().toISOString() }, { count: 'exact' })
        .eq('user_id', userId);

    if (error) {
        console.error('[Zolos] ❌ saveCharacterByUserId error:', error.message, error.details, error.hint);
    } else {
        if (count > 0) {
            console.log('[Zolos] ✅ saveCharacterByUserId successful! Rows affected:', count);
        } else {
            console.warn('[Zolos] ⚠️ saveCharacterByUserId: 0 rows updated. userId may not exist or RLS blocked the update.');
            
            // Fallback: try saving by characterId if user_id update affected 0 rows
            // This handles cases where user_id might be missing or incorrect in the state
            const charId = updates.characterId || updates.id;
            if (charId) {
                console.log(`[Zolos] 🔄 Retrying save by characterId: ${charId}`);
                await saveCharacter(charId, filteredUpdates);
            }
        }
    }
}

// ============ Daily Quests DB Sync (System Inventory Fallback) ============
export async function saveDailyQuests(characterId, questData) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        localDb.set(`daily_quests_${characterId}`, questData);
        return;
    }

    try {
        const { data: existing } = await supabase
            .from('inventory')
            .select('*')
            .eq('character_id', characterId)
            .eq('item_name', 'daily_quests')
            .eq('item_type', 'system')
            .maybeSingle();

        if (existing) {
            await supabase
                .from('inventory')
                .update({ stats: questData })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('inventory')
                .insert({
                    character_id: characterId,
                    item_name: 'daily_quests',
                    item_type: 'system',
                    quantity: 1,
                    stats: questData
                });
        }
    } catch (e) {
        console.error('[GameSync] Failed to save daily quests to DB:', e);
    }
}

export async function loadDailyQuests(characterId) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        return localDb.get(`daily_quests_${characterId}`);
    }

    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .eq('character_id', characterId)
            .eq('item_name', 'daily_quests')
            .eq('item_type', 'system')
            .maybeSingle();

        if (error) throw error;
        return data?.stats || null;
    } catch (e) {
        console.error('[GameSync] Failed to load daily quests from DB:', e);
        return null;
    }
}

// ============ Fishing Almanac DB Sync (System Inventory Fallback) ============
export async function saveFishingAlmanac(characterId, almanacData) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        localDb.set(`fishing_almanac_${characterId}`, almanacData);
        return;
    }
    try {
        const { data: existing } = await supabase
            .from('inventory')
            .select('id')
            .eq('character_id', characterId)
            .eq('item_name', 'fishing_almanac')
            .eq('item_type', 'system')
            .maybeSingle();

        if (existing) {
            await supabase.from('inventory').update({ stats: almanacData }).eq('id', existing.id);
        } else {
            await supabase.from('inventory').insert({
                character_id: characterId,
                item_name: 'fishing_almanac',
                item_type: 'system',
                quantity: 1,
                stats: almanacData
            });
        }
    } catch (e) {
        console.error('[GameSync] Failed to save fishing almanac to DB:', e);
    }
}

export async function loadFishingAlmanac(characterId) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        return localDb.get(`fishing_almanac_${characterId}`) || null;
    }
    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('stats')
            .eq('character_id', characterId)
            .eq('item_name', 'fishing_almanac')
            .eq('item_type', 'system')
            .maybeSingle();
        if (error) throw error;
        return data?.stats || null;
    } catch (e) {
        console.error('[GameSync] Failed to load fishing almanac from DB:', e);
        return null;
    }
}

// ============ Login Streak (Daily Rewards) ============
// Stored as a system inventory item, same pattern as the fishing almanac.
// Shape: { streak: number, lastClaim: 'YYYY-MM-DD' }
export async function saveLoginStreak(characterId, streakData) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        localDb.set(`login_streak_${characterId}`, streakData);
        return;
    }
    try {
        const { data: existing } = await supabase
            .from('inventory')
            .select('id')
            .eq('character_id', characterId)
            .eq('item_name', 'login_streak')
            .eq('item_type', 'system')
            .maybeSingle();

        if (existing) {
            await supabase.from('inventory').update({ stats: streakData }).eq('id', existing.id);
        } else {
            await supabase.from('inventory').insert({
                character_id: characterId,
                item_name: 'login_streak',
                item_type: 'system',
                quantity: 1,
                stats: streakData
            });
        }
    } catch (e) {
        console.error('[GameSync] Failed to save login streak to DB:', e);
    }
}

export async function loadLoginStreak(characterId) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        return localDb.get(`login_streak_${characterId}`) || null;
    }
    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('stats')
            .eq('character_id', characterId)
            .eq('item_name', 'login_streak')
            .eq('item_type', 'system')
            .maybeSingle();
        if (error) throw error;
        return data?.stats || null;
    } catch (e) {
        console.error('[GameSync] Failed to load login streak from DB:', e);
        return null;
    }
}

// ============ Bind Guest → Real Account (with progress migration) ============
// Anonymous Supabase sessions aren't available on this project, so every guest
// is a LOCAL guest with no auth session — `updateUser` can't bind them ("Auth
// session missing"). Instead we create a real account and migrate the guest's
// progress (character stats, inventory, friends, quests, almanac) to it, then
// switch the active session so a reload lands in the new account.
export async function migrateGuestToAccount(email, password, guest) {
    if (isOfflineMode || !supabase) throw new Error('ไม่สามารถผูกบัญชีในโหมดออฟไลน์');
    if (!guest) throw new Error('ไม่พบข้อมูลตัวละคร');

    const username = guest.name || 'Adventurer';
    const gender = guest.gender || 'male';

    // 1. Create the real account (auto-signs-in when email confirmation is off)
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email, password, options: { data: { username, gender } }
    });
    if (signUpErr) {
        const msg = (signUpErr.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already been registered')) {
            throw new Error('อีเมลนี้ถูกใช้สมัครแล้ว — ลองอีเมลอื่น หรือเข้าสู่ระบบด้วยบัญชีนี้');
        }
        throw signUpErr;
    }
    const newUser = signUpData?.user;
    if (!newUser) throw new Error('สมัครบัญชีไม่สำเร็จ');
    const newUserId = newUser.id;

    // 2. Ensure an active session exists (required for RLS-protected inserts)
    let sess = (await supabase.auth.getSession())?.data?.session;
    if (!sess) {
        const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
        if (siErr) throw new Error('บัญชีถูกสร้างแล้ว แต่ต้องยืนยันอีเมลก่อนใช้งาน โปรดตรวจสอบกล่องอีเมล');
        sess = (await supabase.auth.getSession())?.data?.session;
    }

    // 3. Profile
    try { await supabase.from('profiles').upsert({ id: newUserId, username, gender }); } catch (e) { /* non-fatal */ }

    // 4. Character row — carry over the guest's stats (strip non-DB fields)
    const s = { ...(guest.stats || {}) };
    delete s.id; delete s.sound_enabled; delete s.graphics_quality; delete s.fps_enabled;
    const charInsert = {
        // `id` is a NOT NULL text PK with no DB default — set it client-side
        // exactly like createCharacter() does for registrations.
        id: 'char_' + Math.random().toString(36).substring(2, 10),
        user_id: newUserId,
        name: username,
        gender,
        last_map: (guest.stats && guest.stats.last_map) || 'prontera_field',
        ...s,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const { data: newChar, error: charErr } = await supabase
        .from('characters').insert(charInsert).select().single();
    if (charErr) throw new Error('ผูกบัญชีสำเร็จบางส่วน แต่ย้ายตัวละครไม่สำเร็จ: ' + charErr.message);
    const newCharId = newChar.id;

    // Retry helper — a single transient failure must not silently drop data.
    const withRetry = async (fn) => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try { await fn(); return true; }
            catch (e) { if (attempt === 2) return false; await new Promise(r => setTimeout(r, 250)); }
        }
        return false;
    };

    // 5. Inventory — each item retried; anything that still fails is reported
    // back to the caller instead of vanishing quietly.
    const failedItems = [];
    for (const it of (guest.inventory || [])) {
        if (!it || !it.item_name || !it.quantity) continue;
        const ok = await withRetry(() => saveInventoryItem(newCharId, it.item_name, it.item_type || 'material', it.quantity, it.stats || {}));
        if (!ok) failedItems.push(it.item_name);
    }

    // 6. System collections (friends / daily quests / fishing almanac / login streak)
    if (guest.friends) await withRetry(() => saveFriendsList(newCharId, guest.friends));
    if (guest.dailyQuests) await withRetry(() => saveDailyQuests(newCharId, guest.dailyQuests));
    if (guest.almanac) await withRetry(() => saveFishingAlmanac(newCharId, guest.almanac));
    if (guest.loginStreak) await withRetry(() => saveLoginStreak(newCharId, guest.loginStreak));

    // 7. Switch the active session to the new real account
    saveActiveSession(newUserId);
    if (failedItems.length) console.warn('[Migrate] items that failed to transfer:', failedItems);
    return { userId: newUserId, characterId: newCharId, failedItems };
}

// ============ Friends List DB Sync (System Inventory Fallback) ============
export async function saveFriendsList(characterId, friendsList) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        localDb.set(`friends_${characterId}`, friendsList);
        return;
    }

    try {
        const { data: existing } = await supabase
            .from('inventory')
            .select('*')
            .eq('character_id', characterId)
            .eq('item_name', 'friends_list')
            .eq('item_type', 'system')
            .maybeSingle();

        if (existing) {
            await supabase
                .from('inventory')
                .update({ stats: { list: friendsList } })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('inventory')
                .insert({
                    character_id: characterId,
                    item_name: 'friends_list',
                    item_type: 'system',
                    quantity: 1,
                    stats: { list: friendsList }
                });
        }
    } catch (e) {
        console.error('[GameSync] Failed to save friends list to DB:', e);
    }
}

export async function loadFriendsList(characterId) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        return localDb.get(`friends_${characterId}`) || [];
    }

    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('*')
            .eq('character_id', characterId)
            .eq('item_name', 'friends_list')
            .eq('item_type', 'system')
            .maybeSingle();

        if (error) throw error;
        return data?.stats?.list || [];
    } catch (e) {
        console.error('[GameSync] Failed to load friends list from DB:', e);
        return [];
    }
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
                { name: 'Lord_Knight', level: 99, total_kills: 9999, gold: 5000000, zol: 25000, play_time: 154800, profiles: { username: 'Ragnarok' } },
                { name: 'Sniper_Alice', level: 85, total_kills: 4521, gold: 1200000, zol: 12000, play_time: 75600, profiles: { username: 'ArcherGuy' } },
                { name: 'High_Priest', level: 76, total_kills: 1205, gold: 850000, zol: 8000, play_time: 32400, profiles: { username: 'Support' } },
                { name: 'Assassin_Cross', level: 60, total_kills: 887, gold: 350000, zol: 3500, play_time: 18000, profiles: { username: 'Katars' } },
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
        } else if (category === 'pvp') {
            sorted.sort((a, b) => (b.mmr ?? 1000) - (a.mmr ?? 1000) || (b.pvp_wins ?? 0) - (a.pvp_wins ?? 0));
        } else {
            sorted.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.total_kills ?? 0) - (a.total_kills ?? 0));
        }
        return sorted.slice(0, 20);
    }

    const applyOrder = (q) => {
        if (category === 'gold') return q.order('gold', { ascending: false });
        if (category === 'kills') return q.order('total_kills', { ascending: false });
        if (category === 'playtime') return q.order('play_time', { ascending: false });
        if (category === 'pvp') return q.order('mmr', { ascending: false }).order('pvp_wins', { ascending: false });
        return q.order('level', { ascending: false }).order('total_kills', { ascending: false });
    };

    const cols = 'name, level, total_kills, gold, zol, play_time, mmr, pvp_wins, pvp_losses, user_id';
    let query = applyOrder(supabase.from('characters').select(`${cols}, profiles(username)`));

    let { data, error } = await query.limit(20);
    if (error) {
        console.warn('[Zolos] fetchLeaderboard error with profiles relation, retrying without profiles:', error.message);
        // Fallback when database has relationship key mapping cache issue
        const res = await applyOrder(supabase.from('characters').select(cols)).limit(20);
        data = res.data;
    }
    return data || [];
}

// ============ Realtime Presence & Broadcast (Socket.io) ============
export async function joinPresence(userId, username, level, onPlayersUpdate, onPlayerPositionUpdate, onChatCallback, currentMapId = 'prontera') {
    onlinePlayersCallback = onPlayersUpdate;
    chatCallback = onChatCallback;
    socketListenersAttached = false;

    // Store player info for later use in updatePresence/broadcast
    currentUserId = userId;
    currentUsername = username;
    currentLevel = level;

    // ===== OFFLINE MODE (No Mock Players) =====
    if (isOfflineMode || (!isSocketMode() && !supabase)) {
        console.log('[Zolos] 📴 Offline Mode active (no bots)');
        if (onPlayersUpdate) onPlayersUpdate([{ userId: 'player_me', username, level }]);
        return;
    }

    // ===== SOCKET.IO MODE =====
    if (isSocketMode()) {
        console.log('[Zolos] 🌐 Connecting to Map Server via Socket.io... userId:', userId, 'username:', username);

        // Connect if not already
        let socket = getSocket();
        if (!socket) {
            socket = await connectSocket();
        }

        if (!socket) {
            console.warn('[Zolos] ⚠️ Socket.io connection failed');
            if (onPlayersUpdate) onPlayersUpdate([{ userId: 'player_me', username, level }]);
            return;
        }

        // Attach event listeners (only once)
        if (!socketListenersAttached) {
            socket.on('players_update', (players) => {
                console.log('[Zolos] 👥 Players update via Socket.io:', players.length, players.map(p => p.username));
                if (onlinePlayersCallback) onlinePlayersCallback(players);
            });

            // Full cross-map roster → drives the Online Players panel so it
            // shows everyone online across all cities. Emitted after
            // players_update, so this is what the panel ends up displaying.
            socket.on('players_global', (players) => {
                if (window.gameUI && typeof window.gameUI.updateOnlinePlayers === 'function') {
                    window.gameUI.updateOnlinePlayers(players);
                }
            });

            socket.on('pos', (payload) => {
                if (onPlayerPositionUpdate && payload && payload.userId !== userId) {
                    onPlayerPositionUpdate(payload);
                }
            });

            // Latency: reply to the server's periodic ping so it can measure our
            // round-trip time and put it in the Online roster (players_global).
            socket.on('srv_ping', (t) => {
                if (socket && socket.connected) socket.emit('srv_pong', t);
            });

            socket.on('chat', (payload) => {
                if (chatCallback && payload) {
                    chatCallback(payload);
                }
            });

            socket.on('kill_streak', (payload) => {
                if (payload && typeof window.onKillStreakReceived === 'function') {
                    window.onKillStreakReceived(payload);
                }
            });

            // Server dropped a message (too fast / duplicate) — gentle heads-up
            socket.on('chat_blocked', (payload) => {
                if (window.gameUI && typeof window.gameUI.addCombatLog === 'function') {
                    const reason = payload && payload.reason === 'dup'
                        ? '⚠️ อย่าส่งข้อความซ้ำเดิมรัวๆ นะ'
                        : '⚠️ พิมพ์เร็วเกินไป เว้นสักครู่แล้วลองใหม่';
                    window.gameUI.addCombatLog(reason, 'warning');
                }
            });

            socket.on('trade_request', (payload) => {
                if (payload && payload.targetUserId === userId) {
                    if (window.gameUI) window.gameUI.receiveTradeRequest(payload);
                }
            });

            socket.on('trade_response', (payload) => {
                if (payload && payload.senderUserId === userId) {
                    if (window.gameUI) window.gameUI.receiveTradeResponse(payload);
                }
            });

            socket.on('trade_cancel', (payload) => {
                if (payload && payload.targetUserId === userId) {
                    if (window.gameUI && typeof window.gameUI.receiveTradeCancel === 'function') {
                        window.gameUI.receiveTradeCancel(payload);
                    }
                }
            });

            socket.on('friend_request', (payload) => {
                if (payload && payload.targetUserId === userId) {
                    if (window.gameUI && typeof window.gameUI.receiveFriendRequest === 'function') {
                        window.gameUI.receiveFriendRequest(payload);
                    }
                }
            });

            socket.on('friend_response', (payload) => {
                if (payload && payload.senderUserId === userId) {
                    if (window.gameUI && typeof window.gameUI.receiveFriendResponse === 'function') {
                        window.gameUI.receiveFriendResponse(payload);
                    }
                }
            });

            // ===== PVP DUEL =====
            socket.on('duel_request', (payload) => {
                if (payload && payload.targetUserId === userId) {
                    if (window.gameUI && typeof window.gameUI.receiveDuelRequest === 'function') {
                        window.gameUI.receiveDuelRequest(payload);
                    }
                }
            });

            socket.on('duel_response', (payload) => {
                if (payload && payload.senderUserId === userId) {
                    if (window.gameUI && typeof window.gameUI.receiveDuelResponse === 'function') {
                        window.gameUI.receiveDuelResponse(payload);
                    }
                }
            });

            socket.on('duel_start', (payload) => {
                if (window.duelManager && typeof window.duelManager.onDuelStart === 'function') {
                    window.duelManager.onDuelStart(payload);
                }
            });

            socket.on('duel_hit', (payload) => {
                if (payload && payload.targetUserId === userId) {
                    if (window.duelManager && typeof window.duelManager.onDuelHit === 'function') {
                        window.duelManager.onDuelHit(payload);
                    }
                }
            });

            socket.on('duel_result', (payload) => {
                if (window.duelManager && typeof window.duelManager.onDuelResult === 'function') {
                    window.duelManager.onDuelResult(payload);
                }
            });

            // ===== WARP TO FRIEND =====
            socket.on('warp_result', (payload) => window.warpManager?.onWarpResult?.(payload));

            // ===== VENDING STALLS =====
            socket.on('stalls_update', () => window.stallManager?.refresh?.());

            // ===== WORLD BOSS =====
            socket.on('boss_state', (payload) => window.worldBossManager?.onState?.(payload));
            socket.on('boss_spawn', (payload) => window.worldBossManager?.onSpawn?.(payload));
            socket.on('boss_hp', (payload) => window.worldBossManager?.onHp?.(payload));
            socket.on('boss_dead', (payload) => window.worldBossManager?.onDead?.(payload));
            socket.on('boss_flee', (payload) => window.worldBossManager?.onFlee?.(payload));

            socketListenersAttached = true;
        }

        // Join the game — include the Supabase access token so the server can
        // verify our identity (userId) instead of trusting it blindly. Guests
        // have no token and stay unverified (can't impersonate a real account).
        let accessToken = null;
        try { accessToken = (await supabase?.auth?.getSession())?.data?.session?.access_token || null; } catch (e) { /* guest */ }
        socket.emit('join', { userId, username, level, mapId: currentMapId, accessToken });
        console.log('[Zolos] ✅ Emitted join event to Map Server');
        return;
    }

    // ===== FALLBACK: No Mock Players =====
    console.warn('[Zolos] ⚠️ Falling back to single player mode (no bots)');
    if (onPlayersUpdate) onPlayersUpdate([{ userId: 'player_me', username, level }]);
}

export function broadcastPosition(userId, username, level, position, rotationY, state, appearance, currentMapId = 'prontera', atkSeq = 0, weaponSoundClass = null) {
    if (isOfflineMode) return;

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        const payload = { userId, username, level, x: position.x, y: position.y, z: position.z, rY: rotationY, state, mapId: currentMapId };
        if (appearance) payload.appearance = appearance;
        // Piggyback the latest attack signal so others can play our weapon's
        // sound. aseq increments once per swing; the server relays the whole
        // payload, so no extra socket event is needed.
        if (atkSeq) { payload.aseq = atkSeq; payload.wsc = weaponSoundClass || 'sword'; }
        socket.emit('pos', payload);
        return;
    }
}

export function broadcastKillStreak(userId, username, count, currentMapId = 'prontera') {
    if (isOfflineMode) {
        if (typeof window.onKillStreakReceived === 'function') {
            window.onKillStreakReceived({ userId, username, count, mapId: currentMapId });
        }
        return;
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('kill_streak', { userId, username, count, mapId: currentMapId });
    }
}

export function broadcastChat(userId, username, level, message, currentMapId = 'prontera') {
    if (isOfflineMode) {
        // Echo back local message using object format
        if (chatCallback) {
            chatCallback({ userId, username, message });
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
                    chatCallback({ userId: sender.userId, username: sender.username, message: reply });
                }
            }
        }, 1500 + Math.random() * 1500);
        return;
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('chat', { userId, username, level, message, mapId: currentMapId });
        // Note: server broadcasts back to everyone (including sender) via 'chat' event
        // so we don't need to echo locally — it will come back from the server
    }
}

export function updatePresence(level, newUsername = null, currentMapId = 'prontera') {
    currentLevel = level;
    if (newUsername) {
        currentUsername = newUsername;
    }

    if (isOfflineMode) {
        const me = mockPlayers.find(p => p.userId === 'player_me');
        if (me) {
            me.level = level;
            if (newUsername) me.username = newUsername;
        }
        if (onlinePlayersCallback) onlinePlayersCallback([...mockPlayers]);
        return;
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('update_presence', {
            level: currentLevel,
            username: currentUsername,
            mapId: currentMapId
        });
    }
}

export function leavePresence() {
    socketListenersAttached = false;

    if (presenceUpdateInterval) {
        clearInterval(presenceUpdateInterval);
        presenceUpdateInterval = null;
    }

    disconnectSocket();
}

// ============ Send save state to server (for server-side save-on-disconnect) ============
export function sendSaveState(saveData) {
    const socket = getSocket();
    if (socket && isSocketConnected() && saveData) {
        // Ensure userId is present for server-side RLS-compliant saves
        socket.emit('save_state', {
            ...saveData,
            userId: saveData.userId || null
        });
    }
}

// ============ Auto-Save ============
export function startAutoSave(getStateCallback, intervalMs = 180000) {
    // Default: 3 minutes (180000ms) instead of 15s
    stopAutoSave();
    autoSaveInterval = setInterval(async () => {
        const state = getStateCallback();
        if (state && state.characterId) {
            // Save directly to Supabase
            if (state.userId) {
                await saveCharacterByUserId(state.userId, state.updates);
            } else {
                await saveCharacter(state.characterId, state.updates);
            }

            // Also send state to Socket server for save-on-disconnect backup
            sendSaveState(state);
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

// ============ Vending Stalls ============
// A stall is a physical shop stand in Prontera showing the owner's marketplace
// listings. The stall row itself only stores presence (name/slot/appearance);
// buying goes through the normal marketplace flow, so offline owners get paid.
export async function fetchVendingStalls() {
    if (isOfflineMode || !supabase) return [];
    try {
        const { data, error } = await supabase
            .from('vending_stalls')
            .select('*')
            .order('slot', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.warn('[Zolos] Failed to fetch vending stalls:', e.message);
        return [];
    }
}

export async function openVendingStall(characterId, ownerName, shopName, appearance) {
    if (isOfflineMode || !supabase) return { ok: false, reason: 'offline' };
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, reason: 'guest' };

        // Find a free slot (0..7)
        const { data: taken } = await supabase.from('vending_stalls').select('slot, user_id');
        const mine = (taken || []).find(s => s.user_id === user.id);
        const usedSlots = new Set((taken || []).map(s => s.slot));
        let slot = mine ? mine.slot : -1;
        if (slot < 0) {
            for (let i = 0; i < 8; i++) { if (!usedSlots.has(i)) { slot = i; break; } }
            if (slot < 0) return { ok: false, reason: 'full' };
        }

        const row = {
            user_id: user.id,
            character_id: characterId,
            owner_name: ownerName,
            shop_name: (shopName || 'ร้านค้า').slice(0, 24),
            slot,
            appearance: appearance || {},
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('vending_stalls').upsert(row, { onConflict: 'user_id' });
        if (error) throw error;

        // Nudge everyone to refresh their stall view
        const socket = getSocket();
        if (socket && isSocketConnected()) socket.emit('stall_change', {});
        return { ok: true, slot };
    } catch (e) {
        console.error('[Zolos] Failed to open vending stall:', e.message);
        return { ok: false, reason: e.message };
    }
}

export async function closeVendingStall() {
    if (isOfflineMode || !supabase) return false;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const { error } = await supabase.from('vending_stalls').delete().eq('user_id', user.id);
        if (error) throw error;
        const socket = getSocket();
        if (socket && isSocketConnected()) socket.emit('stall_change', {});
        return true;
    } catch (e) {
        console.error('[Zolos] Failed to close vending stall:', e.message);
        return false;
    }
}

// Listings belonging to one stall owner (seller_id is the auth user uuid)
export async function fetchStallListings(ownerUserId) {
    if (isOfflineMode || !supabase) return [];
    try {
        const { data, error } = await supabase
            .from('marketplace')
            .select('*')
            .eq('seller_id', ownerUserId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.warn('[Zolos] Failed to fetch stall listings:', e.message);
        return [];
    }
}

export async function buyMarketItem(listingId, buyerCharId, buyerName) {
    let listing = null;
    // A listing is "local" only when it actually lives in local storage (offline
    // mode, or a mock/local id). It must NOT be decided by the buyer being a
    // guest — a guest can be standing in a real player's stall, whose listings
    // live in the DB. Routing guests to the local path was why every such buy
    // failed with a misleading "already bought".
    const idStr = String(listingId);
    const isLocalListing = isOfflineMode || !supabase || idStr.startsWith('mock_') || idStr.startsWith('listing_');
    const isGuestBuyer = buyerCharId.startsWith('guest_') || buyerCharId.startsWith('local_');

    if (isLocalListing) {
        const listings = initLocalMarketplace();
        const idx = listings.findIndex(l => l.id === listingId);
        if (idx >= 0) {
            listing = listings[idx];
            listings.splice(idx, 1);
            localDb.set('marketplace_listings', listings);
        }
    } else {
        // A guest's character + gold live only in local storage, but the purchase
        // RPC needs a real DB character. So guests genuinely can't buy from real
        // player stalls — return a clear reason instead of a misleading error.
        if (isGuestBuyer) return { success: false, reason: 'guest_account_required' };

        // Server-authoritative atomic purchase (SECURITY DEFINER RPC): checks the
        // buyer's gold, moves gold to the seller, delivers the item and removes
        // the listing in one transaction. The client can't skip payment.
        try {
            const { data, error } = await supabase.rpc('buy_market_item', { p_listing_id: listingId });
            if (error) return { success: false, reason: 'error', detail: error.message };
            if (!data || !data.ok) return { success: false, reason: data?.reason || 'unknown' };
            // Announce + hand back the authoritative buyer gold
            const socket2 = getSocket();
            if (socket2 && isSocketConnected()) {
                socket2.emit('chat', {
                    userId: 'system', username: '📢 ระบบตลาด', level: 99,
                    message: `ผู้เล่น [${buyerName}] ได้สั่งซื้อ [${data.item_name}] x${data.quantity} จาก [${data.seller_name}] ในราคา ${data.price} Zeny!`
                });
            }
            return { success: true, buyerGold: data.buyer_gold };
        } catch (err) {
            return { success: false, reason: 'error', detail: err.message };
        }
    }

    if (!listing) return { success: false, reason: 'gone' };

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

    // 3. Broadcast system message via Socket.io chat
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('chat', {
            userId: 'system',
            username: '📢 ระบบตลาด',
            level: 99,
            message: `ผู้เล่น [${buyerName}] ได้สั่งซื้อ [${listing.item_name}] x${listing.quantity} จาก [${listing.seller_name}] ในราคา ${listing.price} Zeny!`
        });
    }

    return { success: true };
}

// ============ P2P DIRECT TRADE ============
export async function sendTradeRequestPacket(senderCharId, senderName, targetUserId, targetName, itemName, itemType, quantity, price, stats = {}) {
    if (isOfflineMode) {
        // Simulation mode: auto respond after 1.5s
        setTimeout(() => {
            if (window.gameUI) {
                window.gameUI.receiveTradeResponse({
                    senderUserId: currentUserId,
                    targetUserId: targetUserId,
                    accepted: Math.random() > 0.15,
                    requestPayload: {
                        senderUserId: currentUserId,
                        senderCharacterId: senderCharId,
                        senderName: senderName,
                        targetUserId: targetUserId,
                        targetName: targetName,
                        itemName: itemName,
                        itemType: itemType,
                        quantity: quantity,
                        price: price,
                        stats: stats
                    }
                });
            }
        }, 1500);
        return { success: true };
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('trade_request', {
            senderUserId: currentUserId,
            senderCharacterId: senderCharId,
            senderName: senderName,
            targetUserId: targetUserId,
            targetName: targetName,
            itemName: itemName,
            itemType: itemType,
            quantity: quantity,
            price: price,
            stats: stats
        });
    }
    return { success: true };
}

export async function sendTradeResponsePacket(senderUserId, targetUserId, accepted, originalRequest) {
    if (isOfflineMode) return { success: true };

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('trade_response', {
            senderUserId: senderUserId,
            targetUserId: targetUserId,
            accepted: accepted,
            requestPayload: originalRequest
        });
    }
    return { success: true };
}

export async function sendTradeCancelPacket(senderUserId, targetUserId, originalRequest) {
    if (isOfflineMode) return { success: true };

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('trade_cancel', {
            senderUserId: senderUserId,
            targetUserId: targetUserId,
            requestPayload: originalRequest
        });
    }
    return { success: true };
}

export async function executeDecentralizedSenderTrade(senderCharId, targetName, itemName, itemType, quantity, price = 0) {
    // Deduct item from sender inventory
    await saveInventoryItem(senderCharId, itemName, itemType, -quantity);

    // Add gold to sender if price > 0
    if (price > 0) {
        const isLocal = isOfflineMode || !supabase || senderCharId.startsWith('guest_') || senderCharId.startsWith('local_');
        if (isLocal) {
            const char = localDb.get(`char_${senderCharId}`);
            if (char) {
                char.gold = (char.gold || 0) + price;
                localDb.set(`char_${senderCharId}`, char);
            }
        } else {
            try {
                const { data: char } = await supabase
                    .from('characters')
                    .select('gold')
                    .eq('id', senderCharId)
                    .single();
                if (char) {
                    await saveCharacter(senderCharId, { gold: (char.gold || 0) + price });
                }
            } catch (err) {
                console.error('[Trade] Failed to add gold to sender:', err);
            }
        }
    }

    // Broadcast trade notification via Socket.io chat
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('chat', {
            userId: 'system',
            username: '📢 Trade',
            level: 99,
            message: `${currentUsername} ส่ง [${itemName}] x${quantity} ให้ [${targetName}]${price > 0 ? ` (${price} Zeny)` : ' (ฟรี)'}!`
        });
    }

    // Local chat echo
    if (chatCallback) {
        chatCallback({
            username: '📢 Trade',
            message: `${currentUsername} ส่ง [${itemName}] x${quantity} ให้ [${targetName}]${price > 0 ? ` (${price} Zeny)` : ' (ฟรี)'}!`
        });
    }

    return { success: true };
}

export async function executeDecentralizedReceiverTrade(receiverCharId, itemName, itemType, quantity, stats = {}, price = 0) {
    // Add item to receiver inventory
    await saveInventoryItem(receiverCharId, itemName, itemType, quantity, stats);

    // Deduct gold from receiver
    if (price > 0) {
        const isLocal = isOfflineMode || !supabase || receiverCharId.startsWith('guest_') || receiverCharId.startsWith('local_');
        if (isLocal) {
            const char = localDb.get(`char_${receiverCharId}`);
            if (char) {
                char.gold = Math.max(0, (char.gold || 0) - price);
                localDb.set(`char_${receiverCharId}`, char);
            }
        } else {
            try {
                const { data: char } = await supabase
                    .from('characters')
                    .select('gold')
                    .eq('id', receiverCharId)
                    .single();
                if (char) {
                    await saveCharacter(receiverCharId, { gold: Math.max(0, (char.gold || 0) - price) });
                }
            } catch (err) {
                console.error('[Trade] Failed to deduct gold from receiver:', err);
            }
        }
    }
    return { success: true };
}

// ============ P2P FRIEND REQUEST ============
export async function sendFriendRequestPacket(senderName, senderLevel, targetUserId, targetName) {
    if (isOfflineMode) {
        // Simulation mode: auto respond after 1s
        setTimeout(() => {
            if (window.gameUI && typeof window.gameUI.receiveFriendResponse === 'function') {
                window.gameUI.receiveFriendResponse({
                    senderUserId: currentUserId,
                    targetUserId: targetUserId,
                    accepted: Math.random() > 0.2,
                    requestPayload: {
                        senderUserId: currentUserId,
                        senderName: senderName,
                        senderLevel: senderLevel,
                        targetUserId: targetUserId,
                        targetName: targetName
                    }
                });
            }
        }, 1000);
        return { success: true };
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('friend_request', {
            senderUserId: currentUserId,
            senderName: senderName,
            senderLevel: senderLevel,
            targetUserId: targetUserId,
            targetName: targetName
        });
    }
    return { success: true };
}

export async function sendFriendResponsePacket(senderUserId, targetUserId, accepted, originalRequest) {
    if (isOfflineMode) return { success: true };

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('friend_response', {
            senderUserId: senderUserId,
            targetUserId: targetUserId,
            accepted: accepted,
            requestPayload: originalRequest
        });
    }
    return { success: true };
}

// ============ PVP MMR Leaderboard ============
export async function getMMRLeaderboard(limit = 8) {
    if (isOfflineMode || !supabase) return [];
    try {
        const { data, error } = await supabase
            .from('characters')
            .select('name, mmr, pvp_wins, pvp_losses')
            .order('mmr', { ascending: false })
            .limit(limit);
        if (error || !data) return [];
        return data.map(r => ({
            name: r.name,
            mmr: Number(r.mmr) || 1000,
            wins: Number(r.pvp_wins) || 0,
            losses: Number(r.pvp_losses) || 0,
        }));
    } catch (e) {
        console.warn('[Zolos] MMR leaderboard fetch failed:', e.message);
        return [];
    }
}

// ============ PVP Duel Networking ============
export function sendDuelRequest(targetUserId, targetName, senderName, senderLevel) {
    if (isOfflineMode) return { success: false, reason: 'offline' };
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('duel_request', {
            senderUserId: currentUserId,
            senderName,
            senderLevel,
            targetUserId,
            targetName,
        });
        return { success: true };
    }
    return { success: false, reason: 'not_connected' };
}

export function sendDuelResponse(senderUserId, accepted) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('duel_response', {
            senderUserId,           // the challenger (recipient of this response)
            targetUserId: currentUserId, // the accepter
            accepted,
        });
    }
}

export function sendDuelHit(targetUserId, damage, critical = false) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('duel_hit', {
            attackerUserId: currentUserId,
            targetUserId,
            damage,
            critical,
        });
    }
}

export function reportDuelEnd(winnerUserId, loserUserId) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('duel_end', { winnerUserId, loserUserId });
    }
}

// ============ World Boss Networking ============
export function sendBossHit(damage, critical = false) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('boss_hit', { damage, critical });
    }
}

// ============ Warp To Friend ============
// Ask the server for a friend's current position/map. The reply arrives on the
// `warp_result` socket event and is handled by window.warpManager.
export function sendWarpRequest(targetUserId) {
    if (isOfflineMode || !targetUserId) return { success: false };
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('warp_request', { targetUserId });
        return { success: true };
    }
    return { success: false };
}

// ============ Offline Mock Presence (unchanged) ============
function _startOfflineMockPresence(userId, username, level, onPlayersUpdate, onPlayerPositionUpdate, onChatCallback) {
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

    if (onPlayersUpdate) onPlayersUpdate(mockPlayers);
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
            mockPlayers.splice(leaveIdx, 1);
            if (onPlayersUpdate) onPlayersUpdate([...mockPlayers]);
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
            if (onPlayersUpdate) onPlayersUpdate([...mockPlayers]);
            if (onPlayerPositionUpdate) onPlayerPositionUpdate(newPlayer);
        }

        // Simulate wandering movement for mock players
        mockPlayers.forEach((p) => {
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

        if (onPlayersUpdate) onPlayersUpdate([...mockPlayers]);
    }, 3000);

    // Simulation for chat messages in offline mode
    setInterval(() => {
        if (onChatCallback && mockPlayers.length > 1) {
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
                onChatCallback({ userId: sender.userId, username: sender.username, message: msg });
            }
        }
    }, 12000 + Math.random() * 8000);
}
