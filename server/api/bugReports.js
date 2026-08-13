import { query } from './db.js';
import { authFromReq, httpErr } from './auth.js';
import { randomUUID } from 'node:crypto';

const SCREENSHOT_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const CATEGORIES = new Set(['gameplay', 'item_economy', 'display', 'map', 'account', 'other']);

export async function ensureBugReportTables() {
    await query(`CREATE TABLE IF NOT EXISTS public.bug_reports (
        id text PRIMARY KEY, user_id text NOT NULL, character_id text NOT NULL,
        character_name text NOT NULL, category text NOT NULL, title text NOT NULL,
        details text NOT NULL, screenshot_data text, context jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        admin_note text, reward_item_name text, reward_item_quantity integer NOT NULL DEFAULT 0,
        reward_gold bigint NOT NULL DEFAULT 0, reviewed_by text,
        created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
    )`);
    await query('CREATE INDEX IF NOT EXISTS bug_reports_user_created_idx ON public.bug_reports(user_id, created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx ON public.bug_reports(status, created_at DESC)');
}

const cleanText = (value, max) => String(value || '').trim().slice(0, max);

async function currentCharacter(userId) {
    const { rows } = await query('SELECT id,name FROM characters WHERE user_id::text=$1 ORDER BY updated_at DESC NULLS LAST,created_at DESC LIMIT 1', [String(userId)]);
    if (!rows[0]) throw httpErr(404, 'ไม่พบตัวละครสำหรับบัญชีนี้');
    return rows[0];
}

export function registerBugReportRoutes(router, wrap) {
    router.post('/bug-reports', wrap(async (req, res) => {
        const auth = authFromReq(req);
        if (!auth) throw httpErr(401, 'กรุณาเข้าสู่ระบบก่อนแจ้งบัค');
        const title = cleanText(req.body?.title, 100);
        const details = cleanText(req.body?.details, 4000);
        const category = CATEGORIES.has(req.body?.category) ? req.body.category : 'other';
        const rawScreenshot = String(req.body?.screenshot || '');
        if (title.length < 4 || details.length < 10) throw httpErr(400, 'กรุณาระบุหัวข้อและรายละเอียดให้เพียงพอ');
        if (rawScreenshot && (rawScreenshot.length > 950_000 || !SCREENSHOT_RE.test(rawScreenshot))) throw httpErr(400, 'ไฟล์ภาพไม่ถูกต้องหรือมีขนาดใหญ่เกินไป');
        const recent = await query("SELECT count(*)::int count FROM bug_reports WHERE user_id=$1 AND created_at > now()-interval '1 hour'", [String(auth.userId)]);
        if (recent.rows[0].count >= 5) throw httpErr(429, 'แจ้งได้สูงสุด 5 รายการต่อชั่วโมง');
        const character = await currentCharacter(auth.userId);
        const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
        const safeContext = { map: cleanText(context.map,48), viewport: cleanText(context.viewport,32), browser: cleanText(context.browser,160), build: cleanText(context.build,64) };
        const id = `bug_${randomUUID()}`;
        await query(`INSERT INTO bug_reports (id,user_id,character_id,character_name,category,title,details,screenshot_data,context)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id,String(auth.userId),character.id,character.name,category,title,details,rawScreenshot||null,safeContext]);
        res.status(201).json({ ok:true,id,status:'pending' });
    }));

    router.get('/bug-reports/mine', wrap(async (req, res) => {
        const auth = authFromReq(req);
        if (!auth) throw httpErr(401, 'กรุณาเข้าสู่ระบบ');
        const { rows } = await query(`SELECT id,category,title,details,screenshot_data,context,status,admin_note,reward_item_name,reward_item_quantity,reward_gold,created_at,reviewed_at
            FROM bug_reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [String(auth.userId)]);
        res.json({ reports:rows });
    }));
}
