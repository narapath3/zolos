// Admin control-panel API. Mounted at /admin/api. Every route is gated by
// requireAdmin: a valid JWT whose profiles.is_admin = true. The dashboard logs
// in through the normal /api/auth/login (reusing the in-game admin account),
// then calls these endpoints with that bearer token.
import express from 'express';
import { query, tx } from './db.js';
import { authFromReq, httpErr } from './auth.js';
import * as ipMonitor from './ipMonitor.js';
import { sweepCheaters, resetCharacter } from './cheatGuard.js';

// Character columns an admin may edit, with bounds. Anything else is ignored.
const EDITABLE_NUM = {
    level: [1, 300], exp: [0, 2_147_483_647], hp: [0, 1_000_000], max_hp: [1, 1_000_000],
    sp: [0, 1_000_000], max_sp: [0, 1_000_000], atk: [0, 1_000_000], def: [0, 1_000_000],
    gold: [0, 2_147_483_647], zol: [0, 2_147_483_647], total_kills: [0, 2_147_483_647],
    play_time: [0, 2_147_483_647], mmr: [0, 100_000], pvp_wins: [0, 2_147_483_647],
    pvp_losses: [0, 2_147_483_647],
};
const EDITABLE_TEXT = new Set(['name', 'job', 'last_map']);

function clampNum(key, val) {
    const [min, max] = EDITABLE_NUM[key];
    const n = Math.floor(Number(val));
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
}

export function createAdminRouter({ io, onlinePlayers, userSocketMap } = {}) {
    const r = express.Router();
    r.use(express.json({ limit: '256kb' }));

    // ---- auth gate ----
    const requireAdmin = async (req, res, next) => {
        try {
            const a = authFromReq(req);
            if (!a) throw httpErr(401, 'ต้องเข้าสู่ระบบ');
            const { rows } = await query(
                'SELECT COALESCE(is_admin,false) AS is_admin, username FROM profiles WHERE id = $1',
                [a.userId]);
            if (!rows[0] || rows[0].is_admin !== true) {
                ipMonitor.recordSuspicious(req.ip, `non-admin hit ${req.path}`);
                throw httpErr(403, 'ต้องเป็นผู้ดูแลระบบเท่านั้น');
            }
            req.admin = { userId: a.userId, username: rows[0].username };
            next();
        } catch (e) { next(e); }
    };

    const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

    // ================= SUMMARY =================
    r.get('/me', requireAdmin, wrap(async (req, res) => {
        res.json({ admin: req.admin });
    }));

    r.get('/summary', requireAdmin, wrap(async (_req, res) => {
        const [players, chars, gold, listings, mail, newToday, admins] = await Promise.all([
            query('SELECT count(*)::int c FROM profiles'),
            query('SELECT count(*)::int c FROM characters'),
            query('SELECT COALESCE(sum(gold),0)::bigint g, COALESCE(sum(zol),0)::bigint z FROM characters'),
            query("SELECT count(*)::int c FROM marketplace"),
            query("SELECT count(*)::int c FROM card_mailbox WHERE status='pending'"),
            query("SELECT count(*)::int c FROM characters WHERE created_at > now() - interval '1 day'"),
            query('SELECT count(*)::int c FROM profiles WHERE is_admin = true'),
        ]);
        res.json({
            players: players.rows[0].c,
            characters: chars.rows[0].c,
            totalGold: Number(gold.rows[0].g),
            totalZol: Number(gold.rows[0].z),
            listings: listings.rows[0].c,
            pendingMail: mail.rows[0].c,
            newCharsToday: newToday.rows[0].c,
            admins: admins.rows[0].c,
            online: onlinePlayers ? onlinePlayers.size : 0,
            serverTime: Date.now(),
        });
    }));

    // ================= PLAYERS =================
    r.get('/players', requireAdmin, wrap(async (req, res) => {
        const search = String(req.query.search || '').trim();
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const offset = Math.max(0, parseInt(req.query.offset) || 0);
        const params = [];
        let where = '';
        if (search) {
            params.push(`%${search}%`);
            where = `WHERE c.name ILIKE $1 OR c.id ILIKE $1 OR c.user_id::text ILIKE $1
                     OR p.username ILIKE $1`;
        }
        params.push(limit, offset);
        const { rows } = await query(
            `SELECT c.id, c.user_id, c.name, c.level, c.gold, c.zol, c.job,
                    c.total_kills, c.play_time, c.updated_at, c.created_at,
                    p.username, COALESCE(p.is_admin,false) AS is_admin, u.email
             FROM characters c
             LEFT JOIN profiles p ON p.id = c.user_id
             LEFT JOIN users u ON u.id = c.user_id
             ${where}
             ORDER BY c.updated_at DESC NULLS LAST
             LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        // mark who is online
        const onlineUsers = new Set();
        if (onlinePlayers) for (const p of onlinePlayers.values()) onlineUsers.add(p.userId);
        res.json({ players: rows.map(x => ({ ...x, online: onlineUsers.has(x.user_id) })) });
    }));

    r.get('/players/:characterId', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const char = await query('SELECT * FROM characters WHERE id = $1', [cid]);
        if (!char.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        const c = char.rows[0];
        const [inv, cards, listings, stalls, prof, user] = await Promise.all([
            query('SELECT id, item_name, item_type, quantity, stats FROM inventory WHERE character_id = $1 ORDER BY item_type, item_name', [cid]),
            query('SELECT card_id, owned, stars, pity FROM character_cards WHERE character_id = $1 ORDER BY owned DESC', [cid]),
            query('SELECT id, item_name, quantity, price, created_at FROM marketplace WHERE seller_id = $1', [c.user_id]),
            query('SELECT id, shop_name, slot, created_at FROM vending_stalls WHERE user_id = $1', [c.user_id]),
            query('SELECT username, is_admin, gender, created_at FROM profiles WHERE id = $1', [c.user_id]),
            query('SELECT email, last_sign_in_at, created_at FROM users WHERE id = $1', [c.user_id]),
        ]);
        const onlineUsers = new Set();
        if (onlinePlayers) for (const p of onlinePlayers.values()) onlineUsers.add(p.userId);
        res.json({
            character: c,
            inventory: inv.rows,
            cards: cards.rows,
            listings: listings.rows,
            stalls: stalls.rows,
            profile: prof.rows[0] || null,
            user: user.rows[0] || null,
            online: onlineUsers.has(c.user_id),
        });
    }));

    // Edit character fields (money, stats, name, job…)
    r.post('/players/:characterId/character', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const body = req.body || {};
        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(body)) {
            if (EDITABLE_NUM[k]) {
                const n = clampNum(k, v);
                if (n === null) continue;
                params.push(n); sets.push(`"${k}" = $${params.length}`);
            } else if (EDITABLE_TEXT.has(k)) {
                params.push(String(v ?? '').slice(0, 48)); sets.push(`"${k}" = $${params.length}`);
            }
        }
        if (!sets.length) throw httpErr(400, 'ไม่มีฟิลด์ที่แก้ไขได้');
        params.push(cid);
        const { rows } = await query(
            `UPDATE characters SET ${sets.join(', ')}, updated_at = now()
             WHERE id = $${params.length} RETURNING *`, params);
        if (!rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        console.log(`[Admin] ${req.admin.username} edited character ${cid}: ${sets.join(', ')}`);
        res.json({ ok: true, character: rows[0] });
    }));

    // Give / remove an item. qty > 0 adds, qty < 0 removes (deletes at 0).
    r.post('/players/:characterId/item', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const { item_name, item_type = 'material', qty, stats = {} } = req.body || {};
        const name = String(item_name || '').trim().slice(0, 64);
        const delta = Math.floor(Number(qty));
        if (!name) throw httpErr(400, 'ต้องระบุชื่อไอเทม');
        if (!Number.isFinite(delta) || delta === 0) throw httpErr(400, 'จำนวนไม่ถูกต้อง');

        const owns = await query('SELECT 1 FROM characters WHERE id = $1', [cid]);
        if (!owns.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');

        const result = await tx(async (client) => {
            const cur = await client.query('SELECT id, quantity FROM inventory WHERE character_id=$1 AND item_name=$2 LIMIT 1', [cid, name]);
            if (!cur.rows[0]) {
                if (delta < 0) return { removed: true, quantity: 0 };
                await client.query('INSERT INTO inventory (character_id, item_name, item_type, quantity, stats) VALUES ($1,$2,$3,$4,$5)',
                    [cid, name, String(item_type).slice(0, 32), delta, stats || {}]);
                return { quantity: delta };
            }
            const next = cur.rows[0].quantity + delta;
            if (next <= 0) {
                await client.query('DELETE FROM inventory WHERE id = $1', [cur.rows[0].id]);
                return { removed: true, quantity: 0 };
            }
            await client.query('UPDATE inventory SET quantity = $2 WHERE id = $1', [cur.rows[0].id, next]);
            return { quantity: next };
        });
        console.log(`[Admin] ${req.admin.username} ${delta > 0 ? 'gave' : 'removed'} ${Math.abs(delta)}× ${name} to/from ${cid}`);
        res.json({ ok: true, ...result });
    }));

    // Grant / revoke admin on a user
    r.post('/players/:characterId/admin-flag', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const grant = req.body?.is_admin === true;
        const c = await query('SELECT user_id FROM characters WHERE id = $1', [cid]);
        if (!c.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        if (!grant && c.rows[0].user_id === req.admin.userId) throw httpErr(400, 'ถอนสิทธิ์แอดมินของตัวเองไม่ได้');
        await query('UPDATE profiles SET is_admin = $2 WHERE id = $1', [c.rows[0].user_id, grant]);
        console.log(`[Admin] ${req.admin.username} set is_admin=${grant} on ${c.rows[0].user_id}`);
        res.json({ ok: true, is_admin: grant });
    }));

    // Delete a character and its owned data
    r.post('/players/:characterId/delete', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const c = await query('SELECT user_id FROM characters WHERE id = $1', [cid]);
        if (!c.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        const uid = c.rows[0].user_id;
        if (uid === req.admin.userId) throw httpErr(400, 'ลบตัวละครของตัวเองผ่านแผงนี้ไม่ได้');
        await tx(async (client) => {
            await client.query('DELETE FROM inventory WHERE character_id = $1', [cid]);
            await client.query('DELETE FROM character_cards WHERE character_id = $1', [cid]);
            await client.query('DELETE FROM marketplace WHERE seller_id = $1', [uid]);
            await client.query('DELETE FROM vending_stalls WHERE user_id = $1', [uid]);
            await client.query('DELETE FROM characters WHERE id = $1', [cid]);
        });
        console.log(`[Admin] ${req.admin.username} DELETED character ${cid} (user ${uid})`);
        res.json({ ok: true });
    }));

    // ================= ECONOMY =================
    r.get('/economy', requireAdmin, wrap(async (_req, res) => {
        const [rich, recent, topZol, activity] = await Promise.all([
            query('SELECT id, name, gold, zol, level FROM characters ORDER BY gold DESC LIMIT 15'),
            query('SELECT item_name, quantity, price, sold_at FROM market_history ORDER BY sold_at DESC LIMIT 25'),
            query('SELECT id, name, zol, level FROM characters ORDER BY zol DESC LIMIT 10'),
            query("SELECT count(*)::int listings, COALESCE(sum(price),0)::bigint value FROM marketplace"),
        ]);
        res.json({
            richest: rich.rows,
            topZol: topZol.rows,
            recentSales: recent.rows,
            market: activity.rows[0],
        });
    }));

    // ================= MOVEMENT (daily "stock ticker") =================
    // Each player's daily change: today's live delta (current − today's opening
    // snapshot) plus a per-day history for sparklines. See api/statSnapshots.js.
    const MOVE_METRICS = ['level', 'exp', 'gold', 'zol', 'total_kills', 'play_time'];
    // "Today" = the current Thai calendar day (matches api/statSnapshots.js).
    const DAY_EXPR = "(now() AT TIME ZONE 'Asia/Bangkok')::date";

    r.get('/movement', requireAdmin, wrap(async (req, res) => {
        const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
        const metric = MOVE_METRICS.includes(String(req.query.metric)) ? String(req.query.metric) : 'gold';

        const cur = await query(`
            SELECT c.id, c.name, c.level, c.exp, c.gold, c.zol, c.total_kills, c.play_time,
                   s.level AS s_level, s.exp AS s_exp, s.gold AS s_gold, s.zol AS s_zol,
                   s.total_kills AS s_total_kills, s.play_time AS s_play_time,
                   (s.character_id IS NOT NULL) AS has_baseline
            FROM characters c
            LEFT JOIN player_stat_snapshots s
              ON s.character_id = c.id AND s.snapshot_date = ${DAY_EXPR}`);

        const players = cur.rows.map(row => {
            const current = {}; const today = {};
            for (const m of MOVE_METRICS) {
                current[m] = Number(row[m]) || 0;
                const sv = row['s_' + m];
                today[m] = (row.has_baseline && sv != null) ? current[m] - Number(sv) : 0;
            }
            return { characterId: row.id, name: row.name, current, today, hasBaseline: row.has_baseline };
        });

        // aggregate "market" totals for the day
        const totals = { activePlayers: 0 };
        for (const m of MOVE_METRICS) totals[m] = 0;
        for (const p of players) {
            let moved = false;
            for (const m of MOVE_METRICS) { totals[m] += p.today[m]; if (p.today[m] !== 0) moved = true; }
            if (moved) totals.activePlayers++;
        }

        players.sort((a, b) => b.today[metric] - a.today[metric]);
        const top = players.slice(0, limit);

        // per-day history for the returned players (for sparklines / detail)
        const ids = top.map(p => p.characterId);
        const history = {};
        if (ids.length) {
            const h = await query(`
                SELECT character_id, snapshot_date::text AS date,
                       level, exp, gold, zol, total_kills, play_time
                FROM player_stat_snapshots
                WHERE snapshot_date >= ${DAY_EXPR} - $1::int AND character_id = ANY($2)
                ORDER BY character_id, snapshot_date`, [days, ids]);
            for (const rr of h.rows) (history[rr.character_id] ||= []).push(rr);
        }

        res.json({ date: new Date().toISOString().slice(0, 10), metric, days, totals, players: top, history });
    }));

    // One player's full daily history (for a detail chart).
    r.get('/movement/:characterId', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));
        const [snaps, cur] = await Promise.all([
            query(`SELECT snapshot_date::text AS date, level, exp, gold, zol, total_kills, play_time
                   FROM player_stat_snapshots
                   WHERE character_id = $1 AND snapshot_date >= ${DAY_EXPR} - $2::int
                   ORDER BY snapshot_date`, [cid, days]),
            query('SELECT name, level, exp, gold, zol, total_kills, play_time FROM characters WHERE id = $1', [cid]),
        ]);
        if (!cur.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        res.json({ characterId: cid, name: cur.rows[0].name, current: cur.rows[0], history: snaps.rows });
    }));

    // ================= SECURITY / IP =================
    r.get('/security', requireAdmin, wrap(async (_req, res) => {
        const online = [];
        if (onlinePlayers) for (const p of onlinePlayers.values()) {
            online.push({
                userId: p.userId, username: p.username, level: p.level,
                mapId: p.mapId, ip: ipMonitor.normalizeIp(p.ip), device: p.device,
                ping: p.ping, verified: p.verified, isAdmin: p.isAdmin,
                joinedAt: p.joinedAt,
            });
        }
        res.json({
            ips: ipMonitor.snapshot(200),
            events: ipMonitor.events(120),
            stats: ipMonitor.stats(),
            online,
        });
    }));

    // ================= CHEAT GUARD =================
    // Log of accounts the auto cheat-guard reset (high-confidence only).
    r.get('/cheats', requireAdmin, wrap(async (_req, res) => {
        const { rows } = await query(
            `SELECT id, character_id, user_id, name, reason, before_data, action, created_at
             FROM cheat_actions ORDER BY created_at DESC LIMIT 100`);
        res.json({ actions: rows });
    }));

    // Run a scan on demand (also runs automatically every 5 min + on boot).
    r.post('/cheats/scan', requireAdmin, wrap(async (req, res) => {
        const { reset, flagged } = await sweepCheaters();
        console.log(`[Admin] 🔎 ${req.admin.username} ran manual cheat scan → reset ${reset}, flagged ${flagged}`);
        res.json({ ok: true, reset, flagged });
    }));

    // Reset a character to a fresh baseline (used for flagged suspects the admin
    // confirms — safer than deleting).
    r.post('/players/:characterId/reset', requireAdmin, wrap(async (req, res) => {
        const cid = req.params.characterId;
        const cur = await query('SELECT * FROM characters WHERE id = $1', [cid]);
        if (!cur.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        const c = cur.rows[0];
        if (c.user_id === req.admin.userId) throw httpErr(400, 'รีเซตตัวละครของตัวเองผ่านแผงนี้ไม่ได้');
        await resetCharacter(c);
        await query(
            `INSERT INTO cheat_actions (character_id, user_id, name, reason, before_data, action)
             VALUES ($1,$2,$3,$4,$5,'admin-reset')`,
            [cid, c.user_id, c.name, `manual reset by ${req.admin.username}`,
                JSON.stringify({ level: c.level, exp: c.exp, gold: c.gold, zol: c.zol, atk: c.atk, def: c.def, max_hp: c.max_hp })]);
        console.log(`[Admin] ♻️ ${req.admin.username} reset character ${cid}`);
        res.json({ ok: true });
    }));

    // ================= EVENTS / ANNOUNCE =================
    r.post('/announce', requireAdmin, wrap(async (req, res) => {
        const text = String(req.body?.text || '').trim().slice(0, 300);
        const color = String(req.body?.color || '#ffd24a').slice(0, 16);
        if (!text) throw httpErr(400, 'ต้องมีข้อความ');
        if (!io) throw httpErr(503, 'socket ไม่พร้อม');
        io.emit('admin:announcement', { text, color, timestamp: Date.now(), fromAdmin: req.admin.username });
        console.log(`[Admin] 📢 ${req.admin.username} announced: ${text}`);
        res.json({ ok: true });
    }));

    // Kick an online player (disconnect their socket)
    r.post('/kick', requireAdmin, wrap(async (req, res) => {
        const userId = String(req.body?.userId || '');
        if (!userId || !userSocketMap || !io) throw httpErr(400, 'ข้อมูลไม่ครบ');
        const sid = userSocketMap.get(userId);
        if (!sid) throw httpErr(404, 'ผู้เล่นไม่ออนไลน์');
        io.sockets.sockets.get(sid)?.disconnect(true);
        console.log(`[Admin] 👢 ${req.admin.username} kicked ${userId}`);
        res.json({ ok: true });
    }));

    // error handler (JSON)
    r.use((err, _req, res, _next) => {
        const status = err.status || 500;
        if (status >= 500) console.error('[admin] error:', err.message);
        res.status(status).json({ error: err.message || 'server error' });
    });

    return r;
}
