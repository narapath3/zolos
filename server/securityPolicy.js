import { getCard } from './cards/CardCatalog.js';

const DEFAULT_ORIGINS = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'https://zolos.online',
    'https://www.zolos.online',
    'https://zolos.vercel.app',
    'https://zolos-multiplayer.vercel.app',
]);

const PROGRESSION_RULES = {
    level: { min: 1, max: 300, increasePerMinute: 3 },
    exp: { min: 0, max: 2_147_483_647, increasePerMinute: 5_000_000 },
    hp: { min: 0, max: 1_000_000, increasePerMinute: 100_000 },
    max_hp: { min: 1, max: 1_000_000, increasePerMinute: 100_000 },
    sp: { min: 0, max: 1_000_000, increasePerMinute: 100_000 },
    max_sp: { min: 0, max: 1_000_000, increasePerMinute: 100_000 },
    atk: { min: 0, max: 1_000_000, increasePerMinute: 10_000 },
    def: { min: 0, max: 1_000_000, increasePerMinute: 10_000 },
    gold: { min: 0, max: 500_000_000, increasePerMinute: 2_000_000 },
    zol: { min: 0, max: 2_147_483_647, increasePerMinute: 500 },
    total_kills: { min: 0, max: 2_147_483_647, increasePerMinute: 1_000 },
    play_time: { min: 0, max: 2_147_483_647, increasePerMinute: 120 },
};

const EQUIPMENT_FIELDS = new Set(['weapon', 'hat', 'glasses', 'shield', 'armor']);
const PERSISTED_JOB_ALIASES = Object.freeze({ swordman: 'swordsman', acolyte: 'priest' });
const PERSISTED_JOB_IDS = new Set(['swordsman', 'mage', 'archer', 'priest']);

export function normalizePersistedJob(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    const canonical = PERSISTED_JOB_ALIASES[raw] || raw;
    return PERSISTED_JOB_IDS.has(canonical) ? canonical : null;
}
const COLOR_FIELDS = new Set(['body_color', 'hair_color', 'pants_color']);
const BOOLEAN_FIELDS = new Set(['sound_enabled', 'fps_enabled']);
const GRAPHICS_QUALITIES = new Set(['low', 'medium', 'high', 'ultra', 'auto']);
const CARD_SOCKET_SLOTS = new Set([
    'weapon', 'shield', 'hat', 'glasses', 'head', 'body', 'garment',
    'ring', 'wrist', 'pants', 'feet', 'accessory',
]);
const REMOTE_APPEARANCE_TEXT_FIELDS = new Set([
    'hat', 'glasses', 'weapon', 'shield', 'pet', 'petName', 'job', 'title',
]);
const REMOTE_APPEARANCE_MAP_FIELDS = new Set(['gear', 'refine', 'cards']);

function cardCategoryForSocket(slot) {
    if (slot === 'weapon') return 'weapon';
    if (slot === 'shield') return 'shield';
    if (slot === 'ring' || slot === 'wrist' || slot === 'accessory') return 'accessory';
    return 'armor';
}

// Outfit presets are client-supplied, so bound them hard: at most 30 sets, each
// with a short name and a slot map whose keys are real equip slots and whose
// values are short item-name strings. Anything malformed is dropped, never
// rejected, so one bad preset can't block the whole appearance save.
function sanitizeLoadouts(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const raw of value.slice(0, 30)) {
        if (!raw || typeof raw !== 'object') continue;
        const slots = {};
        if (raw.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots)) {
            for (const [slot, name] of Object.entries(raw.slots)) {
                if (!CARD_SOCKET_SLOTS.has(slot)) continue;
                slots[slot] = name == null ? null : String(name).slice(0, 64);
            }
        }
        out.push({
            id: String(raw.id ?? `ld_${out.length}`).slice(0, 40),
            name: String(raw.name ?? '').slice(0, 24),
            slots,
        });
    }
    return out;
}

function sanitizeAppearance(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const appearance = { ...value };
    if (Object.hasOwn(appearance, 'loadouts')) appearance.loadouts = sanitizeLoadouts(appearance.loadouts);
    if (!Object.hasOwn(appearance, 'cards')) return appearance;
    if (!appearance.cards || typeof appearance.cards !== 'object' || Array.isArray(appearance.cards)) return null;

    const cards = {};
    const claimedCardIds = new Set();
    for (const [slot, rawCardId] of Object.entries(appearance.cards)) {
        if (!CARD_SOCKET_SLOTS.has(slot)) return null;
        if (rawCardId == null || rawCardId === '') {
            cards[slot] = null;
            continue;
        }
        const card = getCard(rawCardId);
        if (!card || card.slot !== cardCategoryForSocket(slot) || claimedCardIds.has(card.id)) return null;
        claimedCardIds.add(card.id);
        cards[slot] = card.id;
    }
    appearance.cards = cards;
    return appearance;
}

export function sanitizeRemoteAppearance(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out = {};
    if (value.gender === 'male' || value.gender === 'female') out.gender = value.gender;
    for (const key of ['bodyColor', 'hairColor', 'pantsColor']) {
        const color = boundedInteger(value[key], 0, 0xffffff);
        if (color !== null) out[key] = color;
    }
    for (const key of REMOTE_APPEARANCE_TEXT_FIELDS) {
        if (value[key] === null) out[key] = null;
        else if (typeof value[key] === 'string') out[key] = value[key].slice(0, key === 'petName' ? 32 : 64);
    }
    const petLevel = boundedInteger(value.petLevel, 1, 300);
    if (petLevel !== null) out.petLevel = petLevel;
    for (const key of REMOTE_APPEARANCE_MAP_FIELDS) {
        if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) continue;
        const map = {};
        for (const [slot, raw] of Object.entries(value[key]).slice(0, 16)) {
            if (!/^[A-Za-z0-9_-]{1,32}$/.test(slot)) continue;
            if (key === 'refine') {
                const rank = boundedInteger(raw, 0, 20);
                if (rank !== null) map[slot] = rank;
            } else if (raw === null || typeof raw === 'string') {
                map[slot] = raw === null ? null : raw.slice(0, 64);
            }
        }
        out[key] = map;
    }
    return Object.keys(out).length ? out : null;
}

export function clearSocketMappingIfCurrent(userSocketMap, userId, socketId) {
    if (userSocketMap?.get(userId) !== socketId) return false;
    userSocketMap.delete(userId);
    return true;
}

function boundedInteger(value, min, max) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    if (parsed < min || parsed > max) return null;
    return parsed;
}

function sanitizeProgressionValue(key, value, previous, elapsedMs) {
    const rule = PROGRESSION_RULES[key];
    const next = boundedInteger(value, rule.min, rule.max);
    if (next === null) return null;

    const prior = boundedInteger(previous?.[key], rule.min, rule.max);
    if (prior === null) return next;
    // Kill totals are now incremented by the authoritative monster engine. A
    // periodic client snapshot captured just before a kill must never be able to
    // overwrite the newer database value with its stale lower counter.
    if (key === 'total_kills' && next < prior) return null;
    if (next <= prior) return next;

    const elapsedMinutes = Math.max(1, Math.min(60, Number(elapsedMs) / 60_000 || 1));
    const maxIncrease = rule.increasePerMinute * elapsedMinutes;
    return next - prior <= maxIncrease ? next : null;
}

export function sanitizeSaveUpdates(updates, previousUpdates = null, elapsedMs = 60_000) {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return {};

    const sanitized = {};
    for (const [key, value] of Object.entries(updates)) {
        if (Object.hasOwn(PROGRESSION_RULES, key)) {
            const safeValue = sanitizeProgressionValue(key, value, previousUpdates, elapsedMs);
            if (safeValue !== null) sanitized[key] = safeValue;
            continue;
        }

        if (key === 'name') {
            const name = String(value ?? '').trim().slice(0, 32);
            if (name) sanitized.name = name;
        } else if (key === 'last_map') {
            sanitized.last_map = normalizeMapId(value);
        } else if (key === 'job') {
            const job = normalizePersistedJob(value);
            if (job) sanitized.job = job;
        } else if (EQUIPMENT_FIELDS.has(key)) {
            sanitized[key] = String(value ?? '').slice(0, 64);
        } else if (COLOR_FIELDS.has(key)) {
            const color = boundedInteger(value, 0, 0xffffff);
            if (color !== null) sanitized[key] = color;
        } else if (key === 'gender' && (value === 'male' || value === 'female')) {
            sanitized.gender = value;
        } else if (BOOLEAN_FIELDS.has(key) && typeof value === 'boolean') {
            sanitized[key] = value;
        } else if (key === 'graphics_quality' && GRAPHICS_QUALITIES.has(value)) {
            sanitized.graphics_quality = value;
        } else if (key === 'appearance') {
            const appearance = sanitizeAppearance(value);
            if (appearance !== null) sanitized.appearance = appearance;
        }
    }
    return sanitized;
}

export function normalizeMapId(value) {
    const mapId = String(value ?? '').trim();
    return /^[a-z0-9_]{1,48}$/.test(mapId) ? mapId : 'prontera_field';
}

export function resolveTrustedMap(player) {
    return normalizeMapId(player?.mapId);
}

export function normalizePresence(input = {}, currentLevel = null) {
    const username = String(input.username || 'Adventurer').trim().slice(0, 32) || 'Adventurer';
    const parsedLevel = Number.parseInt(input.level, 10);
    let level = Number.isFinite(parsedLevel) ? Math.max(1, Math.min(300, parsedLevel)) : 1;
    if (currentLevel !== null && Number.isFinite(currentLevel) && currentLevel > 0) {
        level = Math.min(level, currentLevel + 2);
    }
    return { username, level, mapId: normalizeMapId(input.mapId) };
}

export function serializeOnlinePlayer(info = {}) {
    const presence = normalizePresence(info);
    const rawPing = Number(info.ping);
    const ping = (Number.isFinite(rawPing) && rawPing >= 0) ? Math.round(rawPing) : null;
    const device = (info.device === 'desktop' || info.device === 'mobile') ? info.device : 'desktop';
    return {
        userId: info.userId || null,
        username: presence.username,
        level: presence.level,
        mapId: presence.mapId,
        device,
        ping,
        characterId: info.characterId || null,
    };
}

export function isAllowedOrigin(origin, configuredOrigins = []) {
    if (!origin) return true;
    return DEFAULT_ORIGINS.has(origin) || configuredOrigins.includes(origin);
}

export function sanitizeInventoryBackup(inventory) {
    if (!inventory || !Array.isArray(inventory)) return [];
    const sanitized = [];
    for (const item of inventory) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const name = String(item.item_name ?? '').trim().slice(0, 64);
        const type = String(item.item_type ?? '').trim().slice(0, 32);
        const quantity = boundedInteger(item.quantity, 0, 999999) ?? 1;

        if (!name) continue;

        const sanitizedItem = {
            item_name: name,
            item_type: type,
            quantity: quantity,
        };

        if (item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats)) {
            const stats = {};
            for (const [sKey, sVal] of Object.entries(item.stats)) {
                if (sKey === 'equipped' && typeof sVal === 'boolean') {
                    stats.equipped = sVal;
                } else if (sKey === 'slot' && typeof sVal === 'string') {
                    if (CARD_SOCKET_SLOTS.has(sVal)) {
                        stats.slot = sVal;
                    }
                } else if (sKey === 'equippedSlot' && typeof sVal === 'string') {
                    if (CARD_SOCKET_SLOTS.has(sVal)) {
                        stats.equippedSlot = sVal;
                    }
                } else if (sKey === 'card_id' && typeof sVal === 'string') {
                    const card = getCard(sVal);
                    if (card) {
                        stats.card_id = card.id;
                    }
                } else if (sKey === 'card_stars') {
                    const stars = boundedInteger(sVal, 1, 5);
                    if (stars !== null) stats.card_stars = stars;
                } else if (sKey === 'card_pity') {
                    const pity = boundedInteger(sVal, 0, 1000);
                    if (pity !== null) stats.card_pity = pity;
                } else if (sKey === 'cards' && Array.isArray(sVal)) {
                    const cardsArray = [];
                    for (const cardVal of sVal) {
                        if (cardVal === null) {
                            cardsArray.push(null);
                        } else if (typeof cardVal === 'string') {
                            const card = getCard(cardVal);
                            if (card) {
                                cardsArray.push(card.id);
                            } else {
                                cardsArray.push(null);
                            }
                        } else {
                            cardsArray.push(null);
                        }
                    }
                    stats.cards = cardsArray.slice(0, 5);
                } else if (sKey === 'refine') {
                    // Equipment enchant level (+N). Dropping this on the periodic
                    // inventory backup silently reset every refined item to +0.
                    const refine = boundedInteger(sVal, 0, 30);
                    if (refine !== null) stats.refine = refine;
                } else if (sKey === 'equippedUid' && typeof sVal === 'string') {
                    stats.equippedUid = sVal.slice(0, 40);
                } else if (sKey === 'petName' && (sVal === null || typeof sVal === 'string')) {
                    stats.petName = sVal === null ? null : sVal.slice(0, 24);
                } else if (sKey === 'petLevel') {
                    const lvl = boundedInteger(sVal, 1, 40);
                    if (lvl !== null) stats.petLevel = lvl;
                } else if (sKey === 'petXp') {
                    const xp = boundedInteger(sVal, 0, 100_000_000);
                    if (xp !== null) stats.petXp = xp;
                } else if (sKey === 'instances' && Array.isArray(sVal)) {
                    // Per-pet records {uid,name,level,xp}. Dropping this reset
                    // every pet's level/xp to 1 on the next reload.
                    const insts = [];
                    for (const inst of sVal.slice(0, 200)) {
                        if (!inst || typeof inst !== 'object' || Array.isArray(inst)) continue;
                        const uid = typeof inst.uid === 'string' ? inst.uid.slice(0, 40) : null;
                        if (!uid) continue;
                        const level = boundedInteger(inst.level, 1, 40) ?? 1;
                        const xp = boundedInteger(inst.xp, 0, 100_000_000) ?? 0;
                        const name = (inst.name === null || inst.name === undefined) ? null
                            : (typeof inst.name === 'string' ? inst.name.slice(0, 24) : null);
                        insts.push({ uid, name, level, xp });
                    }
                    stats.instances = insts;
                }
            }
            if (Object.keys(stats).length > 0) {
                sanitizedItem.stats = stats;
            }
        }
        sanitized.push(sanitizedItem);
    }
    return sanitized;
}

export function validateMovement(prevPos, nextPos, elapsedMs) {
    if (!nextPos || !Number.isFinite(nextPos.x) || !Number.isFinite(nextPos.z)) return false;
    if (nextPos.y !== undefined && !Number.isFinite(nextPos.y)) return false;
    if (Math.abs(nextPos.x) > 500 || Math.abs(nextPos.z) > 500 || Math.abs(nextPos.y ?? 0) > 500) return false;
    if (!prevPos) return true;
    if (!Number.isFinite(prevPos.x) || !Number.isFinite(prevPos.z)) return false;
    if (prevPos.mapId !== nextPos.mapId) return true;
    if (prevPos.teleported) {
        prevPos.teleported = false;
        return true;
    }
    if (elapsedMs < 150) return true;

    const elapsedSecs = Number(elapsedMs) / 1000;
    if (!Number.isFinite(elapsedSecs) || elapsedSecs <= 0) return false;
    const dx = (nextPos.x ?? 0) - (prevPos.x ?? 0);
    const dz = (nextPos.z ?? 0) - (prevPos.z ?? 0);
    const distance = Math.sqrt(dx * dx + dz * dz);

    const velocity = distance / elapsedSecs;
    if (velocity > 40 && distance > 5) {
        console.warn(`[Security] 🚫 Suspicious movement speed detected: ${velocity.toFixed(2)} units/sec (dist: ${distance.toFixed(2)}, elapsed: ${elapsedMs}ms)`);
        return false;
    }
    return true;
}

export function shouldRateLimitEvent(tracker, eventName, limit, windowMs, now = Date.now()) {
    if (!tracker) return false;
    if (!tracker[eventName]) tracker[eventName] = [];
    tracker[eventName] = tracker[eventName].filter(t => now - t < windowMs);
    if (tracker[eventName].length >= limit) {
        return true;
    }
    tracker[eventName].push(now);
    return false;
}

/**
 * Cap PvE damage to a plausible ceiling derived from the player's
 * server-tracked level. Formula: level * 500 + 5000.
 * A level-1 player can deal up to 5500; a level-300 player up to 155000.
 * Returns the clamped value (always >= 0).
 */
export function clampMonsterDamage(level, damage) {
    const lvl = Math.max(1, Math.min(300, Math.floor(Number(level) || 1)));
    const maxDmg = lvl * 500 + 5000;
    const dmg = Number(damage) || 0;
    return Math.max(0, Math.min(maxDmg, dmg));
}

