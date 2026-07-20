// Player Profile Modal — Beautiful profile display with real-time 3D avatar
// Shows player stats, skills, and equipment with premium styling

import { JobPreview } from '../engine/JobPreview.js';
import { JOBS, ITEMS, EQUIP_SLOTS, SKILLS } from '../engine/GameData.js';

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

      @media (max-width: 720px) {
        #player-profile-card {
          width: 96vw;
          max-height: 96vh;
        }
        .profile-main {
          flex-direction: column;
          overflow-y: auto;
        }
        .profile-left {
          flex: none;
          width: 100%;
        }
        .equip-grid {
          grid-template-columns: repeat(3, 1fr);
        }
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
    
    // Merge data: DB provides stats, liveAppearance provides current visuals
    const job = liveAppearance?.job || dbData?.job || 'Novice';
    const level = dbData?.level || liveAppearance?.level || player.level || 1;
    
    // STR/AGI/INT fallback logic
    const defaultStats = JOBS[job]?.stats || { str: 1, agi: 1, int: 1 };
    const stats = {
      str: dbData?.str || defaultStats.str,
      agi: dbData?.agi || defaultStats.agi,
      int: dbData?.int || defaultStats.int
    };

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
    const isOffline = player.isOffline || (player.userId.startsWith('guest_') && (!window.remotePlayersMap || !window.remotePlayersMap.has(player.userId)));

    card.innerHTML = `
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
                <span class="combat-label">Play Time</span>
                <span class="combat-value">${this._formatPlayTime(dbData?.play_time || 0)}</span>
              </div>
            </div>
            ${dbData?.last_map ? `
              <div style="margin-top:10px; font-size:11px; color:rgba(255,255,255,0.3); text-align:right;">
                Last seen: <span style="color:rgba(255,255,255,0.6)">${dbData.last_map.replace(/_/g, ' ')}</span>
              </div>
            ` : ''}
          </div>

          <div>
            <div class="section-title">Skills</div>
            <div class="skills-flex">
              ${this._renderSkills(job)}
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

    // Close button handler
    card.querySelector('.profile-x').onclick = () => this.hide();

    // Initialize 3D character preview
    this._init3DPreview(appearance);

    // Animate bars after a short delay
    setTimeout(() => {
      card.querySelectorAll('.stat-bar-fill').forEach(bar => {
        const val = parseInt(bar.getAttribute('data-val'));
        bar.style.width = Math.min((val / 10) * 100, 100) + '%';
      });
    }, 50);

    this.modal.style.display = 'flex';
  }

  hide() {
    this.modal.style.display = 'none';
    if (this.jobPreview) {
      this.jobPreview.stop();
      this.jobPreview.dispose();
      this.jobPreview = null;
    }
  }

  _init3DPreview(appearance) {
    const canvas = document.getElementById('player-profile-canvas');
    if (!canvas) return;

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
