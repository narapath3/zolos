// Self-hosted auth: bcrypt password verification (reusing the hashes migrated
// from Supabase) + JWT sessions. Replaces supabase.auth.*.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, tx } from './db.js';

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

function uniqueRecoveryUsername(base, suffix = makeUsernameSuffix()) {
    const clean = cleanUsername(base, 'Adventurer');
    const safeSuffix = String(suffix || '').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase() || 'RECOVER';
    return `${clean.slice(0, Math.max(1, 32 - safeSuffix.length - 1))}_${safeSuffix}`;
}

function makeUsernameSuffix() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function recoverPartialSignup({ existing, email, password, meta, actor }) {
    if (!actor || !existing?.encrypted_password) return null;
    // A retry can arrive with either the original anonymous Guest JWT (old
    // non-atomic signup) or the real JWT issued before a later character step
    // failed. In both cases the supplied password is still required.
    const isAnonymousGuest = actor.isAnonymous === true;
    const isSamePartialAccount = actor.isAnonymous !== true && actor.userId === existing.id;
    if (!isAnonymousGuest && !isSamePartialAccount) return null;
    const passwordMatches = await bcrypt.compare(String(password), existing.encrypted_password);
    if (!passwordMatches) return null;

    const recovered = await tx(async (client) => {
        const locked = await client.query(
            'SELECT id, email, encrypted_password FROM users WHERE id = $1 FOR UPDATE',
            [existing.id],
        );
        const account = locked.rows[0];
        if (!account?.encrypted_password) throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');

        const character = await client.query(
            'SELECT 1 FROM characters WHERE user_id = $1 LIMIT 1',
            [account.id],
        );
        if (character.rowCount > 0) throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');

        const currentProfile = await client.query(
            'SELECT username, gender FROM profiles WHERE id = $1 LIMIT 1',
            [account.id],
        );
        if (currentProfile.rows[0]) {
            return {
                ...account,
                username: currentProfile.rows[0].username,
                gender: currentProfile.rows[0].gender || meta.gender,
                recovered: true,
            };
        }

        let username = meta.username;
        let profileCreated = false;
        for (let attempt = 0; attempt < 8 && !profileCreated; attempt += 1) {
            const inserted = await client.query(
                `INSERT INTO profiles (id, username, gender) VALUES ($1, $2, $3)
                 ON CONFLICT (username) DO NOTHING RETURNING username, gender`,
                [account.id, username, meta.gender],
            );
            profileCreated = inserted.rowCount > 0;
            if (!profileCreated) username = uniqueRecoveryUsername(meta.username);
        }
        if (!profileCreated) throw httpErr(409, 'ชื่อผู้เล่นนี้ถูกใช้แล้ว กรุณาลองใหม่อีกครั้ง');
        return { ...account, username, gender: meta.gender, recovered: true };
    });

    return {
        token: signToken({ ...existing, encrypted_password: existing.encrypted_password }),
        user: { id: recovered.id, email: recovered.email || email, is_anonymous: false },
        recovered: true,
        username: recovered.username,
        gender: recovered.gender,
    };
}

export async function signUp({ email, password, username, gender }, actor = null) {
    email = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw httpErr(400, 'อีเมลไม่ถูกต้อง');
    if (!password || String(password).length < 6) throw httpErr(400, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว');

    const hash = await bcrypt.hash(String(password), 10);
    const meta = { username: cleanUsername(username, 'Adventurer'), gender: gender === 'female' ? 'female' : 'male' };

    // Recover a user created by an older non-atomic signup. This path is only
    // available to an authenticated anonymous Guest who proves the password;
    // an existing account with a character is never merged or overwritten.
    const existing = await query(
        'SELECT id, email, encrypted_password FROM users WHERE lower(email) = $1 LIMIT 1',
        [email],
    );
    if (existing.rows[0]) {
        const recovered = await recoverPartialSignup({ existing: existing.rows[0], email, password, meta, actor });
        if (recovered) return recovered;
        throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');
    }

    // User + profile must be one atomic operation. Otherwise a username
    // conflict can leave an auth user without a profile, and the next retry
    // appears as a misleading "profile creation" failure.
    let user;
    try {
        user = await tx(async (client) => {
            const exists = await client.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
            if (exists.rowCount > 0) throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');

            const { rows } = await client.query(
                `INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at)
                 VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id, email, encrypted_password`,
                [email, hash, meta]
            );
            const created = rows[0];
            await client.query(
                `INSERT INTO profiles (id, username, gender) VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, gender = EXCLUDED.gender`,
                [created.id, meta.username, meta.gender]
            );
            return created;
        });
    } catch (error) {
        if (error?.status === 409) throw error;
        if (error?.code === '23505' && String(error?.constraint || '').includes('profiles_username_key')) {
            throw httpErr(409, 'ชื่อผู้เล่นนี้ถูกใช้แล้ว กรุณาใช้ชื่อใหม่');
        }
        if (error?.code === '23505' && String(error?.constraint || '').includes('users')) {
            throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');
        }
        throw error;
    }
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

export async function bindAnonymousUser(userId, { email, password }) {
    email = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw httpErr(400, 'อีเมลไม่ถูกต้อง');
    if (!password || String(password).length < 6) throw httpErr(400, 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว');
    const hash = await bcrypt.hash(String(password), 10);

    // Convert the authenticated anonymous row in place. This preserves the
    // user UUID, every character row, inventory and system-progress row. A
    // separate sign-up + new-character migration would intentionally discard
    // untrusted client state and was the cause of Guest history disappearing.
    let user;
    try {
        user = await tx(async (client) => {
            const current = await client.query(
                'SELECT id, email, encrypted_password, raw_user_meta_data FROM users WHERE id = $1 FOR UPDATE',
                [userId],
            );
            const existing = current.rows[0];
            if (!existing) throw httpErr(404, 'ไม่พบ Guest session นี้');
            if (existing.encrypted_password || existing.email) {
                throw httpErr(409, 'Guest นี้ถูกผูกบัญชีไว้แล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม');
            }

            const conflict = await client.query(
                'SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1',
                [email, userId],
            );
            if (conflict.rowCount > 0) throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');

            const updated = await client.query(
                `UPDATE users
                 SET email = $2,
                     encrypted_password = $3,
                     raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"guest":false}'::jsonb
                 WHERE id = $1
                 RETURNING id, email, encrypted_password`,
                [userId, email, hash],
            );
            return updated.rows[0];
        });
    } catch (error) {
        if (error?.status === 404 || error?.status === 409) throw error;
        if (error?.code === '23505') throw httpErr(409, 'อีเมลนี้ถูกใช้แล้ว');
        throw error;
    }

    return {
        token: signToken(user),
        user: { id: user.id, email: user.email, is_anonymous: false },
        preserved: true,
    };
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
