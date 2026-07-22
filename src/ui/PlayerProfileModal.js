// Player Profile Modal — Beautiful profile display with real-time 3D avatar
// Shows player stats, skills, and equipment with premium styling

import { JobPreview } from '../engine/JobPreview.js';
import { JOBS, ITEMS, EQUIP_SLOTS, SKILLS, getJobStats } from '../engine/GameData.js';

export class PlayerProfileModal {
  constructor() {
    this.currentPlayer = null;
    this.jobPreview = null;
    this._createModal();
    this._injectStyles();
  }

  _injectStyles() {
    if (document.getElementById('player-profile-style')) return;

    const st = document.createElement('style');
    st.id = 'player-profile-style';
    st.textContent = `
      #player-profile-modal {
        position: fixed;
        inset: 0;
        z-index: 1500;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(4, 8, 18, 0.80);
        backdrop-filter: blur(6px);
        padding: 12px;
        box-sizing: border-box;
      }

      #player-profile-card {
        width: min(840px, 96vw);
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        border-radius: 20px;
        background: linear-gradient(180deg, #1a223a, #0d1120);
        border: 1px solid rgba(240, 192, 64, 0.4);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        overflow: hidden;
        pointer-events: auto;
      }

      .profile-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid rgba(240, 192, 64, 0.2);
        background: linear-gradient(90deg, rgba(240, 192, 64, 0.1), transparent);
      }

      .profile-head h2 {
        font-size: 18px;
        color: #fff;
        text-shadow: 0 0 10px rgba(240, 192, 64, 0.3);
        margin: 0;
        font-weight: 800;
      }

      .profile-x {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.6);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      }

      .profile-x:hover {
        transform: rotate(90deg);
        background: rgba(255, 100, 100, 0.2);
        color: #ff6b6b;
        border-color: rgba(255, 100, 100, 0.3);
      }

      .profile-main {
        display: flex;
        padding: 20px;
        gap: 24px;
        overflow: hidden;
      }

      .profile-left {
        flex: 0 0 320px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      #player-profile-canvas {
        width: 100%;
        height: 320px;
        border-radius: 16px;
        background: radial-gradient(circle at 50% 40%, #252d4a, #0d1120);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .profile-info {
        text-align: center;
      }

      .profile-name {
        font-size: 20px;
        font-weight: 800;
        color: #fff;
        margin-bottom: 4px;
      }

      .profile-sub {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        margin-top: 8px;
      }

      .status-online { background: rgba(81, 207, 102, 0.15); color: #51cf66; }
      .status-offline { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.4); }

      .profile-right {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        padding-right: 8px;
      }

      /* Custom scrollbar */
      .profile-right::-webkit-scrollbar { width: 4px; }
      .profile-right::-webkit-scrollbar-track { background: transparent; }
      .profile-right::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }

      .section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #f0c040;
        margin-bottom: 12px;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .section-title::after {
        content: '';
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, rgba(240, 192, 64, 0.2), transparent);
      }

      /* Basic Stats */
      .basic-stats {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .stat-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .stat-label {
        width: 40px;
        font-size: 12px;
        font-weight: 800;
        color: rgba(255, 255, 255, 0.8);
      }

      .stat-bar-bg {
        flex: 1;
        height: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        overflow: hidden;
      }

      .stat-bar-fill {
        height: 100%;
        border-radius: 4px;
        width: 0;
        transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .stat-bar-fill.str { background: linear-gradient(90deg, #ff4b4b, #ff8787); }
      .stat-bar-fill.agi { background: linear-gradient(90deg, #2ecc71, #51cf66); }
      .stat-bar-fill.int { background: linear-gradient(90deg, #3498db, #748ffc); }

      .stat-value {
        width: 24px;
        font-size: 12px;
        font-weight: 700;
        color: #fff;
        text-align: right;
      }

      /* Combat Stats */
      .combat-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }

      .combat-box {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 10px 14px;
        border-radius: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: transform 0.2s ease;
      }

      .combat-box:hover {
        transform: translateY(-2px);
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(240, 192, 64, 0.2);
      }

      .combat-label { font-size: 11px; color: rgba(255, 255, 255, 0.4); font-weight: 600; }
      .combat-value { font-size: 14px; font-weight: 700; color: #fff; }

      /* Skills */
      .skills-flex {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .skill-badge {
        background: rgba(52, 152, 219, 0.1);
        border: 1px solid rgba(52, 152, 219, 0.2);
        color: #74b9ff;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
      }

      /* Equipment */
      .equip-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      .equip-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 6px;
        opacity: 0.5;
        transition: all 0.2s ease;
      }

      .equip-item.filled {
        opacity: 1;
        background: rgba(240, 192, 64, 0.05);
        border-color: rgba(240, 192, 64, 0.3);
      }

      .equip-emoji { font-size: 20px; }
      .equip-slot-label { font-size: 9px; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); font-weight: 800; }
      .equip-name {
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Badges */
      .badges-section {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        margin-top: 8px;
      }

      .badge {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .badge-title { background: #f0c040; color: #000; }
      .badge-veteran { background: #9b59b6; color: #fff; }
      .badge-wealthy { background: #2ecc71; color: #fff; }

      /* Action Buttons */
      .profile-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 16px;
        width: 100%;
      }

      .profile-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(240, 192, 64, 0.3);
        background: rgba(240, 192, 64, 0.05);
        color: #f0c040;
      }

      .profile-btn:hover:not(:disabled) {
        background: rgba(240, 192, 64, 0.15);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(240, 192, 64, 0.2);
      }

      .profile-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        filter: grayscale(1);
      }

      .profile-btn.primary {
        background: #f0c040;
        color: #000;
        border: none;
      }

      .profile-btn.primary:hover:not(:disabled) {
        background: #ffcf50;
      }
      
      .profile-btn.danger {
        border-color: rgba(255, 100, 100, 0.3);
        background: rgba(255, 100, 100, 0.05);
        color: #ff6b6b;
      }
      
      .profile-btn.danger:hover:not(:disabled) {
        background: rgba(255, 100, 100, 0.15);
      }

      @media (max-width: 720px) {
        #player-profile-card {
          width: 96vw;
          max-height: calc(100dvh - 120px);
          border-radius: 16px;
        }
        .profile-head { padding: 10px 16px; }
        .profile-head h2 { font-size: 15px; }
        .profile-main {
          flex-direction: column;
          overflow-y: auto;
          padding: 12px;
          gap: 16px;
          -webkit-overflow-scrolling: touch;
        }
        .profile-left {
          flex: none;
          width: 100%;
          gap: 12px;
        }
        #player-profile-canvas {
          height: 240px;
        }
        .profile-name { font-size: 18px; }
        .profile-right {
          padding-right: 0;
          overflow-y: visible;
          gap: 16px;
        }
        .combat-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .combat-box { padding: 8px 12px; }
        .equip-grid {
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .equip-item { padding: 8px 4px; }
        .equip-emoji { font-size: 18px; }
        .equip-name { font-size: 10px; }
        .section-title { margin-bottom: 8px; }
      }
    `;
    document.head.appendChild(st);
  }

  _createModal() {
    const modal = document.createElement('div');
    modal.id = 'player-profile-modal';
    modal.innerHTML = `<div id="player-profile-card"></div>`;
    document.body.appendChild(modal);
    this.modal = modal;
    
    // Global click listener to close if clicking outside the card
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });
  }

  show(player, dbData = null, liveAppearance = null) {
    this.currentPlayer = player;
    const card = document.getElementById('player-profile-card');
    if (!card) {
      console.error('[Profile] #player-profile-card not found in DOM');
      return;
    }
    
    // Merge data: DB provides stats, liveAppearance provides current visuals
    const job = liveAppearance?.job || dbData?.job || 'Novice';
    const level = dbData?.level || liveAppearance?.level || player.level || 1;
    
    // STR/AGI/INT are derived from the class + level (the game has no manual
    // stat allocation, so the DB's str/agi/int columns are just a default 1 and
    // must not be used — that showed 1/1/1 for everyone).
    const jobKey = JOBS[job] ? job : (Object.keys(JOBS).find(k => JOBS[k].nameEn === job || JOBS[k].name === job) || null);
    const stats = getJobStats(jobKey, level);

    // Appearance merge
    const appearance = {
      gender: liveAppearance?.gender || dbData?.gender || 'male',
      bodyColor: liveAppearance?.bodyColor || dbData?.body_color || 0x4060c0,
      hairColor: liveAppearance?.hairColor || dbData?.hair_color || 0xc04040,
      pantsColor: liveAppearance?.pantsColor || dbData?.pants_color || 0x3a3a5a,
      hat: liveAppearance?.hat || dbData?.hat || 'None',
      glasses: liveAppearance?.glasses || dbData?.glasses || 'None',
      weapon: liveAppearance?.weapon || dbData?.weapon || 'None',
      shield: liveAppearance?.shield || dbData?.shield || 'None',
      gear: liveAppearance?.gear || { body: dbData?.armor },
      job: job,
      title: liveAppearance?.title || dbData?.title
    };

    const jobInfo = JOBS[job] || { name: 'Adventurer', emoji: '⚔️' };
    const uid = player.userId || '';
    const isOffline = player.isOffline || (uid.startsWith('guest_') && (!window.remotePlayersMap || !window.remotePlayersMap.has(player.userId)));

    // Friend status check
    const isFriend = window.gameUI && window.gameUI.friends && window.gameUI.friends.includes(player.username);
    const isSelf = window.userId === player.userId;

    // Build the full HTML — preserve the canvas DOM element reference
    // so that the WebGL renderer survives between show() calls.
    const cardHTML = `
      <div class="profile-head">
        <div>
          <h2>PLAYER PROFILE</h2>
        </div>
        <button class="profile-x">✕</button>
      </div>

      <div class="profile-main">
        <div class="profile-left">
          <canvas id="player-profile-canvas"></canvas>
          <div class="profile-info">
            <div class="profile-name">${dbData?.name || player.username}</div>
            <div class="profile-sub">
              Lv.${level} • ${jobInfo.emoji} ${jobInfo.name}
            </div>
            <div class="status-badge ${isOffline ? 'status-offline' : 'status-online'}">
              ${isOffline ? '⚫ OFFLINE' : '🟢 ONLINE'}
            </div>
            <div class="badges-section">
              ${this._renderBadges({ ...dbData, appearance, level })}
            </div>

            ${!isSelf ? `
            <div class="profile-actions">
              <button id="prof-btn-friend" class="profile-btn ${isFriend ? 'danger' : 'primary'}">
                ${isFriend ? '💔 Remove Friend' : '➕ Add Friend (เพิ่มเพื่อน)'}
              </button>
              <button id="prof-btn-warp" class="profile-btn" ${isOffline ? 'disabled' : ''}>
                🌀 Warp To Player (วาปไปหา)
              </button>
              <button id="prof-btn-duel" class="profile-btn" ${isOffline ? 'disabled' : ''}>
                ⚔️ PVP Duel (ท้าดวล PVP)
              </button>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="profile-right">
          <div>
            <div class="section-title">Attributes</div>
            <div class="basic-stats">
              ${this._renderStatRow('STR', stats.str, 'str')}
              ${this._renderStatRow('AGI', stats.agi, 'agi')}
              ${this._renderStatRow('INT', stats.int, 'int')}
            </div>
          </div>

          <div>
            <div class="section-title">Combat Stats</div>
            <div class="combat-grid">
              <div class="combat-box">
                <span class="combat-label">HP</span>
                <span class="combat-value">${dbData?.hp || '???'}/${dbData?.max_hp || '???'}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">SP</span>
                <span class="combat-value">${dbData?.sp || '???'}/${dbData?.max_sp || '???'}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">ATK</span>
                <span class="combat-value">+${dbData?.atk || 0}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">DEF</span>
                <span class="combat-value">+${dbData?.def || 0}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">Kills</span>
                <span class="combat-value">${dbData?.total_kills || 0}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">Zeny</span>
                <span class="combat-value">${(dbData?.gold || 0).toLocaleString()}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">ZOL</span>
                <span class="combat-value">${(dbData?.zol || 0).toLocaleString()}</span>
              </div>
              <div class="combat-box">
                <span class="combat-label">Playtime</span>
                <span class="combat-value">${this._formatPlayTime(dbData?.play_time)}</span>
              </div>
            </div>
          </div>

          <div>
            <div class="section-title">Equipment</div>
            <div class="equip-grid">
              ${this._renderEquipment(appearance)}
            </div>
          </div>
        </div>
      </div>
    `;

    // If the modal was already showing a DIFFERENT player (switched mid-fly),
    // we must rebuild the full DOM. But if it's the same player, skip the
    // innerHTML assignment to preserve the WebGL canvas.
    const isSamePlayer = this._lastShownPlayerId === player.userId;
    this._lastShownPlayerId = player.userId;

    if (!isSamePlayer) {
      card.innerHTML = cardHTML;
    } else {
      // Same player — update only the text content without destroying the canvas
      this._updateProfileText(card, { dbData, player, level, jobInfo, isOffline, stats, isSelf, isFriend, appearance });
    }

    // Close button handler
    const closeBtn = card.querySelector('.profile-x');
    if (closeBtn) closeBtn.onclick = () => this.hide();

    // Action button handlers
    if (!isSelf) {
      const btnFriend = card.querySelector('#prof-btn-friend');
      const btnWarp = card.querySelector('#prof-btn-warp');
      const btnDuel = card.querySelector('#prof-btn-duel');

      if (btnFriend) {
        btnFriend.onclick = () => {
          if (window.gameUI) {
            window.gameUI._toggleFriend(player);
            // Update button state immediately if it was an add action (pending state)
            if (!isFriend) {
              btnFriend.innerHTML = '⌛ Pending...';
              btnFriend.style.opacity = '0.6';
              btnFriend.style.pointerEvents = 'none';
            } else {
              // If removing, it's instant, so we can hide the modal or let GameUI refresh it
              this.hide();
            }
          }
        };
      }

      if (btnWarp) {
        btnWarp.onclick = async () => {
          if (window.gameUI) {
            const { sendWarpRequest } = await import('../network/GameSync.js');
            const res = sendWarpRequest(player.userId);
            if (res && res.success) {
              if (window.warpManager) window.warpManager.pending = { targetName: player.username };
              window.gameUI.addCombatLog(`🌀 กำลังวาปไปหา ${player.username}...`, 'system');
              this.hide();
            } else {
              window.gameUI.addCombatLog('❌ วาปไม่ได้ (เซิร์ฟเวอร์ไม่เชื่อมต่อ)', 'warning');
            }
          }
        };
      }

      if (btnDuel) {
        btnDuel.onclick = async () => {
          if (window.gameUI) {
            const { sendDuelRequest } = await import('../network/GameSync.js');
            const res = sendDuelRequest(
              player.userId,
              player.username,
              window.gameUI.character?.stats?.name || 'Adventurer',
              window.gameUI.character?.stats?.level || 1
            );
            if (res.success) {
              window.gameUI.addCombatLog(`⚔️ ส่งคำท้าดวลไปยัง ${player.username} แล้ว รอการตอบรับ...`, 'system');
              this.hide();
            } else {
              window.gameUI.addCombatLog('❌ ท้าดวลไม่ได้ (ออฟไลน์/เซิร์ฟเวอร์ไม่เชื่อมต่อ)', 'warning');
            }
          }
        };
      }
    }

    // Initialize 3D character preview
    this._init3DPreview(appearance);

    // Animate bars after a short delay — scale each relative to this hero's
    // top attribute so the bars read as a distribution at any level.
    setTimeout(() => {
      const bars = card.querySelectorAll('.stat-bar-fill');
      let maxVal = 1;
      bars.forEach(b => { maxVal = Math.max(maxVal, parseInt(b.getAttribute('data-val')) || 0); });
      bars.forEach(bar => {
        const val = parseInt(bar.getAttribute('data-val')) || 0;
        bar.style.width = Math.max(8, Math.min((val / maxVal) * 100, 100)) + '%';
      });
    }, 50);

    this.modal.style.display = 'flex';

    // Start live status polling while modal is open
    this._startStatusPolling();
  }

  _startStatusPolling() {
    this._stopStatusPolling();
    this._statusPollTimer = setInterval(() => {
      if (this.modal.style.display === 'none') {
        this._stopStatusPolling();
        return;
      }
      this._updateLiveStatus();
    }, 2000);
  }

  _stopStatusPolling() {
    if (this._statusPollTimer) {
      clearInterval(this._statusPollTimer);
      this._statusPollTimer = null;
    }
  }

  _updateLiveStatus() {
    if (!this.currentPlayer) return;
    const badge = this.modal.querySelector('.status-badge');
    if (!badge) return;

    const userId = this.currentPlayer.userId;
    // Local player is always online
    const isLocal = window.userId === userId;
    // Remote player is online if in the map
    const isRemoteOnline = window.remotePlayersMap && window.remotePlayersMap.has(userId);
    const isOnline = isLocal || isRemoteOnline;

    if (isOnline) {
      badge.className = 'status-badge status-online';
      badge.innerHTML = '🟢 ONLINE';
    } else {
      badge.className = 'status-badge status-offline';
      badge.innerHTML = '⚫ OFFLINE';
    }
  }

  hide() {
    this.modal.style.display = 'none';
    this._stopStatusPolling();
    // Stop the render loop but keep the WebGL renderer alive.
    // The next show() will reuse it (no rebuild needed).
    if (this.jobPreview) {
      this.jobPreview.stop();
    }
  }

  _init3DPreview(appearance) {
    const canvas = document.getElementById('player-profile-canvas');
    if (!canvas) return;

    // Reuse existing JobPreview if the canvas is the same — avoids
    // destroying and recreating the entire WebGL renderer, scene, and
    // CharacterManager on every profile open (the main cause of slow
    // profile popup rendering).
    const existingCanvas = this.jobPreview?.canvas;
    if (this.jobPreview && existingCanvas === canvas) {
      // Just update the appearance — no need to rebuild the renderer
      if (this.jobPreview.char) {
        this.jobPreview.char.applyAppearance(appearance);
        const ringColor = { swordsman: 0xff6a6a, mage: 0xb080ff, archer: 0x7be08a, priest: 0xffe98a }[appearance.job] || 0xffd24a;
        if (this.jobPreview.ring) {
          this.jobPreview.ring.material.color.setHex(ringColor);
        }
      }
      this.jobPreview.start();
      return;
    }

    // Canvas changed (first open or canvas was replaced) — create new preview
    if (this.jobPreview) {
      this.jobPreview.dispose();
    }

    this.jobPreview = new JobPreview(canvas);
    
    // Apply full appearance to the character
    if (this.jobPreview.char) {
      this.jobPreview.char.applyAppearance(appearance);
      
      // Update ring color based on job (match JobPreview logic)
      const ringColor = { swordsman: 0xff6a6a, mage: 0xb080ff, archer: 0x7be08a, priest: 0xffe98a }[appearance.job] || 0xffd24a;
      if (this.jobPreview.ring) {
        this.jobPreview.ring.material.color.setHex(ringColor);
      }
    }
    
    this.jobPreview.start();
  }

  // Update profile text content without destroying the canvas DOM element.
  // This is called when show() is invoked for the SAME player (e.g. the DB
  // fetch completes after the initial render). Preserving the canvas keeps
  // the WebGL renderer alive and avoids the expensive re-creation cost.
  _updateProfileText(card, { dbData, player, level, jobInfo, isOffline, stats, isSelf, isFriend, appearance }) {
    // Update name
    const nameEl = card.querySelector('.profile-name');
    if (nameEl) nameEl.textContent = dbData?.name || player.username;

    // Update level/job subtitle
    const subEl = card.querySelector('.profile-sub');
    if (subEl) subEl.textContent = `Lv.${level} \u2022 ${jobInfo.emoji} ${jobInfo.name}`;

    // Update status badge
    const badgeEl = card.querySelector('.status-badge');
    if (badgeEl) {
      badgeEl.className = `status-badge ${isOffline ? 'status-offline' : 'status-online'}`;
      badgeEl.innerHTML = isOffline ? '\u26ab OFFLINE' : '\ud83d\udfe2 ONLINE';
    }

    // Update badges
    const badgesEl = card.querySelector('.badges-section');
    if (badgesEl) badgesEl.innerHTML = this._renderBadges({ ...dbData, appearance, level });

    // Refresh the STR/AGI/INT numbers (level may be more accurate now).
    if (stats) {
      const setStat = (cls, v) => {
        const fill = card.querySelector(`.stat-bar-fill.${cls}`);
        if (fill) fill.setAttribute('data-val', v);
        const row = fill ? fill.closest('.stat-row') : null;
        const valEl = row ? row.querySelector('.stat-value') : null;
        if (valEl) valEl.textContent = v;
      };
      setStat('str', stats.str); setStat('agi', stats.agi); setStat('int', stats.int);
    }

    // Update stats bars (relative to this hero's top attribute)
    const bars2 = card.querySelectorAll('.stat-bar-fill');
    let maxVal2 = 1;
    bars2.forEach(b => { maxVal2 = Math.max(maxVal2, parseInt(b.getAttribute('data-val')) || 0); });
    bars2.forEach(bar => {
      const val = parseInt(bar.getAttribute('data-val')) || 0;
      bar.style.width = Math.max(8, Math.min((val / maxVal2) * 100, 100)) + '%';
    });

    // Update combat stat values
    const boxes = card.querySelectorAll('.combat-box');
    const values = [
      `${dbData?.hp || '???'}/${dbData?.max_hp || '???'}`,
      `${dbData?.sp || '???'}/${dbData?.max_sp || '???'}`,
      `+${dbData?.atk || 0}`,
      `+${dbData?.def || 0}`,
      `${dbData?.total_kills || 0}`,
      `${(dbData?.gold || 0).toLocaleString()}`,
      `${(dbData?.zol || 0).toLocaleString()}`,
      `${this._formatPlayTime(dbData?.play_time)}`,
    ];
    boxes.forEach((box, i) => {
      const valEl = box.querySelector('.combat-value');
      if (valEl && values[i]) valEl.textContent = values[i];
    });

    // Update equipment grid
    const equipGrid = card.querySelector('.equip-grid');
    if (equipGrid) equipGrid.innerHTML = this._renderEquipment(appearance);
  }

  _renderStatRow(label, value, className) {
    return `
      <div class="stat-row">
        <div class="stat-label">${label}</div>
        <div class="stat-bar-bg">
          <div class="stat-bar-fill ${className}" data-val="${value}"></div>
        </div>
        <div class="stat-value">${value}</div>
      </div>
    `;
  }

  _renderSkills(jobId) {
    const skillIds = JOBS[jobId]?.skills || [];
    if (skillIds.length === 0) return '<div style="font-size:11px; color:rgba(255,255,255,0.2)">No skills unlocked</div>';
    
    return skillIds.map(id => {
      const s = SKILLS[id];
      const name = s ? s.name : (id.charAt(0).toUpperCase() + id.slice(1));
      const emoji = s ? s.emoji : '🌀';
      return `<div class="skill-badge">${emoji} ${name}</div>`;
    }).join('');
  }

  _renderEquipment(appearance) {
    const slots = [
      { id: 'weapon', label: 'Weapon' },
      { id: 'shield', label: 'Shield' },
      { id: 'hat', label: 'Head' },
      { id: 'glasses', label: 'Eyes' },
      { id: 'body', label: 'Armor' },
      { id: 'garment', label: 'Garment' },
      { id: 'ring', label: 'Accessory' },
      { id: 'feet', label: 'Shoes' }
    ];

    return slots.map(slot => {
      let itemName = 'None';
      if (slot.id === 'weapon') itemName = appearance.weapon;
      else if (slot.id === 'shield') itemName = appearance.shield;
      else if (slot.id === 'hat') itemName = appearance.hat;
      else if (slot.id === 'glasses') itemName = appearance.glasses;
      else if (slot.id === 'body') itemName = appearance.gear?.body || appearance.gear?.armor || 'None';
      else itemName = appearance.gear?.[slot.id] || 'None';

      const isFilled = itemName && itemName !== 'None';
      const itemData = isFilled ? ITEMS[itemName] : null;
      const emoji = itemData?.emoji || '➖';
      const displayName = isFilled ? itemName : 'Empty';

      return `
        <div class="equip-item ${isFilled ? 'filled' : ''}">
          <div class="equip-emoji">${emoji}</div>
          <div class="equip-slot-label">${slot.label}</div>
          <div class="equip-name" title="${displayName}">${displayName}</div>
        </div>
      `;
    }).join('');
  }

  _renderBadges(data) {
    const badges = [];
    
    // Title Badge
    const title = data.appearance?.title || data.title;
    if (title) {
      badges.push(`<div class="badge badge-title">${title.replace(/_/g, ' ')}</div>`);
    }
    
    // Veteran Badge
    if (data.level >= 40) {
      badges.push('<div class="badge badge-veteran">Veteran</div>');
    }
    
    // Wealthy Badge
    if (data.gold >= 1000000) {
      badges.push('<div class="badge badge-wealthy">Wealthy</div>');
    }
    
    return badges.join('');
  }

  _formatPlayTime(seconds) {
    if (!seconds) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
}
