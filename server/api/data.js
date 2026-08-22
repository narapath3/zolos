// Policy-based data access — replaces Supabase PostgREST + RLS. One audited
// executor; per-table policies declare who can read/write and how ownership is
// enforced. The authed user id comes from the JWT, never from the client body.
import { query } from './db.js';
import { httpErr } from './auth.js';
import { normalizePersistedJob } from '../securityPolicy.js';

// ownership models:
//   'public'            — anyone may SELECT
//   'own'               — row[ownerCol] must equal the authed user id
//   'own_via_character' — row.character_id must belong to a character owned by the user
const POLICIES = {
    characters: {
        // Character rows are visible to logged-in players for leaderboard/profile
        // features, but anonymous callers must not enumerate IDs or gameplay state.
        read: 'authenticated',
        publicColumns: [
            'id', 'user_id', 'name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp',
            'atk', 'def', 'gold', 'zol', 'total_kills', 'play_time', 'weapon', 'hat',
            'glasses', 'shield', 'armor', 'gender', 'last_map', 'job', 'body_color',
            'hair_color', 'pants_color', 'appearance', 'mmr', 'pvp_wins', 'pvp_losses',
        ],
        write: 'own', ownerCol: 'user_id',
        // characters.id is a client-style text id (char_xxx), no DB default
        genId: () => 'char_' + Math.random().toString(36).slice(2, 10),
        // never client-writable: id, user_id (server-stamped), is_admin-like fields
        writable: ['name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp', 'atk', 'def',
            'gold', 'zol', 'total_kills', 'play_time', 'last_map', 'job',
            'weapon', 'hat', 'glasses', 'shield', 'armor', 'body_color', 'hair_color',
            'pants_color', 'gender', 'sound_enabled', 'graphics_quality', 'fps_enabled',
            'appearance', 'tutorial_completed', 'updated_at'],
    },
    inventory: {
        read: 'own_via_character',
        write: 'own_via_character',
        writable: ['character_id', 'item_name', 'item_type', 'quantity', 'stats'],
    },
    profiles: {
        read: 'public',
        // is_admin is never public data. Admin checks use the gated admin API
        // or /auth/me, not the generic public profile reader.
        publicColumns: ['id', 'username', 'gender', 'created_at'],
        write: 'own', ownerCol: 'id',
        writable: ['username', 'gender'], // is_admin intentionally NOT writable
    },
    // Card-mail inbox. Reads only — sends/claims/returns go through RPCs that
    // re-check ownership. A player may read mail they SENT or RECEIVED, so
    // ownership is "either column matches the authed user".
    card_mailbox: {
        read: 'own_multi', ownerCols: ['sender_user_id', 'recipient_user_id'],
        write: false,
    },
    marketplace: {
        read: 'public',
        // Marketplace rows are escrow records. Creation, cancellation and
        // purchase must go through checked atomic RPCs; allowing generic /db
        // writes would let a seller edit quantity/item/stats after escrow and
        // mint value when another player buys the listing.
        write: false,
        writable: [],
    },
    vending_stalls: {
        read: 'public',
        // Stall placement and metadata are checked atomically by vending RPCs.
        write: false,
    },
    market_history: { read: 'public', write: false },
    character_cards: {
        read: 'own_via_character',
        // Collection counts, stars, and pity are server-owned. Mutations go
        // through card fusion/refine/economy RPCs, never generic /db writes.
        write: false,
    },
};

const SAFE_OPS = new Set(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte']);
const SERVER_AUTHORITATIVE_CHARACTER_FIELDS = new Set([
    'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp', 'atk', 'def',
    'gold', 'zol', 'total_kills', 'play_time', 'updated_at',
]);
const CHARACTER_CREATE_DEFAULTS = Object.freeze({
    level: 1, exp: 0, hp: 100, max_hp: 100, sp: 50, max_sp: 50,
    atk: 10, def: 5, gold: 0, zol: 0, total_kills: 0, play_time: 0,
});
const SYSTEM_INVENTORY_ITEMS = new Set([
    'daily_quests', 'friends_list', 'fishing_almanac', 'adventure_journal', 'login_streak',
]);

function assertClientWriteAllowed(table, action, values, filters = []) {
    if (table === 'inventory') {
        const input = values || {};
        const itemNameFilter = (filters || []).find(f => f?.col === 'item_name' && f?.op === 'eq')?.val;
        const isSystemSnapshot = SYSTEM_INVENTORY_ITEMS.has(input.item_name)
            || SYSTEM_INVENTORY_ITEMS.has(itemNameFilter);
        const isStarterSword = input.item_name === 'Sword' && input.item_type === 'weapon';
        const isStarterFishingRod = input.item_name === 'Fishing Rod' && input.item_type === 'fishing_rod';
        // These flags intentionally identify legacy attempts only; no generic
        // browser mutation is accepted, including starter/system exceptions.
        if (['insert', 'upsert', 'update', 'delete'].includes(action)) {
            const category = isSystemSnapshot ? 'system snapshot'
                : (isStarterSword || isStarterFishingRod ? 'starter item' : 'inventory');
            throw httpErr(403, `${category} mutations must come from server-authoritative RPCs`);
        }
        return;
    }
    if (table !== 'characters') return;
    const input = values || {};
    if (Object.hasOwn(input, 'job')) {
        // A newly-created character may start as Novice (null), but every
        // selected class must use one canonical persisted id. Legacy UI ids are
        // accepted only as aliases and are normalized before SQL is built.
        if (input.job === null && ['insert', 'upsert'].includes(action)) {
            // Keep the explicit Novice value for character creation.
        } else {
            const normalizedJob = normalizePersistedJob(input.job);
            if (!normalizedJob) throw httpErr(400, 'invalid character job');
            input.job = normalizedJob;
        }
    }
    if (['update', 'upsert'].includes(action)) {
        const blocked = Object.keys(input).filter(key => SERVER_AUTHORITATIVE_CHARACTER_FIELDS.has(key));
        if (blocked.length) {
            throw httpErr(403, `server-authoritative character fields: ${blocked.join(', ')}`);
        }
        return;
    }
    if (action === 'insert') {
        const forged = Object.entries(CHARACTER_CREATE_DEFAULTS).filter(([key, expected]) => (
            Object.hasOwn(input, key) && Number(input[key]) !== expected
        )).map(([key]) => key);
        if (forged.length) {
            throw httpErr(403, `invalid character creation fields: ${forged.join(', ')}`);
        }
    }
}

// cache real columns per table so we only ever reference existing columns
const colCache = new Map();
async function tableColumns(table) {
    if (colCache.has(table)) return colCache.get(table);
    const { rows } = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1`, [table]);
    const set = new Set(rows.map(r => r.column_name));
    colCache.set(table, set);
    return set;
}

function ident(name, allowed) {
    if (!allowed.has(name)) throw httpErr(400, `invalid column: ${name}`);
    return '"' + name.replace(/"/g, '') + '"';
}

// Build the ownership WHERE fragment for reads/writes that are scoped to the user.
function ownershipClause(policy, userId, params, forWrite) {
    if (policy.write === 'own' || (forWrite && policy.write === 'own')) {
        params.push(userId);
        return `"${policy.ownerCol}" = $${params.length}`;
    }
    if (policy.write === 'own_via_character' || (!forWrite && policy.read === 'own_via_character')) {
        params.push(userId);
        const col = policy.ownerCol || 'character_id';
        return `"${col}" IN (SELECT id FROM characters WHERE user_id = $${params.length})`;
    }
    // "own_multi" (reads only): the row belongs to the user if ANY of the
    // ownerCols equals the authed user id (e.g. card mail sender OR recipient).
    if (!forWrite && policy.read === 'own_multi' && Array.isArray(policy.ownerCols)) {
        params.push(userId);
        const idx = params.length;
        return '(' + policy.ownerCols.map(c => `"${c.replace(/"/g, '')}" = $${idx}`).join(' OR ') + ')';
    }
    return null;
}

export async function runQuery(spec, userId) {
    const { table, action } = spec;
    const policy = POLICIES[table];
    if (!policy) throw httpErr(403, `table not allowed: ${table}`);
    const cols = await tableColumns(table);
    const params = [];

    // WHERE from client filters (validated)
    const whereParts = [];
    for (const f of (spec.filters || [])) {
        if (!SAFE_OPS.has(f.op)) throw httpErr(400, `bad op: ${f.op}`);
        const c = ident(f.col, cols);
        if (f.op === 'in') {
            const arr = Array.isArray(f.val) ? f.val : [f.val];
            const ph = arr.map(v => { params.push(v); return `$${params.length}`; });
            whereParts.push(`${c} IN (${ph.join(',')})`);
        } else {
            params.push(f.val);
            const opSql = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op];
            whereParts.push(`${c} ${opSql} $${params.length}`);
        }
    }

    if (action === 'select') {
        if (policy.read === 'authenticated') {
            if (!userId) throw httpErr(401, 'auth required');
        } else if (policy.read !== 'public') {
            const own = ownershipClause(policy, userId, params, false);
            if (!userId || !own) throw httpErr(401, 'auth required');
            whereParts.push(own);
        }
        let sel = '*';
        const publicColumns = ['public', 'authenticated'].includes(policy.read) && Array.isArray(policy.publicColumns)
            ? new Set(policy.publicColumns)
            : null;
        if (Array.isArray(spec.columns)) {
            if (publicColumns) {
                const denied = spec.columns.filter(column => !publicColumns.has(column));
                if (denied.length) throw httpErr(403, `public column not available: ${denied.join(', ')}`);
            }
            sel = spec.columns.map(c => ident(c, cols)).join(', ');
        } else if (publicColumns) {
            sel = [...publicColumns].map(c => ident(c, cols)).join(', ');
        }
        let sql = `SELECT ${sel} FROM "${table}"`;
        if (whereParts.length) sql += ' WHERE ' + whereParts.join(' AND ');
        // Multi-column ORDER BY: accept an array of {col,asc} (chained .order())
        // or a single {col,asc} for backward compatibility.
        const orders = (Array.isArray(spec.order) ? spec.order : (spec.order ? [spec.order] : []))
            .filter(o => o && cols.has(o.col));
        if (orders.length) {
            sql += ' ORDER BY ' + orders.map(o => `${ident(o.col, cols)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ');
        }
        const lim = Math.min(parseInt(spec.limit) || 1000, 5000);
        sql += ` LIMIT ${lim}`;
        const { rows } = await query(sql, params);
        return spec.single ? (rows[0] || null) : rows;
    }

    // writes require auth
    if (!userId) throw httpErr(401, 'auth required');
    if (!policy.write) throw httpErr(403, 'read-only table');

    if (action === 'insert' || action === 'upsert') {
        const values = Array.isArray(spec.values) ? spec.values : [spec.values || {}];
        const results = [];
        for (const v of values) {
            assertClientWriteAllowed(table, action, v, []);
            const row = sanitizeWrite(policy, v, cols);
            // stamp/verify ownership
            await enforceInsertOwnership(policy, row, userId);
            // Stall lifetime is server-authoritative. updated_at is deliberately
            // absent from the client writable list so a modified client cannot
            // extend a shop by forging its clock.
            if (table === 'vending_stalls' && cols.has('updated_at')) {
                row.updated_at = new Date().toISOString();
                const { rowCount } = await query(
                    'SELECT 1 FROM characters WHERE id = $1 AND user_id = $2',
                    [row.character_id, userId],
                );
                if (!rowCount) throw httpErr(403, 'not your character');
            }
            // generate a text primary key where the table has no DB default
            if (policy.genId && (row.id === undefined || row.id === null) && cols.has('id')) {
                row.id = policy.genId();
            }
            const keys = Object.keys(row);
            const p2 = [];
            const ph = keys.map(k => { p2.push(row[k]); return `$${p2.length}`; });
            let sql = `INSERT INTO "${table}" (${keys.map(k => ident(k, cols)).join(',')}) VALUES (${ph.join(',')})`;
            if (action === 'upsert') {
                // Supabase upsert defaults to the table primary key when the
                // caller omits onConflict. The self-host adapter previously
                // emitted a plain INSERT in that case, so the profile write
                // after signup/recovery failed with a duplicate id.
                const conflictColumns = spec.onConflict
                    ? spec.onConflict.split(',').map(c => c.trim())
                    : (cols.has('id') ? ['id'] : []);
                if (conflictColumns.length) {
                    const conflictSet = new Set(conflictColumns);
                    const cc = conflictColumns.map(c => ident(c, cols)).join(',');
                    const upd = keys.filter(k => !conflictSet.has(k))
                        .map(k => `${ident(k, cols)}=EXCLUDED.${ident(k, cols)}`).join(',');
                    sql += ` ON CONFLICT (${cc}) DO UPDATE SET ${upd || keys[0] + '=EXCLUDED.' + keys[0]}`;
                }
            }
            sql += ' RETURNING *';
            const { rows } = await query(sql, p2);
            results.push(rows[0]);
        }
        return spec.single ? results[0] : results;
    }

    if (action === 'update') {
        assertClientWriteAllowed(table, action, spec.values || {}, spec.filters || []);
        const row = sanitizeWrite(policy, spec.values || {}, cols);
        const keys = Object.keys(row);
        if (!keys.length) throw httpErr(400, 'no writable fields');
        const p2 = [];
        const setSql = keys.map(k => { p2.push(row[k]); return `${ident(k, cols)}=$${p2.length}`; }).join(',');
        // re-apply filters + ownership against p2
        const wp = [];
        for (const f of (spec.filters || [])) {
            if (!SAFE_OPS.has(f.op)) throw httpErr(400, 'bad op');
            p2.push(f.val); wp.push(`${ident(f.col, cols)} = $${p2.length}`);
        }
        const own = ownershipClause(policy, userId, p2, true);
        if (own) wp.push(own);
        if (!wp.length) throw httpErr(400, 'update needs a filter');
        const sql = `UPDATE "${table}" SET ${setSql} WHERE ${wp.join(' AND ')} RETURNING *`;
        const { rows } = await query(sql, p2);
        return rows;
    }

    if (action === 'delete') {
        const p2 = [];
        const wp = [];
        for (const f of (spec.filters || [])) {
            if (!SAFE_OPS.has(f.op)) throw httpErr(400, 'bad op');
            p2.push(f.val); wp.push(`${ident(f.col, cols)} = $${p2.length}`);
        }
        const own = ownershipClause(policy, userId, p2, true);
        if (own) wp.push(own);
        if (!wp.length) throw httpErr(400, 'delete needs a filter');
        const sql = `DELETE FROM "${table}" WHERE ${wp.join(' AND ')} RETURNING *`;
        const { rows } = await query(sql, p2);
        return rows;
    }

    throw httpErr(400, `unknown action: ${action}`);
}

function sanitizeWrite(policy, values, cols) {
    const out = {};
    for (const [k, v] of Object.entries(values || {})) {
        if (policy.writable.includes(k) && cols.has(k)) out[k] = v;
    }
    return out;
}

// For inserts: stamp/verify ownership so a client can't create rows for others.
async function enforceInsertOwnership(policy, row, userId) {
    if (policy.write === 'own') {
        row[policy.ownerCol] = userId; // server-stamped
    } else if (policy.write === 'own_via_character') {
        const col = policy.ownerCol || 'character_id';
        const charId = row[col];
        if (!charId) throw httpErr(400, `${col} required`);
        const { rowCount } = await query(
            'SELECT 1 FROM characters WHERE id = $1 AND user_id = $2', [charId, userId]);
        if (!rowCount) throw httpErr(403, 'not your character');
    }
}
