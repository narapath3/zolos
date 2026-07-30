// Drop-in shim mimicking the subset of supabase-js the client uses, backed by
// the self-hosted VPS API. Lets ~60 existing `supabase.from()/.rpc()/.auth`
// call sites keep working with minimal changes.
//
// Session: JWT stored in localStorage. All requests attach it as a Bearer token.

const TOKEN_KEY = 'zolos_jwt';

function getToken() { try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

// Decode a JWT payload without verifying (client only needs the claims for UX).
function decodeJwt(t) {
    try {
        const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch { return null; }
}

function userFromToken(t) {
    const p = t && decodeJwt(t);
    if (!p) return null;
    return { id: p.sub, is_anonymous: !!p.anon };
}

export function createZolosClient(baseUrl) {
    const base = baseUrl.replace(/\/$/, '');
    let authChangeCb = null;

    async function apiFetch(path, opts = {}) {
        const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
        const t = getToken();
        if (t) headers.Authorization = 'Bearer ' + t;
        const res = await fetch(base + path, { ...opts, headers });
        let body = null;
        try { body = await res.json(); } catch { /* no body */ }
        if (!res.ok) {
            const err = new Error((body && body.error) || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return body;
    }

    // ---- query builder ----
    class QueryBuilder {
        constructor(table) {
            this.table = table;
            this._action = 'select';
            this._columns = '*';
            this._filters = [];
            this._values = undefined;
            this._order = null;
            this._limit = undefined;
            this._single = false;
            this._maybe = false;
            this._onConflict = undefined;
            this._returnRows = true;
        }
        select(cols) {
            if (this._action === 'select') {
                this._columns = (cols && cols !== '*') ? String(cols).split(',').map(s => s.trim()) : '*';
            }
            return this; // after insert/update, .select() just requests returning rows (we always do)
        }
        insert(values) { this._action = 'insert'; this._values = values; return this; }
        upsert(values, opts) { this._action = 'upsert'; this._values = values; this._onConflict = opts && opts.onConflict; return this; }
        update(values) { this._action = 'update'; this._values = values; return this; }
        delete() { this._action = 'delete'; return this; }
        eq(col, val) { this._filters.push({ col, op: 'eq', val }); return this; }
        neq(col, val) { this._filters.push({ col, op: 'neq', val }); return this; }
        in(col, arr) { this._filters.push({ col, op: 'in', val: arr }); return this; }
        gt(col, val) { this._filters.push({ col, op: 'gt', val }); return this; }
        gte(col, val) { this._filters.push({ col, op: 'gte', val }); return this; }
        lt(col, val) { this._filters.push({ col, op: 'lt', val }); return this; }
        lte(col, val) { this._filters.push({ col, op: 'lte', val }); return this; }
        order(col, opts) { this._order = { col, asc: !(opts && opts.ascending === false) }; return this; }
        limit(n) { this._limit = n; return this; }
        single() { this._single = true; this._limit = this._limit ?? 1; return this; }
        maybeSingle() { this._maybe = true; this._limit = this._limit ?? 1; return this; }

        _spec() {
            return {
                table: this.table, action: this._action, columns: this._columns,
                filters: this._filters, values: this._values, order: this._order,
                limit: this._limit, single: false, onConflict: this._onConflict,
            };
        }

        async _run() {
            try {
                const body = await apiFetch('/db', { method: 'POST', body: JSON.stringify(this._spec()) });
                let data = body.data;
                if (this._single || this._maybe) {
                    const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
                    if (this._single && row === null) {
                        // mirror supabase-js "no rows" so callers checking PGRST116 still work
                        return { data: null, error: { code: 'PGRST116', message: 'no rows returned' } };
                    }
                    return { data: row, error: null };
                }
                return { data: Array.isArray(data) ? data : (data == null ? [] : data), error: null };
            } catch (e) {
                return { data: null, error: { message: e.message, status: e.status } };
            }
        }
        then(resolve, reject) { return this._run().then(resolve, reject); }
    }

    // ---- auth ----
    const auth = {
        async signUp({ email, password, options }) {
            try {
                const meta = (options && options.data) || {};
                const r = await apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, username: meta.username, gender: meta.gender }) });
                setToken(r.token);
                if (authChangeCb) authChangeCb('SIGNED_IN', { user: r.user });
                return { data: { user: r.user, session: { access_token: r.token, user: r.user } }, error: null };
            } catch (e) { return { data: { user: null, session: null }, error: { message: e.message } }; }
        },
        async signInWithPassword({ email, password }) {
            try {
                const r = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
                setToken(r.token);
                if (authChangeCb) authChangeCb('SIGNED_IN', { user: r.user });
                return { data: { user: r.user, session: { access_token: r.token, user: r.user } }, error: null };
            } catch (e) { return { data: { user: null, session: null }, error: { message: e.message } }; }
        },
        async signInAnonymously() {
            try {
                const r = await apiFetch('/auth/guest', { method: 'POST', body: JSON.stringify({}) });
                setToken(r.token);
                if (authChangeCb) authChangeCb('SIGNED_IN', { user: r.user });
                return { data: { user: r.user, session: { access_token: r.token, user: r.user } }, error: null };
            } catch (e) { return { data: { user: null, session: null }, error: { message: e.message } }; }
        },
        async signOut() { setToken(null); if (authChangeCb) authChangeCb('SIGNED_OUT', null); return { error: null }; },
        async getUser() {
            const t = getToken();
            if (!t) return { data: { user: null }, error: null };
            try {
                const r = await apiFetch('/auth/me', { method: 'GET' });
                return { data: { user: r.user }, error: null };
            } catch (e) { return { data: { user: null }, error: { message: e.message } }; }
        },
        async getSession() {
            const t = getToken();
            if (!t) return { data: { session: null }, error: null };
            const user = userFromToken(t);
            return { data: { session: { access_token: t, user } }, error: null };
        },
        async updateUser({ password }) {
            try { await apiFetch('/auth/update', { method: 'POST', body: JSON.stringify({ password }) }); return { data: { user: userFromToken(getToken()) }, error: null }; }
            catch (e) { return { data: { user: null }, error: { message: e.message } }; }
        },
        onAuthStateChange(cb) {
            authChangeCb = cb;
            // emit initial state
            const t = getToken();
            queueMicrotask(() => cb(t ? 'SIGNED_IN' : 'SIGNED_OUT', t ? { user: userFromToken(t) } : null));
            return { data: { subscription: { unsubscribe() { authChangeCb = null; } } } };
        },
    };

    return {
        from(table) { return new QueryBuilder(table); },
        async rpc(fn, args) {
            try {
                const body = await apiFetch('/rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) });
                return { data: body.data, error: null };
            } catch (e) { return { data: null, error: { message: e.message } }; }
        },
        auth,
    };
}
