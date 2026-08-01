// ============================================================
// Socket.io Client Wrapper — Connects to the Zolos Map Server (VPS)
// ============================================================

let socket = null;
let isConnected = false;

// Known-good production Map Server. As of 2026-07-29 the realtime server moved
// off Railway (subscription lapsed) onto a self-hosted Windows VPS, fronted by
// Caddy for TLS at rt.zolos.online. The old Railway host is dead, so this
// default now points at the VPS — set VITE_SOCKET_URL to override.
export const DEFAULT_SOCKET_URL = 'https://rt.zolos.online';

/**
 * Get the SOCKET_URL from env, with fallback logic.
 * Uses VITE_SOCKET_URL when set, otherwise the known production server.
 */
export function getSocketUrl() {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    const url = (env.VITE_SOCKET_URL || DEFAULT_SOCKET_URL).trim();
    if (!url || url === 'undefined') return null;
    return url;
}

/**
 * Check if Socket.io mode is available (URL is configured)
 */
export function isSocketMode() {
    return !!getSocketUrl();
}

/**
 * Connect to the Map Server via Socket.io.
 * Loads socket.io-client dynamically from CDN if not bundled.
 * Returns the socket instance or null if offline.
 */
export async function connectSocket() {
    const url = getSocketUrl();
    if (!url) {
        console.log('[SocketClient] No VITE_SOCKET_URL — running in offline/Supabase mode');
        return null;
    }
    console.log('[SocketClient] Connecting to:', url);

    // Dynamic import: try bundled first, then CDN fallback
    let ioModule;
    try {
        ioModule = await import('socket.io-client');
    } catch {
        console.warn('[SocketClient] socket.io-client not bundled, loading from CDN...');
        // Fallback: load from CDN via script tag  
        await new Promise((resolve, reject) => {
            if (window.io) { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        ioModule = { io: window.io };
    }

    const io = ioModule.io || ioModule.default?.io || ioModule.default;

    socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
    });

    socket.on('connect', () => {
        isConnected = true;
        console.log('[SocketClient] ✅ Connected to Map Server:', socket.id);
    });

    socket.on('disconnect', (reason) => {
        isConnected = false;
        console.log('[SocketClient] ❌ Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
        console.warn('[SocketClient] ⚠️ Connection error:', err.message);
    });

    socket.on('reconnect', (attempt) => {
        isConnected = true;
        console.log(`[SocketClient] 🔄 Reconnected after ${attempt} attempt(s)`);
    });

    // Wait for initial connection (or timeout after 5s)
    await new Promise((resolve) => {
        if (socket.connected) { resolve(); return; }
        const timeout = setTimeout(() => {
            console.warn('[SocketClient] ⏱️ Connection timeout, proceeding anyway');
            resolve();
        }, 5000);
        socket.once('connect', () => {
            clearTimeout(timeout);
            resolve();
        });
    });

    return socket;
}

/**
 * Get the current socket instance.
 * Returns null if not connected.
 */
export function getSocket() {
    return socket;
}

/**
 * Check if socket is currently connected.
 */
export function isSocketConnected() {
    return isConnected && socket && socket.connected;
}

/**
 * Disconnect from the Map Server.
 */
export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        isConnected = false;
    }
}

/**
 * Measure server ping with fallbacks:
 * 1. Socket.io volatile cli_pong emission
 * 2. Supabase HEAD REST request
 * 3. Socket server polling GET request
 */
export async function measurePing() {
    let ms = null;

    // Strategy 1: Socket.io round-trip (most accurate for game server)
    try {
        if (isConnected && socket && socket.connected) {
            ms = await new Promise((resolve) => {
                const t0 = performance.now();
                const timeout = setTimeout(() => resolve(null), 3000);
                socket.volatile.emit('cli_pong', Date.now(), () => {
                    clearTimeout(timeout);
                    resolve(Math.round(performance.now() - t0));
                });
            });
        }
    } catch { /* socket not available, fall through */ }

    // Strategy 2: HTTP fetch to Supabase REST endpoint
    if (ms === null) {
        try {
            const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
            const supabaseUrl = (env.VITE_SUPABASE_URL || '').trim();
            if (supabaseUrl && !supabaseUrl.includes('YOUR_PROJECT')) {
                const t0 = performance.now();
                await fetch(supabaseUrl + '/rest/v1/', {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store',
                });
                ms = Math.round(performance.now() - t0);
            }
        } catch { /* offline or CORS blocked */ }
    }

    // Strategy 3: Socket URL HTTP ping
    if (ms === null) {
        try {
            const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
            const socketUrl = (env.VITE_SOCKET_URL || DEFAULT_SOCKET_URL).trim();
            if (socketUrl && socketUrl !== 'undefined') {
                const t0 = performance.now();
                await fetch(socketUrl + '/socket.io/?EIO=4&transport=polling', {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-store',
                });
                ms = Math.round(performance.now() - t0);
            }
        } catch { /* offline */ }
    }

    return ms;
}

