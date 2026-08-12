/**
 * AnnouncementSync.js
 * Handles Socket.io broadcasting and receiving of announcements
 * Admins send announcements through Socket.io to all connected players
 */

import { getSocket, isSocketConnected } from './SocketClient.js';

let listenerSocket = null;
let announcementHandler = null;
let broadcastHandler = null;

/**
 * Broadcast an announcement to all players via Socket.io
 * @param {string} text - Announcement text
 * @param {string} type - Type of announcement (info, warning, event, etc.)
 * @param {number} duration - Display duration in milliseconds
 */
export async function broadcastAnnouncement(text, type = 'info', duration = 8000, interval = 0) {
  const socket = getSocket();
  if (!socket || !isSocketConnected()) {
    console.warn('[AnnouncementSync] Socket not connected, announcement will only show locally');
    return false;
  }

  try {
    socket.emit('admin:announcement', {
      text,
      type,
      duration,
      interval,
      timestamp: Date.now(),
      sender: 'admin'
    });
    console.log('[AnnouncementSync] ✅ Announcement broadcasted:', text, 'Interval:', interval, 'min');
    return true;
  } catch (err) {
    console.error('[AnnouncementSync] ❌ Failed to broadcast announcement:', err);
    return false;
  }
}

/**
 * Setup announcement listeners on the socket
 * @param {Function} onAnnouncementReceived - Callback when announcement is received
 */
export function setupAnnouncementListeners(onAnnouncementReceived) {
  const socket = getSocket();
  if (!socket) {
    console.warn('[AnnouncementSync] Socket not available for announcement listeners');
    return;
  }

  removeAnnouncementListeners();
  listenerSocket = socket;

  // Listen for announcements from other admins
  announcementHandler = (data) => {
    console.log('[AnnouncementSync] 📢 Received announcement:', data.text);
    if (onAnnouncementReceived) {
      onAnnouncementReceived(data);
    }
  };
  socket.on('admin:announcement', announcementHandler);

  // Listen for admin broadcast channel
  broadcastHandler = (data) => {
    console.log('[AnnouncementSync] 📢 Broadcast announcement:', data.text);
    if (onAnnouncementReceived) {
      onAnnouncementReceived(data);
    }
  };
  socket.on('announcement:broadcast', broadcastHandler);

  console.log('[AnnouncementSync] ✅ Announcement listeners setup');
}

/**
 * Remove announcement listeners
 */
export function removeAnnouncementListeners() {
  if (!listenerSocket) return;

  if (announcementHandler) listenerSocket.off('admin:announcement', announcementHandler);
  if (broadcastHandler) listenerSocket.off('announcement:broadcast', broadcastHandler);
  listenerSocket = null;
  announcementHandler = null;
  broadcastHandler = null;
  console.log('[AnnouncementSync] Announcement listeners removed');
}
