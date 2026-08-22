// Supabase Client Configuration
// Replace with your actual Supabase URL and Anon Key
import { createClient } from '@supabase/supabase-js';
import { createZolosClient } from './ZolosApiClient.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {});
const SUPABASE_URL = (env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co').trim();
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY').trim();

// Self-host cutover switch: when VITE_API_URL is set, use the VPS API (drop-in
// shim) instead of Supabase. Unset it to fall back to Supabase — reversible.
const API_URL = (env.VITE_API_URL || '').trim();
export const apiBaseUrl = API_URL;
export const isSelfHostMode = !!(API_URL && API_URL.startsWith('http'));

const supabaseUnconfigured =
  SUPABASE_URL.includes('YOUR_PROJECT') ||
  SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY') ||
  !SUPABASE_URL.startsWith('http');

let supabaseClient = null;
if (isSelfHostMode) {
  try {
    supabaseClient = createZolosClient(API_URL);
    console.log('[Zolos] 🏠 Using self-hosted API:', API_URL);
  } catch (e) {
    console.warn('Self-host API client init failed:', e.message);
  }
} else if (!supabaseUnconfigured) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase initialization failed, running in Offline Fallback mode:", e.message);
  }
}

// Offline only when neither backend is available.
export const isOfflineMode = !supabaseClient;

export const supabase = supabaseClient;

// ============ Local Fallback Database ============
// Simple simulated database inside localStorage for offline play
export const localDb = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(`zolos_db_${key}`)) || null;
    } catch {
      return null;
    }
  },
  set(key, val) {
    localStorage.setItem(`zolos_db_${key}`, JSON.stringify(val));
  }
};

async function hashOfflinePassword(password) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    throw new Error('Offline authentication requires Web Crypto support');
  }
  const bytes = new TextEncoder().encode(String(password));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// ============ Auth Helpers ============
export async function signUp(email, password, username, gender = 'male') {
  if (isOfflineMode || !supabase) {
    if (String(password || '').length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    // Simulating offline sign up. Store only a one-way hash; never persist the
    // raw password in localStorage, which is readable by every script on origin.
    const users = localDb.get('users') || {};
    if (users[username]) {
      throw new Error('Username already exists (Offline Database)');
    }
    const userId = 'local_' + Math.random().toString(36).substring(2, 15);
    users[username] = { userId, password_hash: await hashOfflinePassword(password), email };
    localDb.set('users', users);

    // Save profile locally
    const profile = { id: userId, username, gender, created_at: new Date().toISOString() };
    localDb.set(`profile_${userId}`, profile);
    saveActiveSession(userId);

    return { user: { id: userId, is_anonymous: false } };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, gender } }
  });
  if (error) throw error;

  // Create profile (gender chosen at registration drives the character model)
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      username,
      gender
    });
  }
  return data;
}

export async function signIn(email, password) {
  const username = email.replace('@zolos.game', '');

  if (isOfflineMode || !supabase) {
    const users = localDb.get('users') || {};
    const user = users[username];
    const passwordHash = user?.password_hash || (user?.password ? await hashOfflinePassword(user.password) : null);
    const suppliedHash = await hashOfflinePassword(password);
    if (!user || !passwordHash || passwordHash !== suppliedHash) {
      throw new Error('Invalid login credentials (Offline Database)');
    }
    // Migrate legacy local accounts that stored plaintext credentials.
    if (user.password) {
      delete user.password;
      user.password_hash = passwordHash;
      localDb.set('users', users);
    }
    saveActiveSession(user.userId);
    return { user: { id: user.userId, is_anonymous: false } };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export function getDeterministicGuestName(id) {
  if (!id) return 'Adventurer';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const code = Math.abs(hash).toString(36).substring(0, 5).toUpperCase();
  return 'Guest_' + (code || 'X0000');
}

export function isPlaceholderName(name) {
  return !name || name === 'Novice' || name === 'Guest' || name === 'Adventurer';
}

const GUEST_JOB_IDS = new Set(['swordsman', 'mage', 'archer', 'priest']);
const guestJobKey = identity => `zolos_guest_job_${String(identity || '').slice(0, 160)}`;

export function saveGuestJobHint(identity, jobId) {
  const key = String(identity || '');
  if (!key || !GUEST_JOB_IDS.has(jobId)) return false;
  try {
    localStorage.setItem(guestJobKey(key), jobId);
    return true;
  } catch {
    return false;
  }
}

export function getGuestJobHint(identity) {
  const key = String(identity || '');
  if (!key) return null;
  try {
    const jobId = localStorage.getItem(guestJobKey(key));
    return GUEST_JOB_IDS.has(jobId) ? jobId : null;
  } catch {
    return null;
  }
}

function getReusableLocalGuestId() {
  const activeUserId = localDb.get('active_session_user_id');
  if (typeof activeUserId !== 'string' || !/^guest_[a-z0-9]+$/i.test(activeUserId)) return null;
  const profile = localDb.get(`profile_${activeUserId}`);
  const character = localDb.get(`char_${activeUserId}`);
  return profile || character ? activeUserId : null;
}

function createLocalGuestSession({ forceNew = false } = {}) {
  const userId = !forceNew && getReusableLocalGuestId()
    ? getReusableLocalGuestId()
    : `guest_${Math.random().toString(36).substring(2, 10)}`;
  const guestName = getDeterministicGuestName(userId);
  const profile = localDb.get(`profile_${userId}`) || { id: userId, username: guestName, created_at: new Date().toISOString() };
  if (!profile.username || isPlaceholderName(profile.username)) profile.username = guestName;
  localDb.set(`profile_${userId}`, profile);
  saveActiveSession(userId);
  return { user: { id: userId, is_anonymous: true }, guestName: profile.username };
}

export async function signInAnonymously({ forceNew = false } = {}) {
  if (isOfflineMode || !supabase) return createLocalGuestSession({ forceNew });

  try {
    // Reuse the authenticated anonymous session when the player presses the
    // normal Guest entry point. A new anonymous identity is only created by an
    // explicit "Guest ใหม่" action.
    if (!forceNew) {
      const existing = await getSession();
      if (existing?.user?.is_anonymous === true) {
        const guestName = getDeterministicGuestName(existing.user.id);
        return { user: existing.user, session: existing, guestName };
      }
    } else {
      await supabase.auth.signOut();
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;

    if (data.user) {
      const guestName = getDeterministicGuestName(data.user.id);
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: guestName
      });
      return { ...data, guestName };
    }
    return data;
  } catch (e) {
    console.warn("Supabase anonymous sign-in failed, utilizing local guest session fallback:", e.message);
    return createLocalGuestSession({ forceNew });
  }
}

export async function getSession() {
  if (isOfflineMode || !supabase) {
    // Check if there is a local session active
    const activeUserId = localDb.get('active_session_user_id');
    if (activeUserId) {
      const profile = localDb.get(`profile_${activeUserId}`);
      const character = localDb.get(`char_${activeUserId}`);
      if (profile || character) {
        return { user: { id: activeUserId, is_anonymous: activeUserId.startsWith('guest_') } };
      }
    }
    return null;
  }

  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    return data.session;
  }

  // Fallback to local guest session if offline guest fallback was used
  const activeUserId = localDb.get('active_session_user_id');
  if (activeUserId && activeUserId.startsWith('guest_')) {
    const profile = localDb.get(`profile_${activeUserId}`);
    const character = localDb.get(`char_${activeUserId}`);
    if (profile || character) {
      return { user: { id: activeUserId, is_anonymous: true } };
    }
  }

  return null;
}

export async function getProfile(userId) {
  if (isOfflineMode || !supabase || (userId && userId.startsWith('guest_'))) {
    return localDb.get(`profile_${userId}`);
  }

  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data;
}

export async function bindAccount(email, password) {
  if (isOfflineMode || !supabase) {
    throw new Error('Cannot bind account in Offline Mode');
  }

  const { data, error } = await supabase.auth.updateUser({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export function saveActiveSession(userId) {
  localDb.set('active_session_user_id', userId);
}

export function clearActiveSession() {
  localDb.set('active_session_user_id', null);
}

export async function sendPasswordResetEmail(email) {
  if (isOfflineMode || !supabase) {
    // Simulated reset for offline mode
    return { success: true, message: 'Password reset link sent to ' + email + ' (Simulated)' };
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  if (error) throw error;
  return { success: true, data };
}

export async function updatePassword(newPassword) {
  if (isOfflineMode || !supabase) {
    return { success: true, message: 'Password updated (Simulated)' };
  }

  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return { success: true, data };
}

// ============ Realtime Online Count (Auth Screen) ============
export function subscribeOnlineCount(callback) {
  // Check if Socket.io is enabled. Ignore the stale VITE_SOCKET_SERVER_URL —
  // fall back to the known production Map Server (VPS, see SocketClient.js).
  const socketUrl = (env.VITE_SOCKET_URL || 'https://rt.zolos.online').trim();
  const isSocketEnabled = socketUrl && socketUrl !== 'undefined';

  if (isSocketEnabled) {
    let cleanup = null;

    // Load SocketClient dynamically to prevent circular dependencies or premature connection
    import('./SocketClient.js').then(async ({ connectSocket, getSocket, isSocketConnected }) => {
      let socket = getSocket();
      if (!socket) {
        socket = await connectSocket();
      }

      if (socket) {
        const handler = (count) => {
          callback(count);
        };
        socket.on('online_count', handler);

        // Send a request to get the initial count if socket is already connected
        if (isSocketConnected()) {
          // The server sends online_count on connect and updates,
          // but we can request or trigger it here if needed.
        }

        cleanup = () => {
          socket.off('online_count', handler);
        };
      }
    }).catch(err => {
      console.warn('[SupabaseClient] Failed to load socket client for online count:', err);
    });

    return () => {
      if (cleanup) cleanup();
    };
  }

  if (isOfflineMode || !supabase) {
    // Simulate a fluctuating online count for offline mode
    let fakeCount = 1 + Math.floor(Math.random() * 4);
    callback(fakeCount);
    const interval = setInterval(() => {
      fakeCount = Math.max(1, fakeCount + (Math.random() > 0.5 ? 1 : -1));
      callback(fakeCount);
    }, 5000);
    return () => clearInterval(interval);
  }

  const mainChannel = supabase.channel('online-players', {
    config: { presence: { key: '_counter_' } }
  });

  mainChannel
    .on('presence', { event: 'sync' }, () => {
      const state = mainChannel.presenceState();
      const count = Object.keys(state).filter(k => k !== '_counter_').length;
      callback(count);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Zolos] 📊 Online count watcher subscribed');
      }
    });

  return () => {
    try { mainChannel.unsubscribe(); } catch (e) { /* ignore */ }
  };
}


