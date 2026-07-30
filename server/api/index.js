// Express router exposing the self-hosted auth + data API.
// Mounted at /api. Hardened: rate limits, JSON size cap, auth middleware.
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import * as auth from './auth.js';
import { runQuery } from './data.js';
import { callRpc } from './rpc.js';

export function createApiRouter() {
    const r = express.Router();

    // CORS for browser calls from the Vercel frontend (zolos.online).
    const allowed = new Set((process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
    const allowAll = process.env.CORS_ALLOW_ALL === 'true';
    r.use(cors({
        origin: (origin, cb) => {
            if (!origin || allowAll || allowed.has(origin)) return cb(null, true);
            cb(null, false);
        },
        credentials: true,
    }));

    r.use(express.json({ limit: '256kb' }));

    // global-ish limiter (per IP)
    const generalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
    const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
    r.use(generalLimiter);

    const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(err => {
        const status = err.status || 500;
        if (status >= 500) console.error('[api] error:', err.message);
        res.status(status).json({ error: err.message || 'server error' });
    });

    // ---- auth ----
    r.post('/auth/signup', authLimiter, wrap(async (req, res) => {
        res.json(await auth.signUp(req.body || {}));
    }));
    r.post('/auth/login', authLimiter, wrap(async (req, res) => {
        res.json(await auth.signIn(req.body || {}));
    }));
    r.post('/auth/guest', authLimiter, wrap(async (_req, res) => {
        res.json(await auth.signInAnonymously());
    }));
    r.get('/auth/me', wrap(async (req, res) => {
        const a = auth.authFromReq(req);
        if (!a) return res.status(401).json({ error: 'no session' });
        res.json({ user: await auth.getMe(a.userId) });
    }));
    r.post('/auth/update', wrap(async (req, res) => {
        const a = auth.authFromReq(req);
        if (!a) return res.status(401).json({ error: 'no session' });
        res.json(await auth.updateUser(a.userId, req.body || {}));
    }));

    // ---- generic data (policy-enforced) ----
    r.post('/db', wrap(async (req, res) => {
        const a = auth.authFromReq(req);
        const data = await runQuery(req.body || {}, a?.userId || null);
        res.json({ data });
    }));

    // ---- rpc (ported Postgres functions) ----
    r.post('/rpc/:fn', wrap(async (req, res) => {
        const a = auth.authFromReq(req);
        const data = await callRpc(req.params.fn, req.body || {}, a?.userId || null);
        res.json({ data });
    }));

    r.get('/health', (_req, res) => res.json({ status: 'ok', api: 'zolos-selfhost' }));
    return r;
}
