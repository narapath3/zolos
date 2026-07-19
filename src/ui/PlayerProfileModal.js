// Player Profile Modal — Beautiful profile display with real-time 3D avatar
// Shows player stats, skills, and equipment with premium styling

import { JobPreview } from '../engine/JobPreview.js';

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
        width: min(800px, 96vw);
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        background: linear-gradient(180deg, #151b30, #0d1120);
        border: 1px solid rgba(240, 192, 64, 0.35);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        overflow: hidden;
      }

      .profile-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.2);
        background: linear-gradient(90deg, rgba(240, 192, 64, 0.14), transparent);
      }

      .profile-head h2 {
        font-size: 17px;
        color: #fff;
        text-shadow: 0 0 14px rgba(240, 192, 64, 0.5);
        margin: 0;
        font-weight: 800;
      }

      .profile-head .sub {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 3px;
      }

      .profile-x {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(100, 150, 255, 0.2);
        color: rgba(255, 255, 255, 0.5);
        width: 36px;
        height: 36px;
        border-radius: 9px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        transition: all 0.2s;
      }

      .profile-x:hover {
        background: rgba(255, 100, 100, 0.2);
        border-color: rgba(255, 100, 100, 0.4);
        color: #ff6b6b;
      }

      .profile-main {
        display: flex;
        gap: 16px;
        padding: 16px 18px;
        overflow-y: auto;
        min-height: 0;
      }

      .profile-left {
        flex: 0 0 45%;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      #player-profile-canvas {
        width: 100%;
        height: 280px;
        border-radius: 14px;
        border: 1px solid rgba(100, 150, 255, 0.2);
        display: block;
        background: radial-gradient(circle at 50% 32%, rgba(96, 130, 210, 0.28), rgba(10, 14, 28, 0.55) 70%);
      }

      .profile-title {
        text-align: center;
        padding: 8px;
      }

      .profile-title .n {
        font-size: 18px;
        font-weight: 800;
        color: #fff;
      }

      .profile-title .level-job {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 4px;
      }

      .profile-title .job-emoji {
        font-size: 14px;
        color: var(--primary, #f0c040);
      }

      .profile-right {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
      }

      .stat-section {
        background: rgba(100, 150, 255, 0.08);
        border: 1px solid rgba(100, 150, 255, 0.2);
        border-radius: 12px;
        padding: 12px;
      }

      .stat-section-title {
        font-size: 9px;
        letter-spacing: 0.5px;
        color: var(--primary, #f0c040);
        margin-bottom: 8px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .stat-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }

      .stat-row:last-child {
        margin-bottom: 0;
      }

      .stat-row .lbl {
        width: 64px;
        font-size: 11px;
        font-weight: 800;
        color: #fff;
      }

      .stat-bar {
        flex: 1;
        height: 12px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      .stat-bar > i {
        display: block;
        height: 100%;
        border-radius: 6px;
        transition: width 0.3s;
      }

      .stat-bar.str > i {
        background: linear-gradient(90deg, #ff6b6b, #ff8787);
      }

      .stat-bar.agi > i {
        background: linear-gradient(90deg, #51cf66, #69db7c);
      }

      .stat-bar.int > i {
        background: linear-gradient(90deg, #4c6ef5, #748ffc);
      }

      .stat-row .val {
        width: 28px;
        text-align: right;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.7);
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }

      .stat-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 8px;
      }

      .stat-box {
        background: rgba(255, 255, 255, 0.05);
        padding: 8px;
        border-radius: 6px;
        text-align: center;
        border: 1px solid rgba(100, 150, 255, 0.1);
      }

      .stat-box .label {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 2px;
      }

      .stat-box .value {
        font-size: 13px;
        font-weight: 700;
        color: #fff;
      }

      .stat-box.hp .value { color: #ff6b6b; }
      .stat-box.sp .value { color: #4c6ef5; }
      .stat-box.atk .value { color: #ff8787; }
      .stat-box.def .value { color: #51cf66; }
      .stat-box.kills .value { color: #ffc107; }
      .stat-box.gold .value { color: #ffd24a; }

      .mod-pill {
        display: inline-block;
        font-size: 10px;
        font-weight: 800;
        border-radius: 16px;
        padding: 3px 9px;
        margin: 3px 4px 0 0;
        border: 1px solid transparent;
      }

      .mod-up {
        color: #57e08a;
        background: rgba(64, 224, 128, 0.14);
        border-color: rgba(64, 224, 128, 0.32);
      }

      .mod-dn {
        color: #ff8098;
        background: rgba(255, 96, 128, 0.14);
        border-color: rgba(255, 96, 128, 0.32);
      }

      .skill-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: #cfe6ff;
        background: rgba(90, 140, 220, 0.14);
        border: 1px solid rgba(120, 170, 230, 0.3);
        border-radius: 20px;
        padding: 3px 9px;
        margin: 3px 4px 0 0;
      }

      .equip-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .equip-slot {
        text-align: center;
        padding: 8px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(100, 200, 255, 0.2);
        transition: all 0.2s;
      }

      .equip-slot:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(100, 200, 255, 0.4);
      }

      .equip-slot .icon {
        font-size: 18px;
        margin-bottom: 4px;
      }

      .equip-slot .slot-name {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 2px;
      }

      .equip-slot .item-name {
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 800;
        border-radius: 16px;
        padding: 4px 10px;
        margin-top: 4px;
        border: 1px solid transparent;
      }

      .status-online {
        color: #57e08a;
        background: rgba(64, 224, 128, 0.14);
        border-color: rgba(64, 224, 128, 0.32);
      }

      .status-offline {
        color: rgba(255, 255, 255, 0.5);
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.1);
      }

      @media (max-width: 680px) {
        .profile-main {
          flex-direction: column;
        }
        .profile-left {
          flex: none;
        }
        #player-profile-canvas {
          height: 240px;
        }
        #player-profile-card {
          max-height: calc(100dvh - 116px);
        }
        #player-profile-modal {
          align-items: flex-start;
          padding: 8px 8px 108px;
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
  }

  show(player, characterData) {
    this.currentPlayer = player;
    const card = document.getElementById('player-profile-card');
    
    const jobEmoji = this._getJobEmoji(characterData?.job);
    const jobName = this._getJobName(characterData?.job);

    card.innerHTML = `
      <div class="profile-head">
        <div>
          <h2>🎖️ โปรไฟล์ผู้เล่น</h2>
          <div class="sub">ดูข้อมูลสถิติและอุปกรณ์ของผู้เล่น</div>
        </div>
        <button class="profile-x">✕</button>
      </div>

      <div class="profile-main">
        <div class="profile-left">
          <canvas id="player-profile-canvas"></canvas>
          <div class="profile-title">
            <div class="n">${player.username}</div>
            <div class="level-job">
              Lv.${player.level} • <span class="job-emoji">${jobEmoji}</span> ${jobName}
            </div>
            <div class="status-badge ${player.isOffline ? 'status-offline' : 'status-online'}">
              ${player.isOffline ? '⚫ ออฟไลน์' : '🟢 ออนไลน์'}
            </div>
          </div>
        </div>

        <div class="profile-right">
          ${this._renderStats(characterData)}
          ${this._renderCombatStats(characterData)}
          ${this._renderModifiers(characterData)}
          ${this._renderSkills(characterData)}
          ${this._renderEquipment(characterData)}
        </div>
      </div>
    `;

    // Close button handler
    card.querySelector('.profile-x').onclick = () => this.hide();

    // Initialize 3D character preview
    this._init3DPreview(characterData);

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

  _init3DPreview(data) {
    const canvas = document.getElementById('player-profile-canvas');
    if (!canvas) return;

    // Dispose old preview
    if (this.jobPreview) {
      this.jobPreview.dispose();
      this.jobPreview = null;
    }

    // Create new preview
    this.jobPreview = new JobPreview(canvas);
    if (data && data.job) {
      this.jobPreview.setJob(data.job);
    }
    this.jobPreview.start();
  }

  _renderStats(data) {
    if (!data) return '';

    const stats = [
      { label: 'STR', value: data.str || 0, max: 20, class: 'str' },
      { label: 'AGI', value: data.agi || 0, max: 20, class: 'agi' },
      { label: 'INT', value: data.int || 0, max: 20, class: 'int' }
    ];

    const statsHtml = stats.map(stat => {
      const percent = Math.min((stat.value / stat.max) * 100, 100);
      return `
        <div class="stat-row">
          <div class="lbl">${stat.label}</div>
          <div class="stat-bar ${stat.class}">
            <i style="width: ${percent}%"></i>
          </div>
          <div class="val">${stat.value}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="stat-section">
        <div class="stat-section-title">⚔️ พลังพื้นฐาน</div>
        ${statsHtml}
      </div>
    `;
  }

  _renderCombatStats(data) {
    if (!data) return '';

    return `
      <div class="stat-section">
        <div class="stat-section-title">📊 สถิติการต่อสู้</div>
        <div class="stat-grid">
          <div class="stat-box hp">
            <div class="label">HP</div>
            <div class="value">${data.hp || 0}/${data.max_hp || 0}</div>
          </div>
          <div class="stat-box sp">
            <div class="label">SP</div>
            <div class="value">${data.sp || 0}/${data.max_sp || 0}</div>
          </div>
          <div class="stat-box atk">
            <div class="label">ATK</div>
            <div class="value">+${data.atk || 0}</div>
          </div>
          <div class="stat-box def">
            <div class="label">DEF</div>
            <div class="value">+${data.def || 0}</div>
          </div>
          <div class="stat-box kills">
            <div class="label">Kills</div>
            <div class="value">${(data.total_kills || 0).toLocaleString()}</div>
          </div>
          <div class="stat-box gold">
            <div class="label">Zeny</div>
            <div class="value">${(data.gold || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
    `;
  }

  _renderModifiers(data) {
    if (!data) return '';

    const mods = [];
    if (data.hp_mod) mods.push(`<span class="mod-pill ${data.hp_mod > 0 ? 'mod-up' : 'mod-dn'}">HP ${data.hp_mod > 0 ? '+' : ''}${data.hp_mod}%</span>`);
    if (data.def_mod) mods.push(`<span class="mod-pill ${data.def_mod > 0 ? 'mod-up' : 'mod-dn'}">DEF ${data.def_mod > 0 ? '+' : ''}${data.def_mod}%</span>`);
    if (data.atk_mod) mods.push(`<span class="mod-pill ${data.atk_mod > 0 ? 'mod-up' : 'mod-dn'}">ATK ${data.atk_mod > 0 ? '+' : ''}${data.atk_mod}%</span>`);
    if (data.sp_mod) mods.push(`<span class="mod-pill ${data.sp_mod > 0 ? 'mod-up' : 'mod-dn'}">SP ${data.sp_mod > 0 ? '+' : ''}${data.sp_mod}%</span>`);

    if (mods.length === 0) return '';

    return `
      <div class="stat-section">
        <div class="stat-section-title">⚡ ค่าต่อสู้เทียบสายกลาง</div>
        <div style="line-height: 1.8;">${mods.join('')}</div>
      </div>
    `;
  }

  _renderSkills(data) {
    if (!data || !data.skills || data.skills.length === 0) return '';

    const skillsHtml = data.skills.map(skill => 
      `<span class="skill-pill">✨ ${skill.name}</span>`
    ).join('');

    return `
      <div class="stat-section">
        <div class="stat-section-title">✨ สกิลที่ติดตั้ง</div>
        <div style="line-height: 1.8;">${skillsHtml}</div>
      </div>
    `;
  }

  _renderEquipment(data) {
    if (!data) return '';

    const slots = [
      { name: 'weapon', icon: '⚔️', label: 'Weapon' },
      { name: 'hat', icon: '🎩', label: 'Hat' },
      { name: 'shield', icon: '🛡️', label: 'Shield' },
      { name: 'armor', icon: '🎽', label: 'Armor' },
      { name: 'glasses', icon: '👓', label: 'Glasses' },
      { name: 'ring', icon: '💍', label: 'Ring' }
    ];

    const equipHtml = slots.map(slot => {
      const item = data[slot.name];
      const hasItem = item && item !== 'None';
      return `
        <div class="equip-slot">
          <div class="icon">${slot.icon}</div>
          <div class="slot-name">${slot.label}</div>
          <div class="item-name">${hasItem ? item : '-'}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="stat-section">
        <div class="stat-section-title">🎽 อุปกรณ์ที่สวมใส่</div>
        <div class="equip-grid">${equipHtml}</div>
      </div>
    `;
  }

  _getJobEmoji(job) {
    const emojis = {
      'swordsman': '⚔️',
      'mage': '🔮',
      'archer': '🏹',
      'priest': '✨'
    };
    return emojis[job] || '🎮';
  }

  _getJobName(job) {
    const jobs = {
      'swordsman': '⚔️ นักดาบ',
      'mage': '🔮 จอมเวทย์',
      'archer': '🏹 นักธนู',
      'priest': '✨ พระ'
    };
    return jobs[job] || job || 'ผู้เล่น';
  }
}
