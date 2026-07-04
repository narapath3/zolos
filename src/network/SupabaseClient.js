// Supabase Client Configuration
// Replace with your actual Supabase URL and Anon Key
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY').trim();

export const isOfflineMode =
  SUPABASE_URL.includes('YOUR_PROJECT') ||
  SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY') ||
  !SUPABASE_URL.startsWith('http');

let supabaseClient = null;
if (!isOfflineMode) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase initialization failed, running in Offline Fallback mode:", e.message);
  }
}

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

// ============ Auth Helpers ============
export async function signUp(email, password, username) {
  if (isOfflineMode || !supabase) {
    // Simulating offline sign up
    const users = localDb.get('users') || {};
    if (users[username]) {
      throw new Error('Username already exists (Offline Database)');
    }
    const userId = 'local_' + Math.random().toString(36).substring(2, 15);
    users[username] = { userId, password, email };
    localDb.set('users', users);

    // Save profile locally
    const profile = { id: userId, username, created_at: new Date().toISOString() };
    localDb.set(`profile_${userId}`, profile);
    saveActiveSession(userId);

    return { user: { id: userId, is_anonymous: false } };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) throw error;

  // Create profile
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      username
    });
  }
  return data;
}

export async function signIn(email, password) {
  const username = email.replace('@zolos.game', '');

  if (isOfflineMode || !supabase) {
    const users = localDb.get('users') || {};
    const user = users[username];
    if (!user || user.password !== password) {
      throw new Error('Invalid login credentials (Offline Database)');
    }
    saveActiveSession(user.userId);
    return { user: { id: user.userId, is_anonymous: false } };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInAnonymously() {
  if (isOfflineMode || !supabase) {
    const userId = 'guest_' + Math.random().toString(36).substring(2, 10);
    const guestName = 'Guest_' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const profile = { id: userId, username: guestName, created_at: new Date().toISOString() };
    localDb.set(`profile_${userId}`, profile);
    saveActiveSession(userId);
    return { user: { id: userId, is_anonymous: true }, guestName };
  }

  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;

    // Create guest profile
    if (data.user) {
      const guestName = 'Guest_' + Math.random().toString(36).substring(2, 7).toUpperCase();
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: guestName
      });
      return { ...data, guestName };
    }
    return data;
  } catch (e) {
    console.warn("Supabase anonymous sign-in failed, utilizing local guest session fallback:", e.message);
    const userId = 'guest_' + Math.random().toString(36).substring(2, 10);
    const guestName = 'Guest_' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const profile = { id: userId, username: guestName, created_at: new Date().toISOString() };
    localDb.set(`profile_${userId}`, profile);
    saveActiveSession(userId);
    return { user: { id: userId, is_anonymous: true }, guestName };
  }
}

export async function getSession() {
  if (isOfflineMode || !supabase) {
    // Check if there is a local session active
    const activeUserId = localDb.get('active_session_user_id');
    if (activeUserId) {
      const profile = localDb.get(`profile_${activeUserId}`);
      if (profile) {
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
    if (profile) {
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

export function saveActiveSession(userId) {
  localDb.set('active_session_user_id', userId);
}

export function clearActiveSession() {
  localDb.set('active_session_user_id', null);
}

// ============ Realtime Online Count (Auth Screen) ============
export function subscribeOnlineCount(callback) {
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

