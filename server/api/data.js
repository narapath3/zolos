// Policy-based data access — replaces Supabase PostgREST + RLS. One audited
// executor; per-table policies declare who can read/write and how ownership is
// enforced. The authed user id comes from the JWT, never from the client body.
import { query } from './db.js';
import { httpErr } from './auth.js';

// ownership models:
//   'public'            — anyone may SELECT
//   'own'               — row[ownerCol] must equal the authed user id
//   'own_via_character' — row.character_id must belong to a character owned by the user
const POLICIES = {
    characters: {
        read: 'public',
        write: 'own', ownerCol: 'user_id',
        // characters.id is a client-style text id (char_xxx), no DB default
        genId: () => 'char_' + Math.random().toString(36).slice(2, 10),
        // never client-writable: id, user_id (server-stamped), is_admin-like fields
        writable: ['name', 'level', 'exp', 'hp', 'max_hp', 'sp', 'max_sp', 'atk', 'def',
            'gold', 'zol', 'total_kills', 'play_time', 'last_map', 'job',
            'weapon', 'hat', 'glasses', 'shield', 'armor', 'body_color', 'hair_color',
            'pants_color', 'gender', 'sound_enabled', 'graphics_quality', 'fps_enabled',
            'appearance', 'updated_at'],
    },
    inventory: {
        read: 'own_via_character',
        write: 'own_via_character',
        writable: ['character_id', 'item_name', 'item_type', 'quantity', 'stats'],
    },
    profiles: {
        read: 'public',
        write: 'own', ownerCol: 'id',
        writable: ['username'], // is_admin intentionally NOT writable
    },
    marketplace: {
        read: 'public',
        write: 'own', ownerCol: 'seller_id', // seller_id is the seller's user_id (uuid)
        writable: ['seller_name', 'item_id', 'item_name', 'item_type', 'emoji', 'quantity', 'price', 'stats'],
    },
    vending_stalls: {
        read: 'public',
        write: 'own', ownerCol: 'user_id',
        writable: ['character_id', 'owner_name', 'shop_name', 'slot', 'appearance'],
    },
    market_history: { read: 'public', write: false },
    character_cards: {
        read: 'own_via_character',
        write: 'own_via_character',
        writable: ['character_id', 'card_id', 'owned', 'stars', 'pity'],
    },
};

const SAFE_OPS = new Set(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte']);

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
        if (policy.read !== 'public') {
            const own = ownershipClause(policy, userId, params, false);
            if (!userId || !own) throw httpErr(401, 'auth required');
            whereParts.push(own);
        }
        let sel = '*';
        if (Array.isArray(spec.columns)) sel = spec.columns.map(c => ident(c, cols)).join(', ');
        let sql = `SELECT ${sel} FROM "${table}"`;
        if (whereParts.length) sql += ' WHERE ' + whereParts.join(' AND ');
        if (spec.order && cols.has(spec.order.col)) sql += ` ORDER BY ${ident(spec.order.col, cols)} ${spec.order.asc ? 'ASC' : 'DESC'}`;
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
            const row = sanitizeWrite(policy, v, cols);
            // stamp/verify ownership
            await enforceInsertOwnership(policy, row, userId);
            // generate a text primary key where the table has no DB default
            if (policy.genId && (row.id === undefined || row.id === null) && cols.has('id')) {
                row.id = policy.genId();
            }
            const keys = Object.keys(row);
            const p2 = [];
            const ph = keys.map(k => { p2.push(row[k]); return `$${p2.length}`; });
            let sql = `INSERT INTO "${table}" (${keys.map(k => ident(k, cols)).join(',')}) VALUES (${ph.join(',')})`;
            if (action === 'upsert' && spec.onConflict) {
                const cc = spec.onConflict.split(',').map(c => ident(c.trim(), cols)).join(',');
                const upd = keys.filter(k => !spec.onConflict.split(',').map(s => s.trim()).includes(k))
                    .map(k => `${ident(k, cols)}=EXCLUDED.${ident(k, cols)}`).join(',');
                sql += ` ON CONFLICT (${cc}) DO UPDATE SET ${upd || keys[0] + '=EXCLUDED.' + keys[0]}`;
            }
            sql += ' RETURNING *';
            const { rows } = await query(sql, p2);
            results.push(rows[0]);
        }
        return spec.single ? results[0] : results;
    }

    if (action === 'update') {
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
