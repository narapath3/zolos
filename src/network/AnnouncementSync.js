/**
 * AnnouncementSync.js
 * Handles Socket.io broadcasting and receiving of announcements
 * Admins send announcements through Socket.io to all connected players
 */

import { getSocket, isSocketConnected } from './SocketClient.js';

/**
 * Broadcast an announcement to all players via Socket.io
 * @param {string} text - Announcement text
 * @param {string} type - Type of announcement (info, warning, event, etc.)
 * @param {number} duration - Display duration in milliseconds
 */
export async function broadcastAnnouncement(text, type = 'info', duration = 8000) {
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
      timestamp: Date.now(),
      sender: 'admin'
    });
    console.log('[AnnouncementSync] ✅ Announcement broadcasted:', text);
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

  // Listen for announcements from other admins
  socket.on('admin:announcement', (data) => {
    console.log('[AnnouncementSync] 📢 Received announcement:', data.text);
    if (onAnnouncementReceived) {
      onAnnouncementReceived(data);
    }
  });

  // Listen for admin broadcast channel
  socket.on('announcement:broadcast', (data) => {
    console.log('[AnnouncementSync] 📢 Broadcast announcement:', data.text);
    if (onAnnouncementReceived) {
      onAnnouncementReceived(data);
    }
  });

  console.log('[AnnouncementSync] ✅ Announcement listeners setup');
}

/**
 * Remove announcement listeners
 */
export function removeAnnouncementListeners() {
  const socket = getSocket();
  if (!socket) return;

  socket.off('admin:announcement');
  socket.off('announcement:broadcast');
  console.log('[AnnouncementSync] Announcement listeners removed');
}
