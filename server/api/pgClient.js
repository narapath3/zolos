// Server-side supabase-js-compatible adapter backed by local Postgres.
// Full access (like the old service_role) — server.js performs its own
// authorization. Used to swap `createClient(...)` inside the socket server.
import { query } from './db.js';
import { verifyToken } from './auth.js';

function q(id) { return '"' + String(id).replace(/"/g, '') + '"'; }

class SBQuery {
    constructor(table) {
        this.table = table;
        this._action = 'select';
        this._cols = '*';
        this._values = undefined;
        this._filters = [];
        this._single = false;
        this._maybe = false;
    }
    select(cols) {
        if (this._action === 'select') {
            this._cols = (cols && cols !== '*')
                ? String(cols).split(',').map(s => q(s.trim())).join(', ')
                : '*';
        }
        return this;
    }
    insert(values) { this._action = 'insert'; this._values = values; return this; }
    update(values) { this._action = 'update'; this._values = values; return this; }
    delete() { this._action = 'delete'; return this; }
    eq(col, val) { this._filters.push([col, val]); return this; }
    in(col, arr) { this._filters.push([col, arr, 'in']); return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._maybe = true; return this; }

    _where(params) {
        if (!this._filters.length) return '';
        const parts = this._filters.map(([col, val, op]) => {
            if (op === 'in') {
                const arr = Array.isArray(val) ? val : [val];
                const ph = arr.map(v => { params.push(v); return `$${params.length}`; });
                return `${q(col)} IN (${ph.join(',')})`;
            }
            params.push(val); return `${q(col)} = $${params.length}`;
        });
        return ' WHERE ' + parts.join(' AND ');
    }

    async _run() {
        const params = [];
        let sql;
        try {
            if (this._action === 'select') {
                sql = `SELECT ${this._cols} FROM ${q(this.table)}${this._where(params)}`;
            } else if (this._action === 'insert') {
                const rows = Array.isArray(this._values) ? this._values : [this._values];
                const keys = Object.keys(rows[0] || {});
                const tuples = rows.map(r => '(' + keys.map(k => { params.push(r[k]); return `$${params.length}`; }).join(',') + ')');
                sql = `INSERT INTO ${q(this.table)} (${keys.map(q).join(',')}) VALUES ${tuples.join(',')} RETURNING *`;
            } else if (this._action === 'update') {
                const keys = Object.keys(this._values || {});
                const set = keys.map(k => { params.push(this._values[k]); return `${q(k)}=$${params.length}`; }).join(',');
                sql = `UPDATE ${q(this.table)} SET ${set}${this._where(params)} RETURNING *`;
            } else if (this._action === 'delete') {
                sql = `DELETE FROM ${q(this.table)}${this._where(params)} RETURNING *`;
            }
            const { rows } = await query(sql, params);
            if (this._single) {
                if (rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
                return { data: rows[0], error: null };
            }
            if (this._maybe) return { data: rows[0] ?? null, error: null };
            return { data: rows, error: null };
        } catch (e) {
            return { data: null, error: { message: e.message, code: e.code } };
        }
    }
    then(resolve, reject) { return this._run().then(resolve, reject); }
}

export function createPgClient() {
    return {
        from(table) { return new SBQuery(table); },
        async rpc(fn, args) {
            // args is an object of named params; order them by the function's params
            const names = Object.keys(args || {});
            const vals = names.map(n => args[n]);
            const ph = vals.map((_, i) => `$${i + 1}`).join(',');
            // build named-arg call so param order doesn't matter
            const named = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
            try {
                const { rows } = await query(`SELECT public.${fn}(${named}) AS result`, vals);
                return { data: rows[0]?.result ?? null, error: null };
            } catch (e) {
                return { data: null, error: { message: e.message, code: e.code } };
            }
        },
        auth: {
            async getUser(token) {
                const v = token ? verifyToken(token) : null;
                if (!v) return { data: { user: null }, error: { message: 'invalid token' } };
                return { data: { user: { id: v.userId, is_anonymous: v.isAnonymous } }, error: null };
            },
        },
    };
}
