// Self-hosted auth: bcrypt password verification (reusing the hashes migrated
// from Supabase) + JWT sessions. Replaces supabase.auth.*.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
const isProduction = process.env.NODE_ENV === 'production'
    || process.env.RAILWAY_ENVIRONMENT === 'production'
    || process.env.USE_LOCAL_DB === 'true'
    || Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (isProduction && configuredJwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
}
// Keep a development-only fallback so local tests and explicitly local runs are
// usable, but never allow a predictable signing key in a deployed server.
const JWT_SECRET = configuredJwtSecret || DEV_JWT_SECRET;
const TOKEN_TTL = '30d';

function signToken(user) {
    return jwt.sign(
        { sub: user.id, anon: !user.encrypted_password },
        JWT_SECRET,
        { expiresIn: TOKEN_TTL }
    );
}

export function verifyToken(token) {
    try {
        const p = jwt.verify(token, JWT_SECRET);
        return { userId: p.sub, isAnonymous: !!p.anon };
    } catch {
        return null;
    }
}

// Read the bearer token from a request; returns { userId, isAnonymous } or null.
export function authFromReq(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    return verifyToken(h.slice(7));
}

function cleanUsername(name, fallback) {
    const u = String(name || '').trim().slice(0, 32);
    return u || fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp({ email, password, username, gender }) {
    email = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw httpErr(400, 'อีเมลไม่ถูกต้อง');
    if (!password || String(password).length < 6) throw httpErr(400, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว');

    const exists = await query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (exists.rowCount > 0) throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');

    const hash = await bcrypt.hash(String(password), 10);
    const meta = { username: cleanUsername(username, 'Adventurer'), gender: gender === 'female' ? 'female' : 'male' };
    const { rows } = await query(
        `INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id, email, encrypted_password`,
        [email, hash, meta]
    );
    const user = rows[0];
    await query(
        `INSERT INTO profiles (id, username) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
        [user.id, meta.username]
    );
    return { token: signToken(user), user: { id: user.id, email: user.email, is_anonymous: false } };
}

export async function signIn({ email, password }) {
    email = String(email || '').trim().toLowerCase();
    const { rows } = await query(
        'SELECT id, email, encrypted_password FROM users WHERE lower(email) = $1',
        [email]
    );
    const user = rows[0];
    if (!user || !user.encrypted_password) throw httpErr(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    const ok = await bcrypt.compare(String(password || ''), user.encrypted_password);
    if (!ok) throw httpErr(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await query('UPDATE users SET last_sign_in_at = now() WHERE id = $1', [user.id]);
    return { token: signToken(user), user: { id: user.id, email: user.email, is_anonymous: false } };
}

// Persistent guest: a real DB-backed anonymous user (survives relogin via the
// stored JWT). Fixes the old "new guest id every time" reset bug.
export async function signInAnonymously() {
    const { rows } = await query(
        `INSERT INTO users (id, raw_user_meta_data, created_at)
         VALUES (gen_random_uuid(), '{"guest":true}'::jsonb, now())
         RETURNING id`,
        []
    );
    const user = { id: rows[0].id, encrypted_password: null };
    return { token: signToken(user), user: { id: user.id, is_anonymous: true } };
}

export async function getMe(userId) {
    const { rows } = await query(
        `SELECT u.id, u.email, (u.encrypted_password IS NULL) AS is_anonymous,
                p.username, COALESCE(p.is_admin, false) AS is_admin
         FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = $1`,
        [userId]
    );
    return rows[0] || null;
}

export async function updateUser(userId, { password }) {
    if (password) {
        if (String(password).length < 6) throw httpErr(400, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว');
        const hash = await bcrypt.hash(String(password), 10);
        await query('UPDATE users SET encrypted_password = $2 WHERE id = $1', [userId, hash]);
    }
    return { ok: true };
}

export function httpErr(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}
