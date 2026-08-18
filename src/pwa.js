// PWA glue: registers the service worker and wires the "Install app" button
// on the home/auth screen. The button appears only when the browser reports
// the app is installable (or on iOS, which has no install event — we show a
// short how-to instead).

export function initPWA() {
  // Register the service worker (root scope so it controls the whole origin).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        await registration.update();
        let reloaded = false;
        const activate = () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', activate, { once: true });
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'ZOLOS_SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'ZOLOS_SKIP_WAITING' });
              activate();
            }
          });
        });
      } catch (e) {
        console.warn('[PWA] Service worker registration failed:', e?.message);
      }
    });
  }

  const btn = document.getElementById('btn-install-pwa');
  const hint = document.getElementById('pwa-install-hint');
  if (!btn) return;

  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) { btn.style.display = 'none'; return; } // already installed

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  let deferredPrompt = null;

  // Chromium / Edge / Android: capture the install event and reveal the button.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'flex';
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
      btn.style.display = 'none';
    } else if (isIOS && hint) {
      // iOS Safari has no install prompt — guide the user.
      hint.style.display = 'block';
    }
  });

  window.addEventListener('appinstalled', () => {
    btn.style.display = 'none';
    if (hint) hint.style.display = 'none';
  });

  // iOS: no beforeinstallprompt, so show the button up front (click → how-to).
  if (isIOS) btn.style.display = 'flex';
}
