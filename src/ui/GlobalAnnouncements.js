// ============ GLOBAL ANNOUNCEMENTS SYSTEM ============
// Broadcasts important events to all players on the server to create a sense of
// community and make the game world feel alive. Shows level-ups, rare drops, achievements.

export class GlobalAnnouncements {
  constructor() {
    this.announcements = [];
    this.maxAnnouncements = 50;
    this.feedContainer = null;
    this.socket = null;
    this._injectStyles();
  }

  // Initialize with socket connection
  init(socket) {
    this.socket = socket;
    this._createFeedUI();
    this._setupSocketListeners();
  }

  // Create the announcement feed UI
  _createFeedUI() {
    if (document.getElementById('global-feed-container')) return;

    const container = document.createElement('div');
    container.id = 'global-feed-container';
    container.className = 'global-feed-container';
    container.innerHTML = `
      <div class="global-feed-header">
        <span class="global-feed-title">🌍 เหตุการณ์ในเซิร์ฟเวอร์</span>
        <button id="global-feed-toggle" class="global-feed-toggle">−</button>
      </div>
      <div id="global-feed-list" class="global-feed-list"></div>
    `;
    document.body.appendChild(container);

    this.feedContainer = container;
    document.getElementById('global-feed-toggle').addEventListener('click', () => {
      this._toggleFeed();
    });
  }

  // Toggle feed visibility
  _toggleFeed() {
    const list = document.getElementById('global-feed-list');
    const btn = document.getElementById('global-feed-toggle');
    if (list.style.display === 'none') {
      list.style.display = 'flex';
      btn.textContent = '−';
    } else {
      list.style.display = 'none';
      btn.textContent = '+';
    }
  }

  // Setup socket listeners for announcements
  _setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('player_level_up', (data) => {
      this.addAnnouncement({
        type: 'level-up',
        playerName: data.playerName,
        level: data.level,
        icon: '⬆️',
        color: '#ffaa4a',
      });
    });

    this.socket.on('rare_drop', (data) => {
      this.addAnnouncement({
        type: 'rare-drop',
        playerName: data.playerName,
        itemName: data.itemName,
        rarity: data.rarity,
        icon: '✨',
        color: '#ff7aaa',
      });
    });

    this.socket.on('boss_defeated', (data) => {
      this.addAnnouncement({
        type: 'boss-defeated',
        playerName: data.playerName,
        bossName: data.bossName,
        icon: '🐉',
        color: '#ff5a7a',
      });
    });

    this.socket.on('achievement_unlocked', (data) => {
      this.addAnnouncement({
        type: 'achievement',
        playerName: data.playerName,
        achievementName: data.achievementName,
        icon: '🏆',
        color: '#ffcf4a',
      });
    });

    this.socket.on('guild_milestone', (data) => {
      this.addAnnouncement({
        type: 'guild-milestone',
        guildName: data.guildName,
        milestone: data.milestone,
        icon: '🏰',
        color: '#9fccff',
      });
    });
  }

  // Add an announcement to the feed
  addAnnouncement(data) {
    const announcement = {
      id: Date.now(),
      timestamp: new Date(),
      ...data,
    };

    this.announcements.unshift(announcement);
    if (this.announcements.length > this.maxAnnouncements) {
      this.announcements.pop();
    }

    this._renderAnnouncement(announcement);
  }

  // Render a single announcement
  _renderAnnouncement(announcement) {
    const list = document.getElementById('global-feed-list');
    if (!list) return;

    const item = document.createElement('div');
    item.className = `global-feed-item global-feed-${announcement.type}`;
    item.style.borderLeftColor = announcement.color;

    let content = '';
    switch (announcement.type) {
      case 'level-up':
        content = `${announcement.icon} <strong>${announcement.playerName}</strong> ขึ้นเลเวล <span style="color:${announcement.color};font-weight:900;">${announcement.level}</span>!`;
        break;
      case 'rare-drop':
        content = `${announcement.icon} <strong>${announcement.playerName}</strong> ได้ <span style="color:${announcement.color};font-weight:900;">${announcement.itemName}</span> (${announcement.rarity})`;
        break;
      case 'boss-defeated':
        content = `${announcement.icon} <strong>${announcement.playerName}</strong> สังหารบอส <span style="color:${announcement.color};font-weight:900;">${announcement.bossName}</span>!`;
        break;
      case 'achievement':
        content = `${announcement.icon} <strong>${announcement.playerName}</strong> ปลดล็อก <span style="color:${announcement.color};font-weight:900;">${announcement.achievementName}</span>!`;
        break;
      case 'guild-milestone':
        content = `${announcement.icon} กิลด์ <strong>${announcement.guildName}</strong> บรรลุ <span style="color:${announcement.color};font-weight:900;">${announcement.milestone}</span>!`;
        break;
      default:
        content = announcement.message || 'ไม่ทราบเหตุการณ์';
    }

    item.innerHTML = `
      <div class="global-feed-content">
        <span class="global-feed-text">${content}</span>
        <span class="global-feed-time">${this._formatTime(announcement.timestamp)}</span>
      </div>
    `;

    // Add animation
    item.style.opacity = '0';
    item.style.transform = 'translateX(-20px)';
    list.insertBefore(item, list.firstChild);

    // Trigger animation
    setTimeout(() => {
      item.style.transition = 'all 0.4s ease-out';
      item.style.opacity = '1';
      item.style.transform = 'translateX(0)';
    }, 10);

    // Auto-remove old items
    const items = list.querySelectorAll('.global-feed-item');
    if (items.length > 15) {
      const oldItem = items[items.length - 1];
      oldItem.style.transition = 'all 0.3s ease-out';
      oldItem.style.opacity = '0';
      oldItem.style.transform = 'translateX(20px)';
      setTimeout(() => oldItem.remove(), 300);
    }
  }

  // Format time display
  _formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'เพิ่งเดี๋ยว';
    if (minutes < 60) return `${minutes}นาทีที่แล้ว`;
    if (hours < 24) return `${hours}ชั่วโมงที่แล้ว`;
    return date.toLocaleDateString('th-TH');
  }

  // Broadcast an announcement from client (for testing or special cases)
  broadcastAnnouncement(data) {
    if (this.socket) {
      this.socket.emit('announce_event', data);
    }
  }

  // Inject styles
  _injectStyles() {
    if (document.getElementById('global-announcements-styles')) return;

    const style = document.createElement('style');
    style.id = 'global-announcements-styles';
    style.textContent = `
      .global-feed-container {
        position: fixed;
        top: 80px;
        right: 12px;
        width: min(340px, 100vw - 24px);
        max-height: 60vh;
        background: linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(22, 33, 62, 0.95));
        border: 2px solid rgba(255, 207, 74, 0.3);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 207, 74, 0.15);
        z-index: 1300;
        display: flex;
        flex-direction: column;
        backdrop-filter: blur(8px);
        overflow: hidden;
      }

      .global-feed-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: linear-gradient(90deg, rgba(240, 192, 64, 0.1), transparent);
        border-bottom: 1px solid rgba(255, 207, 74, 0.2);
        flex-shrink: 0;
      }

      .global-feed-title {
        font-size: 13px;
        font-weight: 900;
        color: #ffcf4a;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
      }

      .global-feed-toggle {
        background: rgba(255, 207, 74, 0.1);
        border: 1px solid rgba(255, 207, 74, 0.3);
        color: #ffcf4a;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 900;
        transition: all 0.2s;
      }

      .global-feed-toggle:hover {
        background: rgba(255, 207, 74, 0.2);
        border-color: #ffcf4a;
      }

      .global-feed-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        -webkit-overflow-scrolling: touch;
      }

      .global-feed-list::-webkit-scrollbar {
        width: 6px;
      }

      .global-feed-list::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }

      .global-feed-list::-webkit-scrollbar-thumb {
        background: rgba(255, 207, 74, 0.3);
        border-radius: 3px;
      }

      .global-feed-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 207, 74, 0.5);
      }

      .global-feed-item {
        padding: 8px 10px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.04);
        border-left: 3px solid #ffcf4a;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        transition: all 0.2s;
        font-size: 12px;
      }

      .global-feed-item:hover {
        background: rgba(255, 255, 255, 0.08);
        border-left-width: 4px;
      }

      .global-feed-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
      }

      .global-feed-text {
        color: #d0d0d0;
        line-height: 1.4;
        flex: 1;
      }

      .global-feed-text strong {
        color: #fff;
        font-weight: 800;
      }

      .global-feed-time {
        color: #9aa5c0;
        font-size: 10px;
        white-space: nowrap;
        flex-shrink: 0;
      }

      /* Type-specific colors */
      .global-feed-level-up {
        border-left-color: #ffaa4a;
      }

      .global-feed-rare-drop {
        border-left-color: #ff7aaa;
      }

      .global-feed-boss-defeated {
        border-left-color: #ff5a7a;
      }

      .global-feed-achievement {
        border-left-color: #ffcf4a;
      }

      .global-feed-guild-milestone {
        border-left-color: #9fccff;
      }

      @media (max-width: 768px) {
        .global-feed-container {
          top: auto;
          bottom: 80px;
          right: 8px;
          left: 8px;
          width: auto;
          max-height: 40vh;
        }

        .global-feed-title {
          font-size: 12px;
        }

        .global-feed-text {
          font-size: 11px;
        }
      }
    `;

    document.head.appendChild(style);
  }
}
