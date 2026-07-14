// Detects when a newer build has been deployed while this tab was left open,
// and offers a one-tap reload. Works with the Vite hashed-bundle setup:
// index.html is served no-cache, so fetching it returns the CURRENT deployed
// asset hash. We compare that against the hash of the bundle THIS tab loaded
// (import.meta.url points at our own index-XXXX.js). Different hash = a new
// deploy exists.

const BUNDLE_RE = /(index-[A-Za-z0-9_-]+\.js)/;

// The MAIN entry bundle filename this tab loaded. Read it from the document's
// module <script> (not import.meta.url — this file is a separate dynamic chunk).
function detectCurrentBundle() {
    const s = document.querySelector('script[type="module"][src*="/assets/index-"]');
    if (s) {
        const m = (s.getAttribute('src') || '').match(BUNDLE_RE);
        if (m) return m[1];
    }
    // Fallback: scan loaded resources for the entry bundle
    try {
        const hit = performance.getEntriesByType('resource')
            .map(e => e.name)
            .find(n => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(n));
        if (hit) { const m = hit.match(BUNDLE_RE); if (m) return m[1]; }
    } catch { /* ignore */ }
    return null;
}

const currentBundle = detectCurrentBundle();

let bannerShown = false;
let intervalId = null;

async function fetchLatestBundle() {
    try {
        const res = await fetch('/index.html?_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(BUNDLE_RE);
        return m ? m[1] : null;
    } catch {
        return null; // offline / network blip — ignore, try again later
    }
}

function showUpdateBanner() {
    if (bannerShown) return;
    bannerShown = true;

    const style = document.createElement('style');
    style.textContent = `
      #zolos-update-banner{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);
        z-index:99999;display:flex;align-items:center;gap:14px;
        background:linear-gradient(135deg,#2b2340,#1c1730);color:#fff;
        border:2px solid #ffd94a;border-radius:14px;padding:12px 16px;
        box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:'Itim','Inter',sans-serif;
        font-size:15px;max-width:92vw;animation:zub-in .4s cubic-bezier(.2,1.3,.4,1) both}
      #zolos-update-banner b{color:#ffd94a}
      #zolos-update-banner button{cursor:pointer;border:none;border-radius:10px;
        padding:9px 16px;font-family:inherit;font-size:14px;font-weight:700}
      #zolos-update-reload{background:#4ade80;color:#08210f}
      #zolos-update-later{background:transparent;color:#aaa;border:1px solid #555 !important}
      @keyframes zub-in{from{opacity:0;transform:translate(-50%,20px)}to{opacity:1;transform:translate(-50%,0)}}
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'zolos-update-banner';
    bar.innerHTML = `
      <span>✨ <b>มีเวอร์ชันใหม่!</b> โหลดใหม่เพื่อรับอัปเดตล่าสุด</span>
      <button id="zolos-update-reload">🔄 โหลดใหม่</button>
      <button id="zolos-update-later">ภายหลัง</button>
    `;
    document.body.appendChild(bar);

    document.getElementById('zolos-update-reload').addEventListener('click', () => {
        window.location.reload();
    });
    document.getElementById('zolos-update-later').addEventListener('click', () => {
        bar.remove();
        // Keep bannerShown = true so we don't nag again this session
    });
}

async function check() {
    if (bannerShown || !currentBundle) return;
    const latest = await fetchLatestBundle();
    if (latest && latest !== currentBundle) {
        console.log(`[Zolos] 🔔 New build detected (${latest} vs running ${currentBundle})`);
        showUpdateBanner();
        if (intervalId) clearInterval(intervalId);
    }
}

// Start polling for new deploys.
export function startUpdateChecker(intervalMs = 3 * 60 * 1000) {
    if (!currentBundle) {
        console.warn('[Zolos] UpdateChecker: could not determine current bundle — disabled');
        return;
    }
    // Check on tab refocus (common: user returns to a tab left open for hours)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
    // Periodic check
    intervalId = setInterval(check, intervalMs);
    // One delayed check shortly after load (covers "opened right as deploy landed")
    setTimeout(check, 30 * 1000);
}
