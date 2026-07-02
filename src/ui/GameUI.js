// Game UI — HUD, panels, combat log, and all in-game UI
import { getExpRequired, ITEMS, SHOP_ITEMS, MONSTERS, PAYON_MONSTERS, WATER_MONSTERS, getAllMonsters } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, updateInventoryItemStats } from '../network/GameSync.js';

export class GameUI {
  constructor(character = null, soundManager = null) {
    this.gameScreen = document.getElementById('game-screen');
    this.combatLogEl = document.getElementById('combat-log-messages');
    this.maxLogMessages = 20;
    this.inventory = [];
    this.characterId = null;

    this.character = character;
    this.soundManager = soundManager;

    this.currentTab = 'all';
    this.selectedItemName = null;

    // NPC Shop state
    this.shopTab = 'buy';
    this.selectedShopItemName = null;

    // Profile Editor callback
    this.profileSaveCallback = null;

    this._setupPanels();
    this._setupROInventoryEvents();
    this._setupShopEvents();
    this._setupWiki();
    this._setupFriendSystem();
    this._setupChat();
    this._setupMinimap();
    this._setupProfileEditor();
  }

  show() {
    this.gameScreen.style.display = 'block';
  }

  hide() {
    this.gameScreen.style.display = 'none';
  }

  _setupPanels() {
    // Panel toggle buttons
    document.getElementById('btn-stats').addEventListener('click', () => this._togglePanel('stats-panel'));
    document.getElementById('btn-inventory').addEventListener('click', () => this._togglePanel('inventory-panel'));
    document.getElementById('btn-shop').addEventListener('click', () => {
      this._togglePanel('shop-panel');
      this._renderShop();
    });
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
      this._togglePanel('leaderboard-panel');
      this._refreshLeaderboard();
    });
    document.getElementById('btn-players-list').addEventListener('click', () => this._togglePanel('players-panel'));
    const btnWiki = document.getElementById('btn-wiki');
    if (btnWiki) {
      btnWiki.addEventListener('click', () => {
        this._togglePanel('wiki-panel');
        this._renderWiki();
      });
    }

    // Close buttons
    document.querySelectorAll('.panel-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('data-close');
        document.getElementById(panelId).style.display = 'none';
      });
    });
  }

  _setupROInventoryEvents() {
    // Filter tabs clicking
    const tabs = document.querySelectorAll('.inv-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.getAttribute('data-tab');
        this._renderInventory();
      });
    });

    // Use Item button clicking
    const useBtn = document.getElementById('btn-use-item');
    if (useBtn) {
      useBtn.addEventListener('click', () => {
        this._useSelectedItem();
      });
    }
  }

  _togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    // Close others
    document.querySelectorAll('.side-panel').forEach(p => {
      if (p.id !== panelId) p.style.display = 'none';
    });
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  // ============ HUD Updates ============
  updateHUD(stats) {
    // Name and level
    document.getElementById('hud-name').textContent = stats.name;
    document.getElementById('hud-level').textContent = stats.level;

    // HP bar
    const hpPct = Math.floor((stats.hp / stats.max_hp) * 100);
    document.getElementById('hp-fill').style.width = hpPct + '%';
    document.getElementById('hp-text').textContent = `${Math.floor(stats.hp)}/${stats.max_hp}`;

    // SP bar
    const spPct = Math.floor((stats.sp / stats.max_sp) * 100);
    document.getElementById('sp-fill').style.width = spPct + '%';
    document.getElementById('sp-text').textContent = `${Math.floor(stats.sp)}/${stats.max_sp}`;

    // EXP bar
    const expRequired = getExpRequired(stats.level);
    const expPct = Math.floor((stats.exp / expRequired) * 100);
    document.getElementById('exp-fill').style.width = expPct + '%';
    document.getElementById('exp-text').textContent = `${stats.exp}/${expRequired}`;

    // Kill counter
    document.getElementById('kill-count').textContent = stats.total_kills;

    // Gold
    document.getElementById('gold-amount').textContent = stats.gold.toLocaleString();
  }

  updateStats(stats) {
    const body = document.getElementById('stats-body');
    const expRequired = getExpRequired(stats.level);

    const hpPct = Math.min(100, Math.max(0, Math.floor((stats.hp / stats.max_hp) * 100)));
    const spPct = Math.min(100, Math.max(0, Math.floor((stats.sp / stats.max_sp) * 100)));
    const expPct = Math.min(100, Math.max(0, Math.floor((stats.exp / expRequired) * 100)));

    body.innerHTML = `
      <!-- Avatar & Basic Info Card -->
      <div class="stats-avatar-card">
        <div class="stats-avatar-wrapper">
          <span>🧙‍♂️</span>
          <div class="stats-level-badge">Lv.${stats.level}</div>
        </div>
        <div class="stats-meta">
          <div class="stats-meta-name">${stats.name}</div>
          <div class="stats-meta-time">⏱️ Play Time: ${this._formatTime(stats.play_time)}</div>
        </div>
      </div>

      <!-- Graphical Status Bars -->
      <div class="stats-bars-section">
        <!-- HP -->
        <div class="stats-bar-container">
          <div class="stats-bar-header">
            <span class="stats-bar-label">HP</span>
            <span class="stats-bar-val">${Math.floor(stats.hp)} / ${stats.max_hp}</span>
          </div>
          <div class="stats-bar-bg">
            <div class="stats-bar-fill hp" style="width: ${hpPct}%;"></div>
          </div>
        </div>

        <!-- SP -->
        <div class="stats-bar-container">
          <div class="stats-bar-header">
            <span class="stats-bar-label">SP</span>
            <span class="stats-bar-val">${Math.floor(stats.sp)} / ${stats.max_sp}</span>
          </div>
          <div class="stats-bar-bg">
            <div class="stats-bar-fill sp" style="width: ${spPct}%;"></div>
          </div>
        </div>

        <!-- EXP -->
        <div class="stats-bar-container">
          <div class="stats-bar-header">
            <span class="stats-bar-label">EXP</span>
            <span class="stats-bar-val">${stats.exp} / ${expRequired} (${expPct}%)</span>
          </div>
          <div class="stats-bar-bg">
            <div class="stats-bar-fill exp" style="width: ${expPct}%;"></div>
          </div>
        </div>
      </div>

      <!-- Stat Cards Grid -->
      <div class="stats-grid">
        <div class="stats-card atk">
          <div class="stats-card-header">
            <span class="stats-card-icon">⚔️</span>
            <span class="stats-card-title">Attack</span>
          </div>
          <div class="stats-card-value">${stats.atk}</div>
        </div>

        <div class="stats-card def">
          <div class="stats-card-header">
            <span class="stats-card-icon">🛡️</span>
            <span class="stats-card-title">Defense</span>
          </div>
          <div class="stats-card-value">${stats.def}</div>
        </div>

        <div class="stats-card kills">
          <div class="stats-card-header">
            <span class="stats-card-icon">💀</span>
            <span class="stats-card-title">Kills</span>
          </div>
          <div class="stats-card-value">${stats.total_kills.toLocaleString()}</div>
        </div>

        <div class="stats-card gold">
          <div class="stats-card-header">
            <span class="stats-card-icon">💰</span>
            <span class="stats-card-title">Gold</span>
          </div>
          <div class="stats-card-value">${stats.gold.toLocaleString()}</div>
        </div>
      </div>
    `;
  }

  _formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // ============ Inventory ============
  _enrichItem(item) {
    const meta = ITEMS[item.item_name];
    return {
      item_name: item.item_name,
      item_type: item.item_type || meta?.type || 'material',
      quantity: item.quantity,
      emoji: meta?.emoji || item.emoji || '📦',
      rarity: meta?.rarity || 'common',
      desc: meta?.desc || 'ไม่มีข้อมูลรายละเอียดสเตตัสเพิ่มเติมสำหรับไอเทมสไตล์ RO ชิ้นนี้',
      price: meta?.price || 10,
      healHp: meta?.healHp || 0,
      restoreSp: meta?.restoreSp || 0,
      stats: item.stats || {}
    };
  }

  _getItemDroppers(itemName) {
    const droppers = [];
    const allMons = getAllMonsters();
    Object.keys(allMons).forEach(mKey => {
      const m = allMons[mKey];
      if (m.loot) {
        const lootFound = m.loot.find(l => l.name === itemName);
        if (lootFound) {
          droppers.push({ name: m.name, emoji: m.emoji, chance: lootFound.chance });
        }
      }
    });
    return droppers;
  }

  async loadInventoryFromDB(characterId) {
    this.characterId = characterId;
    try {
      const rawInv = await loadInventory(characterId);
      this.inventory = rawInv.map(i => this._enrichItem(i));

      // Auto equip equipment on load if present in inventory
      const equippedWeapon = this.inventory.find(i => (i.item_type === 'weapon' || i.item_type === 'fishing_rod') && i.stats && i.stats.equipped === true);
      if (equippedWeapon && this.character) {
        this.character.equipWeapon(equippedWeapon.item_name);
      } else if (this.character) {
        this.character.equipWeapon(null);
      }

      const equippedArmor = this.inventory.find(i => i.item_type === 'armor' && i.stats && i.stats.equipped === true);
      if (equippedArmor && this.character) {
        this.character.equippedArmor = equippedArmor.item_name;
      } else if (this.character) {
        this.character.equippedArmor = null;
      }

      const equippedShield = this.inventory.find(i => i.item_type === 'shield' && i.stats && i.stats.equipped === true);
      if (equippedShield && this.character) {
        this.character.equippedShield = equippedShield.item_name;
      } else if (this.character) {
        this.character.equippedShield = null;
      }
    } catch (e) {
      console.error('Failed to load inventory:', e);
      this.inventory = [];
    }
    this._renderInventory();
  }

  async addItem(item) {
    // Check if already in local inventory
    const existing = this.inventory.find(i => i.item_name === item.name);
    if (existing) {
      existing.quantity++;
    } else {
      const newItem = {
        item_name: item.name,
        item_type: item.type,
        quantity: 1,
        emoji: item.emoji
      };
      this.inventory.push(this._enrichItem(newItem));
    }

    // Save to DB (fire and forget)
    if (this.characterId) {
      saveInventoryItem(this.characterId, item.name, item.type, 1).catch(() => { });
    }

    this._renderInventory();

    if (this.selectedItemName === item.name) {
      this._updateDetailBox();
    }
  }

  _renderInventory() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    // Filter based on tab
    let filtered = this.inventory;
    if (this.currentTab === 'usable') {
      filtered = this.inventory.filter(i => i.item_type === 'consumable');
    } else if (this.currentTab === 'equip') {
      filtered = this.inventory.filter(i => ['weapon', 'fishing_rod', 'armor', 'shield'].includes(i.item_type));
    } else if (this.currentTab === 'etc') {
      filtered = this.inventory.filter(i => i.item_type === 'material');
    }

    // Fill inventory slots
    const totalSlots = Math.max(25, filtered.length);
    for (let i = 0; i < totalSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';

      if (i < filtered.length) {
        const item = filtered[i];
        const isEquipped = item.stats && item.stats.equipped === true;
        if (isEquipped) {
          slot.classList.add('equipped');
        }
        if (item.rarity) {
          slot.classList.add(`rarity-${item.rarity}`);
        }

        slot.innerHTML = `
                  <span>${item.emoji}</span>
                  <span class="inv-qty">${item.quantity}</span>
                  ${isEquipped ? '<span class="inv-equipped-badge">E</span>' : ''}
                `;
        slot.title = `${item.item_name} x${item.quantity}${isEquipped ? ' (Equipped)' : ''}`;

        if (this.selectedItemName === item.item_name) {
          slot.classList.add('selected');
        }

        slot.addEventListener('click', () => {
          document.querySelectorAll('.inv-slot').forEach(s => s.classList.remove('selected'));
          slot.classList.add('selected');
          this.selectedItemName = item.item_name;
          this._updateDetailBox();
        });
      }

      grid.appendChild(slot);
    }

    this._updateDetailBox();
  }

  _updateDetailBox() {
    const placeholder = document.getElementById('detail-placeholder');
    const content = document.getElementById('detail-content');

    if (!this.selectedItemName) {
      placeholder.style.display = 'block';
      content.style.display = 'none';
      return;
    }

    const item = this.inventory.find(i => i.item_name === this.selectedItemName);
    if (!item || item.quantity <= 0) {
      this.selectedItemName = null;
      placeholder.style.display = 'block';
      content.style.display = 'none';
      return;
    }

    placeholder.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('detail-icon').textContent = item.emoji;
    const nameEl = document.getElementById('detail-name');
    nameEl.textContent = item.item_name;
    nameEl.className = 'detail-name';
    if (item.rarity) {
      nameEl.classList.add(`color-${item.rarity}`);
    }

    let typeStr = 'Etc. Item';
    if (item.item_type === 'consumable') {
      typeStr = 'Usable Item';
    } else if (item.item_type === 'weapon') {
      typeStr = 'Weapon';
    } else if (item.item_type === 'fishing_rod') {
      typeStr = 'Fishing Tool';
    } else if (item.item_type === 'armor') {
      typeStr = 'Armor';
    } else if (item.item_type === 'shield') {
      typeStr = 'Shield';
    }
    document.getElementById('detail-type').textContent = typeStr;
    const droppers = this._getItemDroppers(item.item_name);
    let droppedByHtml = '';
    if (droppers.length > 0) {
      droppedByHtml = `<br/><br/><strong style="color:var(--secondary)">👾 Dropped By / ได้จากมอนสเตอร์:</strong><br/>` + droppers.map(d => `${d.emoji} ${d.name} (${(d.chance * 100).toFixed(1)}%)`).join('<br/>');
    } else {
      droppedByHtml = `<br/><br/><strong style="color:var(--text-dim)">👾 Dropped By:</strong> ไม่ดรอปจากมอนสเตอร์ (NPC Shop หรืออื่นๆ)`;
    }
    document.getElementById('detail-desc').innerHTML = item.desc + droppedByHtml;
    document.getElementById('detail-price-val').textContent = item.price;

    const useBtn = document.getElementById('btn-use-item');
    if (item.item_type === 'consumable') {
      useBtn.style.display = 'block';
      useBtn.textContent = `ใช้งาน (x${item.quantity})`;
    } else if (['weapon', 'fishing_rod', 'armor', 'shield'].includes(item.item_type)) {
      useBtn.style.display = 'block';
      const isEquipped = item.stats && item.stats.equipped === true;
      useBtn.textContent = isEquipped ? 'ถอดออก' : 'สวมใส่';
    } else {
      useBtn.style.display = 'none';
    }
  }

  async _useSelectedItem() {
    if (!this.selectedItemName || !this.character) return;

    const itemIdx = this.inventory.findIndex(i => i.item_name === this.selectedItemName);
    if (itemIdx === -1) return;

    const item = this.inventory[itemIdx];

    if (['weapon', 'fishing_rod', 'armor', 'shield'].includes(item.item_type)) {
      await this._toggleEquipItem(item);
      return;
    }

    if (item.item_type !== 'consumable' || item.quantity <= 0) return;

    let used = false;
    if (item.healHp > 0) {
      if (this.character.stats.hp >= this.character.stats.max_hp) {
        this.addCombatLog('❌ พลังชีวิต (HP) ของคุณเต็มเปี่ยมอยู่แล้ว!', 'system');
        return;
      }
      this.character.heal(item.healHp);
      this.addCombatLog(`🥤 ใช้ ${item.emoji} ${item.item_name} ฟื้นฟู HP +${item.healHp}!`, 'heal');
      used = true;
    } else if (item.restoreSp > 0) {
      if (this.character.stats.sp >= this.character.stats.max_sp) {
        this.addCombatLog('❌ พลังเวทมนตร์ (SP) ของคุณเต็มเปี่ยมอยู่แล้ว!', 'system');
        return;
      }
      this.character.restoreSp(item.restoreSp);
      this.addCombatLog(`🥤 ใช้ ${item.emoji} ${item.item_name} ฟื้นฟู SP +${item.restoreSp}!`, 'heal');
      used = true;
    }

    if (used) {
      if (this.soundManager) {
        this.soundManager.playUseItemSound();
      }

      item.quantity--;

      // Decrement item count in DB
      if (this.characterId) {
        saveInventoryItem(this.characterId, item.item_name, item.item_type, -1).catch(() => { });
      }

      if (item.quantity <= 0) {
        this.inventory.splice(itemIdx, 1);
        this.selectedItemName = null;
      }

      this._renderInventory();
      this.updateHUD(this.character.stats);
      this.updateStats(this.character.stats);
    }
  }

  async _toggleEquipItem(item) {
    if (!this.character || !item) return;

    const isEquipped = item.stats && item.stats.equipped === true;

    if (isEquipped) {
      // Unequip
      item.stats.equipped = false;
      if (item.item_type === 'weapon' || item.item_type === 'fishing_rod') {
        this.character.equipWeapon(null);
      } else if (item.item_type === 'armor') {
        this.character.equippedArmor = null;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = null;
      }
      if (this.characterId) {
        await updateInventoryItemStats(this.characterId, item.item_name, {});
      }
      this.addCombatLog(`🛡️ ถอด ${item.emoji} ${item.item_name} ออกแล้ว`, 'system');
    } else {
      // Un-equip any currently equipped item of the SAME slot type
      for (const otherItem of this.inventory) {
        let isSameSlot = false;
        if ((item.item_type === 'weapon' || item.item_type === 'fishing_rod') && (otherItem.item_type === 'weapon' || otherItem.item_type === 'fishing_rod')) {
          isSameSlot = true;
        } else if (item.item_type === otherItem.item_type) {
          isSameSlot = true;
        }
        if (isSameSlot && otherItem.stats && otherItem.stats.equipped === true) {
          otherItem.stats.equipped = false;
          if (this.characterId) {
            await updateInventoryItemStats(this.characterId, otherItem.item_name, {});
          }
        }
      }

      // Equip new item
      if (!item.stats) item.stats = {};
      item.stats.equipped = true;
      if (item.item_type === 'weapon' || item.item_type === 'fishing_rod') {
        this.character.equipWeapon(item.item_name);
      } else if (item.item_type === 'armor') {
        this.character.equippedArmor = item.item_name;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = item.item_name;
      }

      if (this.characterId) {
        await updateInventoryItemStats(this.characterId, item.item_name, { equipped: true });
      }
      this.addCombatLog(`⚔️ สวมใส่ ${item.emoji} ${item.item_name} เพิ่มความแข็งแกร่ง!`, 'system');
    }

    if (this.soundManager) {
      this.soundManager.playUseItemSound();
    }

    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
  }

  // ============ Leaderboard ============
  async _refreshLeaderboard() {
    const body = document.getElementById('leaderboard-body');
    body.innerHTML = '<div style="text-align:center;color:var(--text-dim)">Loading...</div>';

    try {
      const data = await fetchLeaderboard();
      if (data.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:var(--text-dim)">No data yet</div>';
        return;
      }

      body.innerHTML = data.map((entry, i) => {
        const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        const username = entry.profiles?.username || 'Unknown';
        return `
          <div class="lb-row">
            <span class="lb-rank">${rankIcon}</span>
            <span class="lb-name">${entry.name} (${username})</span>
            <span class="lb-level">Lv.${entry.level} | 💀${entry.total_kills}</span>
          </div>
        `;
      }).join('');
    } catch (e) {
      body.innerHTML = '<div style="text-align:center;color:var(--accent)">Failed to load</div>';
    }
  }

  // ============ Online Players ============
  // ============ Online Players ============
  updateOnlinePlayers(players) {
    this.onlinePlayers = players || [];

    // Update auth screen count
    const authCount = document.getElementById('online-players-auth');
    if (authCount) authCount.textContent = this.onlinePlayers.length;

    // Update panel
    const body = document.getElementById('players-body');
    if (!body) return;

    if (this.onlinePlayers.length === 0) {
      body.innerHTML = '<div style="text-align:center;color:var(--text-dim)">No players online</div>';
      return;
    }

    body.innerHTML = this.onlinePlayers.map(p => {
      const isFriend = this.friends && this.friends.includes(p.username);
      const starHtml = isFriend ? '<span class="friend-star">⭐</span>' : '';
      return `
        <div class="player-row" data-username="${p.username}">
          <span class="online-dot"></span>
          <span>${p.username}${starHtml}</span>
          <span style="color:var(--text-dim);margin-left:auto">Lv.${p.level}</span>
        </div>
      `;
    }).join('');
  }

  // ============ Friend System Logic ============
  _setupFriendSystem() {
    this.friends = [];
    try {
      const stored = localStorage.getItem('zolos_friends');
      if (stored) {
        this.friends = JSON.parse(stored);
      }
    } catch (e) {
      console.error('[Zolos] Failed to parse friends list:', e);
    }

    const popup = document.getElementById('player-popup');
    const closeBtn = document.getElementById('btn-close-player-popup');
    const overlay = document.getElementById('player-popup-overlay');
    const addFriendBtn = document.getElementById('btn-add-friend');

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
      });
    }

    // Overlay click close
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
      });
    }

    // Click handler for player rows inside Online Players list using delegated events
    const body = document.getElementById('players-body');
    if (body) {
      body.addEventListener('click', (e) => {
        const row = e.target.closest('.player-row');
        if (!row) return;
        const targetUsername = row.getAttribute('data-username');
        if (!this.onlinePlayers) return;
        const player = this.onlinePlayers.find(p => p.username === targetUsername);
        if (player) {
          this._showPlayerPopup(player);
        }
      });
    }

    // Add friend action
    if (addFriendBtn) {
      addFriendBtn.addEventListener('click', () => {
        if (this.selectedProfilePlayer) {
          this._toggleFriend(this.selectedProfilePlayer.username);
        }
      });
    }
  }

  _showPlayerPopup(player) {
    this.selectedProfilePlayer = player;
    const popup = document.getElementById('player-popup');
    const popupName = document.getElementById('player-popup-name');
    const popupLevel = document.getElementById('player-popup-level');
    const addFriendBtn = document.getElementById('btn-add-friend');

    if (popupName) popupName.textContent = player.username;
    if (popupLevel) popupLevel.textContent = `Lv.${player.level}`;

    if (addFriendBtn) {
      // Don't allow friending yourself
      const myName = this.character && this.character.stats ? this.character.stats.name : '';
      if (player.username === myName) {
        addFriendBtn.textContent = '❌ You (Self)';
        addFriendBtn.style.opacity = '0.5';
        addFriendBtn.style.pointerEvents = 'none';
      } else {
        addFriendBtn.style.opacity = '1';
        addFriendBtn.style.pointerEvents = 'auto';
        const isFriend = this.friends.includes(player.username);
        addFriendBtn.innerHTML = isFriend ? '❌ Remove Friend' : '⭐ Add Friend';
      }
    }

    if (popup) popup.style.display = 'flex';
  }

  _toggleFriend(username) {
    const idx = this.friends.indexOf(username);
    if (idx === -1) {
      this.friends.push(username);
      this.addCombatLog(`⭐ เพิ่ม ${username} เป็นเพื่อนสำเสร็จ`, 'system');
    } else {
      this.friends.splice(idx, 1);
      this.addCombatLog(`💔 ลบ ${username} ออกจากรายชื่อเพื่อน`, 'system');
    }

    // Save
    localStorage.setItem('zolos_friends', JSON.stringify(this.friends));

    // Refresh Popup state
    if (this.selectedProfilePlayer && this.selectedProfilePlayer.username === username) {
      this._showPlayerPopup(this.selectedProfilePlayer);
    }

    // Refresh players list
    if (this.onlinePlayers) {
      this.updateOnlinePlayers(this.onlinePlayers);
    }
  }

  // ============ Chat System Logic ============
  _setupChat() {
    const btnToggle = document.getElementById('btn-chat-toggle');
    const btnClose = document.querySelector('[data-close="chat-panel"]');
    const chatPanel = document.getElementById('chat-panel');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this._togglePanel('chat-panel');
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (chatPanel) chatPanel.style.display = 'none';
      });
    }

    const sendMessage = () => {
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (!text) return;

      // Request broadcast
      if (this.chatSendCallback) {
        this.chatSendCallback(text);
      }
      chatInput.value = '';
      chatInput.focus();
    };

    if (sendBtn) {
      sendBtn.addEventListener('click', sendMessage);
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sendMessage();
        }
      });
    }
  }

  setupChatSendCallback(callback) {
    this.chatSendCallback = callback;
  }

  receiveChatMessage(username, message) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const row = document.createElement('div');
    row.className = 'chat-msg-row user';
    row.innerHTML = `
      <span class="chat-msg-username">[${username}]:</span>
      <span class="chat-msg-text">${message}</span>
    `;

    chatMessages.appendChild(row);

    // Auto scroll
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Also place in combat log if chat panel is closed
    const chatPanel = document.getElementById('chat-panel');
    const isClosed = !chatPanel || chatPanel.style.display === 'none';
    if (isClosed) {
      this.addCombatLog(`💬 ${username}: ${message}`, 'chat');
    }
  }

  // ============ Combat Log ============
  addCombatLog(message, type = 'system') {
    const el = document.createElement('div');
    el.className = `combat-msg ${type}`;
    el.textContent = message;
    this.combatLogEl.appendChild(el);

    // Limit messages
    while (this.combatLogEl.children.length > this.maxLogMessages) {
      this.combatLogEl.removeChild(this.combatLogEl.firstChild);
    }

    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (el.parentNode) {
        el.style.transition = 'opacity 0.5s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
      }
    }, 8000);
  }

  // ============ Profile Editor ============
  _setupProfileEditor() {
    const modal = document.getElementById('profile-editor-modal');
    const overlay = document.getElementById('profile-editor-overlay');
    const closeBtn = document.getElementById('btn-close-profile-editor');
    const saveBtn = document.getElementById('btn-save-profile');
    const cancelBtn = document.getElementById('btn-cancel-profile');
    const playerInfo = document.querySelector('.player-info');

    if (!modal || !playerInfo) return;

    // Helper: convert int hex to #rrggbb string
    const hexToStr = (h) => '#' + ('000000' + h.toString(16)).slice(-6);
    // Helper: convert #rrggbb string to int
    const strToHex = (s) => parseInt(s.replace('#', ''), 16);

    const openEditor = () => {
      // Populate current values
      const nameInput = document.getElementById('profile-edit-name');
      const shirtInput = document.getElementById('profile-edit-shirt');
      const pantsInput = document.getElementById('profile-edit-pants');
      const hairInput = document.getElementById('profile-edit-hair');
      const weaponSelect = document.getElementById('profile-edit-weapon');
      const hatSelect = document.getElementById('profile-edit-hat');
      const glassesSelect = document.getElementById('profile-edit-glasses');

      if (this.character) {
        if (nameInput) nameInput.value = this.character.stats?.name || '';
        if (shirtInput) shirtInput.value = hexToStr(this.character.bodyColor || 0x4060c0);
        if (pantsInput) pantsInput.value = hexToStr(this.character.pantsColor || 0x3a3a5a);
        if (hairInput) hairInput.value = hexToStr(this.character.hairColor || 0xc04040);

        // --- Dynamically populate weapon dropdown from inventory ---
        if (weaponSelect) {
          // Keep 'None' default, clear added options
          weaponSelect.innerHTML = '<option value="None">👊 None / มือเปล่า</option>';
          const weaponItems = (this.inventory || []).filter(i =>
            i.item_type === 'weapon' || i.item_type === 'fishing_rod'
          );
          const emojiMap = { 'Sword': '⚔️', 'Bow': '🏹', 'Gun': '🔫', 'Fishing Rod': '🎣', 'Katana': '⚔️', 'Crossbow': '🏹', 'Silver Dagger': '🗡️', 'Heavy Warhammer': '🔨', 'Excalibur': '🗡️', 'Rudra Bow': '🏹', 'Ragnarok Blade': '🔱', 'Novice Cutter': '🔪', 'Mage Staff': '🪄' };
          weaponItems.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i.item_name;
            const em = emojiMap[i.item_name] || '⚔️';
            opt.textContent = `${em} ${i.item_name}`;
            weaponSelect.appendChild(opt);
          });
          // Select current weapon
          const equippedWeapon = weaponItems.find(i => i.stats && i.stats.equipped === true);
          weaponSelect.value = equippedWeapon ? equippedWeapon.item_name : 'None';
        }

        // --- Dynamically populate hat dropdown from inventory ---
        if (hatSelect) {
          hatSelect.innerHTML = '<option value="None">❌ None / ไม่ใส่</option>';
          const hatEmojiMap = { 'Wizard Hat': '🧙', 'Crown': '👑', 'Cowboy Hat': '🤠' };
          const hatItems = (this.inventory || []).filter(i => i.item_type === 'hat');
          hatItems.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i.item_name;
            const em = hatEmojiMap[i.item_name] || '🎩';
            opt.textContent = `${em} ${i.item_name}`;
            hatSelect.appendChild(opt);
          });
          hatSelect.value = this.character.equippedHat || 'None';
        }

        // --- Dynamically populate glasses dropdown from inventory ---
        if (glassesSelect) {
          glassesSelect.innerHTML = '<option value="None">❌ None / ไม่ใส่</option>';
          const glassesEmojiMap = { 'Sunglasses': '🕶️', 'Classic Glasses': '👓' };
          const glassesItems = (this.inventory || []).filter(i => i.item_type === 'glasses');
          glassesItems.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i.item_name;
            const em = glassesEmojiMap[i.item_name] || '👓';
            opt.textContent = `${em} ${i.item_name}`;
            glassesSelect.appendChild(opt);
          });
          glassesSelect.value = this.character.equippedGlasses || 'None';
        }
      }

      modal.style.display = 'flex';
    };

    const closeEditor = () => {
      modal.style.display = 'none';
    };

    // Open on player-info click
    playerInfo.addEventListener('click', openEditor);

    // Close buttons
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);
    if (overlay) overlay.addEventListener('click', closeEditor);

    // Save & Apply
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const data = {
          name: document.getElementById('profile-edit-name')?.value.trim() || '',
          shirtColor: strToHex(document.getElementById('profile-edit-shirt')?.value || '#4060c0'),
          pantsColor: strToHex(document.getElementById('profile-edit-pants')?.value || '#3a3a5a'),
          hairColor: strToHex(document.getElementById('profile-edit-hair')?.value || '#c04040'),
          weapon: document.getElementById('profile-edit-weapon')?.value || 'Sword',
          hat: document.getElementById('profile-edit-hat')?.value || 'None',
          glasses: document.getElementById('profile-edit-glasses')?.value || 'None',
        };

        if (this.profileSaveCallback) {
          this.profileSaveCallback(data);
        }

        this.addCombatLog('✅ โปรไฟล์บันทึกสำเร็จ!', 'system');
        closeEditor();
      });
    }
  }

  setupProfileSaveCallback(callback) {
    this.profileSaveCallback = callback;
  }

  // ============ Auto Farm Button ============
  setupAutoFarmButton(callback) {
    const btn = document.getElementById('btn-auto-farm');
    btn.addEventListener('click', () => {
      const isActive = callback();
      btn.classList.toggle('active', isActive);
    });
  }

  setupLogoutButton(callback) {
    const btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
          callback();
        }
      });
    }
  }

  setAutoFarmState(active) {
    document.getElementById('btn-auto-farm').classList.toggle('active', active);
  }

  // ============ Fishing Button ============
  setupFishingButton(callback) {
    const btn = document.getElementById('btn-fishing');
    if (btn) {
      btn.addEventListener('click', () => {
        callback();
      });
    }
  }

  setFishingButtonVisible(visible) {
    const btn = document.getElementById('btn-fishing');
    if (btn) btn.style.display = visible ? 'flex' : 'none';
  }

  setFishingState(active) {
    const btn = document.getElementById('btn-fishing');
    if (btn) {
      btn.classList.toggle('active', active);
      const textEl = btn.querySelector('.fishing-text');
      if (textEl) textEl.textContent = active ? 'STOP' : 'FISH';
    }
  }

  // ============ Kafra Shop Logic ============
  _setupShopEvents() {
    // Tab switching
    const tabs = document.querySelectorAll('.shop-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.shopTab = tab.getAttribute('data-tab');
        this.selectedShopItemName = null;
        this._renderShop();
      });
    });

    // Action button (Buy / Sell)
    const actionBtn = document.getElementById('btn-shop-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => this._performShopAction());
    }
  }

  _renderShop() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Update gold display
    const goldDisplay = document.getElementById('shop-gold-amount');
    if (goldDisplay && this.character) {
      goldDisplay.textContent = this.character.stats.gold;
    }

    if (this.shopTab === 'buy') {
      // Render buyable list
      SHOP_ITEMS.forEach(shopItem => {
        const itemInfo = ITEMS[shopItem.name];
        if (!itemInfo) return;

        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        if (this.selectedShopItemName === shopItem.name) {
          slot.classList.add('selected');
        }
        slot.innerHTML = `
          <div class="slot-icon">${itemInfo.emoji}</div>
          <div class="slot-quantity" style="font-size:7px;background:rgba(0,0,0,0.7);">z${shopItem.price}</div>
        `;
        slot.addEventListener('click', () => {
          this.selectedShopItemName = shopItem.name;
          this._renderShop();
          this._updateShopDetailBox(shopItem.name, 'buy', shopItem.price);
        });
        grid.appendChild(slot);
      });
    } else {
      // Render sellable inventory (Any etc/usable item)
      if (this.inventory.length === 0) {
        grid.innerHTML = '<div style="grid-column:span 4;text-align:center;color:var(--text-dim);font-size:9px;padding:20px 0;">No items to sell</div>';
      }
      this.inventory.forEach(item => {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        if (this.selectedShopItemName === item.item_name) {
          slot.classList.add('selected');
        }
        const sellPrice = Math.floor(item.price * 0.5); // Sell at 50% value
        slot.innerHTML = `
          <div class="slot-icon">${item.emoji}</div>
          <div class="slot-quantity">x${item.quantity}</div>
        `;
        slot.addEventListener('click', () => {
          this.selectedShopItemName = item.item_name;
          this._renderShop();
          this._updateShopDetailBox(item.item_name, 'sell', sellPrice);
        });
        grid.appendChild(slot);
      });
    }

    // sync placeholder
    if (!this.selectedShopItemName) {
      document.getElementById('shop-detail-placeholder').style.display = 'block';
      document.getElementById('shop-detail-content').style.display = 'none';
    }
  }

  _updateShopDetailBox(itemName, type, price) {
    const registryItem = ITEMS[itemName];
    if (!registryItem) return;

    document.getElementById('shop-detail-placeholder').style.display = 'none';
    const content = document.getElementById('shop-detail-content');
    content.style.display = 'flex';

    document.getElementById('shop-detail-icon').textContent = registryItem.emoji;
    document.getElementById('shop-detail-name').textContent = itemName;

    const priceEl = document.getElementById('shop-detail-price');
    priceEl.textContent = `${type === 'buy' ? 'Buy Price' : 'Sell Value'}: ${price} Zeny`;

    const droppers = this._getItemDroppers(itemName);
    let droppedByHtml = '';
    if (droppers.length > 0) {
      droppedByHtml = `<br/><br/><strong style="color:var(--secondary)">👾 Dropped By / ได้จากมอนสเตอร์:</strong><br/>` + droppers.map(d => `${d.emoji} ${d.name} (${(d.chance * 100).toFixed(1)}%)`).join('<br/>');
    } else {
      droppedByHtml = `<br/><br/><strong style="color:var(--text-dim)">👾 Dropped By:</strong> ไม่ดรอปจากมอนสเตอร์ (NPC Shop หรืออื่นๆ)`;
    }
    document.getElementById('shop-detail-desc').innerHTML = (registryItem.desc || 'No description.') + droppedByHtml;

    const actionBtn = document.getElementById('btn-shop-action');
    actionBtn.textContent = type === 'buy' ? '💸 Buy Item' : '💰 Sell Item';
  }

  async _performShopAction() {
    if (!this.selectedShopItemName || !this.character) return;

    const itemName = this.selectedShopItemName;
    const itemRegistry = ITEMS[itemName];
    if (!itemRegistry) return;

    if (this.shopTab === 'buy') {
      const shopItem = SHOP_ITEMS.find(i => i.name === itemName);
      if (!shopItem) return;

      const price = shopItem.price;
      if (this.character.stats.gold < price) {
        this.addCombatLog('❌ เงิน Zeny ไม่เพียงพอสำหรับการสั่งซื้อ!', 'system');
        if (this.soundManager) this.soundManager.playErrorSound?.(); // Fallback to avoid error
        return;
      }

      // Deduct gold
      this.character.stats.gold -= price;

      // Add to local inventory state
      const existing = this.inventory.find(i => i.item_name === itemName);
      if (existing) {
        existing.quantity++;
      } else {
        this.inventory.push({
          item_name: itemName,
          item_type: itemRegistry.type,
          emoji: itemRegistry.emoji,
          desc: itemRegistry.desc,
          price: itemRegistry.price,
          healHp: itemRegistry.healHp || 0,
          restoreSp: itemRegistry.restoreSp || 0,
          quantity: 1,
          stats: {}
        });
      }

      // Sync and log
      this.addCombatLog(`🛒 ซื้อ ${itemRegistry.emoji} ${itemName} สำเร็จ (-${price} Zeny)`, 'system');
      if (this.soundManager) this.soundManager.playBuySellSound ? this.soundManager.playBuySellSound() : this.soundManager.playUseItemSound();

      if (this.characterId) {
        saveInventoryItem(this.characterId, itemName, itemRegistry.type, 1).catch(() => { });
        // Trigger character database save for gold
        if (this.character.saveStatsToDatabase) {
          this.character.saveStatsToDatabase().catch(() => { });
        }
      }

    } else {
      // Sell action
      const itemIdx = this.inventory.findIndex(i => i.item_name === itemName);
      if (itemIdx === -1) return;

      const item = this.inventory[itemIdx];
      if (item.quantity <= 0) return;

      const sellPrice = Math.floor(item.price * 0.5);

      // Add gold
      this.character.stats.gold += sellPrice;

      // Update quantity
      item.quantity--;
      if (item.quantity <= 0) {
        this.inventory.splice(itemIdx, 1);
        this.selectedShopItemName = null;
      }

      this.addCombatLog(`💰 ขาย ${item.emoji} ${itemName} ได้รับ +${sellPrice} Zeny`, 'system');
      if (this.soundManager) this.soundManager.playBuySellSound ? this.soundManager.playBuySellSound() : this.soundManager.playUseItemSound();

      if (this.characterId) {
        saveInventoryItem(this.characterId, itemName, item.item_type, -1).catch(() => { });
        if (this.character.saveStatsToDatabase) {
          this.character.saveStatsToDatabase().catch(() => { });
        }
      }
    }

    // Refresh displays
    this._renderShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
  }

  // ============ Skill HUD Updates ============
  updateSkillCooldown(skillId, currentCooldown, maxCooldown) {
    const overlay = document.getElementById(`cooldown-${skillId}`);
    if (!overlay) return;

    if (currentCooldown <= 0) {
      overlay.style.height = '0%';
    } else {
      const percentage = (currentCooldown / maxCooldown) * 100;
      overlay.style.height = `${percentage}%`;
    }
  }

  setupSkillClicks(callback) {
    const slots = document.querySelectorAll('.skill-slot');
    slots.forEach(slot => {
      slot.addEventListener('click', () => {
        const skillId = slot.getAttribute('data-skill');
        callback(skillId);
      });
    });
  }

  // ============ Wiki Panel Control & Render ============
  _setupWiki() {
    // Select tabs
    document.querySelectorAll('.wiki-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.wiki-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentWikiTab = tab.getAttribute('data-tab');
        this.selectedWikiItem = null;
        this._renderWikiList();
      });
    });

    // Search events
    const searchInput = document.getElementById('wiki-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._renderWikiList();
      });
    }

    this.currentWikiTab = 'monsters';
    this.selectedWikiItem = null;
  }

  _renderWiki() {
    this._renderWikiList();
    this._renderWikiDetail();
  }

  _renderWikiList() {
    const listContainer = document.getElementById('wiki-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const query = (document.getElementById('wiki-search-input')?.value || '').toLowerCase().trim();

    if (this.currentWikiTab === 'monsters') {
      const allMons = getAllMonsters();
      Object.keys(allMons).forEach(key => {
        const monster = allMons[key];
        const match = key.toLowerCase().includes(query) || monster.name.toLowerCase().includes(query);
        if (!match) return;

        const slot = document.createElement('div');
        slot.className = 'wiki-slot';
        if (monster.waterOnly) slot.classList.add('water-monster');
        if (this.selectedWikiItem === key) {
          slot.classList.add('selected');
        }
        slot.innerHTML = `
          <span class="wiki-slot-emoji">${monster.emoji || '👾'}</span>
          <span class="wiki-slot-name">${monster.name}</span>
        `;
        slot.title = monster.name;
        slot.addEventListener('click', () => {
          this.selectedWikiItem = key;
          this._renderWikiList();
          this._renderWikiDetail();
        });
        listContainer.appendChild(slot);
      });
    } else {
      Object.keys(ITEMS).forEach(key => {
        const item = ITEMS[key];
        const match = key.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query);
        if (!match) return;

        const slot = document.createElement('div');
        slot.className = 'wiki-slot';
        if (item.rarity) slot.classList.add(`rarity-${item.rarity}`);
        if (this.selectedWikiItem === key) {
          slot.classList.add('selected');
        }
        slot.innerHTML = `
          <span class="wiki-slot-emoji">${item.emoji || '📦'}</span>
          <span class="wiki-slot-name">${key}</span>
        `;
        slot.title = key;
        slot.addEventListener('click', () => {
          this.selectedWikiItem = key;
          this._renderWikiList();
          this._renderWikiDetail();
        });
        listContainer.appendChild(slot);
      });
    }

    if (!this.selectedWikiItem) {
      document.getElementById('wiki-detail-placeholder').style.display = 'block';
      document.getElementById('wiki-detail-content').style.display = 'none';
    }
  }

  _renderWikiDetail() {
    const placeholder = document.getElementById('wiki-detail-placeholder');
    const content = document.getElementById('wiki-detail-content');

    if (!this.selectedWikiItem) {
      placeholder.style.display = 'block';
      content.style.display = 'none';
      return;
    }

    placeholder.style.display = 'none';
    content.style.display = 'block';

    const key = this.selectedWikiItem;

    if (this.currentWikiTab === 'monsters') {
      const allMons = getAllMonsters();
      const monster = allMons[key];
      if (!monster) return;

      // Determine map area
      let mapArea = 'Prontera Field';
      if (PAYON_MONSTERS[key]) mapArea = 'Payon Forest';
      else if (WATER_MONSTERS[key]) mapArea = 'Water Zone 🌊';

      // Find drop items details
      let dropHtml = '';
      if (monster.loot && monster.loot.length > 0) {
        dropHtml = `<div class="wiki-section-title">🎁 Loot Drops / อัตราดรอป:</div><div class="wiki-drops-list">`;
        monster.loot.forEach(lootInfo => {
          const itemMeta = ITEMS[lootInfo.name];
          const emoji = itemMeta?.emoji || lootInfo.emoji || '📦';
          const rarity = itemMeta?.rarity || 'common';
          const pct = (lootInfo.chance * 100).toFixed(1);
          dropHtml += `
            <div class="wiki-drop-item">
              <span class="color-${rarity}">${emoji} ${lootInfo.name}</span>
              <span style="color:#20e060">${pct}%</span>
            </div>
          `;
        });
        dropHtml += `</div>`;
      } else {
        dropHtml = `<div class="wiki-section-title">🎁 Loot Drops:</div><div style="font-size:11px;color:var(--text-dim)">No drops</div>`;
      }

      // Calculate an approximate level based on stats since it's not explicitly in DB
      const approxLevel = Math.max(1, Math.floor(monster.hp / 20) + Math.floor(monster.atk / 4));
      const goldText = (typeof monster.gold === 'object') ? (monster.gold.min + ' - ' + monster.gold.max) : monster.gold;

      const envDict = {
        water: 'Water Zone / แหล่งน้ำ 🌊',
        ground: 'Main Land / พื้นดิน 🏜️',
        cave: 'Cave / ในถ้ำ 🪨',
        mountain: 'Mountain / ภูเขา 🏔️'
      };
      const envName = envDict[monster.environment] || monster.environment || 'Unknown';
      content.innerHTML = `
        <div class="detail-row">
          <span class="detail-icon" style="background:${monster.color}22">${monster.emoji || '👾'}</span>
          <div class="detail-info-block">
            <div class="wiki-detail-title">${monster.name}</div>
            <div class="detail-type" style="color:#ff6080">Monster (Lv.${approxLevel})</div>
          </div>
        </div>
        <div class="detail-desc" style="margin-top:8px">
          HP: ${monster.hp} | ATK: ${monster.atk} | DEF: ${monster.def}<br />
          EXP Gain: ${monster.exp} | Zeny: ${goldText}<br />
          Area: ${mapArea}<br />
          Environment: ${envName}
        </div>
        ${dropHtml}
      `;
    } else {
      const item = ITEMS[key];
      if (!item) return;

      // Equip stats details
      let statsHtml = '';
      if (item.atkBonus || item.defBonus || item.hpBonus || item.spBonus) {
        statsHtml = `<div class="wiki-section-title">📊 Equipment Bonuses / โบนัสสเตตัส:</div><div class="detail-desc">`;
        if (item.atkBonus) statsHtml += `⚔️ ATK Bonus: +${item.atkBonus}<br />`;
        if (item.defBonus) statsHtml += `🛡️ DEF Bonus: +${item.defBonus}<br />`;
        if (item.hpBonus) statsHtml += `💚 HP Bonus: +${item.hpBonus}<br />`;
        if (item.spBonus) statsHtml += `💙 SP Bonus: +${item.spBonus}<br />`;
        statsHtml += `</div>`;
      }

      // Check who drops this item
      let droppedByHtml = '';
      const droppers = this._getItemDroppers(key);

      if (droppers.length > 0) {
        droppedByHtml = `<div class="wiki-section-title">👾 Dropped By / ได้จากมอนสเตอร์:</div><div class="wiki-drops-list">`;
        droppers.forEach(d => {
          droppedByHtml += `
            <div class="wiki-drop-item">
              <span>${d.emoji} ${d.name}</span>
              <span style="color:#60a0ff">${(d.chance * 100).toFixed(1)}%</span>
            </div>
          `;
        });
        droppedByHtml += `</div>`;
      }

      content.innerHTML = `
        <div class="detail-row">
          <span class="detail-icon">${item.emoji || '📦'}</span>
          <div class="detail-info-block">
            <div class="wiki-detail-title color-${item.rarity || 'common'}">${key}</div>
            <div class="detail-type color-${item.rarity || 'common'}">${item.type.toUpperCase()} (${item.rarity || 'common'})</div>
          </div>
        </div>
        <div class="detail-desc" style="margin-top:8px">
          ${item.desc}<br />
          <span style="color:#d0d040">Zeny Price: ${item.price}z</span>
        </div>
        ${statsHtml}
        ${droppedByHtml}
      `;
    }
  }

  _setupMinimap() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCoords = document.getElementById('minimap-coords');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
  }

  updateMinimap(playerPos, monsters, portals, npc, remotePlayersMap, currentMap) {
    if (!this.minimapCanvas || !this.minimapCtx || !playerPos) return;

    const canvas = this.minimapCanvas;
    const ctx = this.minimapCtx;
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    // Update coordinate text overlay
    if (this.minimapCoords) {
      this.minimapCoords.textContent = `X: ${Math.round(playerPos.x)}, Z: ${Math.round(playerPos.z)}`;
    }

    ctx.clearRect(0, 0, width, height);

    // Save state for circular clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
    ctx.clip();

    // Map base scales: World size is 70x70 (-35 to +35)
    // Scale: pixels per game world unit (zoom level)
    const scale = 2.8;
    const px = playerPos.x;
    const pz = playerPos.z;

    // 1. Draw Ground
    ctx.fillStyle = currentMap === 'payon' ? '#5a4a2a' : '#3a7a3a';
    ctx.fillRect(0, 0, width, height);

    // 2. Cave Zone (x < -6 && z < -6)
    // Draw it in world coordinates translated to canvas
    // Cave zone extends from -35 to -6 on x and z
    const caveX1 = cx + (-35 - px) * scale;
    const caveZ1 = cy + (-35 - pz) * scale;
    const caveX2 = cx + (-6 - px) * scale;
    const caveZ2 = cy + (-6 - pz) * scale;

    ctx.fillStyle = 'rgba(20, 20, 30, 0.85)';
    ctx.fillRect(caveX1, caveZ1, caveX2 - caveX1, caveZ2 - caveZ1);

    // 3. Mountain Zone (x > 6 && z > 6)
    // Mountain zone extends from 6 to 35 on x and z
    const mtX1 = cx + (6 - px) * scale;
    const mtZ1 = cy + (6 - pz) * scale;
    const mtX2 = cx + (35 - px) * scale;
    const mtZ2 = cy + (35 - pz) * scale;

    ctx.fillStyle = 'rgba(100, 95, 90, 0.45)';
    ctx.fillRect(mtX1, mtZ1, mtX2 - mtX1, mtZ2 - mtZ1);

    // 4. Winding River
    // Render the river by drawing connected segments in the visible viewport
    ctx.beginPath();
    let first = true;
    const viewWidthUnits = width / scale;
    const xStart = Math.max(-35, px - viewWidthUnits / 2 - 2);
    const xEnd = Math.min(35, px + viewWidthUnits / 2 + 2);

    for (let rx = xStart; rx <= xEnd; rx += 1.0) {
      const rz = Math.sin(rx * 0.08) * 10 - 2;
      const dx = rx - px;
      const dz = rz - pz;
      const tx = cx + dx * scale;
      const ty = cy + dz * scale;

      if (first) {
        ctx.moveTo(tx, ty);
        first = false;
      } else {
        ctx.lineTo(tx, ty);
      }
    }
    ctx.strokeStyle = currentMap === 'payon' ? '#254e40' : '#2d6d9d';
    ctx.lineWidth = 5.5 * scale; // Width represents our 5.5 units riverbed size
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 5. Wooden Bridge (centered at x = 0, z = -2, x from -1.8 to 1.8, z from -10 to 6)
    const bridgeX1 = cx + (-1.8 - px) * scale;
    const bridgeZ1 = cy + (-10 - pz) * scale;
    const bridgeWidth = 3.6 * scale;
    const bridgeHeight = 16 * scale;

    ctx.fillStyle = '#7a5a3a'; // Brown wood planks color
    ctx.fillRect(bridgeX1, bridgeZ1, bridgeWidth, bridgeHeight);

    // Draw bridge lines/borders
    ctx.strokeStyle = '#5a3d24';
    ctx.lineWidth = 1;
    ctx.strokeRect(bridgeX1, bridgeZ1, bridgeWidth, bridgeHeight);

    // 6. Draw Portals
    if (portals && portals.length > 0) {
      portals.forEach(portal => {
        const pos = portal.position;
        if (!pos) return;
        const dx = pos.x - px;
        const dz = pos.z - pz;
        const tx = cx + dx * scale;
        const ty = cy + dz * scale;

        // Pulsing outer ripple
        const pulse = 4 + Math.sin(Date.now() * 0.01) * 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 225, 255, 0.3)';
        ctx.fill();

        // Portal core
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00e1ff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // 7. Draw NPC
    if (npc) {
      const pos = npc.position;
      if (pos) {
        const dx = pos.x - px;
        const dz = pos.z - pz;
        const tx = cx + dx * scale;
        const ty = cy + dz * scale;

        ctx.beginPath();
        ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe040';
        ctx.fill();
        ctx.strokeStyle = '#120a02';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw small shop symbol
        ctx.fillStyle = '#120a02';
        ctx.font = 'bold 5px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', tx, ty);
      }
    }

    // 8. Draw Monsters
    if (monsters && monsters.length > 0) {
      monsters.forEach(m => {
        if (!m.alive) return;
        const mPos = m.getPosition();
        if (!mPos) return;

        const dx = mPos.x - px;
        const dz = mPos.z - pz;
        const tx = cx + dx * scale;
        const ty = cy + dz * scale;

        const isBoss = m.type === 'ghostring' || (m.data && m.data.hp >= 500);

        if (isBoss) {
          // Boss outer glow ring
          ctx.beginPath();
          ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 64, 64, 0.25)';
          ctx.fill();
          ctx.strokeStyle = '#ff3333';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Boss core dot
          ctx.beginPath();
          ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ff0030';
          ctx.fill();
        } else {
          // Regular monster dot
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ff4d4d'; // bright red
          ctx.fill();
          ctx.strokeStyle = '#601010';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });
    }

    // 9. Draw Remote Players
    if (remotePlayersMap) {
      for (const remotePlayer of remotePlayersMap.values()) {
        const mesh = remotePlayer.mesh;
        if (!mesh) continue;
        const rPos = mesh.position;
        if (!rPos) continue;

        const dx = rPos.x - px;
        const dz = rPos.z - pz;
        const tx = cx + dx * scale;
        const ty = cy + dz * scale;

        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#2ecc71'; // bright green
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Restore clipping mask
    ctx.restore();

    // 10. Draw Player Dot AT CENTER (always centered)
    const pulseFactor = 0.3 + 0.3 * Math.sin(Date.now() * 0.007);
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5 + pulseFactor * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#00aeff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

