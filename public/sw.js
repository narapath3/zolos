/* ZOLOS service worker — enables PWA install + offline shell.
 *
 * Update-safe by design:
 *  - Navigations (index.html) are NETWORK-FIRST, so a new Vercel deploy is
 *    always picked up online; the cached copy is only a last-resort offline
 *    fallback. This keeps the in-app UpdateChecker (bundle-hash compare)
 *    working exactly as before.
 *  - Hashed build assets (/assets/*) are immutable, so they're CACHE-FIRST
 *    (fast loads + offline). A new build ships new hashed URLs → cache miss →
 *    fetched fresh, so stale code can never be served.
 *  - Cross-origin requests (Supabase, the Socket.io server, YouTube, fonts)
 *    are never intercepted.
 */
const CACHE = 'zolos-cache-v1';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Only handle our own origin; let Supabase / Socket.io / YouTube / fonts pass.
  if (url.origin !== self.location.origin) return;

  // Navigations → network-first (always get the freshest index / deploy).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('/index.html', net.clone()).catch(() => {});
        return net;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Hashed, immutable build assets → cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const net = await fetch(req);
      if (net && net.ok) {
        const c = await caches.open(CACHE);
        c.put(req, net.clone()).catch(() => {});
      }
      return net;
    })());
    return;
  }

  // Other same-origin GETs (icons, manifest, static images) → stale-while-revalidate.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((net) => {
      if (net && net.ok) {
        caches.open(CACHE).then((c) => c.put(req, net.clone()).catch(() => {}));
      }
      return net;
    }).catch(() => cached);
    return cached || network;
  })());
});
