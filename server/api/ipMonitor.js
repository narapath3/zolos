// In-memory IP activity tracker for the admin security panel. Lightweight
// (no DB writes on the hot path) — every API request, auth failure, rate-limit
// hit, socket connect, and anti-cheat flag bumps a per-IP counter. The admin
// dashboard reads a ranked snapshot to spot hosts hammering or probing the
// system. Bounded so a flood of unique IPs can't grow memory without limit.

const MAX_IPS = 5000;          // hard cap on tracked distinct IPs
const MAX_EVENTS = 300;        // recent suspicious-event ring buffer
const WINDOW_MS = 60_000;      // sliding window for "requests per minute"

const ips = new Map();         // ip -> record
const recentEvents = [];       // { ts, ip, kind, detail }

function now() { return Date.now(); }

function getRec(ip) {
    let r = ips.get(ip);
    if (!r) {
        // Evict the least-recently-seen IP when full so tracking stays bounded.
        if (ips.size >= MAX_IPS) {
            let oldestIp = null, oldestTs = Infinity;
            for (const [k, v] of ips) if (v.last < oldestTs) { oldestTs = v.last; oldestIp = k; }
            if (oldestIp) ips.delete(oldestIp);
        }
        r = {
            ip, first: now(), last: now(),
            requests: 0, authFails: 0, rateLimited: 0, suspicious: 0, connects: 0,
            usernames: new Set(),
            _windowStart: now(), _windowCount: 0, ratePerMin: 0,
        };
        ips.set(ip, r);
    }
    return r;
}

function bumpWindow(r) {
    const t = now();
    if (t - r._windowStart >= WINDOW_MS) {
        r.ratePerMin = r._windowCount;
        r._windowStart = t;
        r._windowCount = 0;
    }
    r._windowCount++;
    // live estimate so a burst shows up before the window rolls over
    r.ratePerMin = Math.max(r.ratePerMin, r._windowCount);
}

export function normalizeIp(raw) {
    if (!raw) return 'unknown';
    let ip = String(raw).trim();
    // XFF may be a list "client, proxy1, proxy2" — the client is first.
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    // strip IPv6-mapped IPv4 prefix and any :port
    ip = ip.replace(/^::ffff:/, '');
    return ip || 'unknown';
}

function pushEvent(ip, kind, detail) {
    recentEvents.push({ ts: now(), ip, kind, detail: detail || null });
    if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
}

/** Record one API request from an IP (optionally with the authed username). */
export function recordRequest(ip, username) {
    const r = getRec(normalizeIp(ip));
    r.requests++; r.last = now();
    bumpWindow(r);
    if (username) r.usernames.add(String(username).slice(0, 32));
}

export function recordConnect(ip, username) {
    const r = getRec(normalizeIp(ip));
    r.connects++; r.last = now();
    if (username) r.usernames.add(String(username).slice(0, 32));
}

export function recordAuthFail(ip, detail) {
    const r = getRec(normalizeIp(ip));
    r.authFails++; r.last = now();
    pushEvent(r.ip, 'auth_fail', detail);
}

export function recordRateLimited(ip) {
    const r = getRec(normalizeIp(ip));
    r.rateLimited++; r.last = now();
    pushEvent(r.ip, 'rate_limited', null);
}

/** Anti-cheat / abuse signal (speed hack, ownership mismatch, bad payload…). */
export function recordSuspicious(ip, detail) {
    const r = getRec(normalizeIp(ip));
    r.suspicious++; r.last = now();
    pushEvent(r.ip, 'suspicious', detail);
}

// A simple 0..100 threat score: weighted blend of the abuse signals plus raw
// request rate. Tuned so a normal player sits near 0 and an attacker stands out.
function threatScore(r) {
    const rate = Math.min(60, r.ratePerMin / 20);          // 1200 req/min → 60
    const fails = Math.min(20, r.authFails * 2);           // 10 fails → 20
    const limited = Math.min(15, r.rateLimited * 1.5);     // 10×429 → 15
    const sus = Math.min(25, r.suspicious * 5);            // 5 flags → 25
    return Math.min(100, Math.round(rate + fails + limited + sus));
}

/** Ranked snapshot for the admin panel, most-suspicious first. */
export function snapshot(limit = 200) {
    const rows = [];
    for (const r of ips.values()) {
        rows.push({
            ip: r.ip,
            usernames: [...r.usernames].slice(0, 8),
            requests: r.requests,
            ratePerMin: r.ratePerMin,
            authFails: r.authFails,
            rateLimited: r.rateLimited,
            suspicious: r.suspicious,
            connects: r.connects,
            firstSeen: r.first,
            lastSeen: r.last,
            threat: threatScore(r),
        });
    }
    rows.sort((a, b) => b.threat - a.threat || b.lastSeen - a.lastSeen);
    return rows.slice(0, limit);
}

export function events(limit = 100) {
    return recentEvents.slice(-limit).reverse();
}

export function stats() {
    let high = 0;
    for (const r of ips.values()) if (threatScore(r) >= 50) high++;
    return { trackedIps: ips.size, recentEvents: recentEvents.length, highThreat: high };
}
