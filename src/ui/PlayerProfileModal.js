// Player Profile Modal — Beautiful profile display for other players
// Shows 3D character model, stats, skills, and equipped items

export class PlayerProfileModal {
  constructor() {
    this.currentPlayer = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.characterModel = null;
    this.animationId = null;
    this._createModal();
  }

  _createModal() {
    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'player-profile-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(4px);
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 30, 60, 0.95) 0%, rgba(30, 40, 80, 0.95) 100%);
      border: 2px solid rgba(100, 150, 255, 0.3);
      border-radius: 16px;
      padding: 24px;
      max-width: 900px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    `;

    // Left side: 3D character
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
    `;

    const canvas3d = document.createElement('canvas');
    canvas3d.id = 'player-profile-canvas';
    canvas3d.style.cssText = `
      width: 100%;
      height: 300px;
      background: radial-gradient(circle at 50% 30%, rgba(100, 150, 255, 0.1), rgba(0, 0, 0, 0.5));
      border: 1px solid rgba(100, 150, 255, 0.2);
      border-radius: 12px;
    `;

    const playerNameEl = document.createElement('div');
    playerNameEl.id = 'player-profile-name';
    playerNameEl.style.cssText = `
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      text-align: center;
    `;

    const playerJobEl = document.createElement('div');
    playerJobEl.id = 'player-profile-job';
    playerJobEl.style.cssText = `
      font-size: 14px;
      color: rgba(255, 255, 255, 0.7);
      text-align: center;
      margin-bottom: 8px;
    `;

    leftPanel.appendChild(canvas3d);
    leftPanel.appendChild(playerNameEl);
    leftPanel.appendChild(playerJobEl);

    // Right side: Stats and info
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
      max-height: 400px;
      padding-right: 8px;
    `;
    rightPanel.id = 'player-profile-right';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 100, 100, 0.2);
      color: #fff;
      font-size: 20px;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => {
      closeBtn.style.background = 'rgba(255, 100, 100, 0.4)';
    };
    closeBtn.onmouseout = () => {
      closeBtn.style.background = 'rgba(255, 100, 100, 0.2)';
    };
    closeBtn.onclick = () => this.hide();

    container.appendChild(leftPanel);
    container.appendChild(rightPanel);
    container.appendChild(closeBtn);
    modal.appendChild(container);
    document.body.appendChild(modal);

    this.modal = modal;
    this.canvas3d = canvas3d;
    this.playerNameEl = playerNameEl;
    this.playerJobEl = playerJobEl;
    this.rightPanel = rightPanel;
  }

  show(player, characterData) {
    this.currentPlayer = player;
    this.modal.style.display = 'flex';

    // Update basic info
    this.playerNameEl.textContent = player.username;
    this.playerJobEl.textContent = `Lv.${player.level} • ${this._getJobName(characterData?.job)}`;

    // Render stats and skills
    this._renderStats(characterData);
    this._renderSkills(characterData);
    this._renderEquipment(characterData);

    // Initialize 3D view
    this._init3DView(characterData);
  }

  hide() {
    this.modal.style.display = 'none';
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
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

  _renderStats(data) {
    if (!data) return;

    const statsHtml = `
      <div style="background: rgba(100, 150, 255, 0.1); border: 1px solid rgba(100, 150, 255, 0.2); border-radius: 10px; padding: 12px;">
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; font-weight: 600;">⚔️ พลังพื้นฐาน</div>
        
        <div style="display: grid; gap: 8px; margin-bottom: 12px;">
          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #ff6b6b; font-weight: 600;">STR</span>
              <span style="color: #fff;">${data.str || 0}</span>
            </div>
            <div style="height: 6px; background: rgba(255, 107, 107, 0.2); border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min((data.str || 0) / 20 * 100, 100)}%; background: linear-gradient(90deg, #ff6b6b, #ff8787); border-radius: 3px;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #51cf66; font-weight: 600;">AGI</span>
              <span style="color: #fff;">${data.agi || 0}</span>
            </div>
            <div style="height: 6px; background: rgba(81, 207, 102, 0.2); border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min((data.agi || 0) / 20 * 100, 100)}%; background: linear-gradient(90deg, #51cf66, #69db7c); border-radius: 3px;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #4c6ef5; font-weight: 600;">INT</span>
              <span style="color: #fff;">${data.int || 0}</span>
            </div>
            <div style="height: 6px; background: rgba(76, 110, 245, 0.2); border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min((data.int || 0) / 20 * 100, 100)}%; background: linear-gradient(90deg, #4c6ef5, #748ffc); border-radius: 3px;"></div>
            </div>
          </div>
        </div>
      </div>

      <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.2); border-radius: 10px; padding: 12px;">
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; font-weight: 600;">📊 สถิติการต่อสู้</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="background: rgba(255, 255, 255, 0.05); padding: 8px; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6);">HP</div>
            <div style="font-size: 14px; font-weight: 700; color: #ff6b6b;">${data.hp || 0}/${data.max_hp || 0}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.05); padding: 8px; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6);">SP</div>
            <div style="font-size: 14px; font-weight: 700; color: #4c6ef5;">${data.sp || 0}/${data.max_sp || 0}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.05); padding: 8px; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6);">ATK</div>
            <div style="font-size: 14px; font-weight: 700; color: #ff8787;">+${data.atk || 0}</div>
          </div>
          <div style="background: rgba(255, 255, 255, 0.05); padding: 8px; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6);">DEF</div>
            <div style="font-size: 14px; font-weight: 700; color: #51cf66;">+${data.def || 0}</div>
          </div>
        </div>
      </div>
    `;

    this.rightPanel.innerHTML = statsHtml;
  }

  _renderSkills(data) {
    if (!data || !data.skills || data.skills.length === 0) return;

    const skillsHtml = `
      <div style="background: rgba(200, 150, 255, 0.1); border: 1px solid rgba(200, 150, 255, 0.2); border-radius: 10px; padding: 12px;">
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; font-weight: 600;">✨ สกิลที่ติดตั้ง</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          ${data.skills.map(skill => `
            <div style="background: rgba(255, 255, 255, 0.05); padding: 8px; border-radius: 6px; border-left: 3px solid rgba(200, 150, 255, 0.5); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
              <div style="font-size: 12px; font-weight: 600; color: #fff;">${skill.name}</div>
              <div style="font-size: 10px; color: rgba(255, 255, 255, 0.6);">Lv. ${skill.level || 1}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.rightPanel.innerHTML += skillsHtml;
  }

  _renderEquipment(data) {
    if (!data) return;

    const equipmentHtml = `
      <div style="background: rgba(100, 200, 255, 0.1); border: 1px solid rgba(100, 200, 255, 0.2); border-radius: 10px; padding: 12px;">
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; font-weight: 600;">🎽 อุปกรณ์ที่สวมใส่</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          ${this._renderEquipmentSlot('weapon', data.weapon, '⚔️')}
          ${this._renderEquipmentSlot('hat', data.hat, '🎩')}
          ${this._renderEquipmentSlot('shield', data.shield, '🛡️')}
          ${this._renderEquipmentSlot('armor', data.armor, '🎽')}
          ${this._renderEquipmentSlot('glasses', data.glasses, '👓')}
          ${this._renderEquipmentSlot('ring', data.ring, '💍')}
        </div>
      </div>
    `;

    this.rightPanel.innerHTML += equipmentHtml;
  }

  _renderEquipmentSlot(slotName, itemName, icon) {
    const hasItem = itemName && itemName !== 'None';
    return `
      <div style="background: rgba(255, 255, 255, ${hasItem ? '0.08' : '0.03'}); padding: 8px; border-radius: 6px; text-align: center; border: 1px solid rgba(100, 200, 255, ${hasItem ? '0.3' : '0.1'});">
        <div style="font-size: 18px; margin-bottom: 4px;">${icon}</div>
        <div style="font-size: 10px; color: rgba(255, 255, 255, 0.6); margin-bottom: 2px;">${slotName}</div>
        <div style="font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${hasItem ? itemName : '-'}</div>
      </div>
    `;
  }

  _init3DView(data) {
    // Placeholder for 3D character view
    // In a real implementation, this would use Three.js to render the character
    const canvas = this.canvas3d;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Draw a simple placeholder
    ctx.fillStyle = 'rgba(100, 150, 255, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw job icon
    const jobEmoji = this._getJobEmoji(data?.job);
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(jobEmoji, canvas.width / 2, canvas.height / 2);

    // Draw level badge
    ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
    ctx.beginPath();
    ctx.arc(canvas.width - 30, 30, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffc107';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`Lv.${data?.level || 1}`, canvas.width - 30, 35);
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
}
