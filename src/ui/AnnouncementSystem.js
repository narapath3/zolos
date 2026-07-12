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
      bottom: 85px;
      left: 50%;
      transform: translateX(-50%);
      width: 80%;
      max-width: 800px;
      height: 28px;
      background: rgba(10, 10, 15, 0.7);
      border: 1px solid rgba(255, 0, 110, 0.3);
      border-radius: 14px;
      display: flex;
      align-items: center;
      overflow: hidden;
      z-index: 999;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #00D9FF;
      pointer-events: none;
      box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
    `;

    // Create text element
    this.textElement = document.createElement('div');
    this.textElement.style.cssText = `
      white-space: nowrap;
      padding: 0 30px;
      font-size: 13px;
      letter-spacing: 1px;
      animation: scroll-text 15s linear infinite;
      text-shadow: 0 0 5px rgba(0, 217, 255, 0.5);
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
      #announcement-container.hidden {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    this.isInitialized = true;
    this.hide();
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
   * Show the announcement container
   */
  show() {
    if (this.container) {
      this.container.classList.remove('hidden');
    }
  }

  /**
   * Hide the announcement container
   */
  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
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
