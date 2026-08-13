// Express router exposing the self-hosted auth + data API.
// Mounted at /api. Hardened: rate limits, JSON size cap, auth middleware.
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import * as auth from './auth.js';
import { runQuery } from './data.js';
import { callRpc } from './rpc.js';
import * as ipMonitor from './ipMonitor.js';
import { registerBugReportRoutes } from './bugReports.js';

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

    r.use(express.json({ limit: '1mb' }));

    // Per-IP limiters. Generous because carrier-grade NAT (esp. Thai mobile)
    // puts many legitimate players behind ONE public IP — a tight cap would
    // 429 real users and block their character load. Still low enough to blunt
    // a single abusive host. A page load does a burst (character, inventory,
    // cards, quests, friends, almanac, marketplace, stalls, leaderboard), so
    // the window must comfortably fit several players loading at once.
    const onLimited = (req, res) => { ipMonitor.recordRateLimited(req.ip); res.status(429).json({ error: 'Too many requests' }); };
    const generalLimiter = rateLimit({ windowMs: 60_000, max: 1200, standardHeaders: true, legacyHeaders: false, handler: onLimited });
    const authLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, handler: onLimited });
    r.use(generalLimiter);

    // Record every request's IP for the admin security panel (cheap, in-memory).
    r.use((req, _res, next) => { ipMonitor.recordRequest(req.ip); next(); });

    const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(err => {
        const status = err.status || 500;
        if (status >= 500) console.error('[api] error:', err.message);
        res.status(status).json({ error: err.message || 'server error' });
    });

    registerBugReportRoutes(r, wrap);

    // ---- auth ----
    r.post('/auth/signup', authLimiter, wrap(async (req, res) => {
        res.json(await auth.signUp(req.body || {}));
    }));
    r.post('/auth/login', authLimiter, wrap(async (req, res) => {
        try {
            res.json(await auth.signIn(req.body || {}));
        } catch (e) {
            if (e.status === 401) ipMonitor.recordAuthFail(req.ip, String(req.body?.email || '').slice(0, 64));
            throw e;
        }
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
