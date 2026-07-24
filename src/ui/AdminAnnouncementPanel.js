/**
 * AdminAnnouncementPanel.js
 * Admin panel for posting announcements to the game
 * Allows admins to send messages that appear as scrolling text
 */

import { announcementSystem } from './AnnouncementSystem.js';
import { broadcastAnnouncement } from '../network/AnnouncementSync.js';

export class AdminAnnouncementPanel {
  constructor() {
    this.isVisible = false;
    this.panelElement = null;
    this.isAdminMode = false;
    this.container = null;
  }

  /**
   * Initialize the admin announcement panel
   * @param {HTMLElement} container - Optional container to append to. If not provided, creates a floating panel.
   */
  init(container = null) {
    this.container = container;
    
    // Remove existing panel if it exists
    if (this.panelElement) {
      this.destroy();
    }

    // Create panel HTML
    const panel = document.createElement('div');
    panel.id = 'admin-announcement-panel';
    panel.className = 'admin-announcement-panel';
    
    if (container) {
      // Integrated style
      panel.style.cssText = `
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        background: rgba(26, 26, 46, 0.4);
        border: 1px solid #FF006E;
        padding: 30px;
        box-sizing: border-box;
        font-family: 'Courier New', monospace;
        color: #00D9FF;
        display: block;
        box-shadow: 0 0 20px rgba(255, 0, 110, 0.2);
      `;
    } else {
      // Floating style (fallback)
      panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 350px;
        background: linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(22, 33, 62, 0.95));
        border: 3px solid #FF006E;
        border-radius: 0;
        padding: 20px;
        z-index: 1000;
        font-family: 'Courier New', monospace;
        color: #00D9FF;
        box-shadow: 0 0 30px rgba(255, 0, 110, 0.5), inset 0 0 10px rgba(0, 217, 255, 0.1);
        display: none;
      `;
    }

    panel.innerHTML = `
      <div style="margin-bottom: 15px;">
        <div style="font-size: 14px; font-weight: bold; color: #FFBE0B; margin-bottom: 10px; text-transform: uppercase;">
          ⚙️ ADMIN ANNOUNCEMENTS
        </div>
        <div style="font-size: 12px; color: #00D9FF; margin-bottom: 10px; opacity: 0.8;">
          Post messages that scroll across the game
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; margin-bottom: 5px; color: #FFBE0B;">MESSAGE:</label>
        <textarea 
          id="admin-announcement-text" 
          placeholder="Enter announcement text..."
          style="
            width: 100%;
            height: 80px;
            padding: 8px;
            background: #0a0a1a;
            border: 2px solid #00D9FF;
            color: #00D9FF;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            resize: none;
            box-sizing: border-box;
          "
        ></textarea>
      </div>

      <div class="admin-announcement-fields" style="display: flex; gap: 15px; margin-bottom: 12px;">
        <div style="flex: 1;">
          <label style="display: block; font-size: 12px; margin-bottom: 5px; color: #FFBE0B;">TYPE:</label>
          <select 
            id="admin-announcement-type"
            style="
              width: 100%;
              padding: 8px;
              background: #0a0a1a;
              border: 2px solid #00D9FF;
              color: #00D9FF;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              box-sizing: border-box;
            "
          >
            <option value="info">📢 INFO</option>
            <option value="warning">⚠️ WARNING</option>
            <option value="event">🎉 EVENT</option>
            <option value="maintenance">🔧 MAINTENANCE</option>
            <option value="update">📝 UPDATE</option>
          </select>
        </div>
        <div style="flex: 1;">
          <label style="display: block; font-size: 12px; margin-bottom: 5px; color: #FFBE0B;">DURATION (SEC):</label>
          <input 
            id="admin-announcement-duration" 
            type="number" 
            value="8" 
            min="3" 
            max="60"
            style="
              width: 100%;
              padding: 8px;
              background: #0a0a1a;
              border: 2px solid #00D9FF;
              color: #00D9FF;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              box-sizing: border-box;
            "
          />
        </div>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; margin-bottom: 5px; color: #FFBE0B;">REPEAT INTERVAL:</label>
        <select 
          id="admin-announcement-interval"
          style="
            width: 100%;
            padding: 8px;
            background: #0a0a1a;
            border: 2px solid #FFBE0B;
            color: #FFBE0B;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            box-sizing: border-box;
          "
        >
          <option value="0">OFF (Send Once)</option>
          <option value="1">Every 1 Minute</option>
          <option value="3">Every 3 Minutes</option>
          <option value="5">Every 5 Minutes</option>
          <option value="10">Every 10 Minutes</option>
          <option value="20">Every 20 Minutes</option>
          <option value="30">Every 30 Minutes</option>
        </select>
      </div>

      <div class="admin-announcement-actions" style="display: flex; gap: 10px; margin-bottom: 12px;">
        <button 
          id="admin-announce-btn"
          style="
            flex: 1;
            padding: 10px;
            background: #FF006E;
            border: 2px solid #FF006E;
            color: #0a0a1a;
            font-weight: bold;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            text-transform: uppercase;
            transition: all 120ms;
          "
        >
          📢 SEND
        </button>
        <button 
          id="admin-announce-clear-btn"
          style="
            flex: 1;
            padding: 10px;
            background: transparent;
            border: 2px solid #FFBE0B;
            color: #FFBE0B;
            font-weight: bold;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            text-transform: uppercase;
            transition: all 120ms;
          "
        >
          🗑️ CLEAR
        </button>
      </div>

      <div style="
        padding: 10px;
        background: #0a0a1a;
        border: 1px solid #2a2a4e;
        font-size: 11px;
        color: #00D9FF;
        max-height: 100px;
        overflow-y: auto;
      ">
        <div style="font-weight: bold; margin-bottom: 5px; color: #FFBE0B;">QUEUE:</div>
        <div id="admin-announcement-queue">No pending announcements</div>
      </div>
      
      ${!container ? `
      <div style="margin-top: 12px; text-align: center;">
        <button 
          id="admin-announce-close-btn"
          style="
            padding: 8px 16px;
            background: transparent;
            border: 1px solid #00D9FF;
            color: #00D9FF;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            text-transform: uppercase;
          "
        >
          CLOSE
        </button>
      </div>
      ` : ''}
    `;

    if (container) {
      container.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
    
    this.panelElement = panel;

    // Setup event listeners
    this._setupEventListeners();
  }

  /**
   * Setup event listeners for the panel
   */
  _setupEventListeners() {
    const textInput = document.getElementById('admin-announcement-text');
    const typeSelect = document.getElementById('admin-announcement-type');
    const durationInput = document.getElementById('admin-announcement-duration');
    const intervalSelect = document.getElementById('admin-announcement-interval');
    const sendBtn = document.getElementById('admin-announce-btn');
    const clearBtn = document.getElementById('admin-announce-clear-btn');
    const closeBtn = document.getElementById('admin-announce-close-btn');

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) {
          alert('Please enter announcement text');
          return;
        }

        const type = typeSelect.value;
        const duration = parseInt(durationInput.value) * 1000;
        const interval = parseInt(intervalSelect.value);

        // Add to announcement system locally
        announcementSystem.addAnnouncement(text, type, duration);

        // Handle offline recurring announcement if not in socket mode
        const { isSocketMode } = await import('../network/SocketClient.js');
        if (!isSocketMode() && interval > 0) {
            const intervalMs = interval * 60 * 1000;
            if (this.localIntervals && this.localIntervals[text]) {
                clearInterval(this.localIntervals[text]);
            }
            if (!this.localIntervals) this.localIntervals = {};
            this.localIntervals[text] = setInterval(() => {
                announcementSystem.addAnnouncement(text, type, duration);
            }, intervalMs);
        }

        // Broadcast to all players via Socket.io
        await broadcastAnnouncement(text, type, duration, interval);

        // Clear input
        textInput.value = '';

        // Update queue display
        this._updateQueueDisplay();

        // Show feedback
        this._showFeedback('✅ Announcement sent to all players!');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        announcementSystem.clear();
        // Clear all recurring intervals
        if (this.localIntervals) {
          Object.values(this.localIntervals).forEach(interval => clearInterval(interval));
          this.localIntervals = {};
        }
        this._updateQueueDisplay();
        this._showFeedback('Queue and recurring alerts cleared!');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide();
      });
    }

    // Update queue display on input change
    if (textInput) {
      textInput.addEventListener('input', () => this._updateQueueDisplay());
    }
  }

  /**
   * Update the queue display
   */
  _updateQueueDisplay() {
    const queueEl = document.getElementById('admin-announcement-queue');
    if (!queueEl) return;
    
    const queueSize = announcementSystem.getQueueSize();
    const current = announcementSystem.getCurrent();

    let html = '';
    if (current) {
      html += `<div style="color: #FF006E; margin-bottom: 5px;">▶ NOW: ${current.text}</div>`;
    }
    if (queueSize > 0) {
      html += `<div style="color: #FFBE0B;">⏳ PENDING: ${queueSize} message(s)</div>`;
    }
    if (!current && queueSize === 0) {
      html = '<div style="opacity: 0.5;">No pending announcements</div>';
    }

    queueEl.innerHTML = html;
  }

  /**
   * Show feedback message
   */
  _showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #FF006E;
      color: #0a0a1a;
      padding: 20px 40px;
      border-radius: 0;
      font-weight: bold;
      z-index: 10000;
      font-family: 'Courier New', monospace;
      box-shadow: 0 0 30px rgba(255, 0, 110, 0.8);
    `;
    feedback.textContent = message;
    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.remove();
    }, 2000);
  }

  /**
   * Show the admin panel
   */
  show() {
    if (this.panelElement) {
      this.panelElement.style.display = 'block';
      this.isVisible = true;
      this._updateQueueDisplay();
    }
  }

  /**
   * Hide the admin panel
   */
  hide() {
    if (this.panelElement) {
      this.panelElement.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Toggle the admin panel visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if panel is visible
   */
  isOpen() {
    return this.isVisible;
  }

  /**
   * Destroy the panel
   */
  destroy() {
    if (this.panelElement && this.panelElement.parentNode) {
      this.panelElement.parentNode.removeChild(this.panelElement);
    }
    this.panelElement = null;
  }
}

// Export singleton instance
export const adminAnnouncementPanel = new AdminAnnouncementPanel();
