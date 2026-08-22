// RPC endpoint — calls the ported Postgres functions, injecting the
// JWT-verified user id as the first argument (replacing auth.uid()).
import { query, tx } from './db.js';
import { httpErr } from './auth.js';
import { randomUUID, randomInt } from 'node:crypto';
import { cleanupExpiredVendingStalls } from './marketExpiry.js';
import { sellPetInstanceToNpc } from './npcSale.js';
import { FISH_SPECIES, ITEMS, JOBS, JOB_CHANGE_COST, getEquipSlot } from '../../src/engine/GameData.js';

// name -> ordered arg names the CLIENT supplies (p_user_id is prepended from JWT)
const RPCS = {
    buy_market_item: ['p_listing_id'],
    send_card_mail: ['p_recipient_char_id', 'p_item_name', 'p_item_type', 'p_quantity', 'p_price', 'p_stats', 'p_request_id'],
    claim_card_mail: ['p_mail_id'],
    return_card_mail: ['p_mail_id'],
    admin_update_character: ['target_char_id', 'updates'],
    admin_delete_character: ['target_char_id'],
    admin_give_item: ['target_char_id', 'p_item_name', 'p_item_type', 'p_qty', 'p_stats'],
    create_market_listing: ['p_character_id', 'p_item_name', 'p_quantity', 'p_price'],
    cancel_market_listing: ['p_listing_id'],
    open_vending_stall: ['p_character_id', 'p_shop_name', 'p_appearance', 'p_requested_slot'],
    close_vending_stall: [],
    purchase_shop_item: ['p_character_id', 'p_item_name', 'p_quantity'],
};

function boundedPetInt(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function sanitizePetName(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== 'string') return fallback;
    const name = value.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24);
    return name || null;
}

function normalizeStoredPetInstances(stats) {
    if (!Array.isArray(stats?.instances)) return [];
    return stats.instances.slice(0, 200).filter(instance => (
        instance && typeof instance === 'object' && typeof instance.uid === 'string' && instance.uid.length > 0
    )).map(instance => ({
        uid: instance.uid.slice(0, 40),
        name: sanitizePetName(instance.name),
        level: boundedPetInt(instance.level, 1, 40, 1),
        xp: boundedPetInt(instance.xp, 0, 100_000_000, 0),
    }));
}

// Pet ownership/progression state has to bypass the generic inventory writer:
// generic /db writes intentionally reject quantity and arbitrary item stats.
// This RPC keeps quantity and instance count server-owned, accepts only UIDs
// already present in the player's row, and merges progress monotonically.
async function savePetState(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const requestedUid = body?.p_equipped_uid == null || body?.p_equipped_uid === ''
        ? null : String(body.p_equipped_uid).slice(0, 40);
    const incomingInstances = body?.p_instances;
    if (!characterId || !itemName || !Array.isArray(incomingInstances) || incomingInstances.length > 200) {
        throw httpErr(400, 'invalid pet state');
    }
    if (requestedUid && !/^[A-Za-z0-9:_-]{1,40}$/.test(requestedUid)) {
        throw httpErr(400, 'invalid pet uid');
    }

    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        if (!chars[0]) return { ok: false, reason: 'not_owner' };

        const { rows: rows } = await client.query(
            'SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 AND item_name = $2 FOR UPDATE',
            [characterId, itemName],
        );
        const row = rows[0];
        if (!row || row.item_type !== 'pet') return { ok: false, reason: 'pet_not_owned' };

        let stored = normalizeStoredPetInstances(row.stats || {});
        const quantity = Math.max(0, Math.min(200, Number.isInteger(Number(row.quantity)) ? Number(row.quantity) : 0));
        const legacy = stored.length === 0 && quantity > 0;
        if (legacy) {
            // Older rows stored only quantity/petLevel/petXp. Create stable
            // server-side UIDs for exactly the existing quantity — never from
            // a client-supplied count — then map the submitted state by index.
            const base = String(row.id || `${characterId}_${itemName}`).replace(/[^A-Za-z0-9]/g, '').slice(-28) || 'legacy';
            stored = Array.from({ length: quantity }, (_, index) => ({
                uid: `legacy_${base}_${index}`.slice(0, 40),
                name: sanitizePetName(row.stats?.petName),
                level: boundedPetInt(row.stats?.petLevel, 1, 40, 1),
                xp: boundedPetInt(row.stats?.petXp, 0, 100_000_000, 0),
            }));
        }
        if (incomingInstances.length !== stored.length) return { ok: false, reason: 'pet_state_mismatch' };

        let equippedUid = null;
        const incomingEquippedIndex = requestedUid
            ? incomingInstances.findIndex(instance => String(instance?.uid || '').slice(0, 40) === requestedUid)
            : -1;
        const instances = stored.map((previous, index) => {
            const raw = incomingInstances[index];
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpErr(400, 'invalid pet instance');
            if (!legacy && String(raw.uid || '').slice(0, 40) !== previous.uid) throw httpErr(400, 'pet uid mismatch');
            if (legacy && requestedUid && index === incomingEquippedIndex) equippedUid = previous.uid;
            if (!legacy && requestedUid === previous.uid) equippedUid = previous.uid;
            // Level and XP are server-owned. This endpoint accepts only the
            // player's pet name plus the already-owned active UID; progression
            // is advanced by the committed monster-kill transaction below.
            return {
                uid: previous.uid,
                name: sanitizePetName(raw.name, previous.name),
                level: previous.level,
                xp: previous.xp,
            };
        });
        if (requestedUid && !equippedUid) return { ok: false, reason: 'pet_uid_not_owned' };

        const currentStats = row.stats && typeof row.stats === 'object' && !Array.isArray(row.stats) ? row.stats : {};
        const nextStats = {
            ...currentStats,
            instances,
            equipped: Boolean(equippedUid),
            equippedUid,
        };
        const { rows: updated } = await client.query(
            'UPDATE inventory SET stats = $1 WHERE id = $2 RETURNING item_name, item_type, quantity, stats',
            [nextStats, row.id],
        );
        return { ok: true, item_name: row.item_name, item_type: 'pet', quantity: row.quantity, stats: updated[0]?.stats || nextStats };
    });
}

const DAILY_REWARDS = Object.freeze({
    1: { gold: 500, items: [] },
    2: { gold: 1000, items: [{ name: 'Red Herb', type: 'consumable', quantity: 5 }] },
    3: { gold: 2000, items: [{ name: 'Iron Ore', type: 'material', quantity: 5 }] },
    4: { gold: 3500, items: [{ name: 'Crystal Blue', type: 'material', quantity: 2 }] },
    5: { gold: 5000, items: [{ name: 'Oridecon Stone', type: 'material', quantity: 2 }] },
    6: { gold: 8000, items: [{ name: 'Fire Element Stone', type: 'material', quantity: 1 }] },
    7: { gold: 15000, items: [{ name: 'Dragon Heart', type: 'material', quantity: 1 }] },
});
const ALMANAC_REWARDS = Object.freeze({
    common: { gold: 3000 }, uncommon: { gold: 8000 }, rare: { gold: 20000 }, legendary: { gold: 60000 },
    all: { gold: 150000, item: { name: 'Master Angler Trophy', type: 'title', quantity: 1 } },
});
const SYSTEM_STATE_KEYS = new Set(['daily_quests', 'friends_list', 'adventure_journal']);
const STARTER_LOADOUT = Object.freeze([
    { name: 'Sword', type: 'weapon', stats: { equipped: true } },
    { name: 'Fishing Rod', type: 'fishing_rod', stats: { equipped: false } },
]);

const EQUIPPABLE_TYPES = new Set(['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'headgear', 'glasses', 'accessory', 'title']);
const CONSUMABLE_REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;
const JOB_REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;
let jobEconomyPromise = null;
async function ensureJobEconomy() {
    if (!jobEconomyPromise) {
        jobEconomyPromise = query(`CREATE TABLE IF NOT EXISTS public.job_change_requests (
            request_id text PRIMARY KEY,
            user_id text NOT NULL,
            character_id text NOT NULL,
            result jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )`).catch(error => { jobEconomyPromise = null; throw error; });
    }
    return jobEconomyPromise;
}
let consumableEconomyPromise = null;

async function ensureConsumableEconomy() {
    if (!consumableEconomyPromise) {
        consumableEconomyPromise = query(`CREATE TABLE IF NOT EXISTS public.consumable_use_requests (
            request_id text PRIMARY KEY,
            user_id text NOT NULL,
            character_id text NOT NULL,
            result jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )`).catch(error => { consumableEconomyPromise = null; throw error; });
    }
    return consumableEconomyPromise;
}

async function useConsumable(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const requestId = String(body?.p_request_id || '').trim();
    if (!characterId || !itemName || !CONSUMABLE_REQUEST_ID_RE.test(requestId)) return { ok: false, reason: 'bad_request' };
    const { ITEMS } = await import('../../src/engine/GameData.js');
    const itemData = ITEMS[itemName];
    if (!itemData || itemData.type !== 'consumable' || (!Number(itemData.healHp) && !Number(itemData.restoreSp))) {
        return { ok: false, reason: 'not_consumable' };
    }
    await ensureConsumableEconomy();
    return tx(async (client) => {
        const { rows: prior } = await client.query(
            'SELECT user_id, character_id, result FROM public.consumable_use_requests WHERE request_id = $1 FOR UPDATE', [requestId],
        );
        if (prior[0]) {
            if (String(prior[0].user_id) !== String(userId) || String(prior[0].character_id) !== characterId) return { ok: false, reason: 'request_conflict' };
            return prior[0].result;
        }
        const { rows: chars } = await client.query(
            'SELECT id, hp, max_hp, sp, max_sp, gold FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        const { rows: items } = await client.query(
            'SELECT id, item_type, quantity FROM inventory WHERE character_id = $1 AND item_name = $2 ORDER BY id LIMIT 1 FOR UPDATE', [characterId, itemName],
        );
        const item = items[0];
        if (!item || item.item_type !== 'consumable' || Number(item.quantity) < 1) return { ok: false, reason: 'item_missing' };
        const heal = Math.max(0, Math.floor(Number(itemData.healHp) || 0));
        const restore = Math.max(0, Math.floor(Number(itemData.restoreSp) || 0));
        const hp = Math.min(Number(character.max_hp) || 0, (Number(character.hp) || 0) + heal);
        const sp = Math.min(Number(character.max_sp) || 0, (Number(character.sp) || 0) + restore);
        const noEffect = hp === Number(character.hp) && sp === Number(character.sp);
        const result = {
            ok: true, serverAuthoritative: true, requestId, consumed: !noEffect, item_name: itemName,
            quantity: noEffect ? Number(item.quantity) : Math.max(0, Number(item.quantity) - 1),
            hp: Number(character.hp) || 0, sp: Number(character.sp) || 0, max_hp: Number(character.max_hp) || 0, max_sp: Number(character.max_sp) || 0,
            gold: Number(character.gold) || 0,
        };
        if (!noEffect) {
            await client.query('UPDATE characters SET hp = $2, sp = $3, updated_at = now() WHERE id = $1', [characterId, hp, sp]);
            result.hp = hp; result.sp = sp;
            if (Number(item.quantity) <= 1) await client.query('DELETE FROM inventory WHERE id = $1', [item.id]);
            else await client.query('UPDATE inventory SET quantity = quantity - 1 WHERE id = $1', [item.id]);
        }
        await client.query(
            'INSERT INTO public.consumable_use_requests (request_id, user_id, character_id, result) VALUES ($1, $2, $3, $4)',
            [requestId, userId, characterId, result],
        );
        return result;
    });
}

async function changeJob(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const jobId = String(body?.p_job_id || '').trim().toLowerCase();
    const requestId = String(body?.p_request_id || '').trim();
    const job = JOBS[jobId];
    if (!characterId || !job || !requestId || !JOB_REQUEST_ID_RE.test(requestId)) return { ok: false, reason: 'bad_request' };
    await ensureJobEconomy();
    return tx(async (client) => {
        const { rows: prior } = await client.query(
            'SELECT user_id, character_id, result FROM public.job_change_requests WHERE request_id = $1 FOR UPDATE', [requestId],
        );
        if (prior[0]) {
            if (String(prior[0].user_id) !== String(userId) || String(prior[0].character_id) !== characterId) return { ok: false, reason: 'request_conflict' };
            return prior[0].result;
        }
        const { rows: chars } = await client.query(
            'SELECT id, job, gold FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        if (String(character.job || '') === jobId) return { ok: false, reason: 'already_job' };
        const cost = character.job ? JOB_CHANGE_COST : 0;
        if (Number(character.gold) < cost) return { ok: false, reason: 'insufficient_gold' };
        const signature = job.signatureWeapon;
        const signatureData = ITEMS[signature];
        if (!signatureData || signatureData.type !== 'weapon') return { ok: false, reason: 'job_loadout_unavailable' };
        const { rows: weapons } = await client.query(
            `SELECT id, item_name, item_type, quantity, stats FROM inventory
             WHERE character_id = $1 AND item_type IN ('weapon', 'fishing_rod') FOR UPDATE`, [characterId],
        );
        const currentSignature = weapons.find(item => item.item_name === signature);
        const newGold = Number(character.gold) - cost;
        await client.query('UPDATE characters SET job = $2, gold = $3, updated_at = now() WHERE id = $1', [characterId, jobId, newGold]);
        for (const weapon of weapons) {
            if (weapon.id === currentSignature?.id) continue;
            if (weapon.stats?.equipped === true) {
                await client.query("UPDATE inventory SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{equipped}', 'false'::jsonb, true) WHERE id = $1", [weapon.id]);
            }
        }
        let equipped;
        if (currentSignature) {
            const stats = { ...(currentSignature.stats || {}), equipped: true };
            const { rows: updated } = await client.query(
                'UPDATE inventory SET item_type = $1, quantity = GREATEST(1, quantity), stats = $2 WHERE id = $3 RETURNING item_name, item_type, quantity, stats',
                [signatureData.type, stats, currentSignature.id],
            );
            equipped = updated[0];
        } else {
            const { rows: inserted } = await client.query(
                `INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
                 VALUES ($1, $2, $3, 1, $4) RETURNING item_name, item_type, quantity, stats`,
                [characterId, signature, signatureData.type, { equipped: true }],
            );
            equipped = inserted[0];
        }
        const result = { ok: true, serverAuthoritative: true, requestId, job: jobId, gold: newGold, cost, item: equipped };
        await client.query(
            'INSERT INTO public.job_change_requests (request_id, user_id, character_id, result) VALUES ($1, $2, $3, $4)',
            [requestId, userId, characterId, result],
        );
        return result;
    });
}

function canonicalEquipSlot(itemName, itemType) {
    if (itemType === 'weapon' || itemType === 'fishing_rod') return 'weapon';
    if (itemType === 'shield') return 'shield';
    if (itemType === 'hat' || itemType === 'headgear') return 'hat';
    if (itemType === 'glasses') return 'glasses';
    if (itemType === 'armor' || itemType === 'accessory') return getEquipSlot(itemName) || itemType;
    if (itemType === 'title') return 'title';
    return null;
}

async function saveEquippedItem(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const equipped = body?.p_equipped === true;
    if (!characterId || !itemName || typeof body?.p_equipped !== 'boolean') return { ok: false, reason: 'bad_request' };
    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId],
        );
        if (!chars[0]) return { ok: false, reason: 'not_owner' };
        const catalogType = ITEMS[itemName]?.type;
        const catalogSlot = canonicalEquipSlot(itemName, catalogType);
        if (!catalogType || !catalogSlot || !EQUIPPABLE_TYPES.has(String(catalogType))) return { ok: false, reason: 'not_equippable' };
        const { rows: items } = await client.query(
            `SELECT id, item_name, item_type, quantity, stats FROM inventory
             WHERE character_id = $1 AND item_name = $2 ORDER BY id LIMIT 1 FOR UPDATE`,
            [characterId, itemName],
        );
        const item = items[0];
        if (!item || Number(item.quantity) < 1) return { ok: false, reason: 'item_missing' };
        if (equipped) {
            const { rows: ownedItems } = await client.query(
                `SELECT id, item_name, item_type, quantity, stats FROM inventory
                 WHERE character_id = $1 AND COALESCE(quantity, 0) > 0 FOR UPDATE`, [characterId],
            );
            for (const other of ownedItems) {
                if (other.id === item.id) continue;
                const otherType = ITEMS[other.item_name]?.type || other.item_type;
                if (canonicalEquipSlot(other.item_name, otherType) !== catalogSlot) continue;
                await client.query(
                    "UPDATE inventory SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{equipped}', 'false'::jsonb, true) WHERE id = $1",
                    [other.id],
                );
            }
        }
        const stats = { ...(item.stats || {}), equipped };
        const { rows: updated } = await client.query(
            'UPDATE inventory SET item_type = $1, stats = $2 WHERE id = $3 RETURNING item_name, item_type, quantity, stats', [catalogType, stats, item.id],
        );
        return { ok: true, serverAuthoritative: true, item: updated[0] };
    });
}

async function claimStarterLoadout(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    if (!characterId) return { ok: false, reason: 'invalid_character' };
    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId],
        );
        if (!chars[0]) return { ok: false, reason: 'not_owner' };
        const items = [];
        for (const starter of STARTER_LOADOUT) {
            const { rows } = await client.query(
                `SELECT id, item_name, item_type, quantity, stats FROM inventory
                 WHERE character_id = $1 AND item_name = $2 ORDER BY id LIMIT 1 FOR UPDATE`,
                [characterId, starter.name],
            );
            if (!rows[0]) {
                const { rows: inserted } = await client.query(
                    `INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
                     VALUES ($1, $2, $3, 1, $4) RETURNING id, item_name, item_type, quantity, stats`,
                    [characterId, starter.name, starter.type, starter.stats],
                );
                items.push(inserted[0]);
            } else if (Number(rows[0].quantity) < 1) {
                const repairedStats = { ...(rows[0].stats || {}), equipped: starter.stats.equipped };
                const { rows: repaired } = await client.query(
                    `UPDATE inventory SET item_type = $1, quantity = 1, stats = $2 WHERE id = $3
                     RETURNING id, item_name, item_type, quantity, stats`,
                    [starter.type, repairedStats, rows[0].id],
                );
                items.push(repaired[0]);
            } else {
                items.push({ ...rows[0], item_type: starter.type });
            }
        }
        return {
            ok: true, serverAuthoritative: true,
            items: items.map(item => ({ item_name: item.item_name, item_type: item.item_type, quantity: Math.max(0, Number(item.quantity) || 0), stats: item.stats || {} })),
        };
    });
}

function normalizeSystemState(key, state) {
    if (!SYSTEM_STATE_KEYS.has(key) || !state || typeof state !== 'object' || Array.isArray(state)) return null;
    let encoded;
    try { encoded = JSON.stringify(state); } catch { return null; }
    if (encoded.length > 100_000) return null;
    if (key === 'friends_list') {
        const source = Array.isArray(state) ? state : state.list;
        if (!Array.isArray(source)) return { list: [] };
        const list = [...new Set(source.filter(name => typeof name === 'string').map(name => name.trim().slice(0, 64)).filter(Boolean))].slice(0, 200);
        return { list };
    }
    if (key === 'daily_quests') {
        const quests = Array.isArray(state.quests) ? state.quests.slice(0, 8).map(quest => ({
            id: String(quest?.id || '').slice(0, 32), name: String(quest?.name || '').slice(0, 120),
            desc: String(quest?.desc || '').slice(0, 240), targetName: String(quest?.targetName || '').slice(0, 64),
            current: Math.max(0, Math.min(100000, Math.floor(Number(quest?.current) || 0))),
            target: Math.max(1, Math.min(100000, Math.floor(Number(quest?.target) || 1))),
            rewardGold: Math.max(0, Math.min(100000, Math.floor(Number(quest?.rewardGold) || 0))),
            rewardExp: Math.max(0, Math.min(100000, Math.floor(Number(quest?.rewardExp) || 0))),
            isClaimed: quest?.isClaimed === true,
        })) : [];
        return {
            lastDate: String(state.lastDate || '').slice(0, 32),
            streak: Math.max(0, Math.min(100000, Math.floor(Number(state.streak) || 0))),
            rouletteSpent: state.rouletteSpent === true,
            quests,
        };
    }
    return JSON.parse(encoded);
}

async function saveSystemState(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const key = String(body?.p_key || '').trim();
    const state = normalizeSystemState(key, body?.p_state);
    if (!characterId || !SYSTEM_STATE_KEYS.has(key) || !state) return { ok: false, reason: 'invalid_system_state' };
    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId],
        );
        if (!chars[0]) return { ok: false, reason: 'not_owner' };
        const { rows } = await client.query(
            `SELECT id FROM inventory WHERE character_id = $1 AND item_name = $2 AND item_type = 'system'
             ORDER BY id LIMIT 1 FOR UPDATE`, [characterId, key],
        );
        if (rows[0]) {
            await client.query('UPDATE inventory SET quantity = 1, stats = $2 WHERE id = $1', [rows[0].id, state]);
        } else {
            await client.query(
                `INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
                 VALUES ($1, $2, 'system', 1, $3)`, [characterId, key, state],
            );
        }
        return { ok: true, serverAuthoritative: true, key, state };
    });
}

async function claimDailyReward(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    if (!characterId) return { ok: false, reason: 'invalid_character' };
    return tx(async (client) => {
        const { rows: todayRows } = await client.query("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS today, ((now() AT TIME ZONE 'Asia/Bangkok')::date - 1)::text AS yesterday");
        const today = todayRows[0]?.today;
        const yesterday = todayRows[0]?.yesterday;
        const { rows: chars } = await client.query(
            'SELECT id, gold FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        const { rows: streakRows } = await client.query(
            `SELECT id, stats FROM inventory WHERE character_id = $1 AND item_name = 'login_streak' AND item_type = 'system'
             ORDER BY id LIMIT 1 FOR UPDATE`, [characterId],
        );
        const existing = streakRows[0];
        const stored = existing?.stats && typeof existing.stats === 'object' && !Array.isArray(existing.stats) ? existing.stats : {};
        const currentStreak = Math.max(0, Math.min(100000, Math.floor(Number(stored.streak) || 0)));
        if (stored.lastClaim === today) return { ok: true, serverAuthoritative: true, claimed: false, day: ((Math.max(1, currentStreak) - 1) % 7) + 1, streak: currentStreak, gold: Number(character.gold) || 0, items: [] };
        const streak = stored.lastClaim === yesterday ? currentStreak + 1 : 1;
        const day = ((streak - 1) % 7) + 1;
        const reward = DAILY_REWARDS[day];
        const { rows: updatedChars } = await client.query(
            'UPDATE characters SET gold = LEAST(COALESCE(gold, 0) + $2, 500000000), updated_at = now() WHERE id = $1 RETURNING gold',
            [characterId, reward.gold],
        );
        const nextState = { streak, lastClaim: today };
        if (existing) await client.query('UPDATE inventory SET quantity = 1, stats = $2 WHERE id = $1', [existing.id, nextState]);
        else await client.query("INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, 'login_streak', 'system', 1, $2)", [characterId, nextState]);
        const granted = [];
        for (const item of reward.items) {
            const { rows: itemRows } = await client.query(
                'SELECT id, quantity FROM inventory WHERE character_id = $1 AND item_name = $2 ORDER BY id LIMIT 1 FOR UPDATE',
                [characterId, item.name],
            );
            if (itemRows[0]) await client.query('UPDATE inventory SET item_type = $2, quantity = quantity + $3 WHERE id = $1', [itemRows[0].id, item.type, item.quantity]);
            else await client.query('INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, $2, $3, $4, $5)', [characterId, item.name, item.type, item.quantity, {}]);
            granted.push(item);
        }
        return { ok: true, serverAuthoritative: true, claimed: true, day, streak, gold: Number(updatedChars[0]?.gold) || 0, items: granted, state: nextState };
    });
}

function almanacCompletion(caught, tier) {
    const validCaught = new Set((Array.isArray(caught) ? caught : []).filter(name => typeof name === 'string' && FISH_SPECIES[name]));
    const tiers = ['common', 'uncommon', 'rare', 'legendary'];
    if (tier === 'all') return tiers.every(value => almanacCompletion([...validCaught], value));
    const names = Object.entries(FISH_SPECIES).filter(([, data]) => data.rarity === tier).map(([name]) => name);
    return names.length > 0 && names.every(name => validCaught.has(name));
}

async function claimAlmanacReward(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const tier = String(body?.p_tier || '').trim();
    if (!characterId || !ALMANAC_REWARDS[tier]) return { ok: false, reason: 'invalid_almanac_claim' };
    return tx(async (client) => {
        const { rows: chars } = await client.query('SELECT id, gold FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [characterId, userId]);
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        const { rows } = await client.query(
            `SELECT id, stats FROM inventory WHERE character_id = $1 AND item_name = 'fishing_almanac' AND item_type = 'system'
             ORDER BY id LIMIT 1 FOR UPDATE`, [characterId],
        );
        const row = rows[0];
        const stored = row?.stats && typeof row.stats === 'object' && !Array.isArray(row.stats) ? row.stats : {};
        const claimed = [...new Set((Array.isArray(stored.claimed) ? stored.claimed : []).filter(value => typeof value === 'string' && ALMANAC_REWARDS[value]))];
        if (claimed.includes(tier)) return { ok: true, serverAuthoritative: true, claimed: false, tier, gold: Number(character.gold) || 0, state: { ...stored, claimed } };
        const caught = Array.isArray(stored.caught) ? stored.caught : [];
        if (!almanacCompletion(caught, tier)) return { ok: false, reason: 'almanac_incomplete' };
        const reward = ALMANAC_REWARDS[tier];
        const nextClaimed = [...claimed, tier];
        const { rows: updatedChars } = await client.query(
            'UPDATE characters SET gold = LEAST(COALESCE(gold, 0) + $2, 500000000), updated_at = now() WHERE id = $1 RETURNING gold',
            [characterId, reward.gold],
        );
        const granted = [];
        if (reward.item) {
            const { rows: itemRows } = await client.query('SELECT id, quantity FROM inventory WHERE character_id = $1 AND item_name = $2 ORDER BY id LIMIT 1 FOR UPDATE', [characterId, reward.item.name]);
            if (itemRows[0]) await client.query('UPDATE inventory SET item_type = $2, quantity = quantity + 1 WHERE id = $1', [itemRows[0].id, reward.item.type]);
            else await client.query('INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, $2, $3, 1, $4)', [characterId, reward.item.name, reward.item.type, {}]);
            granted.push(reward.item);
        }
        const nextState = { ...stored, caught: [...new Set(caught.filter(name => typeof name === 'string' && FISH_SPECIES[name]))], claimed: nextClaimed, counts: stored.counts && typeof stored.counts === 'object' ? stored.counts : {} };
        if (row) await client.query('UPDATE inventory SET quantity = 1, stats = $2 WHERE id = $1', [row.id, nextState]);
        else await client.query("INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, 'fishing_almanac', 'system', 1, $2)", [characterId, nextState]);
        return { ok: true, serverAuthoritative: true, claimed: true, tier, gold: Number(updatedChars[0]?.gold) || 0, items: granted, state: nextState };
    });
}

function canonicalPetInstances(row, characterId) {
    const stats = row?.stats && typeof row.stats === 'object' && !Array.isArray(row.stats) ? row.stats : {};
    let instances = normalizeStoredPetInstances(stats);
    const quantity = Math.max(0, Math.min(200, Number.isInteger(Number(row?.quantity)) ? Number(row.quantity) : 0));
    if (!instances.length && quantity > 0) {
        const base = String(row?.id || `${characterId}_${row?.item_name || 'pet'}`).replace(/[^A-Za-z0-9]/g, '').slice(-28) || 'legacy';
        instances = Array.from({ length: quantity }, (_, index) => ({
            uid: `legacy_${base}_${index}`.slice(0, 40),
            name: sanitizePetName(stats.petName),
            level: boundedPetInt(stats.petLevel, 1, 40, 1),
            xp: boundedPetInt(stats.petXp, 0, 100_000_000, 0),
        }));
    }
    return { stats, instances };
}

function petListingStats(instance, sellerCharacterId) {
    return {
        sellerCharacterId: String(sellerCharacterId || '').slice(0, 128),
        instances: [instance],
        petName: instance.name || null,
        petLevel: instance.level,
        petXp: instance.xp,
        equipped: false,
        equippedUid: null,
    };
}

async function createPetMarketListing(body, userId) {
    const characterId = String(body?.p_character_id || '').trim();
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const petUid = String(body?.p_pet_uid || '').trim().slice(0, 40);
    const price = Number(body?.p_price);
    if (!characterId || !itemName || !/^[A-Za-z0-9:_-]{1,40}$/.test(petUid)) return { ok: false, reason: 'bad_pet_listing' };
    if (!Number.isInteger(price) || price < 0 || price > 500_000_000) return { ok: false, reason: 'bad_price' };

    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id, name FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };

        const { rows } = await client.query(
            'SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 AND item_name = $2 AND item_type = \'pet\' FOR UPDATE',
            [characterId, itemName],
        );
        const row = rows[0];
        if (!row) return { ok: false, reason: 'pet_not_owned' };
        const { stats, instances } = canonicalPetInstances(row, characterId);
        const index = instances.findIndex(instance => instance.uid === petUid);
        if (index < 0) return { ok: false, reason: 'pet_uid_not_owned' };
        const activeUid = typeof stats.equippedUid === 'string' && stats.equippedUid
            ? stats.equippedUid : (stats.equipped === true ? instances[0]?.uid : null);
        if (activeUid === petUid) return { ok: false, reason: 'pet_equipped' };

        const [instance] = instances.splice(index, 1);
        const nextStats = { ...stats, instances, equipped: Boolean(activeUid && instances.some(item => item.uid === activeUid)), equippedUid: instances.some(item => item.uid === activeUid) ? activeUid : null };
        if (instances.length) {
            await client.query('UPDATE inventory SET quantity = $1, stats = $2 WHERE id = $3', [instances.length, nextStats, row.id]);
        } else {
            await client.query('DELETE FROM inventory WHERE id = $1', [row.id]);
        }

        const { rows: listings } = await client.query(
            `INSERT INTO marketplace
                (item_id, item_name, item_type, quantity, price, seller_id, seller_name, stats)
             VALUES ($1, $2, 'pet', 1, $3, $4, $5, $6)
             RETURNING *`,
            [randomUUID(), itemName, price, userId, character.name, petListingStats(instance, characterId)],
        );
        return {
            ok: true, serverAuthoritative: true, listing: listings[0],
            remaining: { quantity: instances.length, instances, stats: nextStats },
        };
    });
}

async function cancelPetMarketListing(body, userId) {
    const listingId = String(body?.p_listing_id || '').trim();
    if (!listingId) return { ok: false, reason: 'bad_listing' };
    return tx(async (client) => {
        const { rows: listingRows } = await client.query(
            'SELECT * FROM marketplace WHERE id = $1 AND seller_id = $2 FOR UPDATE',
            [listingId, userId],
        );
        const listing = listingRows[0];
        if (!listing || listing.item_type !== 'pet' || Number(listing.quantity) !== 1) return { ok: false, reason: 'not_pet_listing' };
        const listed = normalizeStoredPetInstances(listing.stats || {});
        if (listed.length !== 1) return { ok: false, reason: 'invalid_pet_listing' };

        const sellerCharacterId = String(listing.stats?.sellerCharacterId || '').trim();
        if (!sellerCharacterId) return { ok: false, reason: 'listing_missing_owner' };
        const { rows: chars } = await client.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [sellerCharacterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'no_character' };
        const { rows: itemRows } = await client.query(
            'SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 AND item_name = $2 AND item_type = \'pet\' FOR UPDATE',
            [character.id, listing.item_name],
        );
        const row = itemRows[0];
        const current = row ? canonicalPetInstances(row, character.id) : { stats: {}, instances: [] };
        if (current.instances.some(instance => instance.uid === listed[0].uid)) return { ok: false, reason: 'pet_uid_duplicate' };
        const instances = [...current.instances, listed[0]];
        const stats = { ...current.stats, instances, equipped: Boolean(current.stats.equippedUid), equippedUid: current.stats.equippedUid || null };
        if (row) {
            await client.query('UPDATE inventory SET quantity = $1, stats = $2 WHERE id = $3', [instances.length, stats, row.id]);
        } else {
            await client.query(
                'INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, $2, \'pet\', $3, $4)',
                [character.id, listing.item_name, instances.length, stats],
            );
        }
        await client.query('DELETE FROM marketplace WHERE id = $1', [listingId]);
        return { ok: true, serverAuthoritative: true, listing };
    });
}

async function buyPetMarketItem(body, userId) {
    const listingId = String(body?.p_listing_id || '').trim();
    const buyerCharacterId = String(body?.p_character_id || '').trim();
    if (!listingId || !buyerCharacterId) return { ok: false, reason: 'bad_purchase' };

    return tx(async (client) => {
        const { rows: listingRows } = await client.query(
            'SELECT * FROM marketplace WHERE id = $1 FOR UPDATE', [listingId],
        );
        const listing = listingRows[0];
        if (!listing || listing.item_type !== 'pet' || Number(listing.quantity) !== 1) return { ok: false, reason: 'not_pet_listing' };
        if (String(listing.seller_id) === String(userId)) return { ok: false, reason: 'own_listing' };
        const listed = normalizeStoredPetInstances(listing.stats || {});
        if (listed.length !== 1) return { ok: false, reason: 'invalid_pet_listing' };

        await client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [`pet-market:${[String(userId), String(listing.seller_id)].sort().join(':')}`],
        );
        const { rows: buyerRows } = await client.query(
            'SELECT id, gold FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [buyerCharacterId, userId],
        );
        const buyer = buyerRows[0];
        if (!buyer) return { ok: false, reason: 'not_owner' };
        if (Number(buyer.gold) < Number(listing.price)) return { ok: false, reason: 'not_enough_gold' };

        const sellerCharacterId = String(listing.stats?.sellerCharacterId || '').trim();
        if (!sellerCharacterId) return { ok: false, reason: 'listing_missing_owner' };
        const { rows: sellerRows } = await client.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE', [sellerCharacterId, listing.seller_id],
        );
        const seller = sellerRows[0];
        if (!seller) return { ok: false, reason: 'seller_missing' };
        await client.query('UPDATE characters SET gold = gold - $2, updated_at = now() WHERE id = $1', [buyer.id, listing.price]);
        await client.query('UPDATE characters SET gold = LEAST(COALESCE(gold, 0) + $2, 500000000), updated_at = now() WHERE id = $1', [seller.id, listing.price]);

        const { rows: itemRows } = await client.query(
            'SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 AND item_name = $2 AND item_type = \'pet\' FOR UPDATE',
            [buyer.id, listing.item_name],
        );
        const row = itemRows[0];
        const current = row ? canonicalPetInstances(row, buyer.id) : { stats: {}, instances: [] };
        if (current.instances.some(instance => instance.uid === listed[0].uid)) return { ok: false, reason: 'pet_uid_duplicate' };
        const instances = [...current.instances, listed[0]];
        const stats = { ...current.stats, instances, equipped: Boolean(current.stats.equippedUid), equippedUid: current.stats.equippedUid || null };
        if (row) {
            await client.query('UPDATE inventory SET quantity = $1, stats = $2 WHERE id = $3', [instances.length, stats, row.id]);
        } else {
            await client.query(
                'INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, $2, \'pet\', $3, $4)',
                [buyer.id, listing.item_name, instances.length, stats],
            );
        }
        await client.query('DELETE FROM marketplace WHERE id = $1', [listingId]);
        await client.query('INSERT INTO market_history (item_name, quantity, price) VALUES ($1, 1, $2)', [listing.item_name, listing.price]);
        return {
            ok: true, serverAuthoritative: true, item_name: listing.item_name, item_type: 'pet', quantity: 1,
            price: Number(listing.price), buyer_gold: Number(buyer.gold) - Number(listing.price), seller_name: listing.seller_name,
            pet: { itemName: listing.item_name, instance: listed[0], instances },
        };
    });
}

 async function createMarketListing(body, userId) {
    const characterId = String(body?.p_character_id || '');
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const quantity = Number(body?.p_quantity);
    const price = Number(body?.p_price);
    if (!characterId || !itemName || !Number.isInteger(quantity) || quantity < 1 || quantity > 999999) {
        return { ok: false, reason: 'bad_listing' };
    }
    if (!Number.isInteger(price) || price < 0 || price > 500_000_000) {
        return { ok: false, reason: 'bad_price' };
    }

    return tx(async (client) => {
        const { rows: chars } = await client.query(
            'SELECT id, name FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };

        const { rows: items } = await client.query(
            'SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 AND item_name = $2 FOR UPDATE',
            [characterId, itemName],
        );
        const item = items[0];
        if (!item || Number(item.quantity) < quantity) return { ok: false, reason: 'not_enough_items' };
        if (item.item_type === 'system') return { ok: false, reason: 'system_item' };

        if (Number(item.quantity) === quantity) {
            await client.query('DELETE FROM inventory WHERE id = $1', [item.id]);
        } else {
            await client.query('UPDATE inventory SET quantity = quantity - $2 WHERE id = $1', [item.id, quantity]);
        }

        const { rows: listings } = await client.query(
            `INSERT INTO marketplace
                (item_id, item_name, item_type, quantity, price, seller_id, seller_name, stats)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [randomUUID(), item.item_name, item.item_type, quantity, price, userId, character.name, item.stats || {}],
        );
        return { ok: true, serverAuthoritative: true, listing: listings[0] };
    });
}

function sanitizeStallAppearance(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const safe = {};
    for (const key of ['bodyColor', 'hairColor', 'pantsColor', 'gender']) {
        if (source[key] !== undefined) safe[key] = String(source[key]).slice(0, 32);
    }
    return safe;
}

async function openVendingStall(body, userId) {
    const characterId = String(body?.p_character_id || '');
    const shopName = String(body?.p_shop_name || 'ร้านค้า').trim().slice(0, 24) || 'ร้านค้า';
    const requested = body?.p_requested_slot;
    const requestedSlot = requested === null || requested === undefined || requested === '' ? null : Number(requested);
    if (!characterId || (requestedSlot !== null && (!Number.isInteger(requestedSlot) || requestedSlot < 0 || requestedSlot >= 8))) {
        return { ok: false, reason: 'invalid_slot' };
    }

    return tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('vending:slots', 0))");
        const { rows: chars } = await client.query(
            'SELECT id, name FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        const { rows: mineRows } = await client.query(
            'SELECT id, slot FROM vending_stalls WHERE user_id = $1 FOR UPDATE', [userId],
        );
        const mine = mineRows[0];
        const { rows: occupied } = await client.query(
            'SELECT slot, user_id FROM vending_stalls WHERE slot BETWEEN 0 AND 7',
        );
        let slot = -1;
        if (requestedSlot !== null) {
            if (occupied.some(row => Number(row.slot) === requestedSlot && row.user_id !== userId)) {
                return { ok: false, reason: 'taken' };
            }
            slot = requestedSlot;
        } else if (mine) {
            slot = Number(mine.slot);
        } else {
            const used = new Set(occupied.map(row => Number(row.slot)));
            for (let i = 0; i < 8; i++) { if (!used.has(i)) { slot = i; break; } }
            if (slot < 0) return { ok: false, reason: 'full' };
        }
        const { rows } = await client.query(
            `INSERT INTO vending_stalls
                (user_id, character_id, owner_name, shop_name, slot, appearance)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id) DO UPDATE SET
                character_id = EXCLUDED.character_id, owner_name = EXCLUDED.owner_name,
                shop_name = EXCLUDED.shop_name, slot = EXCLUDED.slot,
                appearance = EXCLUDED.appearance, updated_at = now()
             RETURNING *`,
            [userId, characterId, character.name, shopName, slot, sanitizeStallAppearance(body?.p_appearance)],
        );
        return { ok: true, slot, moved: !!mine && Number(mine.slot) !== slot, stall: rows[0] };
    });
}

async function closeVendingStall(userId) {
    return tx(async (client) => {
        await client.query('DELETE FROM vending_stalls WHERE user_id = $1', [userId]);
        return { ok: true };
    });
}

const SHOP_REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,160}$/;

async function purchaseShopItem(body, userId) {
    const characterId = String(body?.p_character_id || '');
    const itemName = String(body?.p_item_name || '').trim().slice(0, 64);
    const quantity = Math.floor(Number(body?.p_quantity));
    const requestId = String(body?.p_request_id || '').trim();
    if (!characterId || !itemName || !requestId || !SHOP_REQUEST_ID_RE.test(requestId)
        || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        return { ok: false, reason: 'bad_request' };
    }

    // Import catalog from GameData to verify price and type
    const { ITEMS, SHOP_ITEMS } = await import('../../src/engine/GameData.js');
    const shopItem = SHOP_ITEMS.find(entry => entry.name === itemName);
    const itemData = ITEMS[itemName];
    const allowedShopTypes = new Set(['consumable', 'material', 'weapon', 'armor', 'shield', 'headgear', 'accessory', 'fishing_rod', 'tool']);
    if (!shopItem || !itemData || !allowedShopTypes.has(itemData.type) || itemData.price === undefined || itemData.price === null) {
        return { ok: false, reason: 'item_not_for_sale' };
    }
    const unitPrice = Math.max(0, Number(shopItem.price));
    const totalCost = unitPrice * quantity;

    return tx(async (client) => {
        const { rows: receipts } = await client.query(
            'SELECT user_id, character_id, result FROM public.shop_purchase_requests WHERE request_id = $1 FOR UPDATE',
            [requestId],
        );
        if (receipts[0]) {
            if (String(receipts[0].user_id) !== String(userId) || String(receipts[0].character_id) !== characterId) {
                return { ok: false, reason: 'request_conflict' };
            }
            return receipts[0].result;
        }

        const { rows: chars } = await client.query(
            'SELECT id, gold FROM characters WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [characterId, userId],
        );
        const character = chars[0];
        if (!character) return { ok: false, reason: 'not_owner' };
        if (Number(character.gold) < totalCost) return { ok: false, reason: 'insufficient_gold' };

        // Deduct gold
        await client.query('UPDATE characters SET gold = gold - $2, updated_at = now() WHERE id = $1', [characterId, totalCost]);

        // Add to inventory
        const { rows: inventoryRows } = await client.query(
            `INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (character_id, item_name) DO UPDATE
             SET quantity = public.inventory.quantity + EXCLUDED.quantity,
                 item_type = EXCLUDED.item_type
             RETURNING quantity`,
            [characterId, itemName, itemData.type || 'material', quantity, itemData.stats || {}],
        );

        const result = {
            ok: true, serverAuthoritative: true, requestId, item_name: itemName,
            item_type: itemData.type || 'material', quantity, inventory_quantity: Number(inventoryRows[0]?.quantity) || quantity,
            total_cost: totalCost, gold: Number(character.gold) - totalCost,
        };
        await client.query(
            `INSERT INTO public.shop_purchase_requests (request_id, user_id, character_id, result)
             VALUES ($1, $2, $3, $4)`,
            [requestId, userId, characterId, result],
        );
        return result;
    });
}

async function cancelMarketListing(body, userId) {
    const listingId = String(body?.p_listing_id || '');
    if (!listingId) return { ok: false, reason: 'bad_listing' };

    return tx(async (client) => {
        const { rows: listings } = await client.query(
            'SELECT * FROM marketplace WHERE id = $1 AND seller_id = $2 FOR UPDATE',
            [listingId, userId],
        );
        const listing = listings[0];
        if (!listing) return { ok: false, reason: 'not_owner_or_gone' };

        const { rows: items } = await client.query(
            'SELECT id FROM inventory WHERE character_id = (SELECT id FROM characters WHERE user_id = $1 ORDER BY created_at LIMIT 1) AND item_name = $2 FOR UPDATE',
            [userId, listing.item_name],
        );
        const existing = items[0];
        if (existing) {
            await client.query('UPDATE inventory SET quantity = quantity + $2 WHERE id = $1', [existing.id, listing.quantity]);
        } else {
            const { rows: chars } = await client.query(
                'SELECT id FROM characters WHERE user_id = $1 ORDER BY created_at LIMIT 1',
                [userId],
            );
            if (!chars[0]) return { ok: false, reason: 'no_character' };
            await client.query(
                'INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1, $2, $3, $4, $5)',
                [chars[0].id, listing.item_name, listing.item_type, listing.quantity, listing.stats || {}],
            );
        }
        await client.query('DELETE FROM marketplace WHERE id = $1', [listingId]);
        return { ok: true, serverAuthoritative: true, listing };
    });
}

export async function callRpc(fn, body, userId) {
    if (fn === 'change_job') {
        if (!userId) throw httpErr(401, 'auth required');
        return changeJob(body, userId);
    }
    if (fn === 'use_consumable') {
        if (!userId) throw httpErr(401, 'auth required');
        return useConsumable(body, userId);
    }
    if (fn === 'save_equipped_item') {
        if (!userId) throw httpErr(401, 'auth required');
        return saveEquippedItem(body, userId);
    }
    if (fn === 'claim_starter_loadout') {
        if (!userId) throw httpErr(401, 'auth required');
        return claimStarterLoadout(body, userId);
    }
    if (fn === 'save_system_state') {
        if (!userId) throw httpErr(401, 'auth required');
        return saveSystemState(body, userId);
    }
    if (fn === 'claim_daily_reward') {
        if (!userId) throw httpErr(401, 'auth required');
        return claimDailyReward(body, userId);
    }
    if (fn === 'claim_almanac_reward') {
        if (!userId) throw httpErr(401, 'auth required');
        return claimAlmanacReward(body, userId);
    }
    if (fn === 'save_pet_state') {
        if (!userId) throw httpErr(401, 'auth required');
        return savePetState(body, userId);
    }
    if (fn === 'sell_pet_instance') {
        if (!userId) throw httpErr(401, 'auth required');
        return sellPetInstanceToNpc({
            characterId: body?.p_character_id,
            userId,
            itemName: body?.p_item_name,
            petUid: body?.p_pet_uid,
            requestId: body?.p_request_id,
        });
    }
    if (fn === 'create_pet_market_listing') {
        if (!userId) throw httpErr(401, 'auth required');
        return createPetMarketListing(body, userId);
    }
    if (fn === 'cancel_pet_market_listing') {
        if (!userId) throw httpErr(401, 'auth required');
        return cancelPetMarketListing(body, userId);
    }
    if (fn === 'buy_pet_market_item') {
        if (!userId) throw httpErr(401, 'auth required');
        return buyPetMarketItem(body, userId);
    }
    if (fn === 'create_market_listing') {
        if (!userId) throw httpErr(401, 'auth required');
        return createMarketListing(body, userId);
    }
    if (fn === 'cancel_market_listing') {
        if (!userId) throw httpErr(401, 'auth required');
        return cancelMarketListing(body, userId);
    }
    if (fn === 'open_vending_stall') {
        if (!userId) throw httpErr(401, 'auth required');
        return openVendingStall(body, userId);
    }
    if (fn === 'close_vending_stall') {
        if (!userId) throw httpErr(401, 'auth required');
        return closeVendingStall(userId);
    }
    if (fn === 'purchase_shop_item') {
        if (!userId) throw httpErr(401, 'auth required');
        return purchaseShopItem(body, userId);
    }
    const argNames = RPCS[fn];
    if (!argNames) throw httpErr(404, `unknown rpc: ${fn}`);
    if (!userId) throw httpErr(401, 'auth required');

    // Enforce the deadline again at the purchase boundary. This closes the tiny
    // gap between the exact 48-hour mark and the next scheduled cleanup tick.
    if (fn === 'buy_market_item') await cleanupExpiredVendingStalls();

    const params = [userId, ...argNames.map(n => (body && body[n] !== undefined) ? body[n] : null)];
    const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await query(`SELECT public.${fn}(${placeholders}) AS result`, params);
    return rows[0]?.result ?? null;
}
