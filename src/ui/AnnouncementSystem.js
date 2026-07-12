/**
 * AnnouncementSystem.js
 * Manages scrolling text announcements that display in the game
 * Admins can post announcements via admin panel
 * Announcements appear as scrolling ticker at top of screen
 */

export class AnnouncementSystem {
  constructor() {
    this.announcements = [];
    this.currentIndex = 0;
    this.scrollSpeed = 2; // pixels per frame
    this.displayDuration = 8000; // milliseconds
    this.container = null;
    this.textElement = null;
    this.isInitialized = false;
    this.currentAnnouncement = null;
    this.displayStartTime = 0;
    this.scrollPosition = 0;
    this.maxWidth = 0;
    this.animationFrameId = null;
  }

  /**
   * Initialize the announcement UI
   */
  init() {
    if (this.isInitialized) return;

    // Create container - simple minimal ticker bar
    this.container = document.createElement('div');
    this.container.id = 'announcement-container';
    this.container.style.cssText = `
      position: fixed;
      top: 60px;
      left: 0;
      right: 0;
      height: 32px;
      background: rgba(20, 20, 30, 0.85);
      border-bottom: 1px solid rgba(100, 100, 120, 0.5);
      display: flex;
      align-items: center;
      overflow: hidden;
      z-index: 999;
      font-family: Arial, sans-serif;
      font-weight: normal;
      color: #cccccc;
      box-shadow: none;
    `;

    // Create text element
    this.textElement = document.createElement('div');
    this.textElement.style.cssText = `
      white-space: nowrap;
      padding: 0 20px;
      font-size: 14px;
      letter-spacing: 0.5px;
      animation: scroll-text 20s linear infinite;
      text-shadow: none;
    `;

    this.container.appendChild(this.textElement);
    document.body.appendChild(this.container);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes scroll-text {
        0% { transform: translateX(100%); }
        100% { transform: translateX(-100%); }
      }
      #announcement-container {
        display: flex !important;
      }
    `;
    document.head.appendChild(style);

    this.isInitialized = true;
    this.show();
  }

  /**
   * Add an announcement to the queue
   * @param {string} text - The announcement text
   * @param {string} type - Type of announcement (info, warning, event, etc.)
   * @param {number} duration - How long to display (ms)
   */
  addAnnouncement(text, type = 'info', duration = 8000) {
    const announcement = {
      text: text,
      type,
      duration,
      timestamp: Date.now(),
    };

    this.announcements.push(announcement);

    // If no announcement is currently showing, start showing this one
    if (!this.currentAnnouncement) {
      this.showNext();
    }
  }

  /**
   * Show the next announcement in the queue
   */
  showNext() {
    if (this.announcements.length === 0) {
      this.hide();
      return;
    }

    this.currentAnnouncement = this.announcements.shift();
    this.displayStartTime = Date.now();

    if (this.textElement) {
      this.textElement.textContent = this.currentAnnouncement.text;
    }

    this.show();

    // Schedule next announcement
    setTimeout(() => {
      this.showNext();
    }, this.currentAnnouncement.duration);
  }

  /**
   * Show the announcement container (always visible)
   */
  show() {
    if (this.container) {
      this.container.style.display = 'flex';
    }
  }

  /**
   * Hide the announcement container
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'flex';
    }
    this.currentAnnouncement = null;
  }

  /**
   * Clear all pending announcements
   */
  clear() {
    this.announcements = [];
    this.hide();
  }

  /**
   * Get current announcement
   */
  getCurrent() {
    return this.currentAnnouncement;
  }

  /**
   * Get queue size
   */
  getQueueSize() {
    return this.announcements.length;
  }

  /**
   * Destroy the announcement system
   */
  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.announcements = [];
    this.currentAnnouncement = null;
    this.isInitialized = false;
  }
}

// Export singleton instance
export const announcementSystem = new AnnouncementSystem();
