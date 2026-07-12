// ============================================================
// Socket.io Client Wrapper — Connects to Railway Map Server
// ============================================================

let socket = null;
let isConnected = false;

/**
 * Get the SOCKET_URL from env, with fallback logic.
 * If VITE_SOCKET_URL is empty or not set → returns null (offline mode).
 */
function getSocketUrl() {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    const url = (env.VITE_SOCKET_URL || env.VITE_SOCKET_SERVER_URL || '').trim();
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
