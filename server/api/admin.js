// Admin control-panel API. Mounted at /admin/api. Every route is gated by
// requireAdmin: a valid JWT whose profiles.is_admin = true. The dashboard logs
// in through the normal /api/auth/login (reusing the in-game admin account),
// then calls these endpoints with that bearer token.
import express from 'express';
import cors from 'cors';
import { query, tx } from './db.js';
import { authFromReq, httpErr } from './auth.js';
import * as ipMonitor from './ipMonitor.js';
import { sweepCheaters, resetCharacter } from './cheatGuard.js';
import {
    MAPS, isValidMap, bumpWorldVersion, getMonsterDefs, getMapSpawns,
    getMonsterDrops,
} from './monstersConfig.js';
import { CARD_CATALOG, getCard } from '../cards/CardCatalog.js';
import { getCardEconomy, getCardOverrides } from './cardEconomy.js';

const CARD_RARITIES = new Set(['common', 'rare', 'epic', 'legendary', 'mythic']);

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

export function createAdminRouter({ io, onlinePlayers, userSocketMap, reloadWorld } = {}) {
    const r = express.Router();
    const allowedOrigins = new Set((process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
    r.use(cors({
        origin: (origin, callback) => {
            if (!origin || process.env.CORS_ALLOW_ALL === 'true' || allowedOrigins.has(origin)) return callback(null, true);
            return callback(null, false);
        },
        credentials: true,
    }));
    r.use(express.json({ limit: '256kb' }));

    // Called after any world-config edit: bump the version, tell the running
    // monster engine (Phase 2) to reload + respawn, and notify clients so they
    // refetch defs. reloadWorld is optional so Phase 1 works before the engine
    // exists. Returns the new version.
    const applyWorldChange = async () => {
        const version = await bumpWorldVersion();
        try { if (typeof reloadWorld === 'function') await reloadWorld(); } catch (e) { console.error('[admin] reloadWorld failed:', e.message); }
        try { if (io) io.emit('world_config', { version }); } catch { /* ignore */ }
        return version;
    };

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
        if (io && onlinePlayers) {
            const changed = {};
            for (const key of Object.keys(body)) {
                if (EDITABLE_NUM[key] || EDITABLE_TEXT.has(key)) changed[key] = rows[0][key];
            }
            for (const [socketId, player] of onlinePlayers.entries()) {
                if (String(player.characterId) === String(cid)) {
                    io.to(socketId).emit('admin_character_update', { characterId: cid, updates: changed });
                }
            }
        }
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

    // ================= BUG REPORTS =================
    r.get('/bug-reports', requireAdmin, wrap(async (req, res) => {
        const allowed = new Set(['pending', 'approved', 'rejected', 'all']);
        const status = allowed.has(req.query.status) ? req.query.status : 'pending';
        const params = [];
        const where = status === 'all' ? '' : `WHERE status=$${params.push(status)}`;
        const { rows } = await query(`SELECT id,user_id,character_id,character_name,category,title,details,
            screenshot_data,context,status,admin_note,reward_item_name,reward_item_quantity,reward_gold,
            reviewed_by,created_at,reviewed_at FROM bug_reports ${where}
            ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100`, params);
        res.json({ reports: rows });
    }));

    r.post('/bug-reports/:id/review', requireAdmin, wrap(async (req, res) => {
        const action = req.body?.action;
        if (action !== 'approve' && action !== 'reject') throw httpErr(400, 'action ไม่ถูกต้อง');
        const note = String(req.body?.note || '').trim().slice(0, 1000);
        const itemName = String(req.body?.item_name || '').trim().slice(0, 64);
        const itemQty = Math.min(99, Math.max(0, Math.floor(Number(req.body?.item_quantity) || 0)));
        const gold = Math.min(100_000_000, Math.max(0, Math.floor(Number(req.body?.gold) || 0)));
        if (action === 'approve' && (!itemName || itemQty < 1 || gold < 1)) {
            throw httpErr(400, 'การอนุมัติต้องระบุไอเทม จำนวน และ Zeny รางวัล');
        }

        const reviewed = await tx(async (client) => {
            const locked = await client.query('SELECT * FROM bug_reports WHERE id=$1 FOR UPDATE', [req.params.id]);
            const report = locked.rows[0];
            if (!report) throw httpErr(404, 'ไม่พบรายงานบัค');
            if (report.status !== 'pending') throw httpErr(409, 'รายงานนี้ตรวจสอบไปแล้ว จึงไม่สามารถให้รางวัลซ้ำได้');
            if (action === 'approve') {
                const inv = await client.query('SELECT id,quantity FROM inventory WHERE character_id=$1 AND item_name=$2 LIMIT 1 FOR UPDATE', [report.character_id,itemName]);
                if (inv.rows[0]) {
                    await client.query('UPDATE inventory SET quantity=quantity+$2 WHERE id=$1', [inv.rows[0].id,itemQty]);
                } else {
                    const rewardType = itemName === 'Bug Hunter Emblem' ? 'title' : 'special';
                    await client.query('INSERT INTO inventory (character_id,item_name,item_type,quantity,stats) VALUES ($1,$2,$3,$4,$5)', [report.character_id,itemName,rewardType,itemQty,{}]);
                }
                const money = await client.query('UPDATE characters SET gold=gold+$2,updated_at=now() WHERE id=$1 RETURNING gold', [report.character_id,gold]);
                if (!money.rows[0]) throw httpErr(404, 'ไม่พบตัวละครผู้แจ้งบัค');
            }
            const updated = await client.query(`UPDATE bug_reports SET status=$2,admin_note=$3,
                reward_item_name=$4,reward_item_quantity=$5,reward_gold=$6,reviewed_by=$7,reviewed_at=now()
                WHERE id=$1 RETURNING *`, [report.id,action==='approve'?'approved':'rejected',note,
                action==='approve'?itemName:null,action==='approve'?itemQty:0,action==='approve'?gold:0,String(req.admin.userId)]);
            return updated.rows[0];
        });
        const socketId = userSocketMap?.get(reviewed.user_id);
        if (socketId && io) io.to(socketId).emit('bug_report_reviewed', {
            id: reviewed.id,status: reviewed.status,itemName: reviewed.reward_item_name,
            itemQuantity: reviewed.reward_item_quantity,gold: Number(reviewed.reward_gold),note: reviewed.admin_note,
        });
        console.log(`[Admin] ${req.admin.username} ${reviewed.status} bug report ${reviewed.id}`);
        res.json({ ok:true,report:reviewed });
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

    // ================= WORLD MONSTERS (config) =================
    // Bounds for monster stat edits — anything outside is clamped/ignored.
    const MON_NUM = {
        hp: [1, 100_000_000], atk: [0, 10_000_000], def: [0, 10_000_000],
        exp: [0, 100_000_000], gold_min: [0, 100_000_000], gold_max: [0, 100_000_000],
        size: [0.1, 10], speed: [0, 20], color: [0, 0xffffff],
    };
    const clampMon = (key, val) => {
        const [min, max] = MON_NUM[key];
        const n = Number(val);
        if (!Number.isFinite(n)) return null;
        return Math.max(min, Math.min(max, n));
    };

    // Map list (id + display name) for the dashboard selector.
    r.get('/world/maps', requireAdmin, wrap(async (_req, res) => {
        res.json({ maps: MAPS });
    }));

    // All monster definitions (the catalog).
    r.get('/monsters', requireAdmin, wrap(async (_req, res) => {
        res.json({ monsters: await getMonsterDefs() });
    }));

    // Edit one monster's stats. Only whitelisted numeric fields + name/emoji.
    r.patch('/monsters/:type', requireAdmin, wrap(async (req, res) => {
        const type = String(req.params.type);
        const body = req.body || {};
        const sets = [], vals = [];
        for (const key of Object.keys(MON_NUM)) {
            if (body[key] === undefined) continue;
            const v = clampMon(key, body[key]);
            if (v === null) continue;
            vals.push(v); sets.push(`${key} = $${vals.length}`);
        }
        if (typeof body.name === 'string' && body.name.trim()) { vals.push(body.name.trim().slice(0, 40)); sets.push(`name = $${vals.length}`); }
        if (typeof body.emoji === 'string') { vals.push(body.emoji.slice(0, 8)); sets.push(`emoji = $${vals.length}`); }
        if (typeof body.is_boss === 'boolean') { vals.push(body.is_boss); sets.push(`is_boss = $${vals.length}`); }
        if (!sets.length) throw httpErr(400, 'ไม่มีข้อมูลให้แก้ไข');
        vals.push(type);
        const { rowCount } = await query(
            `UPDATE public.monster_defs SET ${sets.join(', ')}, updated_at = now() WHERE type = $${vals.length}`, vals);
        if (!rowCount) throw httpErr(404, 'ไม่พบมอนสเตอร์');
        const version = await applyWorldChange();
        console.log(`[Admin] 👹 ${req.admin.username} edited monster ${type}`);
        res.json({ ok: true, version });
    }));

    // Spawn table for one map (which monsters spawn here + counts).
    r.get('/maps/:mapId/spawns', requireAdmin, wrap(async (req, res) => {
        const mapId = String(req.params.mapId);
        if (!isValidMap(mapId)) throw httpErr(400, 'แผนที่ไม่ถูกต้อง');
        res.json(await getMapSpawns(mapId));
    }));

    // Set how many land/water monsters spawn on a map.
    r.put('/maps/:mapId/config', requireAdmin, wrap(async (req, res) => {
        const mapId = String(req.params.mapId);
        if (!isValidMap(mapId)) throw httpErr(400, 'แผนที่ไม่ถูกต้อง');
        const land = Math.max(0, Math.min(60, Math.floor(Number(req.body?.land_count)) || 0));
        const water = Math.max(0, Math.min(30, Math.floor(Number(req.body?.water_count)) || 0));
        await query(
            `INSERT INTO public.map_config (map_id, land_count, water_count) VALUES ($1,$2,$3)
             ON CONFLICT (map_id) DO UPDATE SET land_count = EXCLUDED.land_count, water_count = EXCLUDED.water_count`,
            [mapId, land, water]);
        const version = await applyWorldChange();
        res.json({ ok: true, version });
    }));

    // Add or update a spawn entry (which monster + weight) on a map.
    r.post('/maps/:mapId/spawns', requireAdmin, wrap(async (req, res) => {
        const mapId = String(req.params.mapId);
        if (!isValidMap(mapId)) throw httpErr(400, 'แผนที่ไม่ถูกต้อง');
        const type = String(req.body?.monster_type || '').trim();
        if (!type) throw httpErr(400, 'ต้องระบุมอนสเตอร์');
        const def = await query('SELECT environment FROM public.monster_defs WHERE type = $1', [type]);
        if (!def.rows[0]) throw httpErr(404, 'ไม่พบมอนสเตอร์นี้ในแคตตาล็อก');
        const weight = Math.max(1, Math.min(1000, Math.floor(Number(req.body?.weight)) || 10));
        const minLevel = Math.max(1, Math.min(300, Math.floor(Number(req.body?.min_level)) || 1));
        const isWater = req.body?.is_water === true || def.rows[0].environment === 'water';
        await query(
            `INSERT INTO public.map_spawns (map_id, monster_type, weight, min_level, is_water)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (map_id, monster_type)
             DO UPDATE SET weight = EXCLUDED.weight, min_level = EXCLUDED.min_level, is_water = EXCLUDED.is_water`,
            [mapId, type, weight, minLevel, isWater]);
        const version = await applyWorldChange();
        console.log(`[Admin] 👹 ${req.admin.username} set spawn ${type}@${mapId} w=${weight}`);
        res.json({ ok: true, version });
    }));

    // Remove a spawn entry.
    r.delete('/spawns/:id', requireAdmin, wrap(async (req, res) => {
        const id = parseInt(req.params.id);
        if (!Number.isFinite(id)) throw httpErr(400, 'id ไม่ถูกต้อง');
        const { rowCount } = await query('DELETE FROM public.map_spawns WHERE id = $1', [id]);
        if (!rowCount) throw httpErr(404, 'ไม่พบรายการ');
        const version = await applyWorldChange();
        res.json({ ok: true, version });
    }));

    // Drop table for one monster.
    r.get('/monsters/:type/drops', requireAdmin, wrap(async (req, res) => {
        res.json({ drops: await getMonsterDrops(String(req.params.type)) });
    }));

    // Add a drop entry to a monster.
    r.post('/monsters/:type/drops', requireAdmin, wrap(async (req, res) => {
        const type = String(req.params.type);
        const def = await query('SELECT 1 FROM public.monster_defs WHERE type = $1', [type]);
        if (!def.rows[0]) throw httpErr(404, 'ไม่พบมอนสเตอร์');
        const itemName = String(req.body?.item_name || '').trim();
        if (!itemName) throw httpErr(400, 'ต้องระบุชื่อไอเทม');
        const chance = Math.max(0, Math.min(1, Number(req.body?.chance) || 0.1));
        const qtyMin = Math.max(1, Math.min(999, Math.floor(Number(req.body?.qty_min)) || 1));
        const qtyMax = Math.max(qtyMin, Math.min(999, Math.floor(Number(req.body?.qty_max)) || qtyMin));
        const { rows } = await query(
            `INSERT INTO public.monster_drops (monster_type, item_name, emoji, item_type, chance, qty_min, qty_max)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [type, itemName.slice(0, 60), String(req.body?.emoji || '').slice(0, 8),
                String(req.body?.item_type || 'material').slice(0, 20), chance, qtyMin, qtyMax]);
        const version = await applyWorldChange();
        res.json({ ok: true, id: rows[0].id, version });
    }));

    // Remove a drop entry.
    r.delete('/drops/:id', requireAdmin, wrap(async (req, res) => {
        const id = parseInt(req.params.id);
        if (!Number.isFinite(id)) throw httpErr(400, 'id ไม่ถูกต้อง');
        const { rowCount } = await query('DELETE FROM public.monster_drops WHERE id = $1', [id]);
        if (!rowCount) throw httpErr(404, 'ไม่พบรายการ');
        const version = await applyWorldChange();
        res.json({ ok: true, version });
    }));

    // ============ CARD MANAGEMENT ============
    // Catalog + current drop overrides + stardust economy, all in one payload.
    r.get('/cards', requireAdmin, wrap(async (_req, res) => {
        const [overrides, economy] = await Promise.all([getCardOverrides(), getCardEconomy()]);
        const cards = CARD_CATALOG.map(c => {
            const ov = overrides[c.id] || {};
            return {
                id: c.id, name: c.displayName, rarity: c.rarity,
                sourceKind: c.source.kind, sourceId: c.source.id, sourceLabel: c.source.label,
                defaultChance: c.source.chance, defaultPity: c.source.pity,
                chance: ov.chance ?? null, pity: ov.pity ?? null,
                enabled: ov.enabled !== false,
            };
        });
        res.json({ cards, economy });
    }));

    // Set (or clear) a card's drop override. Pass chance/pity as null to fall back
    // to the catalog default; drop_enabled toggles the drop entirely.
    r.patch('/cards/:cardId', requireAdmin, wrap(async (req, res) => {
        const card = getCard(String(req.params.cardId));
        if (!card) throw httpErr(404, 'ไม่พบการ์ด');
        const body = req.body || {};
        const chance = body.chance == null ? null : Math.max(0, Math.min(1, Number(body.chance)));
        const pity = body.pity == null ? null : Math.max(1, Math.min(100000, Math.floor(Number(body.pity))));
        const enabled = body.drop_enabled === undefined ? true : body.drop_enabled === true;
        if (body.chance != null && !Number.isFinite(chance)) throw httpErr(400, 'chance ไม่ถูกต้อง');
        if (body.pity != null && !Number.isFinite(pity)) throw httpErr(400, 'pity ไม่ถูกต้อง');
        await query(
            `INSERT INTO public.card_overrides (card_id, chance, pity, drop_enabled, updated_at)
             VALUES ($1,$2,$3,$4, now())
             ON CONFLICT (card_id) DO UPDATE
               SET chance = EXCLUDED.chance, pity = EXCLUDED.pity,
                   drop_enabled = EXCLUDED.drop_enabled, updated_at = now()`,
            [card.id, chance, pity, enabled]);
        const version = await applyWorldChange(); // reloads engine's override cache
        console.log(`[Admin] 🃏 ${req.admin.username} set card override ${card.id}`);
        res.json({ ok: true, version });
    }));

    // Edit a rarity's Stardust rates.
    r.patch('/cards/economy/:rarity', requireAdmin, wrap(async (req, res) => {
        const rarity = String(req.params.rarity);
        if (!CARD_RARITIES.has(rarity)) throw httpErr(400, 'ความหายากไม่ถูกต้อง');
        const refine = Math.max(0, Math.min(100000, Math.floor(Number(req.body?.refine_dust)) || 0));
        const perDupe = Math.max(0, Math.min(1000000, Math.floor(Number(req.body?.dust_per_dupe)) || 0));
        await query(
            `INSERT INTO public.card_economy (rarity, refine_dust, dust_per_dupe, updated_at)
             VALUES ($1,$2,$3, now())
             ON CONFLICT (rarity) DO UPDATE
               SET refine_dust = EXCLUDED.refine_dust, dust_per_dupe = EXCLUDED.dust_per_dupe, updated_at = now()`,
            [rarity, refine, perDupe]);
        console.log(`[Admin] 🃏 ${req.admin.username} set economy ${rarity} ${refine}/${perDupe}`);
        res.json({ ok: true });
    }));

    // A player's owned cards + Stardust balance.
    r.get('/players/:characterId/cards', requireAdmin, wrap(async (req, res) => {
        const cid = String(req.params.characterId);
        const [cards, ch] = await Promise.all([
            query('SELECT card_id, owned, stars, pity FROM public.character_cards WHERE character_id = $1 ORDER BY owned DESC', [cid]),
            query('SELECT stardust FROM public.characters WHERE id = $1', [cid]),
        ]);
        if (!ch.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        res.json({ cards: cards.rows, stardust: Number(ch.rows[0].stardust) || 0 });
    }));

    // Grant/adjust a card and/or Stardust for a player.
    r.post('/players/:characterId/cards', requireAdmin, wrap(async (req, res) => {
        const cid = String(req.params.characterId);
        const ch = await query('SELECT 1 FROM public.characters WHERE id = $1', [cid]);
        if (!ch.rows[0]) throw httpErr(404, 'ไม่พบตัวละคร');
        const body = req.body || {};
        if (body.cardId) {
            const card = getCard(String(body.cardId));
            if (!card) throw httpErr(404, 'ไม่พบการ์ด');
            const owned = Math.max(0, Math.min(1_000_000, Math.floor(Number(body.owned)) || 0));
            const stars = Math.max(1, Math.min(5, Math.floor(Number(body.stars)) || 1));
            await query(
                `INSERT INTO public.character_cards (character_id, card_id, owned, stars, pity)
                 VALUES ($1,$2,$3,$4,0)
                 ON CONFLICT (character_id, card_id) DO UPDATE
                   SET owned = EXCLUDED.owned, stars = EXCLUDED.stars`,
                [cid, card.id, owned, stars]);
        }
        if (body.setStardust !== undefined) {
            const v = Math.max(0, Math.min(2_000_000_000, Math.floor(Number(body.setStardust)) || 0));
            await query('UPDATE public.characters SET stardust = $2 WHERE id = $1', [cid, v]);
        } else if (body.addStardust !== undefined) {
            const v = Math.floor(Number(body.addStardust)) || 0;
            await query('UPDATE public.characters SET stardust = GREATEST(0, COALESCE(stardust,0) + $2) WHERE id = $1', [cid, v]);
        }
        console.log(`[Admin] 🃏 ${req.admin.username} granted cards/stardust to ${cid}`);
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
