import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, GLAST_MONSTERS, MJOLNIR_MONSTERS, ABYSS_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS, SKILLS } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats, getDeterministicGuestName, isPlaceholderName, sendTradeRequestPacket, sendTradeResponsePacket, sendTradeCancelPacket, executeDecentralizedSenderTrade, executeDecentralizedReceiverTrade, sendFriendRequestPacket, sendFriendResponsePacket } from '../network/GameSync.js';


export class GameUI {
  constructor(character = null, soundManager = null, combatSystem = null) {
    this.gameScreen = document.getElementById('game-screen');
    this.combatLogEl = document.getElementById('combat-log-messages');
    this.maxLogMessages = 20;
    this.inventory = [];
    this.characterId = null;

    this.character = character;
    this.soundManager = soundManager;
    this.combatSystem = combatSystem;
    this.particles = null;

    this.currentTab = 'all';
    this.selectedItemName = null;

    // Leaderboard category state
    this.leaderboardCategory = 'level';
    // Online panel view state
    this.onlineView = 'global';

    // P2P Market state
    this.marketTab = 'buy';
    this.selectedMarketItem = null;

    // Profile Editor callback
    this.profileSaveCallback = null;

    // Shop state
    this.currentShopTab = 'all';
    this.selectedShopItem = null;

    // Sell Shop state
    this.selectedSellShopItem = null;

    this._setupPanels();
    this._setupROInventoryEvents();
    this._setupShopEvents();
    this._setupSellShopEvents();
    this._setupMarketEvents();
    this._setupWiki();
    this._setupFriendSystem();
    this._setupChat();
    this._setupMinimap();
    this._setupProfileEditor();
    this._setupLeaderboardTabs();
    this._setupOnlineTabs();
    this._setupAutoBot();
    this._setupTargetIndicator();
    this._setupTradePanel();
    this._setupMobileControls();
    this._setupDailyQuests();
    window.gameUI = this;
  }

  _setupTargetIndicator() {
    this.targetIndicator = document.getElementById('target-indicator');
    this.targetName = document.getElementById('target-name');
    this.targetHpFill = document.getElementById('target-hp-fill');
    this.currentTargetMonster = null;
  }

  updateTargetIndicator(sceneManager) {
    if (!this.targetIndicator || !sceneManager) return;

    // Determine target: priority to hover, then locked target
    let target = null;
    if (this.hoveredMonster) {
      target = this.hoveredMonster;
    } else if (this.character && this.character.targetMonster) {
      target = this.character.targetMonster;
    }

    if (!target || !target.alive) {
      this.targetIndicator.style.display = 'none';
      this.currentTargetMonster = null;
      return;
    }

    this.currentTargetMonster = target;
    this.targetIndicator.style.display = 'block';

    // Update position
    const screenPos = sceneManager.worldToScreen(target.mesh.position);
    this.targetIndicator.style.left = `${screenPos.x}px`;
    this.targetIndicator.style.top = `${screenPos.y}px`;

    // Update info
    if (this.targetName) this.targetName.textContent = target.data.name;
    if (this.targetHpFill) {
      const hpPercent = (target.hp / target.maxHp) * 100;
      this.targetHpFill.style.width = `${hpPercent}%`;
    }
  }

  _setupAutoBot() {
    const autoBtn = document.getElementById('btn-auto-farm');
    if (autoBtn) {
      autoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.combatSystem) {
          if (this.combatSystem.isFishing) {
            this.addCombatLog("🚫 ไม่สามารถเปิดบอทขณะตกปลาได้", 'system');
            return;
          }
          const isAuto = this.combatSystem.toggleAutoFarm();
          this.setAutoFarmState(isAuto);
          this.setFishingState(false);
          this.addCombatLog(isAuto ? "🤖 Auto-Bot system activated!" : "🤖 Auto-Bot system deactivated.", 'system');
        }
      });
    }

    const fishingBtn = document.getElementById('btn-fishing');
    if (fishingBtn) {
      fishingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.combatSystem) {
          const isFishing = this.combatSystem.toggleFishing();
          this.setFishingState(isFishing);
          this.setAutoFarmState(false);
          // Step 5: Update fishing button label
          const textEl = fishingBtn.querySelector('.fishing-text');
          if (textEl) textEl.textContent = isFishing ? 'STOP' : 'FISH';
          this.addCombatLog(isFishing ? "🎣 Fishing mode activated!" : "🎣 Fishing mode deactivated.", 'system');
        }
      });
    }
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



    const btnMarket = document.getElementById('btn-market');
    if (btnMarket) {
      btnMarket.addEventListener('click', () => {
        this._togglePanel('market-panel');
        this._renderMarket();
      });
    }
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
      this._togglePanel('leaderboard-panel');
      this._refreshLeaderboard();
    });
    document.getElementById('btn-players-list').addEventListener('click', () => this._togglePanel('players-panel'));

    const btnAdmin = document.getElementById('btn-admin');
    if (btnAdmin) {
      btnAdmin.addEventListener('click', () => {
        if (window.adminUI) {
          window.adminUI.toggle();
          this.updateMobileControlsVisibility();
        }
      });
    }

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
        this.updateMobileControlsVisibility();
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
    this.updateMobileControlsVisibility();
  }

  updateMobileControlsVisibility() {
    let anyPanelOpen = false;

    // Check side panels
    document.querySelectorAll('.side-panel').forEach(p => {
      const display = p.style.display || window.getComputedStyle(p).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    });

    // Check modal popups (profile editor, player profile popup, etc.)
    document.querySelectorAll('.modal-popup').forEach(m => {
      const display = m.style.display || window.getComputedStyle(m).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    });

    // Check admin panel
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
      const display = adminPanel.style.display || window.getComputedStyle(adminPanel).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    if (anyPanelOpen) {
      document.body.classList.add('panels-open');
    } else {
      document.body.classList.remove('panels-open');
    }
  }

  // ============ Map Name Update ============
  setMapName(mapName) {
    const el = document.getElementById('map-name');
    if (el) el.textContent = mapName;
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
          <div class="stats-meta-uid">UID: #${this.characterId ? this.characterId.split('_').pop().substring(0, 8).toUpperCase() : 'N/A'}</div>
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
        if (equippedWeapon.item_type === 'fishing_rod') {
          this.setFishingButtonVisible(true);
        }
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

      const equippedHat = this.inventory.find(i => i.item_type === 'hat' && i.stats && i.stats.equipped === true);
      if (equippedHat && this.character) {
        this.character.setHat(equippedHat.item_name);
      } else if (this.character) {
        this.character.setHat(null);
      }

      const equippedGlasses = this.inventory.find(i => i.item_type === 'glasses' && i.stats && i.stats.equipped === true);
      if (equippedGlasses && this.character) {
        this.character.setGlasses(equippedGlasses.item_name);
      } else if (this.character) {
        this.character.setGlasses(null);
      }

      // Already handled weapon restoration above
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
      filtered = this.inventory.filter(i => ['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses'].includes(i.item_type));
    } else if (this.currentTab === 'etc') {
      filtered = this.inventory.filter(i => i.item_type === 'material');
    } else if (this.currentTab === 'fish') {
      filtered = this.inventory.filter(i => i.item_type === 'fish');
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
        slot.classList.add(`rarity-${item.rarity || 'common'}`);

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
    } else if (item.item_type === 'fish') {
      typeStr = 'Fish';
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
    } else if (['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses'].includes(item.item_type)) {
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

    if (['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses'].includes(item.item_type)) {
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

      this.incrementQuestProgress('consume', item.item_name);

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
        // Step 5: Fishing rod unequipped
        if (item.item_name === 'Fishing Rod') {
          this.setFishingButtonVisible(false);
        }
      } else if (item.item_type === 'armor') {
        this.character.equippedArmor = null;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = null;
      } else if (item.item_type === 'hat') {
        this.character.setHat(null);
      } else if (item.item_type === 'glasses') {
        this.character.setGlasses(null);
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
        // Step 5: Fishing rod equipped
        if (item.item_name === 'Fishing Rod') {
          this.setFishingButtonVisible(true);
        } else {
          this.setFishingButtonVisible(false);
        }
      } else if (item.item_type === 'armor') {
        this.character.equippedArmor = item.item_name;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = item.item_name;
      } else if (item.item_type === 'hat') {
        this.character.setHat(item.item_name);
      } else if (item.item_type === 'glasses') {
        this.character.setGlasses(item.item_name);
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
  _setupLeaderboardTabs() {
    const tabs = document.querySelectorAll('.lb-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.leaderboardCategory = tab.getAttribute('data-category');
        this._refreshLeaderboard();
      });
    });
  }

  async _refreshLeaderboard() {
    const body = document.getElementById('leaderboard-body');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px">Loading...</div>';

    try {
      const data = await fetchLeaderboard(this.leaderboardCategory);
      if (!data || data.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px">No data yet</div>';
        return;
      }

      const cat = this.leaderboardCategory;
      body.innerHTML = data.map((entry, i) => {
        const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        const username = (entry.name && !isPlaceholderName(entry.name))
          ? entry.name
          : (entry.profiles?.username && !isPlaceholderName(entry.profiles.username)
            ? entry.profiles.username
            : getDeterministicGuestName(entry.user_id || entry.name || `entry_${i}`));
        let valueText = '';
        if (cat === 'level') valueText = `Lv.${entry.level} | 💀${entry.total_kills ?? 0}`;
        else if (cat === 'gold') valueText = `💰 ${(entry.gold ?? 0).toLocaleString()} Zeny`;
        else if (cat === 'kills') valueText = `💀 ${(entry.total_kills ?? 0).toLocaleString()} Kills`;
        else if (cat === 'playtime') valueText = `⏱️ ${this._formatTime(entry.play_time ?? 0)}`;
        return `
          <div class="lb-row">
            <span class="lb-rank">${rankIcon}</span>
            <span class="lb-name">${username}</span>
            <span class="lb-level">${valueText}</span>
          </div>
        `;
      }).join('');
    } catch (e) {
      body.innerHTML = '<div style="text-align:center;color:var(--accent);padding:20px">Failed to load</div>';
    }
  }

  // ============ Online Players ============
  _setupOnlineTabs() {
    const tabs = document.querySelectorAll('.online-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.onlineView = tab.getAttribute('data-view');
        this._renderOnlinePlayers();
      });
    });
  }

  updateOnlinePlayers(players) {
    this.onlinePlayers = players || [];

    // Update auth screen count
    const authCount = document.getElementById('online-players-auth');
    if (authCount) authCount.textContent = this.onlinePlayers.length;

    this._renderOnlinePlayers();
  }

  _renderOnlinePlayers() {
    const body = document.getElementById('players-body');
    if (!body) return;

    const friends = this.friends || [];
    let list = this.onlinePlayers || [];

    if (this.onlineView === 'friends') {
      list = list.filter(p => friends.includes(p.username));
    }

    if (list.length === 0) {
      const emptyMsg = this.onlineView === 'friends'
        ? 'ยังไม่มีเพื่อนออนไลน์ — แตะชื่อผู้เล่นใน Global เพื่อเพิ่มเพื่อน'
        : 'No players online';
      body.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:10px">${emptyMsg}</div>`;
      return;
    }

    // Header
    let html = `<div class="online-count-badge">${this.onlineView === 'friends' ? '⭐' : '🌐'} ${list.length} ${this.onlineView === 'friends' ? 'friends' : 'players'} online</div>`;

    html += list.map(p => {
      const isFriend = friends.includes(p.username);
      const starHtml = isFriend ? '<span class="friend-star">⭐</span>' : '';
      return `
        <div class="player-row" data-username="${p.username}">
          <span class="online-dot"></span>
          <span>${p.username}${starHtml}</span>
          <span class="player-level-badge">Lv.${p.level}</span>
        </div>
      `;
    }).join('');

    body.innerHTML = html;
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
        this.updateMobileControlsVisibility();
      });
    }

    // Overlay click close
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
        this.updateMobileControlsVisibility();
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
          this._toggleFriend(this.selectedProfilePlayer);
        }
      });
    }

    // Trade action from profile popup
    const popupTradeBtn = document.getElementById('btn-popup-trade');
    if (popupTradeBtn) {
      popupTradeBtn.addEventListener('click', () => {
        if (this.selectedProfilePlayer) {
          if (popup) popup.style.display = 'none';
          this.updateMobileControlsVisibility();
          this.openTradePanel(this.selectedProfilePlayer);
        }
      });
    }

    // Friend request confirmation modal buttons
    this.activeIncomingFriendRequest = null;
    const friendModal = document.getElementById('friend-confirm-modal');
    const friendOverlay = document.getElementById('friend-confirm-overlay');
    const btnAcceptFriend = document.getElementById('btn-accept-friend');
    const btnDeclineFriend = document.getElementById('btn-decline-friend');
    const btnCloseFriendConfirm = document.getElementById('btn-close-friend-confirm');

    const closeFriendModal = () => {
      if (friendModal) friendModal.style.display = 'none';
      this.activeIncomingFriendRequest = null;
      this.updateMobileControlsVisibility();
    };

    if (btnCloseFriendConfirm) btnCloseFriendConfirm.addEventListener('click', closeFriendModal);
    if (friendOverlay) friendOverlay.addEventListener('click', closeFriendModal);

    if (btnAcceptFriend) {
      btnAcceptFriend.addEventListener('click', () => {
        this._acceptIncomingFriendRequest();
      });
    }
    if (btnDeclineFriend) {
      btnDeclineFriend.addEventListener('click', () => {
        this._declineIncomingFriendRequest();
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

    const popupTradeBtn = document.getElementById('btn-popup-trade');
    if (popupTradeBtn) {
      const myName = this.character && this.character.stats ? this.character.stats.name : '';
      if (player.username === myName) {
        popupTradeBtn.style.display = 'none';
      } else {
        popupTradeBtn.style.display = 'block';
      }
    }

    if (popup) {
      popup.style.display = 'flex';
      this.updateMobileControlsVisibility();
    }
  }

  _toggleFriend(player) {
    const username = player.username;
    const isFriend = this.friends.includes(username);

    if (isFriend) {
      // Remove friend instantly (no confirmation needed from other side)
      const idx = this.friends.indexOf(username);
      this.friends.splice(idx, 1);
      this.addCombatLog(`💔 ลบ ${username} ออกจากรายชื่อเพื่อน`, 'system');
      localStorage.setItem('zolos_friends', JSON.stringify(this.friends));

      // Refresh Popup state
      if (this.selectedProfilePlayer && this.selectedProfilePlayer.username === username) {
        this._showPlayerPopup(this.selectedProfilePlayer);
      }
      // Refresh players list
      if (this.onlinePlayers) {
        this.updateOnlinePlayers(this.onlinePlayers);
      }
    } else {
      // Send friend request — requires confirmation from the other player
      const myName = this.character && this.character.stats ? this.character.stats.name : 'Unknown';
      const myLevel = this.character && this.character.stats ? this.character.stats.level : 1;
      const targetUserId = player.userId || player.user_id || username;

      const addFriendBtn = document.getElementById('btn-add-friend');
      if (addFriendBtn) {
        addFriendBtn.innerHTML = '⌛ Pending...';
        addFriendBtn.style.opacity = '0.6';
        addFriendBtn.style.pointerEvents = 'none';
      }

      sendFriendRequestPacket(myName, myLevel, targetUserId, username);
      this.addCombatLog(`✉️ ส่งคำขอเป็นเพื่อนไปยัง ${username} แล้ว`, 'system');
    }
  }

  receiveFriendRequest(payload) {
    if (!payload) return;
    this.activeIncomingFriendRequest = payload;

    const nameEl = document.getElementById('friend-confirm-sender-name');
    const levelEl = document.getElementById('friend-confirm-sender-level');
    const modal = document.getElementById('friend-confirm-modal');

    if (nameEl) nameEl.textContent = payload.senderName || 'Unknown';
    if (levelEl) levelEl.textContent = `Lv.${payload.senderLevel || '?'}`;
    if (modal) modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
    this.addCombatLog(`📩 ${payload.senderName} ส่งคำขอเป็นเพื่อนมาหาคุณ!`, 'system');
  }

  _acceptIncomingFriendRequest() {
    const req = this.activeIncomingFriendRequest;
    if (!req) return;

    // Add sender to our friends list
    if (!this.friends.includes(req.senderName)) {
      this.friends.push(req.senderName);
      localStorage.setItem('zolos_friends', JSON.stringify(this.friends));
    }

    // Send response back to sender
    const myUserId = this.character && this.character.userId ? this.character.userId : req.targetUserId;
    sendFriendResponsePacket(req.senderUserId, myUserId, true, req);

    this.addCombatLog(`🤝 ยอมรับคำขอเพื่อนจาก ${req.senderName} แล้ว!`, 'system');

    // Close modal
    const modal = document.getElementById('friend-confirm-modal');
    if (modal) modal.style.display = 'none';
    this.activeIncomingFriendRequest = null;
    this.updateMobileControlsVisibility();

    // Refresh UI
    if (this.onlinePlayers) this.updateOnlinePlayers(this.onlinePlayers);
    if (this.selectedProfilePlayer && this.selectedProfilePlayer.username === req.senderName) {
      this._showPlayerPopup(this.selectedProfilePlayer);
    }
  }

  _declineIncomingFriendRequest() {
    const req = this.activeIncomingFriendRequest;
    if (!req) return;

    const myUserId = this.character && this.character.userId ? this.character.userId : req.targetUserId;
    sendFriendResponsePacket(req.senderUserId, myUserId, false, req);

    this.addCombatLog(`❌ ปฏิเสธคำขอเพื่อนจาก ${req.senderName}`, 'system');

    // Close modal
    const modal = document.getElementById('friend-confirm-modal');
    if (modal) modal.style.display = 'none';
    this.activeIncomingFriendRequest = null;
    this.updateMobileControlsVisibility();
  }

  receiveFriendResponse(payload) {
    if (!payload) return;
    const req = payload.requestPayload;
    const targetName = req ? req.targetName : 'Unknown';

    if (payload.accepted) {
      // Add to our friends list
      if (!this.friends.includes(targetName)) {
        this.friends.push(targetName);
        localStorage.setItem('zolos_friends', JSON.stringify(this.friends));
      }
      this.addCombatLog(`🤝 ${targetName} ยอมรับคำขอเป็นเพื่อนของคุณแล้ว!`, 'system');
    } else {
      this.addCombatLog(`❌ ${targetName} ปฏิเสธคำขอเป็นเพื่อนของคุณ`, 'system');
    }

    // Reset button if popup is still showing this player
    if (this.selectedProfilePlayer && this.selectedProfilePlayer.username === targetName) {
      this._showPlayerPopup(this.selectedProfilePlayer);
    }

    // Refresh players list
    if (this.onlinePlayers) this.updateOnlinePlayers(this.onlinePlayers);
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
        this.updateMobileControlsVisibility();
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

  // ============ Profile Editor & Settings ============
  _setupProfileEditor() {
    const modal = document.getElementById('profile-editor-modal');
    const overlay = document.getElementById('profile-editor-overlay');
    const closeBtn = document.getElementById('btn-close-profile-editor');
    const saveBtn = document.getElementById('btn-save-profile');
    const cancelBtn = document.getElementById('btn-cancel-profile');
    const playerInfo = document.querySelector('.player-info');
    const btnProfile = document.getElementById('btn-profile');

    if (!modal) return;

    // Helper: convert int hex to #rrggbb string
    const hexToStr = (h) => '#' + ('000000' + h.toString(16)).slice(-6);
    // Helper: convert #rrggbb string to int
    const strToHex = (s) => parseInt(s.replace('#', ''), 16);

    // Setup tab switching in Settings modal
    const tabProfileBtn = document.getElementById('tab-btn-profile');
    const tabSettingsBtn = document.getElementById('tab-btn-settings');
    const tabProfilePane = document.getElementById('tab-content-profile');
    const tabSettingsPane = document.getElementById('tab-content-settings');

    if (tabProfileBtn && tabSettingsBtn && tabProfilePane && tabSettingsPane) {
      tabProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        tabProfilePane.style.display = 'block';
        tabSettingsPane.style.display = 'none';
        tabProfileBtn.classList.add('active-tab');
        tabSettingsBtn.classList.remove('active-tab');
        tabProfileBtn.style.borderBottomColor = 'var(--primary)';
        tabProfileBtn.style.color = 'var(--primary)';
        tabSettingsBtn.style.borderBottomColor = 'transparent';
        tabSettingsBtn.style.color = 'var(--text-dim)';
      });

      tabSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        tabProfilePane.style.display = 'none';
        tabSettingsPane.style.display = 'block';
        tabProfileBtn.classList.remove('active-tab');
        tabSettingsBtn.classList.add('active-tab');
        tabSettingsBtn.style.borderBottomColor = 'var(--primary)';
        tabSettingsBtn.style.color = 'var(--primary)';
        tabProfileBtn.style.borderBottomColor = 'transparent';
        tabProfileBtn.style.color = 'var(--text-dim)';

        // Sync config values when opening
        const soundCheckbox = document.getElementById('settings-sound-enabled');
        const soundLabel = document.getElementById('settings-sound-label');
        if (soundCheckbox && this.soundManager) {
          soundCheckbox.checked = this.soundManager.enabled;
          if (soundLabel) {
            soundLabel.textContent = `Sound Effects: ${this.soundManager.enabled ? 'ON' : 'OFF'}`;
          }
        }
        const graphicsSelect = document.getElementById('settings-graphics-quality');
        if (graphicsSelect && window.rendererSystem) {
          graphicsSelect.value = window.rendererSystem.qualityLevel;
        }
        const fpsCheckbox = document.getElementById('settings-fps-enabled');
        if (fpsCheckbox) {
          fpsCheckbox.checked = localStorage.getItem('zolos_show_fps') === 'true';
        }
      });
    }

    // Audio Mute settings listener
    const soundCheckbox = document.getElementById('settings-sound-enabled');
    if (soundCheckbox) {
      soundCheckbox.addEventListener('change', (e) => {
        if (this.soundManager) {
          this.soundManager.enabled = e.target.checked;
          const soundLabel = document.getElementById('settings-sound-label');
          if (soundLabel) {
            soundLabel.textContent = `Sound Effects: ${this.soundManager.enabled ? 'ON' : 'OFF'}`;
          }
          if (e.target.checked) {
            this.soundManager.playUseItemSound();
          }
        }
        if (this.character && this.character.gameSettings) {
          this.character.gameSettings.sound_enabled = e.target.checked;
          this.character.saveStatsToDatabase();
        }
      });
    }

    // Graphics settings listener
    const graphicsSelect = document.getElementById('settings-graphics-quality');
    if (graphicsSelect) {
      graphicsSelect.addEventListener('change', (e) => {
        const q = e.target.value;
        if (window.rendererSystem) {
          window.rendererSystem.qualityLevel = q;
          window.rendererSystem.applyQualitySettings();
          this.addCombatLog(`🖥️ Graphics Quality set to: ${q.toUpperCase()}`, 'system');
        }
        if (this.character && this.character.gameSettings) {
          this.character.gameSettings.graphics_quality = q;
          this.character.saveStatsToDatabase();
        }
      });
    }

    // FPS Display settings listener
    const fpsCheckbox = document.getElementById('settings-fps-enabled');
    if (fpsCheckbox) {
      fpsCheckbox.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('zolos_show_fps', enabled ? 'true' : 'false');
        const fpsEl = document.getElementById('fps-counter');
        if (fpsEl) {
          fpsEl.style.display = enabled ? 'block' : 'none';
        }
        if (this.character && this.character.gameSettings) {
          this.character.gameSettings.fps_enabled = enabled;
          this.character.saveStatsToDatabase();
        }
      });
    }

    const openEditor = () => {
      // Default to profile tab on open
      if (tabProfileBtn) {
        tabProfileBtn.click();
      }

      // Populate current values
      const nameInput = document.getElementById('profile-edit-name');
      const shirtInput = document.getElementById('profile-edit-shirt');
      const pantsInput = document.getElementById('profile-edit-pants');
      const hairInput = document.getElementById('profile-edit-hair');
      const weaponSelect = document.getElementById('profile-edit-weapon');
      const hatSelect = document.getElementById('profile-edit-hat');
      const glassesSelect = document.getElementById('profile-edit-glasses');

      if (this.character) {
        // Step 9: Display UID in profile editor
        const uidDisplay = document.getElementById('profile-uid-display');
        if (uidDisplay && this.characterId) {
          // Format: UID: #XXXXXXXX (first 8 characters of the ID, uppercase)
          const rawId = this.characterId.includes('_') ? this.characterId.split('_').pop() : this.characterId;
          const uid = rawId.substring(0, 8).toUpperCase();
          uidDisplay.textContent = `UID: #${uid}`;
        }
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
            const em = hatEmojiMap[i.item_name] || '🧙';
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
      this.updateMobileControlsVisibility();
    };

    const closeEditor = () => {
      modal.style.display = 'none';
      this.updateMobileControlsVisibility();
    };

    // Open on click
    if (playerInfo) playerInfo.addEventListener('click', openEditor);
    if (btnProfile) btnProfile.addEventListener('click', openEditor);

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
    if (btn) {
      btn.addEventListener('click', () => {
        const isActive = callback();
        this.setAutoFarmState(isActive);
      });
    }
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

  triggerScreenShake(isCritical = false) {
    if (!isCritical) return;
    // Fix: Target only the 3D canvas instead of the whole UI container
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // Step 5.2: Screen Shake - Only for Critical Hit
    canvas.classList.add('screen-shake-crit');
    setTimeout(() => {
      canvas.classList.remove('screen-shake-crit');
    }, 500);
  }

  setAutoFarmState(active) {
    const btn = document.getElementById('btn-auto-farm');
    if (btn) {
      btn.classList.toggle('active', active);
      const textEl = btn.querySelector('.auto-text');
      if (textEl) {
        textEl.textContent = active ? 'AUTO: ON' : 'AUTO';
      }
    }
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
        this.currentShopTab = tab.getAttribute('data-tab');
        this.selectedShopItem = null;
        this._updateShopDetailBox();
        this._renderShop();
      });
    });

    // Buy button
    const buyBtn = document.getElementById('btn-buy-npc-item');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        this._performShopAction();
      });
    }

  }

  _renderShop() {
    // Increment quest progress for visiting the shop
    this.incrementQuestProgress('shop', 'any');

    const grid = document.getElementById('shop-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Buy tabs: show shop catalog
    const filteredItems = SHOP_ITEMS.filter(item => {
      const itemData = ITEMS[item.name];
      if (!itemData) return false;

      if (this.currentShopTab === 'all') return true;
      if (this.currentShopTab === 'usable') return itemData.type === 'usable' || itemData.type === 'consumable';
      if (this.currentShopTab === 'equip') return ['weapon', 'armor', 'shield', 'hat', 'glasses'].includes(itemData.type);
      return false;
    });

    filteredItems.forEach(item => {
      const itemData = ITEMS[item.name];
      const slot = document.createElement('div');
      slot.className = 'shop-slot';
      if (itemData.rarity) {
        slot.classList.add(`rarity-${itemData.rarity}`);
      }
      if (this.selectedShopItem && this.selectedShopItem.name === item.name) {
        slot.classList.add('selected');
      }

      slot.innerHTML = `
        <span class="slot-emoji">${itemData.emoji}</span>
        <div class="slot-price-tag">${item.price}z</div>
      `;

      slot.addEventListener('click', () => {
        this.selectedShopItem = item;
        this._renderShop();
        this._updateShopDetailBox();
      });

      grid.appendChild(slot);
    });

    // Update gold display
    const goldDisplay = document.getElementById('shop-gold-amount');
    if (goldDisplay && this.character) {
      goldDisplay.textContent = this.character.stats.gold.toLocaleString();
    }
  }

  _updateShopDetailBox() {
    const placeholder = document.getElementById('shop-detail-placeholder');
    const content = document.getElementById('shop-detail-content');
    if (!placeholder || !content) return;

    if (!this.selectedShopItem) {
      placeholder.style.display = 'block';
      content.style.display = 'none';
      return;
    }

    placeholder.style.display = 'none';
    content.style.display = 'block';

    const itemData = ITEMS[this.selectedShopItem.name];
    document.getElementById('shop-detail-icon').textContent = itemData.emoji;
    document.getElementById('shop-detail-name').textContent = this.selectedShopItem.name;
    document.getElementById('shop-detail-type').textContent = itemData.type.toUpperCase();
    document.getElementById('shop-detail-desc').textContent = itemData.desc || 'ไม่มีคำอธิบาย';
    document.getElementById('shop-detail-price-val').textContent = this.selectedShopItem.price;

    const buyBtn = document.getElementById('btn-buy-npc-item');
    if (buyBtn) buyBtn.style.display = 'block';
    const priceLabel = document.getElementById('shop-price-label');
    if (priceLabel) priceLabel.textContent = 'ราคา';
  }

  async _performShopAction() {
    if (!this.selectedShopItem || !this.character) return;

    const item = this.selectedShopItem;
    const itemData = ITEMS[item.name];

    if (this.character.stats.gold < item.price) {
      this.addCombatLog('❌ เงิน Zeny ไม่เพียงพอ!', 'system');
      if (this.soundManager && this.soundManager.playErrorSound) this.soundManager.playErrorSound();
      return;
    }

    // Deduct gold
    this.character.stats.gold -= item.price;

    // Add to inventory
    const existing = this.inventory.find(i => i.item_name === item.name);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.inventory.push({
        item_name: item.name,
        item_type: itemData.type,
        emoji: itemData.emoji,
        desc: itemData.desc,
        price: itemData.price || item.price,
        healHp: itemData.healHp || 0,
        restoreSp: itemData.restoreSp || 0,
        quantity: 1,
        stats: itemData.stats || {}
      });
    }

    // Save persistence
    if (this.characterId) {
      // Fixed argument order: (characterId, itemName, itemType, quantity)
      await saveInventoryItem(this.characterId, item.name, itemData.type, 1);
      if (this.character.saveStatsToDatabase) {
        await this.character.saveStatsToDatabase();
      }
    }

    this.addCombatLog(`🛒 ซื้อ ${itemData.emoji} ${item.name} สำเร็จ (-${item.price} Zeny)`, 'system');

    if (this.soundManager) {
      if (this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      else if (this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    }

    // Refresh UI
    this._renderShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
  }

  // ============ Sell Shop Logic ============
  _setupSellShopEvents() {
    const qtyInput = document.getElementById('sell-shop-qty-input');
    if (qtyInput) {
      qtyInput.addEventListener('input', () => this._updateSellShopTotal());
    }

    const maxBtn = document.getElementById('btn-sell-shop-max');
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        if (!this.selectedSellShopItem) return;
        const invItem = this.inventory.find(i => i.item_name === this.selectedSellShopItem.item_name);
        if (invItem && qtyInput) {
          qtyInput.value = invItem.quantity;
          this._updateSellShopTotal();
        }
      });
    }

    const confirmBtn = document.getElementById('btn-sell-shop-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this._performSellShopAction());
    }
  }

  _renderSellShop() {
    const grid = document.getElementById('sell-shop-inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const goldDisplay = document.getElementById('sell-shop-gold-amount');
    if (goldDisplay && this.character) {
      goldDisplay.textContent = this.character.stats.gold.toLocaleString();
    }

    // Show only non-equipped sellable items
    const sellableItems = this.inventory.filter(i => !this._isItemEquipped(i));

    sellableItems.forEach(item => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (item.rarity) slot.classList.add(`rarity-${item.rarity}`);
      if (this.selectedSellShopItem && this.selectedSellShopItem.item_name === item.item_name) {
        slot.classList.add('selected');
      }

      slot.innerHTML = `
        <span>${item.emoji}</span>
        <span class="inv-qty">${item.quantity}</span>
      `;

      slot.addEventListener('click', () => {
        this.selectedSellShopItem = item;
        this._renderSellShop();
        this._updateSellShopDetail();
      });

      grid.appendChild(slot);
    });

    this._updateSellShopDetail();
  }

  _updateSellShopDetail() {
    const placeholder = document.getElementById('sell-shop-detail-placeholder');
    const content = document.getElementById('sell-shop-detail-content');
    if (!placeholder || !content) return;

    if (!this.selectedSellShopItem) {
      placeholder.style.display = 'block';
      content.style.display = 'none';
      return;
    }

    placeholder.style.display = 'none';
    content.style.display = 'block';

    const item = this.selectedSellShopItem;
    document.getElementById('sell-shop-detail-icon').textContent = item.emoji;
    document.getElementById('sell-shop-detail-name').textContent = item.item_name;
    document.getElementById('sell-shop-detail-type').textContent = item.item_type.toUpperCase();
    document.getElementById('sell-shop-detail-desc').textContent = item.desc || '';
    document.getElementById('sell-shop-owned-qty').textContent = `มีอยู่: ${item.quantity} ชิ้น`;
    
    const unitPrice = Math.floor(item.price * 0.8);
    document.getElementById('sell-shop-unit-price').textContent = unitPrice.toLocaleString();

    const qtyInput = document.getElementById('sell-shop-qty-input');
    if (qtyInput) {
      if (parseInt(qtyInput.value) > item.quantity) qtyInput.value = item.quantity;
      if (parseInt(qtyInput.value) < 1) qtyInput.value = 1;
    }

    this._updateSellShopTotal();
  }

  _updateSellShopTotal() {
    if (!this.selectedSellShopItem) return;
    const qtyInput = document.getElementById('sell-shop-qty-input');
    const totalDisplay = document.getElementById('sell-shop-total-price');
    if (!qtyInput || !totalDisplay) return;

    const unitPrice = Math.floor(this.selectedSellShopItem.price * 0.8);
    const qty = parseInt(qtyInput.value) || 0;
    totalDisplay.textContent = (unitPrice * qty).toLocaleString();
  }

  async _performSellShopAction() {
    if (!this.selectedSellShopItem || !this.character) return;

    const qtyInput = document.getElementById('sell-shop-qty-input');
    const sellQty = parseInt(qtyInput?.value) || 0;
    if (sellQty <= 0) return;

    const item = this.selectedSellShopItem;
    const invItem = this.inventory.find(i => i.item_name === item.item_name);

    if (!invItem || invItem.quantity < sellQty) {
      this.addCombatLog('❌ จำนวนไอเทมไม่เพียงพอ!', 'system');
      return;
    }

    const unitPrice = Math.floor(item.price * 0.8);
    const totalGold = unitPrice * sellQty;

    // Update state
    this.character.stats.gold += totalGold;
    invItem.quantity -= sellQty;

    if (invItem.quantity <= 0) {
      this.inventory = this.inventory.filter(i => i.item_name !== item.item_name);
      this.selectedSellShopItem = null;
    }

    // Save persistence
    if (this.characterId) {
      await saveInventoryItem(this.characterId, item.item_name, item.item_type, -sellQty);
      if (this.character.saveStatsToDatabase) {
        await this.character.saveStatsToDatabase();
      }
    }

    this.addCombatLog(`💰 ขาย ${item.emoji} ${item.item_name} x${sellQty} สำเร็จ (+${totalGold} Zeny)`, 'system');

    if (this.soundManager) {
      if (this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      else if (this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    }

    // Refresh UI
    this._renderSellShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
  }


  // ============ P2P Marketplace Logic ============
  _setupMarketEvents() {
    // Tab switching
    const tabs = document.querySelectorAll('.market-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.marketTab = tab.getAttribute('data-tab');
        this.selectedMarketItem = null;

        // Reset form
        const form = document.getElementById('market-sell-form');
        if (form) form.style.display = 'none';

        this._renderMarket();
      });
    });

    // Search filter
    const searchInput = document.getElementById('market-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._renderMarket();
      });
    }

    // List button
    const listBtn = document.getElementById('btn-market-list-action');
    if (listBtn) {
      listBtn.addEventListener('click', () => this._performMarketListAction());
    }
  }

  _isItemEquipped(item) {
    if (!this.character || !item) return false;
    if (item.stats && item.stats.equipped === true) return true;
    if (item.item_name === this.character.equippedHat) return true;
    if (item.item_name === this.character.equippedGlasses) return true;
    if (item.item_name === this.character.equippedArmor) return true;
    if (item.item_name === this.character.equippedShield) return true;
    return false;
  }

  async _renderMarket() {
    // Update gold display
    const goldDisplay = document.getElementById('market-gold-amount');
    if (goldDisplay && this.character) {
      goldDisplay.textContent = this.character.stats.gold;
    }

    if (this.marketTab === 'buy') {
      document.getElementById('market-buy-container').style.display = 'block';
      document.getElementById('market-sell-container').style.display = 'none';

      const grid = document.getElementById('market-items-grid');
      if (!grid) return;
      grid.innerHTML = '';

      const query = (document.getElementById('market-search-input')?.value || '').toLowerCase().trim();

      const listings = await fetchMarketListings();
      const filtered = listings.filter(l =>
        l.item_name.toLowerCase().includes(query)
      );

      if (filtered.length === 0) {
        grid.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:9.5px;padding:30px 0;grid-column: span 5;">ไม่มีไอเทมที่วางขายในขณะนี้</div>';
        return;
      }

      filtered.forEach(listing => {
        const itemInfo = ITEMS[listing.item_name] || { emoji: '📦' };
        const row = document.createElement('div');
        row.className = 'market-item-row';

        const isMine = listing.seller_id === this.characterId;

        // Step 8: Apply rarity class to market row
        const rarityClass = `rarity-${itemInfo.rarity || 'common'}`;
        row.innerHTML = `
          <div class="market-item-name-cell ${rarityClass}">
            <span>${itemInfo.emoji}</span>
            <span class="market-item-name-text" title="${listing.item_name}">${listing.item_name}</span>
          </div>
          <div class="market-item-qty-cell">x${listing.quantity}</div>
          <div class="market-item-price-cell">${listing.price}z</div>
          <div class="market-item-seller-cell" title="${listing.seller_name}">${listing.seller_name}${isMine ? ' (คุณ)' : ''}</div>
          <div class="market-item-action-cell">
            ${isMine ?
            `<button class="btn-market-cancel" data-id="${listing.id}">ยกเลิก</button>` :
            `<button class="btn-market-buy" data-id="${listing.id}">ซื้อ</button>`
          }
          </div>
        `;

        // Action click
        const actionBtn = row.querySelector('button');
        if (actionBtn) {
          actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isMine) {
              this._performMarketCancelAction(listing);
            } else {
              this._performMarketBuyAction(listing);
            }
          });
        }

        grid.appendChild(row);
      });
    } else {
      document.getElementById('market-buy-container').style.display = 'none';
      document.getElementById('market-sell-container').style.display = 'block';

      this._renderMarketSellInventory();
    }
  }

  _renderMarketSellInventory() {
    const grid = document.getElementById('market-sell-inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Filter only non-equipped sellable items
    const sellable = this.inventory.filter(item => !this._isItemEquipped(item));

    if (sellable.length === 0) {
      grid.innerHTML = '<div style="grid-column:span 4;text-align:center;color:var(--text-dim);font-size:9.5px;padding:30px 0;">ไม่มีไอเทมที่สามารถตั้งขายได้ (ไอเทมที่สวมใส่อยู่จะไม่สามารถตั้งขายได้)</div>';
      return;
    }

    sellable.forEach(item => {
      const slot = document.createElement('div');
      slot.className = `inventory-slot rarity-${item.rarity || 'common'}`;
      if (this.selectedMarketItem && this.selectedMarketItem.item_name === item.item_name) {
        slot.classList.add('selected');
      }
      slot.innerHTML = `
        <div class="slot-icon">${item.emoji}</div>
        <div class="slot-quantity">x${item.quantity}</div>
      `;
      slot.addEventListener('click', () => {
        this.selectedMarketItem = item;
        this._renderMarketSellInventory();
        this._updateMarketSellForm();
      });
      grid.appendChild(slot);
    });
  }

  async _updateMarketSellForm() {
    const form = document.getElementById('market-sell-form');
    if (!form || !this.selectedMarketItem) return;

    form.style.display = 'block';
    // Step 8: Ensure the form is visible without scrolling
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('market-sell-item-icon').textContent = this.selectedMarketItem.emoji;
    document.getElementById('market-sell-item-name').textContent = this.selectedMarketItem.item_name;
    document.getElementById('market-sell-item-qty-info').textContent = `จำนวนที่มี: ${this.selectedMarketItem.quantity}`;

    // Load Average Price
    const priceInfoEl = document.getElementById('market-sell-price-info');
    if (priceInfoEl) {
      priceInfoEl.textContent = '⌛ กำลังคำนวณราคากลาง...';
      const stats = await fetchMarketPriceStats(this.selectedMarketItem.item_name);
      if (stats && stats.avgPrice) {
        priceInfoEl.innerHTML = `📈 ราคากลางล่าสุด: <span style="color:var(--zeny-gold); font-weight:bold;">${stats.avgPrice.toLocaleString()} Zeny</span> / ชิ้น`;
      } else {
        priceInfoEl.textContent = '📈 ราคากลาง: ยังไม่มีข้อมูลการซื้อขาย';
      }
    }

    // Set defaults
    const qtyInput = document.getElementById('market-sell-qty-input');
    const priceInput = document.getElementById('market-sell-price-input');
    if (qtyInput) {
      qtyInput.value = 1;
      qtyInput.max = this.selectedMarketItem.quantity;
    }
    if (priceInput) {
      priceInput.value = '';
    }
  }

  async _performMarketListAction() {
    if (!this.selectedMarketItem || !this.character || !this.characterId) return;

    const item = this.selectedMarketItem;
    const qtyInput = document.getElementById('market-sell-qty-input');
    const priceInput = document.getElementById('market-sell-price-input');

    if (!qtyInput || !priceInput) return;

    const qty = parseInt(qtyInput.value);
    const price = parseInt(priceInput.value);

    if (isNaN(qty) || qty < 1 || qty > item.quantity) {
      this.addCombatLog('❌ จำนวนที่ตั้งขายไม่ถูกต้อง!', 'system');
      if (this.soundManager) this.soundManager.playErrorSound?.();
      return;
    }

    if (isNaN(price) || price < 0) {
      this.addCombatLog('❌ ราคา Zeny ไม่ถูกต้อง!', 'system');
      if (this.soundManager) this.soundManager.playErrorSound?.();
      return;
    }

    // Call service to list
    try {
      const listing = await listMarketItem(
        this.characterId,
        this.character.stats.name,
        item.item_name,
        item.item_type,
        qty,
        price,
        item.stats || {}
      );

      if (listing) {
        // Deduct from local inventory
        const itemIdx = this.inventory.findIndex(i => i.item_name === item.item_name);
        if (itemIdx >= 0) {
          this.inventory[itemIdx].quantity -= qty;
          if (this.inventory[itemIdx].quantity <= 0) {
            this.inventory.splice(itemIdx, 1);
          }
        }

        // Sync inventory DB decrement
        await saveInventoryItem(this.characterId, item.item_name, item.item_type, -qty, item.stats || {});

        this.addCombatLog(`⚖️ ตั้งขาย ${item.emoji} ${item.item_name} x${qty} ราคา ${price} Zeny แล้ว`, 'system');
        if (this.soundManager) this.soundManager.playBuySellSound ? this.soundManager.playBuySellSound() : this.soundManager.playUseItemSound();

        // Reset selection and close form
        this.selectedMarketItem = null;
        document.getElementById('market-sell-form').style.display = 'none';

        // Refresh displays
        this._renderMarket();
        this._renderInventory();
      } else {
        throw new Error('Listing failed');
      }
    } catch (err) {
      console.error('Market listing failed:', err);
      this.addCombatLog('❌ เกิดข้อผิดพลาดในการตั้งขาย! กรุณาลองใหม่อีกครั้ง', 'system');
      if (this.soundManager) this.soundManager.playErrorSound?.();
    }
  }

  async _performMarketBuyAction(listing) {
    if (!this.character || !this.characterId) return;

    if (this.character.stats.gold < listing.price) {
      this.addCombatLog('❌ เงิน Zeny ไม่เพียงพอสำหรับการสั่งซื้อนี้!', 'system');
      if (this.soundManager) this.soundManager.playErrorSound?.();
      return;
    }

    if (confirm(`คุณต้องการซื้อ ${listing.item_name} x${listing.quantity} ในราคา ${listing.price} Zeny หรือไม่?`)) {
      // Decrease gold
      this.character.stats.gold -= listing.price;

      // Purchase service call (removes listing and adds gold to seller)
      const boughtResult = await buyMarketItem(listing.id, this.characterId, this.character.stats.name);

      if (boughtResult) {
        // Add item to local inventory
        const itemRegistry = ITEMS[listing.item_name] || { emoji: '📦', type: listing.item_type, desc: 'P2P Item', price: 10 };
        const existing = this.inventory.find(i => i.item_name === listing.item_name);
        if (existing) {
          existing.quantity += listing.quantity;
        } else {
          this.inventory.push({
            item_name: listing.item_name,
            item_type: listing.item_type,
            emoji: itemRegistry.emoji || '📦',
            desc: itemRegistry.desc || '',
            price: itemRegistry.price || 10,
            healHp: itemRegistry.healHp || 0,
            restoreSp: itemRegistry.restoreSp || 0,
            quantity: listing.quantity,
            stats: listing.stats || {}
          });
        }

        // Save character stats for gold sync
        if (this.character.saveStatsToDatabase) {
          this.character.saveStatsToDatabase().catch(() => { });
        }

        this.addCombatLog(`🛒 ซื้อ ${listing.item_name} x${listing.quantity} สำเร็จ (-${listing.price} Zeny)`, 'system');
        if (this.soundManager) this.soundManager.playBuySellSound ? this.soundManager.playBuySellSound() : this.soundManager.playUseItemSound();

        // Refresh displays
        this._renderMarket();
        this._renderInventory();
        this.updateHUD(this.character.stats);
        this.updateStats(this.character.stats);
      } else {
        // Refund gold
        this.character.stats.gold += listing.price;
        this.addCombatLog('❌ การซื้อล้มเหลว! ไอเทมอาจถูกผู้เล่นอื่นซื้อไปแล้ว', 'system');
        if (this.soundManager) this.soundManager.playErrorSound?.();
        this._renderMarket();
      }
    }
  }

  async _performMarketCancelAction(listing) {
    if (!this.characterId) return;

    if (confirm(`คุณต้องการยกเลิกการตั้งขาย ${listing.item_name} x${listing.quantity} หรือไม่?`)) {
      const canceled = await cancelMarketListing(listing.id, this.characterId);
      if (canceled) {
        // Add back to local inventory
        const itemRegistry = ITEMS[listing.item_name] || { emoji: '📦', type: listing.item_type, desc: 'P2P Item', price: 10 };
        const existing = this.inventory.find(i => i.item_name === listing.item_name);
        if (existing) {
          existing.quantity += listing.quantity;
        } else {
          this.inventory.push({
            item_name: listing.item_name,
            item_type: listing.item_type,
            emoji: itemRegistry.emoji || '📦',
            desc: itemRegistry.desc || '',
            price: itemRegistry.price || 10,
            healHp: itemRegistry.healHp || 0,
            restoreSp: itemRegistry.restoreSp || 0,
            quantity: listing.quantity,
            stats: listing.stats || {}
          });
        }

        this.addCombatLog(`⚖️ ยกเลิกการตั้งขาย ${listing.item_name} x${listing.quantity} สำเร็จ`, 'system');
        if (this.soundManager) this.soundManager.playUseItemSound?.();

        // Refresh displays
        this._renderMarket();
        this._renderInventory();
      } else {
        this.addCombatLog('❌ ยกเลิกไม่สำเร็จ!', 'system');
        if (this.soundManager) this.soundManager.playErrorSound?.();
        this._renderMarket();
      }
    }
  }

  // ============ Skill HUD Updates ============
  updateSkillCooldown(skillId, currentCooldown, maxCooldown) {
    const overlay = document.getElementById(`cooldown-${skillId}`);
    if (overlay) {
      if (currentCooldown <= 0) {
        overlay.style.height = '0%';
      } else {
        const percentage = (currentCooldown / maxCooldown) * 100;
        overlay.style.height = `${percentage}%`;
      }
    }

    const mobOverlay = document.getElementById(`mobile-cooldown-${skillId}`);
    if (mobOverlay) {
      if (currentCooldown <= 0) {
        mobOverlay.style.height = '0%';
      } else {
        const percentage = (currentCooldown / maxCooldown) * 100;
        mobOverlay.style.height = `${percentage}%`;
      }
    }
  }

  castSkill(skillId) {
    if (!this.character || !this.character.isAlive()) return false;

    // Determine target
    let target = this.character.targetMonster;
    if (skillId === 'bash' && !target) {
      if (this.combatSystem && this.combatSystem.monsters) {
        target = this.combatSystem.monsters.findNearest(this.character.getPosition());
        // Snap target if within reasonable range (3x normal melee range)
        if (target && this.character.getPosition().distanceTo(target.getPosition()) > this.character.getAttackRange() * 3) {
          target = null;
        }
      }
    }

    // Call character's useSkill
    const success = this.character.useSkill(
      skillId,
      target,
      this.combatSystem ? this.combatSystem.monsters : null,
      this,
      this.soundManager,
      this.particles || window.particles,
      (skillType, hitTarget, dmg) => {
        // Handle monster death if this skill killed it
        if (hitTarget && !hitTarget.alive) {
          if (this.combatSystem) {
            this.combatSystem._onMonsterKilled(hitTarget);
          }
        }
      }
    );

    return success;
  }

  _setupMobileControls() {
    const pad = document.getElementById('mobile-pad');
    const container = document.getElementById('joystick-container');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    if (!pad || !container || !base || !knob) return;

    let joystickActive = false;
    let joystickTouchId = null;
    let joystickStartTime = 0;
    let startX = 0;
    let startY = 0;
    const maxRadius = 45; // Max knob movement radius in pixels

    // Hide joystick container by default (floating mode)
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.style.transition = 'opacity 0.15s ease';

    // Keep track of virtual key states
    const activeKeys = {
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false
    };

    const triggerKeyEvent = (keyCode, isPressed) => {
      if (activeKeys[keyCode] === isPressed) return;
      activeKeys[keyCode] = isPressed;
      const type = isPressed ? 'keydown' : 'keyup';
      const event = new KeyboardEvent(type, { code: keyCode, key: keyCode });
      window.dispatchEvent(event);
    };

    // Show joystick at a specific position
    const showJoystickAt = (x, y) => {
      const size = container.offsetWidth || 130;
      container.style.left = `${x - size / 2}px`;
      container.style.top = `${y - size / 2}px`;
      container.style.bottom = 'auto';
      container.style.opacity = '1';
      container.style.pointerEvents = 'auto';
    };

    const hideJoystick = () => {
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
    };

    const handleStart = (e) => {
      // Only active if the mobile control pad is visible on screen (responsive check)
      if (window.getComputedStyle(pad).display === 'none') return;

      // Only respond to touches on the LEFT half of the screen
      const touch = e.touches ? e.touches[0] : e;
      if (touch.clientX > window.innerWidth / 2) return;

      // Ignore if touching an interactive element (buttons, etc.)
      const target = e.target;
      if (target.closest('#mobile-actions') || target.closest('#auto-farm-container') ||
        target.closest('#hud-bottom') || target.closest('.side-panel') ||
        target.closest('.modal-popup') || target.closest('#hud-top') ||
        target.closest('#minimap-container') || target.closest('#target-indicator') ||
        target.closest('#fps-counter') || target.closest('#kill-counter')) return;

      e.preventDefault();
      joystickActive = true;
      if (e.touches) joystickTouchId = e.touches[0].identifier;

      joystickStartTime = performance.now();
      startX = touch.clientX;
      startY = touch.clientY;

      showJoystickAt(startX, startY);
      knob.style.transform = 'translate(0px, 0px)';
      base.style.borderColor = 'var(--primary)';
    };

    const handleMove = (e) => {
      if (!joystickActive) return;
      e.preventDefault();

      let touch;
      if (e.touches) {
        touch = Array.from(e.touches).find(t => t.identifier === joystickTouchId);
        if (!touch) return;
      } else {
        touch = e;
      }

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let angle = Math.atan2(dy, dx);
      let moveX = dx;
      let moveY = dy;

      if (distance > maxRadius) {
        moveX = Math.cos(angle) * maxRadius;
        moveY = Math.sin(angle) * maxRadius;
      }

      knob.style.transform = `translate(${moveX}px, ${moveY}px)`;

      const nx = moveX / maxRadius;
      const ny = moveY / maxRadius;
      const threshold = 0.35;

      const inputManager = this.character ? this.character.inputManager : null;
      if (inputManager) {
        inputManager.setJoystickInput(nx, ny);
      } else {
        triggerKeyEvent('KeyW', ny < -threshold);
        triggerKeyEvent('KeyS', ny > threshold);
        triggerKeyEvent('KeyA', nx < -threshold);
        triggerKeyEvent('KeyD', nx > threshold);
      }
    };

    const handleEnd = (e) => {
      if (!joystickActive) return;

      // Find the touch coordinates that ended
      let touch;
      if (e.changedTouches) {
        touch = Array.from(e.changedTouches).find(t => t.identifier === joystickTouchId);
        if (!touch) return;
      } else {
        touch = e;
      }

      const duration = performance.now() - joystickStartTime;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      joystickActive = false;
      joystickTouchId = null;
      knob.style.transform = 'translate(0px, 0px)';
      base.style.borderColor = 'rgba(240, 192, 64, 0.4)';
      hideJoystick();

      const inputManager = this.character ? this.character.inputManager : null;
      if (inputManager) {
        inputManager.setJoystickInput(0, 0);
      } else {
        triggerKeyEvent('KeyW', false);
        triggerKeyEvent('KeyS', false);
        triggerKeyEvent('KeyA', false);
        triggerKeyEvent('KeyD', false);
      }

      // Tap detection: short tap with small movement
      if (duration < 250 && distance < 15) {
        if (window.handleCanvasTap) {
          window.handleCanvasTap({
            clientX: touch.clientX,
            clientY: touch.clientY
          });
        }
      }
    };

    // Listen on the window for floating joystick (since mobile-pad has pointer-events: none)
    window.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd, { passive: false });

    // Desktop/mouse fallback (for browser mobile simulation mode)
    window.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    // Sprint Button logic
    const sprintBtn = document.getElementById('btn-mobile-sprint');
    if (sprintBtn) {
      let isSprintActive = false;
      const toggleSprint = () => {
        isSprintActive = !isSprintActive;
        sprintBtn.classList.toggle('active', isSprintActive);

        const event = new KeyboardEvent(isSprintActive ? 'keydown' : 'keyup', {
          code: 'ShiftLeft',
          key: 'Shift'
        });
        window.dispatchEvent(event);
      };

      sprintBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleSprint();
      });
      sprintBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSprint();
      });
    }

    // Target/Attack Button logic
    const attackBtn = document.getElementById('btn-mobile-attack');
    if (attackBtn) {
      const triggerAttack = () => {
        if (!this.character) return;

        if (!this.character.targetMonster) {
          if (this.combatSystem && this.combatSystem.monsters) {
            const nearest = this.combatSystem.monsters.findNearest(this.character.getPosition());
            if (nearest) {
              this.character.targetMonster = nearest;
              this.addCombatLog(`🎯 Target selected: ${nearest.data.name}`, 'system');
            } else {
              this.addCombatLog('❌ No monsters nearby', 'system');
            }
          }
        } else {
          const name = this.character.targetMonster.data.name || 'Monster';
          this.character.targetMonster = null;
          this.addCombatLog(`❌ Deselected target: ${name}`, 'system');
        }
      };

      attackBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerAttack();
      });
      attackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerAttack();
      });
    }

    // Skill buttons touch and click triggers
    ['bash', 'heal', 'magnumBreak'].forEach((skillId, index) => {
      const btn = document.getElementById(`btn-mobile-skill-${index + 1}`);
      if (btn) {
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.castSkill(skillId);
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.castSkill(skillId);
        });
      }
    });
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
    } else if (this.currentWikiTab === 'fish') {
      Object.keys(ITEMS).forEach(key => {
        const item = ITEMS[key];
        if (item.type !== 'fish') return;
        const match = key.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query);
        if (!match) return;

        const slot = document.createElement('div');
        slot.className = 'wiki-slot';
        if (item.rarity) slot.classList.add(`rarity-${item.rarity}`);
        if (this.selectedWikiItem === key) {
          slot.classList.add('selected');
        }
        slot.innerHTML = `
          <span class="wiki-slot-emoji">${item.emoji || '🐟'}</span>
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
    } else {
      Object.keys(ITEMS).forEach(key => {
        const item = ITEMS[key];
        if (item.type === 'fish') return;
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
      if (PAYON_MONSTERS[key]) mapArea = 'Payon Forest 🌲';
      else if (GLAST_MONSTERS[key]) mapArea = 'Glast Heim 🏰';
      else if (MJOLNIR_MONSTERS[key]) mapArea = 'Mjolnir Mountains ⛰️';
      else if (ABYSS_MONSTERS[key]) mapArea = 'Abyss Lake 🌊';
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
      } else {
        droppedByHtml = `
          <div class="wiki-section-title">👾 Dropped By / ได้จากมอนสเตอร์:</div>
          <div style="font-size:11px;color:var(--text-dim);padding-left:4px;">ไม่ดรอปจากมอนสเตอร์ (NPC Shop หรืออื่นๆ)</div>
        `;
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

    // 1. Draw Ground (color based on current map)
    const MAP_GROUND_COLORS = {
      prontera: '#3a7a3a',
      payon: '#5a4a2a',
      glast_heim: '#2a2035',
      mjolnir: '#7a7060',
      abyss_lake: '#0a1020',
    };
    ctx.fillStyle = MAP_GROUND_COLORS[currentMap] || '#3a7a3a';
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
    const MAP_RIVER_COLORS = {
      prontera: '#2d6d9d',
      payon: '#254e40',
      glast_heim: '#1a0a2a',
      mjolnir: '#5080a0',
      abyss_lake: '#0a1a40',
    };
    ctx.strokeStyle = MAP_RIVER_COLORS[currentMap] || '#2d6d9d';
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

  // ============ Trade Panel ============
  _setupTradePanel() {
    this.tradeTarget = null;
    this.tradeSelectedItem = null;
    this.activeTradeRequest = null;
    this.tradeTimeout = null;

    // Sender Panel Setup
    const closeBtn = document.getElementById('btn-close-trade');
    const overlay = document.getElementById('trade-panel-overlay');
    const closeTradePanel = () => {
      // Clear timeout & wait overlay if any active trade
      if (this.tradeTimeout) {
        clearTimeout(this.tradeTimeout);
        this.tradeTimeout = null;
      }
      const waitOverlay = document.getElementById('trade-waiting-overlay');
      if (waitOverlay) waitOverlay.style.display = 'none';

      const panel = document.getElementById('trade-panel');
      if (panel) panel.style.display = 'none';
      this.tradeTarget = null;
      this.tradeSelectedItem = null;
    };
    if (closeBtn) closeBtn.addEventListener('click', closeTradePanel);
    if (overlay) overlay.addEventListener('click', closeTradePanel);

    // Cancel Waiting Button
    const cancelWaitBtn = document.getElementById('btn-cancel-waiting-trade');
    if (cancelWaitBtn) {
      cancelWaitBtn.addEventListener('click', async () => {
        if (this.tradeTarget && this.characterId) {
          const req = {
            senderUserId: this.characterId,
            targetUserId: this.tradeTarget.userId,
            senderName: this.character && this.character.stats ? this.character.stats.name : 'Player'
          };
          await sendTradeCancelPacket(this.characterId, this.tradeTarget.userId, req);
        }
        closeTradePanel();
        this.addCombatLog('🤝 ยกเลิกการรอคอยการซื้อขาย', 'system');
      });
    }

    // Receiver Panel Setup
    const closeConfirmBtn = document.getElementById('btn-close-trade-confirm');
    const confirmOverlay = document.getElementById('trade-confirm-overlay');
    const closeConfirmPanel = () => {
      const panel = document.getElementById('trade-confirm-modal');
      if (panel) panel.style.display = 'none';
      this.activeTradeRequest = null;
    };
    if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', closeConfirmPanel);
    if (confirmOverlay) confirmOverlay.addEventListener('click', closeConfirmPanel);

    // Accept & Decline Buttons
    const acceptBtn = document.getElementById('btn-accept-trade');
    const declineBtn = document.getElementById('btn-decline-trade');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => this._acceptIncomingTrade());
    }
    if (declineBtn) {
      declineBtn.addEventListener('click', () => this._declineIncomingTrade());
    }

    const executeBtn = document.getElementById('btn-execute-trade');
    if (executeBtn) {
      executeBtn.addEventListener('click', () => this._executeTrade());
    }
  }

  openTradePanel(remotePlayer) {
    if (!remotePlayer) return;

    this.tradeTarget = remotePlayer;
    this.tradeSelectedItem = null;

    // Populate target info
    const nameEl = document.getElementById('trade-target-name');
    const levelEl = document.getElementById('trade-target-level');
    if (nameEl) nameEl.textContent = remotePlayer.username || 'Player';
    if (levelEl) levelEl.textContent = `Lv.${remotePlayer.level || 1}`;

    // Hide wait overlay on open
    const waitOverlay = document.getElementById('trade-waiting-overlay');
    if (waitOverlay) waitOverlay.style.display = 'none';

    // Hide form until item is selected
    const form = document.getElementById('trade-selected-form');
    if (form) form.style.display = 'none';

    // Render sender's tradeable inventory
    this._renderTradeInventory();

    // Show modal
    const panel = document.getElementById('trade-panel');
    if (panel) panel.style.display = 'flex';
  }

  _renderTradeInventory() {
    const grid = document.getElementById('trade-inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Filter to tradeable items (quantity > 0, not equipped)
    const tradeable = this.inventory.filter(i => {
      if (i.quantity <= 0) return false;
      if (i.stats && i.stats.equipped) return false;
      return true;
    });

    if (tradeable.length === 0) {
      grid.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:12px;">ไม่มีไอเทมที่สามารถส่งได้</div>';
      return;
    }

    tradeable.forEach(item => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (item.rarity) slot.classList.add(`rarity-${item.rarity}`);
      if (this.tradeSelectedItem && this.tradeSelectedItem.item_name === item.item_name) {
        slot.classList.add('selected');
      }

      slot.innerHTML = `
        <span>${item.emoji || '📦'}</span>
        <span class="inv-qty">${item.quantity}</span>
      `;
      slot.title = `${item.item_name} x${item.quantity}`;

      slot.addEventListener('click', () => {
        this.tradeSelectedItem = item;
        this._renderTradeInventory();

        // Show and populate form
        const form = document.getElementById('trade-selected-form');
        if (form) form.style.display = 'block';

        const icon = document.getElementById('trade-selected-icon');
        const name = document.getElementById('trade-selected-name');
        const qtyInfo = document.getElementById('trade-selected-qty-info');
        const qtyInput = document.getElementById('trade-qty-input');

        if (icon) icon.textContent = item.emoji || '📦';
        if (name) name.textContent = item.item_name;
        if (qtyInfo) qtyInfo.textContent = `จำนวนที่มี: ${item.quantity}`;
        if (qtyInput) {
          qtyInput.max = item.quantity;
          qtyInput.value = 1;
        }
      });

      grid.appendChild(slot);
    });
  }

  async _executeTrade() {
    if (!this.tradeTarget || !this.tradeSelectedItem || !this.characterId) {
      this.addCombatLog('❌ ไม่สามารถส่งไอเทมได้ - ไม่ได้เลือกไอเทมหรือเป้าหมาย', 'warning');
      return;
    }

    const item = this.tradeSelectedItem;
    const qtyInput = document.getElementById('trade-qty-input');
    const priceInput = document.getElementById('trade-price-input');
    const quantity = Math.min(parseInt(qtyInput?.value) || 1, item.quantity);
    const price = parseInt(priceInput?.value) || 0;

    if (quantity <= 0) {
      this.addCombatLog('❌ จำนวนต้องมากกว่า 0', 'warning');
      return;
    }

    // Show waiting spinner
    const waitOverlay = document.getElementById('trade-waiting-overlay');
    if (waitOverlay) waitOverlay.style.display = 'flex';

    try {
      const myName = this.character && this.character.stats ? this.character.stats.name : 'Player';
      await sendTradeRequestPacket(
        this.characterId,
        myName,
        this.tradeTarget.userId,
        this.tradeTarget.username || 'Player',
        item.item_name,
        item.item_type,
        quantity,
        price,
        item.stats || {}
      );

      // Start 30 seconds timeout
      this.tradeTimeout = setTimeout(() => {
        if (waitOverlay && waitOverlay.style.display !== 'none') {
          waitOverlay.style.display = 'none';
          this.addCombatLog('⏱️ คำขอการซื้อขายหมดเวลาไม่มีการตอบรับ', 'warning');
          this.tradeTarget = null;
          this.tradeSelectedItem = null;
        }
      }, 30000);

    } catch (err) {
      console.error('[Trade] Request Error:', err);
      this.addCombatLog('❌ เกิดข้อผิดพลาดในการส่งคำขอซื้อขาย', 'warning');
      if (waitOverlay) waitOverlay.style.display = 'none';
    }
  }

  receiveTradeRequest(payload) {
    if (!payload) return;
    this.activeTradeRequest = payload;

    // Populate confirm modal fields
    const senderName = document.getElementById('trade-confirm-sender-name');
    const senderLevel = document.getElementById('trade-confirm-sender-level');
    const itemName = document.getElementById('trade-confirm-item-name');
    const itemQty = document.getElementById('trade-confirm-item-qty');
    const itemIcon = document.getElementById('trade-confirm-item-icon');
    const priceDisplay = document.getElementById('trade-confirm-price-display');
    const acceptBtn = document.getElementById('btn-accept-trade');

    if (senderName) senderName.textContent = payload.senderName || 'Anonymous';
    if (senderLevel) senderLevel.style.display = 'none';

    const meta = ITEMS[payload.itemName] || {};
    if (itemIcon) itemIcon.textContent = meta.emoji || '📦';
    if (itemName) {
      itemName.textContent = payload.itemName;
      itemName.className = 'detail-name ' + `color-${meta.rarity || 'common'}`;
    }
    if (itemQty) itemQty.textContent = `จำนวน: x${payload.quantity}`;

    if (priceDisplay) {
      if (payload.price > 0) {
        priceDisplay.textContent = `ราคา: ${payload.price.toLocaleString()} Zeny`;
        priceDisplay.style.color = '#ffdd44';
      } else {
        priceDisplay.textContent = `ราคา: 0 Zeny (ฟรี)`;
        priceDisplay.style.color = '#40e080';
      }
    }

    // Check Receiver Zeny Gold
    if (acceptBtn) {
      const myGold = this.character && this.character.stats ? this.character.stats.gold : 0;
      if (payload.price > myGold) {
        acceptBtn.disabled = true;
        acceptBtn.style.opacity = '0.5';
        acceptBtn.textContent = 'Zeny ไม่พอ (Insufficient Zeny)';
      } else {
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
        acceptBtn.textContent = '🤝 ตกลง (Accept)';
      }
    }

    // Display the modal
    const panel = document.getElementById('trade-confirm-modal');
    if (panel) panel.style.display = 'flex';
  }

  receiveTradeCancel(payload) {
    if (!payload) return;
    if (this.activeTradeRequest && this.activeTradeRequest.senderUserId === payload.senderUserId) {
      const panel = document.getElementById('trade-confirm-modal');
      if (panel) panel.style.display = 'none';
      this.activeTradeRequest = null;
      const senderName = payload.requestPayload?.senderName || 'ผู้เล่น';
      this.addCombatLog(`🤝 ${senderName} ได้ยกเลิกคำขอโอนไอเทมและราคาเสนอแล้ว`, 'system');
    }
  }

  async _acceptIncomingTrade() {
    const req = this.activeTradeRequest;
    if (!req) return;

    // Check Receiver Zeny again to make sure
    const myGold = this.character && this.character.stats ? this.character.stats.gold : 0;
    if (req.price > myGold) {
      this.addCombatLog('❌ แต้ม Zeny ของคุณไม่เพียงพอสำหรับการซื้อขายนี้', 'warning');
      return;
    }

    try {
      // Execute receiver transaction logic
      await executeDecentralizedReceiverTrade(
        this.characterId,
        req.itemName,
        req.itemType,
        req.quantity,
        req.stats || {},
        req.price
      );

      // Re-load inventory to force refresh
      await this.loadInventoryFromDB(this.characterId);

      // Deduct gold from character stats locally so HUD renders correctly immediately
      if (this.character && this.character.stats) {
        this.character.stats.gold = Math.max(0, this.character.stats.gold - req.price);
        this.updateHUD(this.character.stats);
        this.updateStats(this.character.stats);
      }

      this.addCombatLog(`🤝 ได้รับ [${req.itemName}] x${req.quantity} จาก ${req.senderName}!`, 'loot');

      // Send Response accepted = true
      await sendTradeResponsePacket(req.senderUserId, req.targetUserId, true, req);

      // Close modal
      const panel = document.getElementById('trade-confirm-modal');
      if (panel) panel.style.display = 'none';
      this.activeTradeRequest = null;

    } catch (err) {
      console.error('[Trade] Accept Error:', err);
      this.addCombatLog('❌ เกิดข้อผิดพลาดในการตอบรับการซื้อขาย', 'warning');
    }
  }

  async _declineIncomingTrade() {
    const req = this.activeTradeRequest;
    if (!req) return;

    try {
      // Send Response accepted = false
      await sendTradeResponsePacket(req.senderUserId, req.targetUserId, false, req);

      // Close modal
      const panel = document.getElementById('trade-confirm-modal');
      if (panel) panel.style.display = 'none';
      this.activeTradeRequest = null;

    } catch (err) {
      console.error('[Trade] Decline Error:', err);
    }
  }

  async receiveTradeResponse(payload) {
    if (!payload) return;

    // Clear timeout & wait overlay
    if (this.tradeTimeout) {
      clearTimeout(this.tradeTimeout);
      this.tradeTimeout = null;
    }

    const waitOverlay = document.getElementById('trade-waiting-overlay');
    if (waitOverlay) waitOverlay.style.display = 'none';

    // Close trade panel
    const panel = document.getElementById('trade-panel');
    if (panel) panel.style.display = 'none';

    const req = payload.requestPayload;
    if (payload.accepted) {
      // Execute sender transaction logic
      try {
        await executeDecentralizedSenderTrade(
          this.characterId,
          req.targetName,
          req.itemName,
          req.itemType,
          req.quantity,
          req.price
        );

        // Deduct from local inventory
        const localItem = this.inventory.find(i => i.item_name === req.itemName);
        if (localItem) {
          localItem.quantity -= req.quantity;
          if (localItem.quantity <= 0) {
            const idx = this.inventory.indexOf(localItem);
            this.inventory.splice(idx, 1);
          }
        }

        // Add gold to character stats locally so HUD renders correctly immediately
        if (this.character && this.character.stats) {
          this.character.stats.gold = (this.character.stats.gold || 0) + req.price;
          this.updateHUD(this.character.stats);
          this.updateStats(this.character.stats);
        }

        this.addCombatLog(`🤝 ส่ง ${req.itemName} x${req.quantity} ให้ ${req.targetName} เรียบร้อยแล้ว!`, 'loot');
        this._renderInventory();

      } catch (err) {
        console.error('[Trade] Execute Sender Error:', err);
      }
    } else {
      this.addCombatLog(`❌ ${req.targetName} ปฏิเสธการโอนไอเทมการซื้อขาย`, 'warning');
    }

    this.tradeTarget = null;
    this.tradeSelectedItem = null;
  }

  // ============ Daily Quest System ============
  _setupDailyQuests() {
    this._checkDailyQuestsReset();

    const btnDaily = document.getElementById('btn-daily-quests');
    if (btnDaily) {
      btnDaily.addEventListener('click', () => {
        this._togglePanel('daily-quests-panel');
        this._renderDailyQuests();
      });
    }

    const btnSpin = document.getElementById('btn-spin-roulette');
    if (btnSpin) {
      btnSpin.addEventListener('click', () => {
        this._spinRoulette();
      });
    }
  }

  _checkDailyQuestsReset() {
    const today = new Date().toDateString();
    let data = null;
    try {
      const stored = localStorage.getItem('zolos_daily_quests');
      if (stored) {
        data = JSON.parse(stored);
      }
    } catch (e) {
      console.error('[Daily Quest] Failed to parse local storage:', e);
    }

    if (!data || data.lastDate !== today || !data.quests || data.quests.length < 4) {
      const previousStreak = data ? (data.streak || 0) : 0;
      let allCompletedYesterday = false;
      if (data && data.quests) {
        allCompletedYesterday = data.quests.every(q => q.current >= q.target);
      }

      const newStreak = allCompletedYesterday ? previousStreak + 1 : 0;

      // Select random monster
      const monsterPool = ['Poring', 'Fabre', 'Lunatic', 'Bigfoot', 'Fly'];
      const targetMonster = monsterPool[Math.floor(Math.random() * monsterPool.length)];

      // Select random consumable
      const consumePool = ['Apple', 'Carrot', 'Red Herb', 'Yellow Herb'];
      const targetConsumable = consumePool[Math.floor(Math.random() * consumePool.length)];

      data = {
        lastDate: today,
        streak: newStreak,
        rouletteSpent: false,
        quests: [
          {
            id: 'hunt',
            name: '⚔️ ล่ามอนสเตอร์ยอดนิยม',
            desc: `กำจัดตัวมอนเตอร์ ${targetMonster} จำนวน 5 ตัว`,
            targetName: targetMonster,
            current: 0,
            target: 5,
            rewardGold: 200,
            rewardExp: 150,
            isClaimed: false
          },
          {
            id: 'fish',
            name: '🎣 ท้าทายยอดนักตกปลา',
            desc: 'ตกปลาชนิดใดก็ได้จากแม่น้ำจำนวน 3 ตัว',
            targetName: 'any',
            current: 0,
            target: 3,
            rewardGold: 200,
            rewardExp: 150,
            isClaimed: false
          },
          {
            id: 'consume',
            name: '🥤 ผู้รักสุขภาพฟื้นพลัง',
            desc: `ใช้งานยาฟื้นพลัง ${targetConsumable} จำนวน 3 ชิ้น`,
            targetName: targetConsumable,
            current: 0,
            target: 3,
            rewardGold: 150,
            rewardExp: 100,
            isClaimed: false
          },
          {
            id: 'shop',
            name: '🛍️ เยี่ยมชมร้านค้าคาฟรา',
            desc: 'คุยกับ NPC คาฟรา เพื่อเปิดดูร้านค้า 1 ครั้ง',
            targetName: 'any',
            current: 0,
            target: 1,
            rewardGold: 100,
            rewardExp: 80,
            isClaimed: false
          }
        ]
      };

      localStorage.setItem('zolos_daily_quests', JSON.stringify(data));
      this.addCombatLog('📜 ได้รับภารกิจรายวันชุดใหม่เรียบร้อยแล้ว! แตะที่ปุ่ม Quest เพื่อเปิดดู', 'system');
    }

    this.dailyQuestsState = data;
  }

  _renderDailyQuests() {
    const listContainer = document.getElementById('quest-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const state = this.dailyQuestsState;
    if (!state || !state.quests) return;

    const streakVal = document.getElementById('val-quest-streak');
    if (streakVal) streakVal.textContent = state.streak;

    let completedCount = 0;

    state.quests.forEach((q, idx) => {
      const isCompleted = q.current >= q.target;
      if (isCompleted) completedCount++;

      const pct = Math.min(100, Math.floor((q.current / q.target) * 100));

      const row = document.createElement('div');
      row.className = `quest-row ${isCompleted ? 'completed' : ''}`;

      row.innerHTML = `
        <div class="quest-header-row">
          <span class="quest-title-text">${q.name}</span>
          <span class="quest-status-badge">${isCompleted ? 'สำเร็จ' : 'กำลังทำ'}</span>
        </div>
        <div class="quest-desc-text">${q.desc}</div>
        <div class="quest-progress-container">
          <div class="quest-progress-bg">
            <div class="quest-progress-fill" style="width: ${pct}%;"></div>
          </div>
          <span class="quest-progress-text">${q.current} / ${q.target}</span>
        </div>
        <div class="quest-reward-row">
          <span class="quest-reward-span">🪙 +${q.rewardGold}z | ✨ +${q.rewardExp}xp</span>
          <button class="btn-quest-claim" id="btn-claim-quest-${idx}" ${isCompleted && !q.isClaimed ? '' : 'disabled'}>
            ${q.isClaimed ? 'รับแล้ว' : 'รับรางวัล'}
          </button>
        </div>
      `;

      listContainer.appendChild(row);

      const claimBtn = row.querySelector(`#btn-claim-quest-${idx}`);
      if (claimBtn && isCompleted && !q.isClaimed) {
        claimBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._claimQuestReward(idx);
        });
      }
    });

    const spinBtn = document.getElementById('btn-spin-roulette');
    if (spinBtn) {
      if (completedCount >= 3) {
        if (state.rouletteSpent) {
          spinBtn.textContent = '🎡 สปินแล้ววันนี้ (สุ่มใหม่ในวันพรุ่งนี้)';
          spinBtn.disabled = true;
        } else {
          spinBtn.textContent = '🎡 สปินวงล้อเสี่ยงโชครับไอเทมเทพ!';
          spinBtn.disabled = false;
        }
      } else {
        spinBtn.textContent = `🎡 ล็อควงล้อนำโชค (เคลียร์เควส ${completedCount}/3)`;
        spinBtn.disabled = true;
      }
    }
  }

  _claimQuestReward(idx) {
    const state = this.dailyQuestsState;
    if (!state || !state.quests || !state.quests[idx]) return;

    const q = state.quests[idx];
    if (q.isClaimed || q.current < q.target) return;

    q.isClaimed = true;
    localStorage.setItem('zolos_daily_quests', JSON.stringify(state));

    if (this.character && this.character.stats) {
      this.character.stats.gold += q.rewardGold;
      const leveledUp = this.character.addExp(q.rewardExp);

      this.addCombatLog(`🎉 รับรางวัลเควส: +${q.rewardGold} Zeny และ +${q.rewardExp} EXP!`, 'gold');

      if (leveledUp) {
        if (this.soundManager && this.soundManager.playLevelUpSound) {
          this.soundManager.playLevelUpSound();
        }
        this.addCombatLog(`🎉 LEVEL UP! เลเวลของคุณตอนนี้คือ ${this.character.stats.level}!`, 'levelup');
      }

      this.updateHUD(this.character.stats);
      this.updateStats(this.character.stats);
    }

    this._renderDailyQuests();
    if (this.soundManager && this.soundManager.playUseItemSound) {
      this.soundManager.playUseItemSound();
    }
  }

  _spinRoulette() {
    const state = this.dailyQuestsState;
    if (!state || state.rouletteSpent) return;

    const spinBtn = document.getElementById('btn-spin-roulette');
    const display = document.getElementById('roulette-rewards-display');
    const strip = document.getElementById('roulette-strip');
    if (!spinBtn || !display || !strip) return;

    state.rouletteSpent = true;
    localStorage.setItem('zolos_daily_quests', JSON.stringify(state));
    spinBtn.disabled = true;
    spinBtn.textContent = '🎡 กำลังหมุนเสี่ยงโชค...';

    // Roster of items in the pool
    const pool = [
      { name: 'Apple', emoji: '🍎', rarity: 'common' },
      { name: 'Carrot', emoji: '🥕', rarity: 'common' },
      { name: 'Red Herb', emoji: '🌿', rarity: 'common' },
      { name: 'Yellow Elixir', emoji: '🧪', rarity: 'rare' },
      { name: 'Emperium Crystal', emoji: '💎', rarity: 'legendary' },
      { name: 'Ghostring Scroll', emoji: '📜', rarity: 'legendary' },
      { name: 'Golden Deviruchi Hat', emoji: '👑', rarity: 'legendary' }
    ];

    strip.innerHTML = '';
    const itemsCount = 35;
    const stripItems = [];
    for (let i = 0; i < itemsCount; i++) {
      let item;
      if (i === 28) {
        const rng = Math.random();
        if (rng < 0.05) item = pool[6]; // Golden Deviruchi Hat
        else if (rng < 0.15) item = pool[5]; // Ghostring Scroll
        else if (rng < 0.3) item = pool[4]; // Emperium Crystal
        else if (rng < 0.5) item = pool[3]; // Yellow Elixir
        else item = pool[Math.floor(Math.random() * 3)];
      } else {
        item = pool[Math.floor(Math.random() * pool.length)];
      }
      stripItems.push(item);

      const itemBox = document.createElement('div');
      itemBox.className = `roulette-item-box rarity-${item.rarity}`;
      itemBox.innerHTML = `<span>${item.emoji}</span>`;
      itemBox.title = item.name;
      strip.appendChild(itemBox);
    }

    const winner = stripItems[28];
    display.style.display = 'flex';
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0px)';

    if (this.soundManager && this.soundManager.playUseItemSound) {
      this.soundManager.playUseItemSound();
    }

    setTimeout(() => {
      strip.style.transition = 'transform 3.5s cubic-bezier(0.1, 0.8, 0.1, 1)';
      const offset = -(28 * 54) + 120;
      strip.style.transform = `translateX(${offset}px)`;
    }, 50);

    setTimeout(() => {
      const winBox = strip.childNodes[28];
      if (winBox) winBox.classList.add('selected-outcome');

      this.addItem({
        name: winner.name,
        type: winner.rarity === 'common' ? 'consumable' : (winner.name.includes('Hat') ? 'hat' : 'material'),
        emoji: winner.emoji
      });

      this.addCombatLog(`🎡 กงล้อหมุนหยุดที่: รับไอเทมดรอปแดนสวรรค์ [${winner.emoji} ${winner.name}]!`, 'loot');

      if (winner.rarity === 'legendary') {
        if (this.soundManager && this.soundManager.playLevelUpSound) {
          this.soundManager.playLevelUpSound();
        }
      }

      spinBtn.textContent = '🎡 สปินแล้ววันนี้ (สุ่มใหม่ในวันพรุ่งนี้)';
      this._renderDailyQuests();
    }, 3800);
  }

  incrementQuestProgress(type, targetName = '') {
    const state = this.dailyQuestsState;
    if (!state || !state.quests) return;

    let updated = false;
    state.quests.forEach(q => {
      if (q.id === type) {
        if (q.targetName === 'any' || q.targetName === targetName) {
          if (q.current < q.target) {
            q.current++;
            updated = true;
            this.addCombatLog(`📈 ภารกิจ [${q.name}]: คืบหน้า ${q.current}/${q.target}`, 'system');

            if (q.current === q.target) {
              this.addCombatLog(`✨ ภารกิจ [${q.name}] สำเร็จแล้ว! กดรับรางวัลได้เลย`, 'levelup');
            }
          }
        }
      }
    });

    if (updated) {
      localStorage.setItem('zolos_daily_quests', JSON.stringify(state));
      const panel = document.getElementById('daily-quests-panel');
      if (panel && panel.style.display !== 'none') {
        this._renderDailyQuests();
      }
    }
  }
}

