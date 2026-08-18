// Game Sync — Save/Load character data to Supabase + Realtime via Socket.io
import { supabase, isOfflineMode, localDb, getDeterministicGuestName, isPlaceholderName, saveActiveSession } from './SupabaseClient.js';
import { getSocket, isSocketConnected, isSocketMode, connectSocket, disconnectSocket } from './SocketClient.js';
import { getCard } from '../cards/CardCatalog.js';
import { fuseCard } from '../cards/CardProgression.js';
export { getDeterministicGuestName, isPlaceholderName };

let autoSaveInterval = null;
let autoSaveInFlight = false;
let autoSaveGeneration = 0;
let onlinePlayersCallback = null;
let presenceUpdateInterval = null;
let offlineChatInterval = null;
let clientPingInterval = null;
let mockPlayers = [];
let socketListenersAttached = false;
let socketListenersOwner = null;
let chatCallback = null;
let playerPositionCallback = null;
let cardFusionSocket = null;
const pendingCardFusions = new Map();
const pendingOreConversions = new Map();
const pendingPetPurchases = new Map();
const pendingNpcSales = new Map();
let clientMeasuredPing = null;
const inventoryMutationQueues = new Map();

function isCommittedOreConversion(result) {
    return Boolean(result
        && typeof result.requestId === 'string'
        && Number.isInteger(result.ore_spent) && result.ore_spent > 0
        && Number.isInteger(result.zol_gained) && result.zol_gained > 0
        && Number.isInteger(result.zol) && result.zol >= 0);
}

function isCommittedPetPurchase(result) {
    return Boolean(result
        && typeof result.requestId === 'string'
        && typeof result.item_name === 'string' && result.item_name.length > 0
        && Number.isInteger(result.price) && result.price > 0
        && Number.isInteger(result.gold) && result.gold >= 0
        && Number.isInteger(result.quantity) && result.quantity >= 1
        && result.stats && Array.isArray(result.stats.instances)
        && result.stats.instances.length === result.quantity);
}

function enqueueInventoryMutation(characterId, itemName, mutation) {
    const key = `${characterId}\u0000${itemName}`;
    const previous = inventoryMutationQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(mutation);
    inventoryMutationQueues.set(key, current);
    return current.finally(() => {
        if (inventoryMutationQueues.get(key) === current) inventoryMutationQueues.delete(key);
    });
}

function rejectPendingMap(map, message) {
    for (const pending of map.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message));
    }
    map.clear();
}

function rejectPendingSocketRequests() {
    const message = 'การเชื่อมต่อหลุด กรุณารอให้เชื่อมต่อใหม่แล้วลองอีกครั้ง';
    rejectPendingMap(pendingOreConversions, message);
    rejectPendingMap(pendingPetPurchases, message);
    rejectPendingMap(pendingNpcSales, message);
    rejectPendingMap(pendingCardFusions, message);
    rejectPendingMap(pendingCardRefines, message);
}

// ============ Client-side profanity filter (mirrors server) ============
const _PROFANITY = [
    'motherfucker', 'ควยเย็ดแม่', 'เย็ดแม่มึง', 'ไอ้ชาติหมา', 'พ่อมึงตาย', 'แม่มึงตาย',
    'ไอ้หน้าหี', 'ไอหน้าหี', 'ไอ้เหี้ย', 'อีดอกทอง', 'เย็ดแม่', 'ไอเหี้ย',
    'ไอ้ระยำ', 'ไอ้สลิด', 'ไอ้ควาย', 'ชาติหมา', 'asshole', 'อีระยำ',
    'ไอ้สัส', 'ดอกทอง', 'อีควาย', 'กะหรี่', 'เควี่ย', 'สันดาน', 'nigger',
    'ไอสัส', 'อีดอก', 'เหี้ย', 'จัญไร', 'bitch', 'pussy', 'แตดๆ',
    'เย็ด', 'สถุน', 'ระยำ', 'fuck', 'fvck', 'shit', 'dick', 'cunt',
    'ควย', 'สัส', 'สาด', 'สัด', 'แตด', 'fuk', 'หี'
].sort((a, b) => b.length - a.length);
const _PROFANITY_RE = _PROFANITY.map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
function censorText(text) {
    let out = text;
    for (const re of _PROFANITY_RE) out = out.replace(re, '***');
    return out;
}

/** Return the locally-measured round-trip latency (ms) or null. */
export function getClientPing() { return clientMeasuredPing; }

function attachOreConversionListeners(socket) {
    if (socket._zolosOreListeners) return;
    socket._zolosOreListeners = true;
    socket.on('ore_conversion_result', (result) => {
        const pending = pendingOreConversions.get(result?.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingOreConversions.delete(result.requestId);
        if (!isCommittedOreConversion(result)) {
            pending.reject(new Error('Invalid ore conversion response'));
            return;
        }
        pending.resolve(result);
    });
    socket.on('ore_conversion_error', (error) => {
        const pending = pendingOreConversions.get(error?.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingOreConversions.delete(error.requestId);
        pending.reject(new Error(error.message || 'แปลงแร่ไม่สำเร็จ'));
    });
}

function normalizeRoster(players) {
    return Array.isArray(players) ? players.filter(player => player && typeof player === 'object') : [];
}

export async function requestOreConversion(characterId, requestId) {
    if (isOfflineMode || !supabase || String(characterId).startsWith('guest_') || String(characterId).startsWith('local_')) {
        const inv = localDb.get(`inventory_${characterId}`) || [];
        const ore = inv.filter(i => i.item_name === 'Celestial Ore').reduce((n, i) => n + (Number(i.quantity) || 0), 0);
        if (ore <= 0) throw new Error('ไม่มี Celestial Ore สำหรับแปลง');
        localDb.set(`inventory_${characterId}`, inv.filter(i => i.item_name !== 'Celestial Ore'));
        const char = localDb.get(`char_${characterId}`);
        if (!char) throw new Error('ไม่พบข้อมูลตัวละคร');
        char.zol = Math.min(2147483647, (Number(char.zol) || 0) + ore * 100);
        localDb.set(`char_${characterId}`, char);
        return { ore_spent: ore, zol_gained: ore * 100, zol: char.zol, requestId };
    }
    const socket = getSocket();
    if (!socket || !isSocketConnected()) throw new Error('เซิร์ฟเวอร์ยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่');
    if (pendingOreConversions.has(requestId)) throw new Error('กำลังแปลงแร่อยู่');
    attachOreConversionListeners(socket);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingOreConversions.delete(requestId);
            reject(new Error('เซิร์ฟเวอร์ตอบสนองช้า แร่ยังไม่ถูกลบ กรุณาลองใหม่'));
        }, 12000);
        pendingOreConversions.set(requestId, { resolve, reject, timeout });
        socket.emit('ore_convert', { requestId });
    });
}

function attachPetPurchaseListeners(socket) {
    if (socket._zolosPetPurchaseListeners) return;
    socket._zolosPetPurchaseListeners = true;
    socket.on('pet_purchase_result', (result) => {
        const pending = pendingPetPurchases.get(result?.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingPetPurchases.delete(result.requestId);
        if (!isCommittedPetPurchase(result)) {
            pending.reject(new Error('Invalid pet purchase response'));
            return;
        }
        pending.resolve(result);
    });
    socket.on('pet_purchase_error', (error) => {
        const pending = pendingPetPurchases.get(error?.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingPetPurchases.delete(error.requestId);
        pending.reject(new Error(error?.message || 'ซื้อสัตว์เลี้ยงไม่สำเร็จ'));
    });
}

export function requestNpcSale(itemName, quantity, requestId) {
    const socket = getSocket();
    if (!socket || !isSocketConnected()) throw new Error('เซิร์ฟเวอร์ยังไม่พร้อม');
    if (pendingNpcSales.has(requestId)) throw new Error('กำลังดำเนินการขายนี้อยู่');
    if (!socket._zolosNpcSaleListeners) {
        socket._zolosNpcSaleListeners = true;
        socket.on('npc_sell_result', result => {
            const pending = pendingNpcSales.get(result?.requestId); if (!pending) return;
            clearTimeout(pending.timeout); pendingNpcSales.delete(result.requestId);
            if (!Number.isSafeInteger(result.gold) || !Number.isSafeInteger(result.remaining)) return pending.reject(new Error('ผลการขายไม่ถูกต้อง'));
            pending.resolve(result);
        });
        socket.on('npc_sell_error', error => {
            const pending = pendingNpcSales.get(error?.requestId); if (!pending) return;
            clearTimeout(pending.timeout); pendingNpcSales.delete(error.requestId); pending.reject(new Error(error.message || 'ขายไม่สำเร็จ'));
        });
    }
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pendingNpcSales.delete(requestId); reject(new Error('เซิร์ฟเวอร์ตอบสนองช้า ไอเทมยังไม่ถูกขาย')); }, 12000);
        pendingNpcSales.set(requestId, { resolve, reject, timeout });
        socket.emit('npc_sell', { itemName, quantity, requestId });
    });
}

export async function requestPetPurchase(characterId, itemName, requestId, offlinePet = null) {
    if (isOfflineMode || !supabase || String(characterId).startsWith('guest_') || String(characterId).startsWith('local_')) {
        const price = Math.max(1, Number(offlinePet?.price) || 0);
        const charKey = `char_${characterId}`;
        const character = localDb.get(charKey);
        if (!character) throw new Error('ไม่พบข้อมูลตัวละคร');
        if ((Number(character.gold) || 0) < price) throw new Error('Zeny ไม่พอสำหรับสัตว์เลี้ยงตัวนี้');
        const receiptKey = `pet_purchase_${characterId}_${requestId}`;
        const previous = localDb.get(receiptKey);
        if (previous) return previous;
        const invKey = `inventory_${characterId}`;
        const inventory = localDb.get(invKey) || [];
        let row = inventory.find(i => i.item_name === itemName && i.item_type === 'pet');
        if (!row) {
            row = { id: `inv_${requestId}`, character_id: characterId, item_name: itemName, item_type: 'pet', quantity: 0, stats: { instances: [] } };
            inventory.push(row);
        }
        const instances = Array.isArray(row.stats?.instances) ? row.stats.instances : [];
        if (instances.length >= 200) throw new Error('ช่องเก็บสัตว์เลี้ยงชนิดนี้เต็มแล้ว');
        const instance = { uid: `pet_${requestId.replace(/[^a-zA-Z0-9]/g, '').slice(-24)}`, name: null, level: 1, xp: 0 };
        row.stats = { ...(row.stats || {}), instances: [...instances, instance] };
        row.quantity = row.stats.instances.length;
        character.gold -= price;
        localDb.set(invKey, inventory);
        localDb.set(charKey, character);
        const result = { item_name: itemName, pet_key: offlinePet?.pet, price, gold: character.gold, quantity: row.quantity, stats: row.stats, instance, requestId };
        localDb.set(receiptKey, result);
        return result;
    }

    const socket = getSocket();
    if (!socket || !isSocketConnected()) throw new Error('เซิร์ฟเวอร์ยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่');
    if (pendingPetPurchases.has(requestId)) throw new Error('กำลังดำเนินการคำสั่งซื้อนี้อยู่');
    attachPetPurchaseListeners(socket);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingPetPurchases.delete(requestId);
            reject(new Error('เซิร์ฟเวอร์ตอบสนองช้า เงินจะไม่ถูกหักซ้ำ กรุณาลองใหม่'));
        }, 12000);
        pendingPetPurchases.set(requestId, { resolve, reject, timeout });
        socket.emit('pet_purchase', { itemName, requestId });
    });
}

let currentUserId = null;
let currentUsername = 'Adventurer';
let currentLevel = 1;
let activeMapId = 'prontera';
let currentCharacterId = null;

// ============ Device Detection ============
export function getDeviceTypeFromUserAgent(ua) {
    const isTablet = /iPad|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    if (isTablet) return 'tablet';
    const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    if (isMobile) return 'mobile';
    return 'desktop';
}

export function getDeviceType() {
    const ua = navigator?.userAgent || '';

    // 1. Explicit keywords check
    const isTabletUA = /iPad|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    if (isTabletUA) return 'tablet';
    if (isMobileUA) return 'mobile';

    // 2. Touch screen features check (crucial for modern iPadOS which defaults to desktop UA)
    const hasTouch = (navigator.maxTouchPoints > 0) ||
        ('ontouchstart' in window) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    if (hasTouch) {
        const width = window.screen?.width || window.innerWidth || 800;
        const height = window.screen?.height || window.innerHeight || 600;
        const minDim = Math.min(width, height);
        const maxDim = Math.max(width, height);

        // Small screen touch devices are phones
        if (minDim < 600) {
            return 'mobile';
        }
        // Medium screen touch devices (up to iPad Pro 12.9" portrait dimension of 1024 or landscape 1366) are tablets
        if (maxDim <= 1366) {
            return 'tablet';
        }
    }

    return 'desktop';
}

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

    const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : (() => { const c = new AbortController(); setTimeout(() => c.abort(), 8000); return c.signal; })();
    const query = supabase
        .from('characters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    const { data, error, status } = await (typeof query.abortSignal === 'function' ? query.abortSignal(timeoutSignal) : query);

    if (error && error.code === 'PGRST116') {
        // No character found, create one
        return await createCharacter(userId);
    }
    if (error) {
        if (status && !error.status) error.status = status;
        throw error;
    }

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
// Read-only fetch of another player's character by username (fallback when
// the userId from the socket roster doesn't match the characters.user_id
// column — e.g. the server sent a socket id instead of the Supabase UUID).
// characters is publicly readable (RLS SELECT USING true).
export async function fetchCharacterByUsername(username) {
    if (!supabase || isOfflineMode || !username) return null;
    try {
        const fields = 'name, level, exp, hp, max_hp, sp, max_sp, atk, def, gold, zol, total_kills, play_time, weapon, hat, glasses, shield, armor, gender, last_map, job, body_color, hair_color, pants_color, appearance';
        const { data, error } = await supabase
            .from('characters')
            .select(fields)
            .eq('name', username)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('[Zolos] fetchCharacterByUsername error:', error.message);
            return null;
        }
        if (data) {
            console.error(`[Zolos] fetchCharacterByUsername matched: ${data.name} (user_id=${data.user_id})`);
        }
        return data;
    } catch (e) {
        console.error('[Zolos] fetchCharacterByUsername error:', e);
        return null;
    }
}

export async function fetchPublicCharacter(userId) {
    if (!supabase || isOfflineMode || !userId || userId.startsWith('guest_') || userId.startsWith('local_')) return null;
    try {
        // Only select columns that actually exist in the DB schema.
        // Including non-existent columns (str, agi, int, title) caused
        // the first query to ALWAYS fail with PGRST204, forcing a second
        // network round-trip on every profile load — the main cause of
        // the slow profile popup.
        const fields = 'name, level, exp, hp, max_hp, sp, max_sp, atk, def, gold, zol, total_kills, play_time, weapon, hat, glasses, shield, armor, gender, last_map, job, body_color, hair_color, pants_color, appearance';
        const { data, error } = await supabase
            .from('characters')
            .select(fields)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('[Zolos] fetchPublicCharacter error:', error.message);
            return null;
        }
        if (!data) {
            console.error(`[Zolos] fetchPublicCharacter: no row found for user_id=${userId}`);
        }
        return data;
    } catch (e) {
        console.error('[Zolos] fetchPublicCharacter error:', e);
        return null;
    }
}

// Resolve a player-facing UID (the 8-char code shown as "UID: #XXXXXXXX",
// derived from characters.id → 'char_' + suffix) back to that character's
// routing identity. Used by the card P2P trade so a sender can target a
// recipient by UID. Returns { characterId, userId, username } or null.
export async function resolveCharacterByUid(uid) {
    if (isOfflineMode || !supabase || !uid) return null;
    const clean = String(uid).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) return null;
    const charId = 'char_' + clean;
    try {
        const { data, error } = await supabase
            .from('characters')
            .select('id, user_id, name')
            .eq('id', charId)
            .maybeSingle();
        if (error) {
            console.error('[Zolos] resolveCharacterByUid error:', error.message);
            return null;
        }
        if (!data) return null;
        return { characterId: data.id, userId: data.user_id, username: data.name };
    } catch (e) {
        console.error('[Zolos] resolveCharacterByUid error:', e);
        return null;
    }
}

// Search characters by name prefix for autocomplete suggestions.
// Returns up to 5 results as [{ characterId, userId, username, level }].
export async function searchCharactersByName(query) {
    if (isOfflineMode || !supabase || !query || query.length < 1) return [];
    const clean = String(query).trim();
    if (!clean) return [];
    try {
        const { data, error } = await supabase
            .from('characters')
            .select('id, user_id, name, level')
            .ilike('name', `${clean}%`)
            .order('level', { ascending: false })
            .limit(5);
        if (error) {
            console.error('[Zolos] searchCharactersByName error:', error.message);
            return [];
        }
        return (data || []).map(d => ({
            characterId: d.id,
            userId: d.user_id,
            username: d.name,
            level: d.level,
        }));
    } catch (e) {
        console.error('[Zolos] searchCharactersByName error:', e);
        return [];
    }
}

// ===== Card Mailbox (offline P2P card delivery via escrow) =====

// Escrow a card into the recipient's mailbox. Returns the RPC result jsonb
// ({ ok, reason?, mail_id?, recipient_name? }).
export async function sendCardMail(recipientCharId, itemName, itemType, quantity, price, stats = {}) {
    if (isOfflineMode || !supabase) return { ok: false, reason: 'offline' };
    try {
        const { data, error } = await supabase.rpc('send_card_mail', {
            p_recipient_char_id: recipientCharId,
            p_item_name: itemName,
            p_item_type: itemType || 'card',
            p_quantity: quantity,
            p_price: price || 0,
            p_stats: stats || {},
        });
        if (error) { console.error('[Mail] send error:', error.message); return { ok: false, reason: 'error' }; }
        return data || { ok: false, reason: 'error' };
    } catch (e) { console.error('[Mail] send error:', e); return { ok: false, reason: 'error' }; }
}

// All pending mail visible to me (RLS returns only rows I sent or received).
export async function fetchCardMail() {
    if (isOfflineMode || !supabase) return [];
    try {
        const { data, error } = await supabase
            .from('card_mailbox')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) { console.error('[Mail] fetch error:', error.message); return []; }
        return data || [];
    } catch (e) { console.error('[Mail] fetch error:', e); return []; }
}

export async function claimCardMail(mailId) {
    if (isOfflineMode || !supabase) return { ok: false, reason: 'offline' };
    try {
        const { data, error } = await supabase.rpc('claim_card_mail', { p_mail_id: mailId });
        if (error) { console.error('[Mail] claim error:', error.message); return { ok: false, reason: 'error' }; }
        return data || { ok: false, reason: 'error' };
    } catch (e) { console.error('[Mail] claim error:', e); return { ok: false, reason: 'error' }; }
}

export async function returnCardMail(mailId) {
    if (isOfflineMode || !supabase) return { ok: false, reason: 'offline' };
    try {
        const { data, error } = await supabase.rpc('return_card_mail', { p_mail_id: mailId });
        if (error) { console.error('[Mail] return error:', error.message); return { ok: false, reason: 'error' }; }
        return data || { ok: false, reason: 'error' };
    } catch (e) { console.error('[Mail] return error:', e); return { ok: false, reason: 'error' }; }
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
        weapon: 'Sword',
        hat: 'None',
        glasses: 'None',
        shield: 'None',
        armor: null,
        job: null,
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
        'weapon', 'hat', 'glasses', 'shield', 'armor',
        'body_color', 'hair_color', 'pants_color', 'gender',
        'sound_enabled', 'graphics_quality', 'fps_enabled',
        'appearance' // full look JSON (pet/refine/cards/all gear) for offline profiles
    ];

    // Optional appearance fields (may not be in DB yet)
    // We only include these if they are present in the updates object
    const appearanceFields = [
        'weapon', 'hat', 'glasses', 'body_color', 'hair_color', 'pants_color', 'gender'
    ];

    const isOnline = isSocketConnected();
    const statFields = ['level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp', 'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'last_map'];

    // Filter the updates to only include fields we know are safe or intended for DB
    const filteredUpdates = {};
    for (const key of Object.keys(dbUpdates)) {
        if (isOnline && statFields.includes(key)) {
            continue;
        }
        if (allowedFields.includes(key) || appearanceFields.includes(key)) {
            let val = dbUpdates[key];
            // Part 5.3: Client-side stat validation/clamping
            if (key === 'level') val = Math.max(1, Math.min(300, parseInt(val) || 1));
            if (key === 'gold') val = Math.max(0, Math.min(2147483647, parseInt(val) || 0));
            if (key === 'atk') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));
            if (key === 'def') val = Math.max(0, Math.min(1000000, parseInt(val) || 0));

            filteredUpdates[key] = val;
        }
    }

    if (Object.keys(filteredUpdates).length === 0) {
        console.log(`[Zolos] 💾 Direct DB save skipped: player is online. Stats will be updated via Socket save_state.`);
        return;
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
        'weapon', 'hat', 'glasses', 'shield', 'armor',
        'body_color', 'hair_color', 'pants_color', 'gender',
        'sound_enabled', 'graphics_quality', 'fps_enabled',
        'appearance' // full look JSON (pet/refine/cards/all gear) for offline profiles
    ];

    const isOnline = isSocketConnected();
    const statFields = ['level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp', 'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'last_map'];

    const filteredUpdates = {};
    for (const key of Object.keys(updates)) {
        if (isOnline && statFields.includes(key)) {
            continue;
        }
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

    if (Object.keys(filteredUpdates).length === 0) {
        console.log(`[Zolos] 💾 Direct DB save by user_id skipped: player is online. Stats will be updated via Socket save_state.`);
        return;
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
        // If the DB doesn't have the `appearance` column yet, drop it and retry
        // so core stats still persist (the offline-profile feature just stays
        // dormant until the column is added). Prevents a schema mismatch from
        // silently breaking all saves.
        if (filteredUpdates.appearance !== undefined) {
            const { appearance, ...rest } = filteredUpdates;
            const { error: retryErr } = await supabase
                .from('characters')
                .update({ ...rest, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
            if (retryErr) console.error('[Zolos] ❌ retry without appearance failed:', retryErr.message);
            else console.log('[Zolos] ✅ saved (without appearance — column missing)');
        }
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

// ============ Adventure Journal / Monster Codex ============
// Kept in the existing system-inventory channel so this feature works without
// a schema migration and follows the character across devices.
export async function saveAdventureJournal(characterId, journalData) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        localDb.set(`adventure_journal_${characterId}`, journalData);
        return;
    }
    try {
        const { data: existing } = await supabase.from('inventory').select('id')
            .eq('character_id', characterId).eq('item_name', 'adventure_journal')
            .eq('item_type', 'system').maybeSingle();
        if (existing) {
            await supabase.from('inventory').update({ stats: journalData }).eq('id', existing.id);
        } else {
            await supabase.from('inventory').insert({ character_id: characterId, item_name: 'adventure_journal', item_type: 'system', quantity: 1, stats: journalData });
        }
    } catch (e) {
        console.error('[GameSync] Failed to save adventure journal:', e);
    }
}

export async function loadAdventureJournal(characterId) {
    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        return localDb.get(`adventure_journal_${characterId}`) || null;
    }
    try {
        const { data, error } = await supabase.from('inventory').select('stats')
            .eq('character_id', characterId).eq('item_name', 'adventure_journal')
            .eq('item_type', 'system').maybeSingle();
        if (error) throw error;
        return data?.stats || null;
    } catch (e) {
        console.error('[GameSync] Failed to load adventure journal:', e);
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
        const fusionSnapshot = localDb.get(`card_fusion_${characterId}`);
        if (Array.isArray(fusionSnapshot?.inventory)) return fusionSnapshot.inventory;
        return localDb.get(`inventory_${characterId}`) || [];
    }

    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('character_id', characterId);

    if (error) throw error;
    return data || [];
}

export async function loadCharacterCards(characterId) {
    if (isOfflineMode || !supabase || !characterId
        || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        return null;
    }
    const { data, error } = await supabase
        .from('character_cards')
        .select('card_id, owned, stars, pity')
        .eq('character_id', characterId);
    if (error) throw error;
    return data || [];
}

/**
 * Save (or adjust quantity of) an inventory item in Supabase.
 *
 * Required Supabase RLS policy for the inventory table:
 *
 * CREATE POLICY "Users can manage their own inventory"
 * ON inventory FOR ALL
 * USING (
 *   character_id IN (
 *     SELECT id FROM characters WHERE user_id = auth.uid()
 *   )
 * );
 *
 * The policy ensures that only authenticated users can INSERT/UPDATE/DELETE
 * inventory rows whose character_id belongs to a character they own.
 */
async function saveInventoryItemNow(characterId, itemName, itemType, quantity, stats = {}) {
    console.log(`[Zolos] 📦 saveInventoryItem called: characterId=${characterId}, itemName=${itemName}, quantity=${quantity}`);

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
        console.log(`[Zolos] 📦 [offline] saveInventoryItem completed for ${itemName}`);
        return true;
    }

    try {
        // Check if item already exists.
        // Use .select() + .limit(1) instead of .maybeSingle() because the
        // inventory table may have duplicate (character_id, item_name) rows
        // from a missing UNIQUE constraint. .maybeSingle() returns null when
        // it finds multiple rows, causing a new INSERT on every save and
        // creating even more duplicates. With .limit(1) we always get one
        // row to update (or null if none exists).
        const { data: rows, error: fetchError } = await supabase
            .from('inventory')
            .select('*')
            .eq('character_id', characterId)
            .eq('item_name', itemName)
            .limit(1)
            .single();

        if (fetchError && fetchError.code === 'PGRST116') {
            // No rows found — item doesn't exist yet
            if (quantity > 0) {
                const { error: insertError } = await supabase
                    .from('inventory')
                    .insert({ character_id: characterId, item_name: itemName, item_type: itemType, quantity, stats });
                if (insertError) {
                    console.error(`[Zolos] ❌ Error inserting inventory item ${itemName} for characterId ${characterId}:`, insertError.message);
                    throw insertError;
                }
                console.log(`[Zolos] 📦 saveInventoryItem inserted ${itemName} qty=${quantity} for characterId ${characterId}`);
            }
        } else if (fetchError) {
            console.error(`[Zolos] ❌ Error checking inventory item ${itemName} for characterId ${characterId}:`, fetchError.message);
            throw fetchError;
        } else {
            // Row exists — update its quantity
            const existing = rows;
            const newQty = existing.quantity + quantity;
            if (newQty <= 0) {
                const { error: deleteError } = await supabase
                    .from('inventory')
                    .delete()
                    .eq('id', existing.id);
                if (deleteError) {
                    console.error(`[Zolos] ❌ Error deleting inventory item ${itemName} for characterId ${characterId}:`, deleteError.message);
                    throw deleteError;
                }
                console.log(`[Zolos] 📦 saveInventoryItem deleted ${itemName} (qty=0) for characterId ${characterId}`);
            } else {
                const { error: updateError } = await supabase
                    .from('inventory')
                    .update({ quantity: newQty })
                    .eq('id', existing.id);
                if (updateError) {
                    console.error(`[Zolos] ❌ Error updating inventory item ${itemName} for characterId ${characterId}:`, updateError.message);
                    throw updateError;
                }
                console.log(`[Zolos] 📦 saveInventoryItem updated ${itemName} qty=${newQty} for characterId ${characterId}`);
            }
        }
    } catch (e) {
        console.error(`[Zolos] ❌ saveInventoryItem FAILED for characterId=${characterId}, itemName=${itemName}:`, e.message);
        return false;
    }
    return true;
}

export function saveInventoryItem(characterId, itemName, itemType, quantity, stats = {}) {
    return enqueueInventoryMutation(characterId, itemName,
        () => saveInventoryItemNow(characterId, itemName, itemType, quantity, stats));
}

/**
 * SET an inventory item's quantity to an ABSOLUTE value (and its stats),
 * inserting the row if missing. Unlike saveInventoryItem (which ADDS a delta),
 * this is idempotent — calling it repeatedly with the same quantity never
 * inflates the stack. Use it to persist the in-memory truth (periodic flush,
 * "ensure the row exists" before a stats update); use saveInventoryItem only
 * for +N / -N gameplay adjustments (pickups, uses, sells, trades).
 */
async function setInventoryItemQuantityNow(characterId, itemName, itemType, quantity, stats = {}) {
    const qty = Math.max(0, Math.floor(quantity) || 0);

    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        const inv = localDb.get(`inventory_${characterId}`) || [];
        const existing = inv.find(i => i.item_name === itemName);
        if (qty <= 0) {
            localDb.set(`inventory_${characterId}`, inv.filter(i => i.item_name !== itemName));
        } else if (existing) {
            existing.quantity = qty;
            existing.stats = stats;
        } else if (qty > 0) {
            inv.push({
                id: 'inv_' + Math.random().toString(36).substring(2, 10),
                character_id: characterId, item_name: itemName, item_type: itemType,
                quantity: qty, stats,
            });
        }
        localDb.set(`inventory_${characterId}`, inv);
        return true;
    }

    try {
        const { data: existing, error: fetchError } = await supabase
            .from('inventory')
            .select('id')
            .eq('character_id', characterId)
            .eq('item_name', itemName)
            .limit(1)
            .single();

        if (fetchError && fetchError.code === 'PGRST116') {
            if (qty > 0) {
                const { error: insertError } = await supabase.from('inventory')
                    .insert({ character_id: characterId, item_name: itemName, item_type: itemType, quantity: qty, stats });
                if (insertError) throw insertError;
            }
        } else if (fetchError) {
            throw fetchError;
        } else if (qty <= 0) {
            const { error: deleteError } = await supabase.from('inventory').delete()
                .eq('character_id', characterId)
                .eq('item_name', itemName);
            if (deleteError) throw deleteError;
        } else {
            const { error: updateError } = await supabase.from('inventory')
                .update({ quantity: qty, stats })
                .eq('id', existing.id);
            if (updateError) throw updateError;
        }
    } catch (e) {
        console.error(`[Zolos] ❌ setInventoryItemQuantity FAILED for characterId=${characterId}, itemName=${itemName}:`, e.message);
        return false;
    }
    return true;
}

export function setInventoryItemQuantity(characterId, itemName, itemType, quantity, stats = {}) {
    return enqueueInventoryMutation(characterId, itemName,
        () => setInventoryItemQuantityNow(characterId, itemName, itemType, quantity, stats));
}

async function updateInventoryItemStatsNow(characterId, itemName, stats) {
    console.log(`[Zolos] 🔄 updateInventoryItemStats called: characterId=${characterId}, itemName=${itemName}, stats=${JSON.stringify(stats)}`);

    if (isOfflineMode || !supabase || characterId.startsWith('guest_') || characterId.startsWith('local_')) {
        const inv = localDb.get(`inventory_${characterId}`) || [];
        const existing = inv.find(i => i.item_name === itemName);
        if (existing) {
            existing.stats = stats;
            localDb.set(`inventory_${characterId}`, inv);
        }
        console.log(`[Zolos] 🔄 [offline] updateInventoryItemStats completed for ${itemName}`);
        return true;
    }

    try {
        const { error } = await supabase
            .from('inventory')
            .update({ stats })
            .eq('character_id', characterId)
            .eq('item_name', itemName);

        if (error) {
            console.error(`[Zolos] ❌ updateInventoryItemStats FAILED for characterId=${characterId}, itemName=${itemName}:`, error.message);
            throw error;
        }
        console.log(`[Zolos] 🔄 updateInventoryItemStats succeeded for ${itemName} on characterId ${characterId}`);
    } catch (e) {
        console.error(`[Zolos] ❌ updateInventoryItemStats threw for characterId=${characterId}, itemName=${itemName}:`, e.message);
        return false;
    }
    return true;
}

export function updateInventoryItemStats(characterId, itemName, stats) {
    return enqueueInventoryMutation(characterId, itemName,
        () => updateInventoryItemStatsNow(characterId, itemName, stats));
}

function isCommittedFusionResult(result) {
    return Boolean(
        result && getCard(result.cardId)?.id === result.cardId
        && Number.isInteger(result.owned) && result.owned >= 0
        && Number.isInteger(result.stars) && result.stars >= 1 && result.stars <= 5
        && Number.isInteger(result.pity) && result.pity >= 0
        && typeof result.requestId === 'string',
    );
}

function publishCardFusionResult(result) {
    if (isCommittedFusionResult(result)) window.gameUI?.onCardFusionResult?.(result);
}

function publishCardFusionError(error) {
    if (error && typeof error.requestId === 'string') window.gameUI?.onCardFusionError?.(error);
}

function attachCardFusionListeners(socket) {
    if (!socket || cardFusionSocket === socket) return;
    cardFusionSocket = socket;
    socket.on('card_fusion_result', (result) => {
        const pending = pendingCardFusions.get(result?.requestId);
        if (!pending || !isCommittedFusionResult(result)) return;
        pendingCardFusions.delete(result.requestId);
        clearTimeout(pending.timeout);
        publishCardFusionResult(result);
        pending.resolve(result);
    });
    socket.on('card_fusion_error', (error) => {
        const pending = pendingCardFusions.get(error?.requestId);
        if (!pending) return;
        pendingCardFusions.delete(error.requestId);
        clearTimeout(pending.timeout);
        publishCardFusionError(error);
        const failure = new Error(error.message || 'หลอมการ์ดไม่สำเร็จ');
        failure.cardFusionPublished = true;
        pending.reject(failure);
    });
}

function offlineFusionContext() {
    const gameUI = window.gameUI;
    const characterId = gameUI?.characterId || gameUI?.character?.id;
    if (!gameUI?.character?.cardState || !characterId) throw new Error('ไม่พบข้อมูลการ์ดของตัวละคร');
    return { gameUI, characterId };
}

function buildOfflineFusionInventory(inventory, cardId, row) {
    return (inventory || []).map((item) => {
        if (item?.item_type !== 'card' || getCard(item.item_name)?.id !== cardId) return item;
        return {
            ...item,
            quantity: row.owned,
            stats: { ...(item.stats || {}), card_id: cardId, card_stars: row.stars, card_pity: row.pity },
        };
    });
}

async function requestOfflineCardFusion(cardId, requestId) {
    const { gameUI, characterId } = offlineFusionContext();
    const nextCardState = fuseCard(structuredClone(gameUI.character.cardState), cardId);
    const row = nextCardState[cardId];
    const nextInventory = buildOfflineFusionInventory(structuredClone(gameUI.inventory || []), cardId, row);
    const result = { cardId, owned: row.owned, stars: row.stars, pity: row.pity, requestId };

    // One snapshot contains the complete next state and is written before UI
    // notification, so a storage failure cannot spend duplicates in memory.
    localDb.set(`card_fusion_${characterId}`, { cardState: nextCardState, inventory: nextInventory });
    publishCardFusionResult(result);
    return result;
}

export async function requestCardFusion(cardId, requestId, opts = {}) {
    const card = typeof cardId === 'string' ? getCard(cardId) : null;
    if (!card || card.id !== cardId) throw new Error('ไม่พบการ์ดที่ต้องการหลอม');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(requestId)) {
        throw new Error('รหัสคำขอหลอมการ์ดไม่ถูกต้อง');
    }
    const useDust = opts?.useDust === true;

    // Offline has no Stardust ledger, so dust-assisted fusion is server-only.
    if (isOfflineMode || !isSocketMode()) {
        if (useDust) throw new Error('การเติมผงดาวใช้ได้เฉพาะตอนออนไลน์');
        return requestOfflineCardFusion(cardId, requestId);
    }

    const socket = getSocket();
    if (!socket?.connected) throw new Error('การเชื่อมต่อหลุด กรุณาลองใหม่อีกครั้ง');
    attachCardFusionListeners(socket);
    if (pendingCardFusions.has(requestId)) throw new Error('คำขอหลอมการ์ดนี้กำลังดำเนินการอยู่');

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingCardFusions.delete(requestId);
            reject(new Error('การหลอมการ์ดหมดเวลา กรุณาลองใหม่อีกครั้ง'));
        }, 20_000);
        pendingCardFusions.set(requestId, { resolve, reject, timeout });
        socket.emit('card_fuse', { cardId, requestId, useDust });
    });
}

// ============ Card refine (dupes → Stardust) + economy ============
const pendingCardRefines = new Map();
let cardRefineSocket = null;

function isCommittedCardRefineResult(result) {
    return Boolean(result
        && getCard(result.cardId)?.id === result.cardId
        && Number.isInteger(result.owned) && result.owned >= 0
        && Number.isInteger(result.stardust) && result.stardust >= 0
        && typeof result.requestId === 'string');
}

function attachCardRefineListeners(socket) {
    if (!socket || cardRefineSocket === socket) return;
    cardRefineSocket = socket;
    socket.on('card_refine_result', (result) => {
        const pending = pendingCardRefines.get(result?.requestId);
        if (!pending) return;
        pendingCardRefines.delete(result.requestId);
        clearTimeout(pending.timeout);
        if (!isCommittedCardRefineResult(result)) {
            pending.reject(new Error('Invalid card refine response'));
            return;
        }
        window.gameUI?.onCardRefineResult?.(result);
        pending.resolve(result);
    });
    socket.on('card_refine_error', (error) => {
        const pending = pendingCardRefines.get(error?.requestId);
        if (!pending) return;
        pendingCardRefines.delete(error.requestId);
        clearTimeout(pending.timeout);
        const failure = new Error(error?.message || 'ถลุงการ์ดไม่สำเร็จ');
        failure.cardFusionPublished = true;
        pending.reject(failure);
    });
    // Balance/economy push (reply to card_econ or after a change).
    socket.on('card_econ', (payload) => window.gameUI?.onCardEcon?.(payload));
}

export async function requestCardRefine(cardId, count, requestId) {
    const card = typeof cardId === 'string' ? getCard(cardId) : null;
    if (!card || card.id !== cardId) throw new Error('ไม่พบการ์ดที่ต้องการถลุง');
    if (!Number.isInteger(count) || count < 1) throw new Error('จำนวนการ์ดไม่ถูกต้อง');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(requestId)) {
        throw new Error('รหัสคำขอไม่ถูกต้อง');
    }
    if (isOfflineMode || !isSocketMode()) throw new Error('การถลุงการ์ดใช้ได้เฉพาะตอนออนไลน์');

    const socket = getSocket();
    if (!socket?.connected) throw new Error('การเชื่อมต่อหลุด กรุณาลองใหม่อีกครั้ง');
    attachCardRefineListeners(socket);
    if (pendingCardRefines.has(requestId)) throw new Error('คำขอถลุงการ์ดนี้กำลังดำเนินการอยู่');

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingCardRefines.delete(requestId);
            reject(new Error('การถลุงการ์ดหมดเวลา กรุณาลองใหม่อีกครั้ง'));
        }, 20_000);
        pendingCardRefines.set(requestId, { resolve, reject, timeout });
        socket.emit('card_refine', { cardId, count, requestId });
    });
}

// Ask the server for our Stardust balance + current economy rates.
export function requestCardEcon() {
    if (isOfflineMode || !isSocketMode()) return;
    const socket = getSocket();
    if (!socket?.connected) return;
    attachCardRefineListeners(socket);
    socket.emit('card_econ');
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
        return sorted.slice(0, 50);
    }

    const applyOrder = (q) => {
        if (category === 'gold') return q.order('gold', { ascending: false });
        if (category === 'kills') return q.order('total_kills', { ascending: false });
        if (category === 'playtime') return q.order('play_time', { ascending: false });
        if (category === 'pvp') return q.order('mmr', { ascending: false }).order('pvp_wins', { ascending: false });
        return q.order('level', { ascending: false }).order('total_kills', { ascending: false });
    };

    // `id` (the char_xxx character id) is needed by the in-game admin panel so
    // its edit/give/delete RPCs target the right character — admin_*_character
    // look up WHERE id = target_char_id, not by user_id.
    const cols = 'id, name, level, total_kills, gold, zol, play_time, mmr, pvp_wins, pvp_losses, user_id';
    let query = applyOrder(supabase.from('characters').select(`${cols}, profiles(username)`));

    let { data, error } = await query.limit(50);
    if (error) {
        console.warn('[Zolos] fetchLeaderboard error with profiles relation, retrying without profiles:', error.message);
        // Fallback when database has relationship key mapping cache issue
        const res = await applyOrder(supabase.from('characters').select(cols)).limit(50);
        data = res.data;
    }
    return data || [];
}

// ============ Realtime Presence & Broadcast (Socket.io) ============
export async function joinPresence(userId, username, level, onPlayersUpdate, onPlayerPositionUpdate, onChatCallback, currentMapId = 'prontera', characterId = null) {
    onlinePlayersCallback = onPlayersUpdate;
    chatCallback = onChatCallback;
    playerPositionCallback = onPlayerPositionUpdate;

    // Store player info for later use in updatePresence/broadcast
    currentUserId = userId;
    currentUsername = username;
    currentLevel = level;
    activeMapId = currentMapId || 'prontera';
    currentCharacterId = characterId;

    // ===== OFFLINE MODE (No Mock Players) =====
    // Skip this gate when Socket.io is available — the map server handles
    // player presence and ping measurement independently of Supabase.
    if (isOfflineMode && !isSocketMode()) {
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

        // Re-emit `join` on every (re)connect. A dropped socket reconnects with
        // a NEW socket.id and is NOT in any map room until it re-joins; without
        // this the player becomes a "ghost" — still counted in the global online
        // number, but invisible to others and unable to see them (their `pos` is
        // rejected server-side, and they receive no map broadcasts). The map and
        // level are read live so a reconnect after warping/leveling stays correct.
        const emitJoin = async () => {
            let accessToken = null;
            try { accessToken = (await supabase?.auth?.getSession())?.data?.session?.access_token || null; } catch (e) { /* guest */ }
            const liveMap = (typeof window !== 'undefined' && window.sceneManager?.currentMap) || activeMapId;
            const liveLevel = (typeof window !== 'undefined' && window.character?.stats?.level) || currentLevel;
            socket.emit('join', { userId: currentUserId, username: currentUsername, level: liveLevel, mapId: liveMap, characterId: currentCharacterId, accessToken, device: getDeviceType() });
            console.log('[Zolos] ✅ Emitted join to Map Server (map=' + liveMap + ')');
        };

        // Attach event listeners (only once)
        if (!socketListenersAttached || socketListenersOwner !== socket) {
            // Whenever the underlying connection is (re)established, re-join our
            // map room instead of lingering as a ghost. The initial connection is
            // already up here (so this fires only on later reconnects); the first
            // join is emitted explicitly below.
            socket.on('connect', emitJoin);
            socket.on('disconnect', rejectPendingSocketRequests);

            socket.on('players_update', (players) => {
                players = normalizeRoster(players);
                console.log('[Zolos] 👥 Players update via Socket.io:', players.length, players.map(p => p.username));
                if (onlinePlayersCallback) onlinePlayersCallback(players);
            });

            // Full cross-map roster → drives the Online Players panel so it
            // shows everyone online across all cities. Emitted after
            // players_update, so this is what the panel ends up displaying.
            socket.on('players_global', (players) => {
                players = normalizeRoster(players);
                if (window.gameUI && typeof window.gameUI.updateOnlinePlayers === 'function') {
                    window.gameUI.updateOnlinePlayers(players);
                }
            });

            socket.on('pos', (payload) => {
                if (playerPositionCallback && payload && payload.userId !== currentUserId) {
                    playerPositionCallback(payload);
                }
            });

            // Latency: reply to the server's periodic ping so it can measure our
            // round-trip time and put it in the Online roster (players_global).
            socket.on('srv_ping', (t) => {
                if (socket && socket.connected) {
                    socket.emit('srv_pong', t);
                }
            });

            // Client-side RTT measurement: we send client_ping(timestamp),
            // server echoes it back as client_pong(timestamp), and we compute
            // our own round-trip latency so the UI can show it immediately.
            socket.on('client_pong', (t) => {
                if (typeof t === 'number') {
                    const rtt = Date.now() - t;
                    if (rtt >= 0 && rtt < 60000) {
                        clientMeasuredPing = clientMeasuredPing == null
                            ? rtt : Math.round(clientMeasuredPing * 0.5 + rtt * 0.5);
                    }
                }
            });
            // Start periodic client_ping using multi-strategy measurePing helper
            if (!clientPingInterval) {
                const runPing = async () => {
                    try {
                        const { measurePing } = await import('./SocketClient.js');
                        const ms = await measurePing();
                        if (ms != null) {
                            clientMeasuredPing = clientMeasuredPing == null
                                ? ms : Math.round(clientMeasuredPing * 0.5 + ms * 0.5);
                        }
                    } catch (e) {
                        console.warn('[GameSync] Ping measurement failed:', e);
                    }
                };
                clientPingInterval = setInterval(runPing, 5000);
                // Fire first ping immediately
                runPing();
            }

            socket.on('chat', (payload) => {
                if (chatCallback && payload) {
                    if (typeof payload.message === 'string') payload.message = censorText(payload.message);
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

            socket.on('admin_character_update', (payload) => {
                const character = window.character;
                if (!character || !payload || String(payload.characterId) !== String(character.characterId)) return;
                const updates = payload.updates || {};
                const numeric = new Set(['level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp', 'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'mmr', 'pvp_wins', 'pvp_losses']);
                for (const [key, value] of Object.entries(updates)) {
                    if (numeric.has(key) && Number.isFinite(Number(value))) character.stats[key] = Number(value);
                    else if (key === 'name' || key === 'job' || key === 'last_map') character.stats[key] = value;
                }
                if (updates.atk !== undefined) character.stats._baseAtk = Number(updates.atk);
                if (updates.def !== undefined) character.stats._baseDef = Number(updates.def);
                if (updates.max_hp !== undefined) character.stats._baseMaxHp = Number(updates.max_hp);
                if (updates.max_sp !== undefined) character.stats._baseMaxSp = Number(updates.max_sp);
                window.gameUI?.updateHUD?.(character.stats);
                window.gameUI?.updateStats?.(character.stats);
                const money = `${updates.gold !== undefined ? ` · Gold ${Number(updates.gold).toLocaleString()}` : ''}${updates.zol !== undefined ? ` · ZOL ${Number(updates.zol).toLocaleString()}` : ''}`;
                window.gameUI?.addCombatLog?.(`🎁 Admin อัปเดตข้อมูลตัวละครแล้ว${money}`, 'levelup');
            });

            socket.on('trade_request', (payload) => {
                if (payload
                    && payload.targetUserId === currentUserId
                    && (!payload.targetCharacterId || payload.targetCharacterId === currentCharacterId)) {
                    if (window.gameUI) window.gameUI.receiveTradeRequest(payload);
                }
            });

            socket.on('trade_response', (payload) => {
                if (payload && payload.senderUserId === currentUserId) {
                    if (window.gameUI) window.gameUI.receiveTradeResponse(payload);
                }
            });

            socket.on('trade_cancel', (payload) => {
                if (payload && payload.targetUserId === currentUserId) {
                    if (window.gameUI && typeof window.gameUI.receiveTradeCancel === 'function') {
                        window.gameUI.receiveTradeCancel(payload);
                    }
                }
            });

            socket.on('friend_request', (payload) => {
                if (payload && payload.targetUserId === currentUserId) {
                    if (window.gameUI && typeof window.gameUI.receiveFriendRequest === 'function') {
                        window.gameUI.receiveFriendRequest(payload);
                    }
                }
            });

            socket.on('friend_response', (payload) => {
                if (payload && payload.senderUserId === currentUserId) {
                    if (window.gameUI && typeof window.gameUI.receiveFriendResponse === 'function') {
                        window.gameUI.receiveFriendResponse(payload);
                    }
                }
            });

            // ===== PVP DUEL =====
            socket.on('duel_request', (payload) => {
                if (payload && payload.targetUserId === currentUserId) {
                    if (window.gameUI && typeof window.gameUI.receiveDuelRequest === 'function') {
                        window.gameUI.receiveDuelRequest(payload);
                    }
                }
            });

            socket.on('duel_response', (payload) => {
                if (payload && payload.senderUserId === currentUserId) {
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
                if (payload && payload.targetUserId === currentUserId) {
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
            socket.on('warp_result', (payload) => {
                console.error('[Warp DEBUG] warp_result received:', payload);
                window.warpManager?.onWarpResult?.(payload);
            });
            socket.on('skyrail_closed', () => {
                window.gameUI?.addCombatLog?.('🚉 Skyrail Bazaar ปิดแล้ว พบกันทุกวัน 18:00–23:59 น.', 'warning');
                if (window.sceneManager?.currentMap === 'skyrail_bazaar') window.gameUI?._doWarp?.('prontera');
            });

            // ===== VENDING STALLS =====
            socket.on('stalls_update', () => window.stallManager?.refresh?.());

            // ===== WORLD BOSS =====
            socket.on('boss_state', (payload) => window.worldBossManager?.onState?.(payload));
            socket.on('boss_spawn', (payload) => window.worldBossManager?.onSpawn?.(payload));
            socket.on('boss_hp', (payload) => window.worldBossManager?.onHp?.(payload));
            socket.on('boss_dead', (payload) => window.worldBossManager?.onDead?.(payload));
            socket.on('boss_flee', (payload) => window.worldBossManager?.onFlee?.(payload));
            socket.on('card_reward', (payload) => window.cardRewardManager?.onReward?.(payload));

            // Shared monster HP — a teammate hit a monster; drain our copy too.
            // (Legacy path — only used when the server engine is OFF.)
            socket.on('monster_hit', (payload) => {
                if (payload) window.applyRemoteMonsterHit?.(payload.monsterId, payload.damage);
            });

            // ===== Server-authoritative monsters (Phase 2) =====
            // The server tells us which model is authoritative. Store it so the
            // MonsterManager switches to render-only mode, then notify.
            socket.on('world_mode', (payload) => {
                window.__serverMonsters = !!(payload && payload.serverMonsters);
                window.onWorldMode?.(payload);
            });
            // ~10Hz snapshot of every server-owned monster on our map.
            socket.on('mon_state', (payload) => { if (payload) window.onMonState?.(payload); });
            // A server monster died — play death FX + queue respawn locally.
            socket.on('mon_dead', (payload) => { if (payload) window.onMonDead?.(payload); });
            // We contributed to a kill — the server grants exp/gold authoritatively.
            socket.on('mon_reward', (payload) => { if (payload) window.onMonReward?.(payload); });
            // The server rolled a drop for us (already written to our inventory).
            socket.on('mon_loot', (payload) => { if (payload) window.onMonLoot?.(payload); });
            // A server monster struck us while chasing.
            socket.on('mon_atk', (payload) => { if (payload) window.onMonAtk?.(payload); });
            socket.on('mon_atk_fx', (payload) => { if (payload) window.onMonAtkFx?.(payload); });
            // Admin changed world config — refetch defs if the version moved.
            socket.on('world_config', (payload) => { if (payload) window.onWorldConfig?.(payload); });

            // A teammate cast a skill — play its effect on our screen too.
            socket.on('skill_cast', (payload) => {
                if (payload) window.onRemoteSkillCast?.(payload);
            });

            // A teammate landed a hit — render the slash/sparks/damage number.
            socket.on('attack_hit', (payload) => {
                if (payload) window.onRemoteAttackHit?.(payload);
            });

            socketListenersAttached = true;
            socketListenersOwner = socket;
        }

        // Initial join. Includes the Supabase access token so the server can
        // verify our identity (userId) instead of trusting it blindly; guests
        // have no token and stay unverified. Later reconnects re-join via the
        // `connect` handler registered above.
        await emitJoin();
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

// Relay a hit on a shared monster to everyone else on the map so their copy of
// that monster loses the same HP (server excludes the sender).
export function broadcastMonsterHit(monsterId, damage, currentMapId = 'prontera') {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('monster_hit', { monsterId, damage, mapId: currentMapId });
    }
}

// Phase 2: report a hit on a SERVER-OWNED monster. The server subtracts the
// (clamped) damage from the shared HP and, on death, grants exp/gold/drops.
export function reportMonsterHit(monsterId, damage, crit = false) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('mon_hit', { monsterId, damage, crit });
    }
}

// Tell the map that we hit a target so everyone can render the slash/sparks/damage number.
export function broadcastAttackHit(targetX, targetZ, isCritical, damage, weaponSoundClass, currentMapId = 'prontera') {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('attack_hit', {
            tc: isCritical ? 1 : 0,
            dmg: Math.max(0, Math.min(99999, Math.floor(damage || 0))),
            wsc: weaponSoundClass || 'melee',
            tx: targetX,
            tz: targetZ,
            mapId: currentMapId,
        });
    }
}

export function broadcastSkillCast(skillId, targetX, targetZ, currentMapId = 'prontera') {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('skill_cast', { skillId, tx: targetX, tz: targetZ, mapId: currentMapId });
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
            chatCallback({ userId, username, message: censorText(message) });
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
    activeMapId = currentMapId || activeMapId;
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
    socketListenersOwner = null;
    playerPositionCallback = null;
    currentCharacterId = null;
    rejectPendingSocketRequests();

    if (presenceUpdateInterval) {
        clearInterval(presenceUpdateInterval);
        presenceUpdateInterval = null;
    }

    if (offlineChatInterval) {
        clearInterval(offlineChatInterval);
        offlineChatInterval = null;
    }

    if (clientPingInterval) {
        clearInterval(clientPingInterval);
        clientPingInterval = null;
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
    const generation = autoSaveGeneration;
    autoSaveInterval = setInterval(async () => {
        if (autoSaveInFlight || (typeof document !== 'undefined' && document.hidden)) return;
        const state = getStateCallback();
        if (state && state.characterId) {
            autoSaveInFlight = true;
            try {
            // Save directly to Supabase
            if (state.userId) {
                await saveCharacterByUserId(state.userId, state.updates);
            } else {
                await saveCharacter(state.characterId, state.updates);
            }

            // Also send state to Socket server for save-on-disconnect backup
            if (generation === autoSaveGeneration) sendSaveState(state);
            } catch (error) {
                console.warn('[Zolos] Autosave failed; the next interval will retry:', error?.message || error);
            } finally {
                autoSaveInFlight = false;
            }
        }
    }, intervalMs);
}
export function stopAutoSave() {
    autoSaveGeneration++;
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    // Do not clear the lock while an older database write is still pending.
    // Its finally block releases the lock; a replacement session must not
    // overlap that write or let the old completion alter its server backup.
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
        // Authenticated listings must be escrowed atomically: the server checks
        // character ownership and inventory quantity, removes the offered item,
        // then creates the listing in one transaction. The browser never gets to
        // mint a listing by merely posting a marketplace row.
        const { data, error } = await supabase.rpc('create_market_listing', {
            p_character_id: sellerCharId,
            p_item_name: itemName,
            p_quantity: quantity,
            p_price: price,
        });

        if (error || !data?.ok || !data.listing) {
            console.error('[Zolos] ❌ Atomic marketplace listing FAILED:', error?.message || data?.reason);
            listingData._failed = true;
            return listingData;
        }
        console.log('[Zolos] ✅ Atomic marketplace listing created:', data.listing.id);
        return { ...data.listing, _serverAuthoritative: true };
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
    const isRemoteListing = !isOfflineMode && supabase
        && !characterId.startsWith('guest_') && !characterId.startsWith('local_')
        && !String(listingId).startsWith('mock_') && !String(listingId).startsWith('listing_');
    if (isRemoteListing) {
        const { data, error } = await supabase.rpc('cancel_market_listing', {
            p_listing_id: listingId,
        });
        if (error || !data?.ok) {
            console.warn('[Zolos] Atomic marketplace cancel failed:', error?.message || data?.reason);
            return false;
        }
        return { ok: true, serverAuthoritative: true };
    }

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

export async function openVendingStall(characterId, ownerName, shopName, appearance, requestedSlot = null) {
    if (isOfflineMode || !supabase) return { ok: false, reason: 'offline' };
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, reason: 'guest' };

        // Use the stand the player clicked. Calls without a requested stand keep
        // the old first-free fallback for backwards compatibility.
        const { data: taken } = await supabase.from('vending_stalls').select('slot, user_id');
        const mine = (taken || []).find(s => s.user_id === user.id);
        let slot = -1;
        if (requestedSlot !== null && requestedSlot !== undefined) {
            const chosenSlot = Number(requestedSlot);
            if (!Number.isInteger(chosenSlot) || chosenSlot < 0 || chosenSlot >= 8) {
                return { ok: false, reason: 'invalid_slot' };
            }
            const occupiedByAnother = (taken || []).some(
                s => Number(s.slot) === chosenSlot && s.user_id !== user.id
            );
            if (occupiedByAnother) return { ok: false, reason: 'taken' };
            slot = chosenSlot;
        } else if (mine) {
            slot = Number(mine.slot);
        } else {
            const usedSlots = new Set((taken || []).map(s => Number(s.slot)));
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
        };
        const { error } = await supabase.from('vending_stalls').upsert(row, { onConflict: 'user_id' });
        if (error) throw error;

        // Nudge everyone to refresh their stall view
        const socket = getSocket();
        if (socket && isSocketConnected()) socket.emit('stall_change', {});
        return { ok: true, slot, moved: !!mine && Number(mine.slot) !== slot };
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
            return { success: true, serverAuthoritative: true, buyerGold: data.buyer_gold };
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
export async function sendTradeRequestPacket(senderCharId, senderName, targetUserId, targetName, itemName, itemType, quantity, price, stats = {}, targetCharacterId = null) {
    const requestId = `trade:${senderCharId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
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
                        targetCharacterId: targetCharacterId,
                        targetName: targetName,
                        itemName: itemName,
                        itemType: itemType,
                        quantity: quantity,
                        price: price,
                        stats: stats,
                        requestId,
                    }
                });
            }
        }, 1500);
        return { success: true, requestId };
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('trade_request', {
            senderUserId: currentUserId,
            senderCharacterId: senderCharId,
            senderName: senderName,
            targetUserId: targetUserId,
            targetCharacterId: targetCharacterId,
            targetName: targetName,
            itemName: itemName,
            itemType: itemType,
            quantity: quantity,
            price: price,
            stats: stats,
            requestId,
        });
    }
    return { success: true, requestId };
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
    if (typeof receiverCharId !== 'string' || !receiverCharId
        || typeof itemName !== 'string' || !itemName || itemName.length > 120
        || typeof itemType !== 'string' || !itemType || itemType.length > 40
        || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999
        || !Number.isSafeInteger(price) || price < 0 || price > 2_147_483_647
        || !stats || typeof stats !== 'object' || Array.isArray(stats)) {
        throw new Error('Invalid incoming trade payload');
    }
    // Card refinement is owner-bound. Never trust or inherit card star/pity
    // fields supplied by another client; every received copy starts at ★1.
    const receivedStats = itemType === 'card'
        ? { card_id: stats.card_id, card_stars: 1, card_pity: 0 }
        : stats;
    await saveInventoryItem(receiverCharId, itemName, itemType, quantity, receivedStats);

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
    const requestId = `friend:${currentUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
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
                        targetName: targetName,
                        requestId
                    }
                });
            }
        }, 1000);
        return { success: true, requestId };
    }

    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('friend_request', {
            senderUserId: currentUserId,
            senderName: senderName,
            senderLevel: senderLevel,
            targetUserId: targetUserId,
            targetName: targetName,
            requestId
        });
    }
    return { success: true, requestId };
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
        const requestId = `duel:${currentUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
        socket.emit('duel_request', {
            senderUserId: currentUserId,
            senderName,
            senderLevel,
            targetUserId,
            targetName,
            requestId,
        });
        return { success: true, requestId };
    }
    return { success: false, reason: 'not_connected' };
}

export function sendDuelResponse(senderUserId, accepted, requestId) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('duel_response', {
            senderUserId,           // the challenger (recipient of this response)
            targetUserId: currentUserId, // the accepter
            accepted,
            requestId,
        });
    }
}

export function sendDuelHit(duelId, targetUserId, damage, critical = false) {
    if (isOfflineMode) return;
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('duel_hit', {
            duelId,
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
    const requestId = `warp:${currentUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    if (isOfflineMode) {
        if (!targetUserId) return { success: false };
        const list = (typeof mockPlayers !== 'undefined' && Array.isArray(mockPlayers)) ? mockPlayers : [];
        const mockPlayer = list.find(p => p.userId === targetUserId || p.username === targetUserId);
        if (mockPlayer) {
            setTimeout(() => {
                if (window.warpManager && typeof window.warpManager.onWarpResult === 'function') {
                    window.warpManager.onWarpResult({
                        ok: true,
                        targetUserId: mockPlayer.userId,
                        targetName: mockPlayer.username,
                        mapId: mockPlayer.mapId || 'prontera',
                        x: typeof mockPlayer.x === 'number' ? mockPlayer.x : 0,
                        y: typeof mockPlayer.y === 'number' ? mockPlayer.y : 1.2,
                        z: typeof mockPlayer.z === 'number' ? mockPlayer.z : 10,
                        requestId
                    });
                }
            }, 100);
            return { success: true, requestId };
        }
        console.error('[Warp DEBUG] Offline mode: no mock player found for', targetUserId);
        return { success: false };
    }
    if (!targetUserId) return { success: false };
    const socket = getSocket();
    if (socket && isSocketConnected()) {
        socket.emit('warp_request', { targetUserId, requestId });
        return { success: true, requestId };
    }
    return { success: false };
}

// ============ Offline Mock Presence (unchanged) ============
function _startOfflineMockPresence(userId, username, level, onPlayersUpdate, onPlayerPositionUpdate, onChatCallback) {
    if (presenceUpdateInterval) clearInterval(presenceUpdateInterval);
    if (offlineChatInterval) clearInterval(offlineChatInterval);
    // Simulate real online players
    const names = ['XyzRef', 'PoringsLayer', 'PoringHunter', 'MerchantSatoshi', 'WarlockZee', 'SniperSky'];
    const mapIds = ['prontera', 'payon', 'glast_heim', 'mjolnir', 'abyss_lake', 'svarrga'];
    const devices = ['desktop', 'mobile', 'tablet'];

    mockPlayers = [
        { userId: 'player_me', username, level, device: getDeviceType(), mapId: 'prontera', ping: 12 }
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
            state: 'idle',
            device: devices[Math.floor(Math.random() * devices.length)],
            mapId: mapIds[Math.floor(Math.random() * mapIds.length)],
            ping: Math.floor(Math.random() * 150) + 15
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
                state: 'idle',
                device: devices[Math.floor(Math.random() * devices.length)],
                mapId: mapIds[Math.floor(Math.random() * mapIds.length)],
                ping: Math.floor(Math.random() * 150) + 15
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
    offlineChatInterval = setInterval(() => {
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
