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
const COLOR_FIELDS = new Set(['body_color', 'hair_color', 'pants_color']);
const BOOLEAN_FIELDS = new Set(['sound_enabled', 'fps_enabled']);
const GRAPHICS_QUALITIES = new Set(['low', 'medium', 'high', 'ultra', 'auto']);

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
    if (prior === null) return null;
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

export function normalizePresence(input = {}) {
    const username = String(input.username || 'Adventurer').trim().slice(0, 32) || 'Adventurer';
    const parsedLevel = Number.parseInt(input.level, 10);
    const level = Number.isFinite(parsedLevel) ? Math.max(1, Math.min(300, parsedLevel)) : 1;
    return { username, level, mapId: normalizeMapId(input.mapId) };
}

export function isAllowedOrigin(origin, configuredOrigins = []) {
    if (!origin) return true;
    return DEFAULT_ORIGINS.has(origin) || configuredOrigins.includes(origin);
}
