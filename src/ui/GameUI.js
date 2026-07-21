import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, GLAST_MONSTERS, MJOLNIR_MONSTERS, ABYSS_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS, SKILLS, FISH_SPECIES, FORGE_RECIPES, PICKAXES, JOBS, JOB_UNLOCK_LEVEL, JOB_CHANGE_COST, canEquipItem, itemJob, EQUIP_SLOTS, ARMOR_SLOTS, getEquipSlot, getJobStats } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats, getDeterministicGuestName, isPlaceholderName, sendTradeRequestPacket, sendTradeResponsePacket, sendTradeCancelPacket, executeDecentralizedSenderTrade, executeDecentralizedReceiverTrade, sendFriendRequestPacket, sendFriendResponsePacket, saveDailyQuests, loadDailyQuests, saveFriendsList, loadFriendsList, saveFishingAlmanac, loadFishingAlmanac, saveLoginStreak, loadLoginStreak, broadcastKillStreak } from '../network/GameSync.js';
import { LayoutManager } from './LayoutManager.js';
import { PlayerProfileModal } from './PlayerProfileModal.js';


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
    this.playerProfileModal = new PlayerProfileModal();
    this._setupLeaderboardTabs();
    this._setupOnlineTabs();
    this._setupAutoBot();
    this._setupTargetIndicator();
    this._setupTradePanel();
    this._setupMobileControls();
    this._setupDailyQuests();
    this._setupNetworkStatus();
    this._setupRespawnShortcut();
    this.layoutManager = new LayoutManager(this);
    window.gameUI = this;
    this.killStreak = 0;
  }

  _setupRespawnShortcut() {
    const btn = document.getElementById('btn-respawn-now');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (this.character && !this.character.isAlive()) {
        this.character.respawn();
        this.killStreak = 0;
        this.addCombatLog('💚 คุณเกิดใหม่แล้ว!', 'system');
        this.updateHUD(this.character.stats);
        btn.style.display = 'none';
      }
    });
  }

  _setupNetworkStatus() {
    this.networkDot = document.getElementById('network-dot');
    this.networkText = document.getElementById('network-text');
    this.networkStatusEl = document.getElementById('network-status');

    // Update every 2 seconds
    setInterval(() => {
      this.updateNetworkStatus();
    }, 2000);
  }

  async updateNetworkStatus() {
    if (!this.networkDot || !this.networkText) return;

    const { isSocketConnected, isSocketMode } = await import('../network/SocketClient.js');
    const connected = isSocketConnected();
    const socketMode = isSocketMode();

    const { isOfflineMode } = await import('../network/SupabaseClient.js');

    if (!socketMode) {
      this.networkDot.style.background = isOfflineMode ? '#888' : '#40a0ff';
      this.networkText.textContent = isOfflineMode ? 'LOCAL' : 'CLOUD';
      this.networkText.style.color = isOfflineMode ? '#aaa' : '#40a0ff';
      if (this.networkStatusEl) this.networkStatusEl.style.color = isOfflineMode ? '#aaa' : '#40a0ff';
    } else if (connected) {
      this.networkDot.style.background = '#0f0';
      this.networkText.textContent = 'ONLINE';
      this.networkText.style.color = '#0f0';
      if (this.networkStatusEl) this.networkStatusEl.style.color = '#0f0';
    } else {
      this.networkDot.style.background = '#f44';
      this.networkText.textContent = 'OFFLINE';
      this.networkText.style.color = '#f44';
      if (this.networkStatusEl) this.networkStatusEl.style.color = '#f44';
    }
  }

  _setupTargetIndicator() {
    this.targetIndicator = document.getElementById('target-indicator');
    this.targetName = document.getElementById('target-name');
    this.targetHpFill = document.getElementById('target-hp-fill');
    this.currentTargetMonster = null;
  }

  clearTarget() {
    if (this.targetIndicator) this.targetIndicator.style.display = 'none';
    this.currentTargetMonster = null;
    this.hoveredMonster = null;
    if (this.character) this.character.targetMonster = null;
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
        if (window.duelState) {
          this.addCombatLog("🚫 ไม่สามารถเปิดบอทขณะดวล PVP ได้", 'system');
          return;
        }
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
        if (window.duelState) {
          this.addCombatLog("🚫 ไม่สามารถตกปลาขณะดวล PVP ได้", 'system');
          return;
        }
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

    // ⛏️ Mine button — appears when standing near a Celestial Ore node (driven
    // by the game loop via setMineTarget). Toggles the auto-mining job on/off.
    const mineBtn = document.getElementById('btn-mine');
    if (mineBtn) {
      mineBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.mineOreNode(this._mineTargetNode);
      });
    }
  }

  // Called each frame with the nearest un-mined ore node in range (or null).
  // When mining, a null target just means "the node is depleted / respawning"
  // (or you stepped away) — the job idles and resumes automatically once an ore
  // node is back in range, so it keeps "working" without falsely stopping.
  setMineTarget(node) {
    this._mineTargetNode = node || null;
    this._updateMineButton();
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
          const almanac = document.getElementById('almanac-modal');
          if (almanac) almanac.style.display = 'none';
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

    const btnAlmanac = document.getElementById('btn-almanac');
    if (btnAlmanac) {
      btnAlmanac.addEventListener('click', () => this.openFishingAlmanac());
    }

    const btnDailyReward = document.getElementById('btn-daily-reward');
    if (btnDailyReward) {
      btnDailyReward.addEventListener('click', () => this.openDailyReward());
    }

    const btnVendingStall = document.getElementById('btn-vending-stall');
    if (btnVendingStall) {
      btnVendingStall.addEventListener('click', () => this._openVendingStallSetup());
    }

    const btnWarp = document.getElementById('btn-warp');
    if (btnWarp) {
      btnWarp.addEventListener('click', (e) => {
        console.log('[GameUI] btn-warp clicked');
        this.openWarpMap();
      });
    } else {
      console.warn('[GameUI] btn-warp not found in DOM');
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
    // The Fishing Almanac is a standalone overlay (not a .side-panel) — close it
    // too so opening any other menu dismisses it.
    const almanac = document.getElementById('almanac-modal');
    if (almanac) almanac.style.display = 'none';
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

    // Check the Fishing Almanac overlay (standalone modal, not a .side-panel)
    const almanacModal = document.getElementById('almanac-modal');
    if (almanacModal) {
      const display = almanacModal.style.display || window.getComputedStyle(almanacModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Check the Forge overlay (standalone modal)
    const forgeModal = document.getElementById('forge-modal');
    if (forgeModal) {
      const display = forgeModal.style.display || window.getComputedStyle(forgeModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Check the Daily Reward overlay (standalone modal)
    const dailyModal = document.getElementById('daily-modal');
    if (dailyModal) {
      const display = dailyModal.style.display || window.getComputedStyle(dailyModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Check the Vending Stall shop overlay (standalone modal)
    const stallModal = document.getElementById('stall-modal');
    if (stallModal) {
      const display = stallModal.style.display || window.getComputedStyle(stallModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Check the Heaven Merchant overlay (standalone modal)
    const heavenModal = document.getElementById('heaven-modal');
    if (heavenModal) {
      const display = heavenModal.style.display || window.getComputedStyle(heavenModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Check the Job/Class picker overlay (standalone modal, id="job-modal").
    // It sits at the same z-index as the mobile pad, so if we don't hide the
    // controls the joystick / action buttons float over it and eat taps —
    // which is why its buttons felt unresponsive / hard to close on mobile.
    const jobModal = document.getElementById('job-modal');
    if (jobModal) {
      const display = jobModal.style.display || window.getComputedStyle(jobModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Check the Warp Map overlay
    const warpModal = document.getElementById('warp-modal');
    if (warpModal) {
      const display = warpModal.style.display || window.getComputedStyle(warpModal).display;
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
  setMapName(mapName, mapId) {
    const el = document.getElementById('map-name');
    if (el) el.textContent = mapName;
    if (mapId) {
      this.currentMapId = mapId;
      // Refresh online players list when map changes to filter correctly
      this._renderOnlinePlayers();
    }
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
    const hudGold = document.getElementById('hud-gold-amount');
    if (hudGold) hudGold.textContent = stats.gold.toLocaleString();
    const hudZol = document.getElementById('hud-zol-amount');
    if (hudZol) hudZol.textContent = (Number(stats.zol) || 0).toLocaleString();
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
      this.inventory = rawInv.filter(i => i.item_type !== 'system').map(i => this._enrichItem(i));

      // Job locking: auto-unequip any worn item (weapon/hat/glasses) this class
      // can't use — e.g. gear equipped before this update or before a job change.
      const myJob = this.character?.stats?.job || null;
      for (const it of this.inventory) {
        if (it.item_type !== 'weapon' && it.item_type !== 'hat' && it.item_type !== 'glasses') continue;
        if (it.stats && it.stats.equipped === true && !canEquipItem(it.item_name, myJob)) {
          it.stats.equipped = false;
          if (this.characterId) updateInventoryItemStats(this.characterId, it.item_name, it.stats).catch(() => { });
        }
      }

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

      // Restore every equipped armor piece into its own body-part slot. If two
      // saved items claim the same slot (shouldn't happen), the last one wins.
      if (this.character) {
        for (const s of ARMOR_SLOTS) this.character.equippedGear[s] = null;
        for (const it of this.inventory) {
          if (it.item_type === 'armor' && it.stats && it.stats.equipped === true) {
            const slot = getEquipSlot(it.item_name) || 'body';
            this.character.equippedGear[slot] = it.item_name;
          }
        }
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

      // Show the loaded armor/shield pieces on the hero model.
      if (this.character && this.character.updateGearVisuals) this.character.updateGearVisuals();

      // Migrate pickaxes saved before durability existed: a missing `durability`
      // means "bought under the old rules", so give it a full bar rather than
      // letting it read as broken.
      for (const it of this.inventory) {
        if (it.item_type !== 'tool' || !ITEMS[it.item_name] || !ITEMS[it.item_name].durability) continue;
        if (!it.stats) it.stats = {};
        if (it.stats.durability == null) {
          it.stats.durability = ITEMS[it.item_name].durability;
          if (this.characterId) updateInventoryItemStats(this.characterId, it.item_name, it.stats).catch(() => { });
        }
      }

      // Restore the equipped pickaxe (mining tool) so mining works after reload.
      const equippedPick = this.inventory.find(i => i.item_type === 'tool' && i.stats && i.stats.equipped === true);
      if (this.character) this.character.equippedPickaxe = equippedPick ? equippedPick.item_name : null;

      // Already handled weapon restoration above
    } catch (e) {
      console.error('Failed to load inventory:', e);
      this.inventory = [];
    }
    this._renderInventory();
  }

  // ============ Daily Quests load/save helpers ============
  async loadDailyQuestsFromDB(characterId) {
    if (!characterId) return;
    this.characterId = characterId;
    try {
      const localKey = `zolos_daily_quests_${characterId}`;
      let localData = null;
      try {
        const stored = localStorage.getItem(localKey);
        if (stored) localData = JSON.parse(stored);
      } catch (e) { }

      // Load from DB
      const dbQuests = await loadDailyQuests(characterId);
      const today = new Date().toDateString();

      let selectedState = null;
      if (dbQuests && dbQuests.lastDate === today) {
        selectedState = dbQuests;
      } else if (localData && localData.lastDate === today) {
        selectedState = localData;
      }

      if (selectedState) {
        this.dailyQuestsState = selectedState;
        localStorage.setItem(localKey, JSON.stringify(selectedState));
        localStorage.setItem('zolos_daily_quests', JSON.stringify(selectedState));
        await saveDailyQuests(characterId, selectedState);
      } else {
        // Force refresh daily quests
        this._checkDailyQuestsReset();
      }

      this._renderDailyQuests();
    } catch (e) {
      console.error('[Zolos] Failed to load daily quests from DB:', e);
    }
  }

  async _saveDailyQuestsToDB() {
    const state = this.dailyQuestsState;
    if (!state) return;
    try {
      localStorage.setItem('zolos_daily_quests', JSON.stringify(state));
      if (this.characterId) {
        const localKey = `zolos_daily_quests_${this.characterId}`;
        localStorage.setItem(localKey, JSON.stringify(state));
        await saveDailyQuests(this.characterId, state);
      }
    } catch (e) {
      console.error('[Zolos] Failed to save daily quests:', e);
    }
  }

  // ============ Friends List load/save helpers ============
  async loadFriendsFromDB(characterId) {
    if (!characterId) return;
    try {
      const localKey = `zolos_friends_${characterId}`;
      let localFriends = [];
      try {
        const stored = localStorage.getItem(localKey);
        if (stored) localFriends = JSON.parse(stored);
      } catch (e) { }

      const dbFriends = await loadFriendsList(characterId);
      if (dbFriends && dbFriends.length > 0) {
        this.friends = dbFriends;
      } else {
        this.friends = localFriends;
      }

      localStorage.setItem(localKey, JSON.stringify(this.friends));
      localStorage.setItem('zolos_friends', JSON.stringify(this.friends));

      if (this.onlinePlayers) this.updateOnlinePlayers(this.onlinePlayers);
    } catch (e) {
      console.error('[Zolos] Failed to load friends from DB:', e);
    }
  }

  async _saveFriendsListToDB() {
    if (!this.characterId) return;
    try {
      const localKey = `zolos_friends_${this.characterId}`;
      localStorage.setItem(localKey, JSON.stringify(this.friends));
      localStorage.setItem('zolos_friends', JSON.stringify(this.friends));
      await saveFriendsList(this.characterId, this.friends);
    } catch (e) {
      console.error('[Zolos] Failed to save friends list:', e);
    }
  }

  /**
   * Flush all inventory item stats to database (Safety net for logout/exit).
   * This ensures every item in the local inventory exists in Supabase with
   * the correct quantity AND stats, so nothing is lost on reload.
   */
  async _flushInventoryToDB() {
    if (!this.characterId || !this.inventory) return;
    const { saveInventoryItem, updateInventoryItemStats } = await import('../network/GameSync.js');

    // Flush ALL items (not just equipped ones) so that items bought but never
    // equipped still have a confirmed DB row with the right quantity.
    for (const item of this.inventory) {
      try {
        // First ensure the item exists in DB with correct quantity
        await saveInventoryItem(this.characterId, item.item_name, item.item_type, item.quantity, item.stats || {});
        // Then update the stats (equipped state, durability, etc.)
        if (item.stats && Object.keys(item.stats).length > 0) {
          await updateInventoryItemStats(this.characterId, item.item_name, item.stats);
        }
      } catch (e) {
        console.error(`[Zolos] ❌ _flushInventoryToDB failed for ${item.item_name}:`, e.message);
      }
    }
    console.log(`[Zolos] 💾 _flushInventoryToDB completed for ${this.inventory.length} items, characterId=${this.characterId}`);
  }

  // ============ Fishing Almanac ============
  // A collection log of every fish species. Each new species caught grants a
  // small discovery bonus; completing a whole rarity tier (or the entire book)
  // grants a big claimable reward. Persisted like daily quests / friends.
  async loadFishingAlmanacFromDB(characterId) {
    if (!characterId) return;
    this.characterId = characterId;
    this.almanac = { caught: [], claimed: [] };
    try {
      const localKey = `zolos_almanac_${characterId}`;
      let local = null;
      try { const s = localStorage.getItem(localKey); if (s) local = JSON.parse(s); } catch (e) { }
      const db = await loadFishingAlmanac(characterId);
      // Merge DB + local so nothing is ever lost (union of caught species)
      const merged = { caught: [], claimed: [] };
      const caught = new Set([...(db?.caught || []), ...(local?.caught || [])]);
      const claimed = new Set([...(db?.claimed || []), ...(local?.claimed || [])]);
      merged.caught = [...caught];
      merged.claimed = [...claimed];
      this.almanac = merged;
      localStorage.setItem(localKey, JSON.stringify(merged));
    } catch (e) {
      console.error('[Zolos] Failed to load fishing almanac:', e);
    }
    // Restore the Master Angler title for completed collectors
    if (this.almanac.claimed.includes('all') && this.character && this.character.setTitle) {
      this.character.setTitle('master_angler');
    }
  }

  async _saveFishingAlmanac() {
    if (!this.almanac) return;
    try {
      if (this.characterId) {
        localStorage.setItem(`zolos_almanac_${this.characterId}`, JSON.stringify(this.almanac));
        await saveFishingAlmanac(this.characterId, this.almanac);
      }
    } catch (e) {
      console.error('[Zolos] Failed to save fishing almanac:', e);
    }
  }

  // Per-species discovery bonus (gold) and per-tier completion rewards.
  static get _ALMANAC_DISCOVERY() { return { common: 50, uncommon: 150, rare: 500, legendary: 2000 }; }
  static get _ALMANAC_TIER_REWARD() {
    return {
      common: { gold: 3000 },
      uncommon: { gold: 8000 },
      rare: { gold: 20000 },
      legendary: { gold: 60000 },
      all: { gold: 150000, item: { name: 'Master Angler Trophy', type: 'material', emoji: '🏆', rarity: 'legendary', price: 99999, desc: 'ถ้วยรางวัลสุดยอดนักตกปลา — จับปลาครบทุกชนิดในสมุดสะสม!' } },
    };
  }

  _almanacTierCounts() {
    if (!this.almanac) this.almanac = { caught: [], claimed: [] };
    const caught = new Set(this.almanac.caught);
    const totals = {}, got = {};
    for (const [name, data] of Object.entries(FISH_SPECIES)) {
      totals[data.rarity] = (totals[data.rarity] || 0) + 1;
      if (caught.has(name)) got[data.rarity] = (got[data.rarity] || 0) + 1;
    }
    return { totals, got, caughtTotal: caught.size, grandTotal: Object.keys(FISH_SPECIES).length };
  }

  // Called from the fishCaught flow. Records a species; grants the discovery
  // bonus the first time it's seen and auto-refreshes the almanac if open.
  recordFishCatch(item) {
    if (!item || (item.type && item.type !== 'fish')) return;
    const name = item.name || item.item_name;
    if (!name || !FISH_SPECIES[name]) return;
    if (!this.almanac) this.almanac = { caught: [], claimed: [] };
    if (this.almanac.caught.includes(name)) return; // already discovered

    this.almanac.caught.push(name);
    const rarity = FISH_SPECIES[name].rarity;
    const bonus = GameUI._ALMANAC_DISCOVERY[rarity] || 50;
    if (this.character && this.character.stats) {
      this.character.stats.gold = (Number(this.character.stats.gold) || 0) + bonus;
      this.updateHUD(this.character.stats);
    }
    const rEmoji = { common: '⚪', uncommon: '🟢', rare: '🔵', legendary: '🟡' }[rarity] || '⚪';
    this.addCombatLog(`📖 พบปลาชนิดใหม่! ${item.emoji || '🐟'} ${name} ${rEmoji} (+${bonus} Gold) — สมุดสะสม ${this._almanacTierCounts().caughtTotal}/${this._almanacTierCounts().grandTotal}`, 'loot');
    this._saveFishingAlmanac();
    // If a tier just got completed, nudge the player
    this._notifyAlmanacCompletions();
    const modal = document.getElementById('almanac-modal');
    if (modal && modal.style.display !== 'none') this._renderAlmanac();
  }

  _notifyAlmanacCompletions() {
    const { totals, got } = this._almanacTierCounts();
    const claimed = new Set(this.almanac.claimed);
    const label = { common: 'ธรรมดา', uncommon: 'พบบ่อย', rare: 'หายาก', legendary: 'ตำนาน' };
    for (const tier of ['common', 'uncommon', 'rare', 'legendary']) {
      if (totals[tier] && got[tier] === totals[tier] && !claimed.has(tier)) {
        this.addCombatLog(`🎉 สะสมปลาระดับ "${label[tier]}" ครบแล้ว! เปิดสมุดปลา 📖 เพื่อรับรางวัล`, 'levelup');
      }
    }
    const allDone = ['common', 'uncommon', 'rare', 'legendary'].every(t => totals[t] && got[t] === totals[t]);
    if (allDone && !claimed.has('all')) {
      this.addCombatLog('👑 คุณจับปลาครบทุกชนิดแล้ว! เปิดสมุดปลารับรางวัลใหญ่สุดพิเศษ!', 'levelup');
    }
  }

  _claimAlmanacReward(tier) {
    const { totals, got } = this._almanacTierCounts();
    if (!this.almanac) return;
    const claimed = new Set(this.almanac.claimed);
    if (claimed.has(tier)) return;

    let complete = false;
    if (tier === 'all') {
      complete = ['common', 'uncommon', 'rare', 'legendary'].every(t => totals[t] && got[t] === totals[t]);
    } else {
      complete = totals[tier] && got[tier] === totals[tier];
    }
    if (!complete) return;

    const reward = GameUI._ALMANAC_TIER_REWARD[tier];
    if (this.character && this.character.stats) {
      this.character.stats.gold = (Number(this.character.stats.gold) || 0) + (reward.gold || 0);
      this.updateHUD(this.character.stats);
    }
    if (reward.item) this.addItem(reward.item);
    this.almanac.claimed.push(tier);
    this._saveFishingAlmanac();

    const label = { common: 'ธรรมดา', uncommon: 'พบบ่อย', rare: 'หายาก', legendary: 'ตำนาน', all: 'ครบทุกชนิด' }[tier];
    this.addCombatLog(`🏅 รับรางวัลสะสมปลา "${label}": +${(reward.gold || 0).toLocaleString()} Gold${reward.item ? ` + ${reward.item.emoji} ${reward.item.name}` : ''}!`, 'levelup');
    if (this.soundManager) this.soundManager.playLevelUpSound();

    // Completing the whole almanac awards the glowing Master Angler title
    if (tier === 'all' && this.character && this.character.setTitle) {
      this.character.setTitle('master_angler');
      this.addCombatLog('👑 ปลดล็อกฉายา "🏆 Master Angler" — เรืองแสงเหนือหัวให้ทุกคนเห็น!', 'levelup');
      if (this.triggerScreenShake) this.triggerScreenShake(true);
      try {
        if (window.particles && this.character.getPosition) window.particles.createExplosion(this.character.getPosition(), 0xffd24a);
      } catch (e) { /* non-fatal */ }
    }
    this._renderAlmanac();
  }

  openFishingAlmanac() {
    // Responsive styles (injected once). On mobile the overlay is anchored near
    // the top and reserves space at the bottom so it never covers the HUD /
    // skill buttons; the card height is capped and its body scrolls internally.
    if (!document.getElementById('almanac-style')) {
      const st = document.createElement('style');
      st.id = 'almanac-style';
      st.textContent = `
        #almanac-modal{position:fixed;inset:0;z-index:1400;display:none;align-items:center;justify-content:center;
          background:rgba(0,0,0,.6);backdrop-filter:blur(3px);padding:12px;box-sizing:border-box;}
        #almanac-card{width:min(680px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:16px;
          background:linear-gradient(160deg,#12233a,#0d1526);border:1.5px solid #2f6fb0;
          box-shadow:0 20px 60px rgba(0,0,0,.7);overflow:hidden;}
        #almanac-card .almanac-head{flex:0 0 auto;}
        #almanac-card .almanac-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}
        @media (max-width:768px){
          #almanac-modal{align-items:flex-start;padding:8px 8px 116px;}
          #almanac-card{width:100%;max-height:calc(100vh - 132px);max-height:calc(100dvh - 132px);}
        }`;
      document.head.appendChild(st);
    }
    let modal = document.getElementById('almanac-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'almanac-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); }
      });
      modal.innerHTML = `<div id="almanac-card"></div>`;
      document.body.appendChild(modal);
    }
    // Close any open side panels so the almanac doesn't stack on top of them.
    document.querySelectorAll('.side-panel').forEach(p => { p.style.display = 'none'; });
    this._renderAlmanac();
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderAlmanac() {
    const card = document.getElementById('almanac-card');
    if (!card) return;
    if (!this.almanac) this.almanac = { caught: [], claimed: [] };
    const caught = new Set(this.almanac.caught);
    const claimed = new Set(this.almanac.claimed);
    const { totals, got, caughtTotal, grandTotal } = this._almanacTierCounts();

    const tierMeta = {
      common: { label: 'ธรรมดา', color: '#b8c4d0', badge: '⚪' },
      uncommon: { label: 'พบบ่อย', color: '#5fdd7a', badge: '🟢' },
      rare: { label: 'หายาก', color: '#4aa3ff', badge: '🔵' },
      legendary: { label: 'ตำนาน', color: '#ffcf4a', badge: '🟡' },
    };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let sections = '';
    for (const tier of ['common', 'uncommon', 'rare', 'legendary']) {
      const m = tierMeta[tier];
      const tierFish = Object.entries(FISH_SPECIES).filter(([, d]) => d.rarity === tier);
      const done = got[tier] === totals[tier];
      const canClaim = done && !claimed.has(tier);
      const claimedTier = claimed.has(tier);
      const rw = GameUI._ALMANAC_TIER_REWARD[tier];

      const slots = tierFish.map(([name, d]) => {
        const has = caught.has(name);
        return `<div title="${has ? esc(name) + ' — ' + esc(d.desc) : 'ยังไม่ค้นพบ'}"
          style="aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;
          background:${has ? 'rgba(74,163,255,.12)' : 'rgba(255,255,255,.03)'};border:1px solid ${has ? m.color + '66' : 'rgba(255,255,255,.06)'};">
          <div style="font-size:20px;${has ? '' : 'filter:grayscale(1);opacity:.3;'}">${has ? (d.emoji || '🐟') : '❓'}</div>
          <div style="font-size:8px;text-align:center;line-height:1.1;color:${has ? '#dfe8f2' : '#54606e'};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${has ? esc(name) : '???'}</div>
        </div>`;
      }).join('');

      const claimBtn = canClaim
        ? `<button data-almanac-claim="${tier}" style="border:none;border-radius:16px;padding:5px 14px;cursor:pointer;font-weight:800;font-size:12px;background:linear-gradient(135deg,#ffcf4a,#ff9e2e);color:#3a2600;">🎁 รับ +${rw.gold.toLocaleString()}g</button>`
        : claimedTier
          ? `<span style="font-size:11px;color:#5fdd7a;font-weight:700;">✅ รับแล้ว</span>`
          : `<span style="font-size:11px;color:#7f8b99;">รางวัล +${rw.gold.toLocaleString()}g</span>`;

      sections += `
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-weight:800;color:${m.color};font-size:14px;">${m.badge} ${m.label}</span>
            <span style="font-size:12px;color:#8a97a5;">${got[tier] || 0}/${totals[tier]}</span>
            <span style="flex:1;"></span>
            ${claimBtn}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:6px;">${slots}</div>
        </div>`;
    }

    const allDone = ['common', 'uncommon', 'rare', 'legendary'].every(t => got[t] === totals[t]);
    const allClaimed = claimed.has('all');
    const allRw = GameUI._ALMANAC_TIER_REWARD.all;
    const grandBanner = `
      <div style="margin-top:6px;padding:12px;border-radius:12px;background:linear-gradient(135deg,rgba(255,207,74,.14),rgba(255,90,40,.08));border:1px solid ${allDone ? '#ffcf4a' : 'rgba(255,255,255,.08)'};display:flex;align-items:center;gap:10px;">
        <div style="font-size:26px;">${allClaimed ? '👑' : '🏆'}</div>
        <div style="flex:1;">
          <div style="font-weight:800;color:#ffcf6a;font-size:13px;">รางวัลใหญ่: จับครบทั้งหมด (${caughtTotal}/${grandTotal})</div>
          <div style="font-size:11px;color:#c9d4df;">+${allRw.gold.toLocaleString()} Gold + ${allRw.item.emoji} ${allRw.item.name}</div>
        </div>
        ${allDone && !allClaimed
        ? `<button data-almanac-claim="all" style="border:none;border-radius:18px;padding:8px 18px;cursor:pointer;font-weight:800;background:linear-gradient(135deg,#ffcf4a,#ff7a2e);color:#3a2600;">รับรางวัล</button>`
        : allClaimed ? `<span style="color:#5fdd7a;font-weight:800;font-size:12px;">✅ รับแล้ว</span>` : `<span style="color:#7f8b99;font-size:11px;">ยังไม่ครบ</span>`}
      </div>`;

    const pct = Math.round((caughtTotal / grandTotal) * 100);
    card.innerHTML = `
      <div class="almanac-head" style="padding:16px 18px;background:linear-gradient(90deg,#173352,#0f1c30);border-bottom:1px solid #2f6fb0;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:22px;">📖</div>
          <div style="flex:1;">
            <div style="font-weight:900;color:#eaf2fb;font-size:17px;">สมุดสะสมปลา</div>
            <div style="font-size:11px;color:#8fa3b8;">Fishing Almanac — ค้นพบแล้ว ${caughtTotal}/${grandTotal} ชนิด (${pct}%)</div>
          </div>
          <button id="almanac-close" style="background:rgba(255,255,255,.08);border:none;color:#cfe0f0;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;">✕</button>
        </div>
        <div style="height:8px;border-radius:6px;background:rgba(0,0,0,.4);margin-top:10px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#4aa3ff,#5fdd7a);transition:width .3s;"></div>
        </div>
      </div>
      <div class="almanac-body" style="padding:16px 18px;">${sections}${grandBanner}</div>`;

    card.querySelector('#almanac-close').onclick = () => {
      const m = document.getElementById('almanac-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    card.querySelectorAll('[data-almanac-claim]').forEach(btn => {
      btn.onclick = () => this._claimAlmanacReward(btn.getAttribute('data-almanac-claim'));
    });
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

    // Paper-doll equipment screen shows only on the Equip tab.
    const doll = document.getElementById('equip-doll');
    if (this.currentTab === 'equip') {
      this._renderEquipDoll();
    } else if (doll) {
      doll.style.display = 'none';
      this.equipSlotFilter = null;
    }

    // Filter based on tab
    let filtered = this.inventory;
    if (this.currentTab === 'usable') {
      filtered = this.inventory.filter(i => i.item_type === 'consumable');
    } else if (this.currentTab === 'equip') {
      filtered = this.inventory.filter(i => ['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses'].includes(i.item_type));
      // Clicking an empty doll slot narrows the list to gear that fits it.
      if (this.equipSlotFilter) {
        filtered = filtered.filter(i => getEquipSlot(i.item_name) === this.equipSlotFilter);
      }
    } else if (this.currentTab === 'etc') {
      filtered = this.inventory.filter(i => i.item_type === 'material' || i.item_type === 'tool');
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

        const equippable = ['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses'].includes(item.item_type);
        slot.addEventListener('click', () => {
          document.querySelectorAll('.inv-slot').forEach(s => s.classList.remove('selected'));
          slot.classList.add('selected');
          this.selectedItemName = item.item_name;
          this._updateDetailBox();
          // On the Equip screen a single tap equips/unequips right away — the
          // detail box's "สวมใส่" button sits below the paper-doll and is easy
          // to miss on mobile, which made gear feel un-equippable.
          if (this.currentTab === 'equip' && equippable) {
            this._toggleEquipItem(item);
          }
        });
      }

      grid.appendChild(slot);
    }

    this._updateDetailBox();
  }

  // Lazily create the paper-doll container (above the inventory grid) and its
  // one-time styles.
  _ensureEquipDoll() {
    if (document.getElementById('equip-doll')) return;
    const grid = document.getElementById('inventory-grid');
    if (!grid || !grid.parentNode) return;

    if (!document.getElementById('equip-doll-styles')) {
      const st = document.createElement('style');
      st.id = 'equip-doll-styles';
      st.textContent = `
      .equip-doll{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:8px;margin:8px 0 12px;padding:12px;
        background:linear-gradient(160deg,rgba(30,38,64,.85),rgba(18,22,38,.9));border:1px solid rgba(120,150,220,.28);
        border-radius:14px;box-shadow:inset 0 0 24px rgba(80,110,200,.12);}
      .equip-col{display:flex;flex-direction:column;gap:8px;}
      .equip-bottom{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:2px;}
      .eq-slot{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
        min-height:58px;padding:6px 4px;border-radius:10px;cursor:pointer;user-select:none;
        background:rgba(12,16,30,.6);border:1.5px solid rgba(120,140,200,.22);transition:transform .1s,border-color .15s,box-shadow .15s;}
      .eq-slot:hover{transform:translateY(-2px);border-color:rgba(150,180,255,.6);box-shadow:0 4px 14px rgba(60,90,190,.35);}
      .eq-slot.filled{background:rgba(30,40,72,.75);border-color:rgba(255,210,90,.55);}
      .eq-slot.active-filter{border-color:#7fe0ff;box-shadow:0 0 12px rgba(127,224,255,.55);}
      .eq-slot-ic{font-size:24px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));}
      .eq-slot.empty .eq-slot-ic{opacity:.32;filter:grayscale(1);}
      .eq-slot-lb{font-size:10px;color:#aeb8d6;letter-spacing:.3px;text-align:center;}
      .eq-slot.filled .eq-slot-lb{color:#ffe6a2;}
      .eq-slot-x{position:absolute;top:2px;right:4px;font-size:10px;color:#ff8f8f;opacity:.75;}
      .eq-slot.rarity-rare{border-color:rgba(90,170,255,.6);} .eq-slot.rarity-epic{border-color:rgba(190,120,255,.65);}
      .eq-slot.rarity-legendary{border-color:rgba(255,190,70,.75);} .eq-slot.rarity-mythic{border-color:rgba(255,90,140,.8);}
      .equip-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:6px;
        border-radius:12px;background:radial-gradient(circle at 50% 35%,rgba(90,120,220,.28),rgba(10,14,28,.2));}
      .equip-hero-face{font-size:46px;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5));}
      .equip-hero-name{font-size:12px;font-weight:700;color:#fff;text-align:center;}
      .equip-hero-job{font-size:10px;color:#9fb0e0;}
      .equip-hero-stats{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:10.5px;margin-top:2px;}
      .equip-hero-stats span b{color:#ffd98a;}
      .equip-doll-hint{grid-column:1/-1;font-size:10.5px;color:#8b97ba;text-align:center;margin-top:-2px;}
      `;
      document.head.appendChild(st);
    }

    const doll = document.createElement('div');
    doll.id = 'equip-doll';
    doll.className = 'equip-doll';
    doll.style.display = 'none';
    grid.parentNode.insertBefore(doll, grid);

    // Delegated click: unequip a filled slot, or filter the list by an empty one.
    doll.addEventListener('click', (e) => {
      const cell = e.target.closest('.eq-slot');
      if (!cell) return;
      const slotId = cell.getAttribute('data-slot');
      const itemName = cell.getAttribute('data-item') || null;
      if (itemName) {
        const invItem = this.inventory.find(i => i.item_name === itemName);
        if (invItem) this._toggleEquipItem(invItem);
      } else {
        // Toggle a filter so the grid shows only gear that fits this slot.
        this.equipSlotFilter = (this.equipSlotFilter === slotId) ? null : slotId;
        this._renderInventory();
      }
    });
  }

  // The item currently worn in a paper-doll slot (or null).
  _slotItemName(id) {
    const ch = this.character;
    if (!ch) return null;
    if (id === 'weapon') return ch.equippedWeapon || null;
    if (id === 'shield') return ch.equippedShield || null;
    if (id === 'hat') return (ch.equippedHat && ch.equippedHat !== 'None') ? ch.equippedHat : null;
    if (id === 'glasses') return (ch.equippedGlasses && ch.equippedGlasses !== 'None') ? ch.equippedGlasses : null;
    return (ch.equippedGear && ch.equippedGear[id]) || null;
  }

  // Shared markup for the paper-doll. `hint` lets each host (inventory vs
  // profile) show its own instruction line.
  _dollInnerHTML(hint) {
    const ch = this.character;
    const cell = (slot) => {
      const name = this._slotItemName(slot.id);
      const it = name ? ITEMS[name] : null;
      const filled = !!name;
      const rarity = it && it.rarity ? it.rarity : '';
      const filterCls = this.equipSlotFilter === slot.id ? ' active-filter' : '';
      const ic = filled && it ? (it.emoji || slot.icon) : slot.icon;
      return `<div class="eq-slot ${filled ? 'filled' : 'empty'}${rarity ? ' rarity-' + rarity : ''}${filterCls}"
        data-slot="${slot.id}" ${filled ? `data-item="${name}"` : ''}
        title="${filled ? name : slot.label + ' (ว่าง)'}">
        <div class="eq-slot-ic">${ic}</div>
        <div class="eq-slot-lb">${filled ? this._short(name) : slot.label}</div>
        ${filled ? '<div class="eq-slot-x">✕</div>' : ''}
      </div>`;
    };
    const bySlot = Object.fromEntries(EQUIP_SLOTS.map(s => [s.id, s]));
    const leftIds = ['hat', 'glasses', 'head', 'body', 'garment'];
    const rightIds = ['weapon', 'shield', 'ring', 'accessory'];
    const bottomIds = ['wrist', 'pants', 'feet'];
    const st = ch.stats;
    const faceEmoji = { swordsman: '⚔️', mage: '🔮', archer: '🏹', priest: '✨' }[st.job] || '🧑';
    const jobName = (JOBS[st.job] && JOBS[st.job].name) || 'Novice';
    return `
      <div class="equip-col">${leftIds.map(id => cell(bySlot[id])).join('')}</div>
      <div class="equip-hero">
        <div class="equip-hero-face">${faceEmoji}</div>
        <div class="equip-hero-name">${st.name || 'Hero'}</div>
        <div class="equip-hero-job">Lv.${st.level} · ${jobName}</div>
        <div class="equip-hero-stats">
          <span>⚔️ ATK <b>${st.atk}</b></span>
          <span>🛡️ DEF <b>${st.def}</b></span>
          <span>❤️ HP <b>${st.max_hp}</b></span>
          <span>💧 SP <b>${st.max_sp}</b></span>
        </div>
      </div>
      <div class="equip-col">${rightIds.map(id => cell(bySlot[id])).join('')}</div>
      <div class="equip-bottom">${bottomIds.map(id => cell(bySlot[id])).join('')}</div>
      <div class="equip-doll-hint">${hint}</div>
    `;
  }

  // Render the hero paper-doll: one frame per body-part slot, the equipped item
  // shown in it, plus a centre portrait with the gear's combined stats.
  _renderEquipDoll() {
    this._ensureEquipDoll();
    const doll = document.getElementById('equip-doll');
    if (!doll) return;
    doll.style.display = 'grid';
    if (!this.character) { doll.innerHTML = ''; return; }
    doll.innerHTML = this._dollInnerHTML('แตะช่องที่ใส่ของอยู่เพื่อถอด · แตะช่องว่างเพื่อดูไอเทมที่สวมได้');
  }

  // Same paper-doll, embedded in the Settings & Profile panel (replaces the old
  // weapon/hat/glasses dropdowns). Tapping any slot opens a picker of items that
  // fit it; equip/unequip applies live.
  _renderProfileEquipDoll() {
    const host = document.getElementById('profile-equip-doll');
    if (!host || !this.character) return;
    this._ensureEquipDoll(); // guarantees the shared .equip-doll styles exist
    host.className = 'equip-doll';
    host.innerHTML = this._dollInnerHTML('แตะช่องเพื่อเลือก/เปลี่ยน/ถอดอุปกรณ์');
    if (!host._wired) {
      host._wired = true;
      host.addEventListener('click', (e) => {
        const c = e.target.closest('.eq-slot');
        if (c) this._openSlotPicker(c.getAttribute('data-slot'));
      });
    }
  }

  // STR/AGI/INT card on the Settings & Profile page (own hero).
  _renderProfileAttributes() {
    const host = document.getElementById('profile-attributes');
    if (!host || !this.character) return;
    const st = this.character.stats || {};
    const js = getJobStats(st.job || null, st.level || 1);
    const attr = {
      str: st.str != null ? st.str : js.str,
      agi: st.agi != null ? st.agi : js.agi,
      int: st.int != null ? st.int : js.int,
    };
    const chip = (label, val, color, hint) => `<div style="flex:1;text-align:center;padding:10px 4px;border-radius:11px;
        background:linear-gradient(160deg,${color}22,${color}08);border:1px solid ${color}66;">
        <div style="font-size:11px;color:${color};font-weight:800;letter-spacing:.6px;">${label}</div>
        <div style="font-size:22px;font-weight:800;color:#fff;line-height:1.2;">${val}</div>
        <div style="font-size:9px;color:var(--text-dim);">${hint}</div></div>`;
    host.style.cssText = 'display:flex;gap:8px;';
    host.innerHTML =
      chip('STR', attr.str, '#ff6b6b', 'พลังโจมตี') +
      chip('AGI', attr.agi, '#51cf66', 'ความว่องไว') +
      chip('INT', attr.int, '#748ffc', 'พลังเวท');
  }

  // Owned items that fit a given doll slot (weapon slot also allows the rod).
  _itemsForSlot(slotId) {
    const inv = this.inventory || [];
    return inv.filter(i => {
      if (slotId === 'weapon') return i.item_type === 'weapon' || i.item_type === 'fishing_rod';
      return getEquipSlot(i.item_name) === slotId;
    });
  }

  // Popup list of the items that fit a slot (plus "remove"), for the profile
  // doll. Selecting one equips it live; the doll + stats refresh instantly.
  _openSlotPicker(slotId) {
    const slot = EQUIP_SLOTS.find(s => s.id === slotId);
    if (!slot) return;
    const items = this._itemsForSlot(slotId);
    const current = this._slotItemName(slotId);

    let ov = document.getElementById('slot-picker-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'slot-picker-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(4,7,16,.62);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;';

    const rows = items.map(i => {
      const equipped = i.item_name === current;
      const locked = (i.item_type === 'weapon') && !canEquipItem(i.item_name, this.character.stats.job);
      return `<div class="sp-row${equipped ? ' sp-eq' : ''}${locked ? ' sp-lock' : ''}" data-name="${i.item_name}">
        <span class="sp-ic">${i.emoji || slot.icon}</span>
        <span class="sp-nm">${i.item_name}</span>
        <span class="sp-tag">${locked ? '🔒' : equipped ? '✅ ใส่อยู่' : ''}</span>
      </div>`;
    }).join('');

    ov.innerHTML = `
      <div class="sp-box" style="background:linear-gradient(160deg,#1b2340,#121627);border:1px solid rgba(130,160,230,.35);
        border-radius:16px;max-width:340px;width:100%;max-height:70vh;overflow:auto;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-weight:800;color:#fff;font-size:15px;">${slot.icon} ${slot.label}</div>
          <div id="sp-close" style="cursor:pointer;color:#9fb0e0;font-size:20px;line-height:1;padding:2px 6px;">✕</div>
        </div>
        <div class="sp-row sp-none" data-name="__none__" style="opacity:${current ? 1 : .5};">
          <span class="sp-ic">🚫</span><span class="sp-nm">ถอดออก (ไม่ใส่)</span><span class="sp-tag"></span>
        </div>
        ${items.length ? rows : '<div style="color:#8b97ba;text-align:center;padding:16px 4px;font-size:13px;">ยังไม่มีไอเทมสำหรับช่องนี้ — หาซื้อได้ที่ร้านค้า</div>'}
      </div>`;

    if (!document.getElementById('slot-picker-styles')) {
      const st = document.createElement('style');
      st.id = 'slot-picker-styles';
      st.textContent = `
      .sp-row{display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;cursor:pointer;
        border:1px solid transparent;transition:background .12s,border-color .12s;}
      .sp-row:hover{background:rgba(90,120,220,.18);border-color:rgba(150,180,255,.4);}
      .sp-row .sp-ic{font-size:20px;width:26px;text-align:center;}
      .sp-row .sp-nm{flex:1;color:#e6ecff;font-size:13.5px;}
      .sp-row .sp-tag{font-size:11px;color:#8fe0a8;}
      .sp-row.sp-eq{background:rgba(60,140,90,.18);border-color:rgba(120,220,150,.4);}
      .sp-row.sp-lock{opacity:.55;}
      .sp-none{margin-bottom:6px;background:rgba(200,70,70,.12);}
      `;
      document.head.appendChild(st);
    }

    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#sp-close').addEventListener('click', close);
    ov.querySelectorAll('.sp-row').forEach(row => {
      row.addEventListener('click', async () => {
        const name = row.getAttribute('data-name');
        if (name === '__none__') {
          if (current) { const it = this.inventory.find(i => i.item_name === current); if (it) await this._toggleEquipItem(it); }
        } else {
          if (name === current) { close(); return; } // already worn
          const it = this.inventory.find(i => i.item_name === name);
          if (it) await this._toggleEquipItem(it); // equips (auto-swaps same slot)
        }
        close();
        this._renderProfileEquipDoll();
      });
    });
  }

  // Trim a long item name so it fits a slot label.
  _short(name) {
    if (!name) return '';
    return name.length > 11 ? name.slice(0, 10) + '…' : name;
  }

  // A brief message that floats over the inventory panel — the combat log sits
  // behind it, so equip failures/successes need their own visible cue.
  _equipToast(msg, ok = true) {
    let t = document.getElementById('equip-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'equip-toast';
      t.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:99999;' +
        'padding:11px 18px;border-radius:12px;font-size:14px;font-weight:700;color:#fff;pointer-events:none;' +
        'box-shadow:0 8px 28px rgba(0,0,0,.5);opacity:0;transition:opacity .18s,top .18s;max-width:82vw;text-align:center;';
      document.body.appendChild(t);
    }
    t.style.background = ok
      ? 'linear-gradient(135deg,#2e9e5b,#1f7a45)'
      : 'linear-gradient(135deg,#c0392b,#8a2820)';
    t.textContent = msg;
    // restart the fade/slide
    t.style.opacity = '0'; t.style.top = '20%';
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.top = '22%'; });
    clearTimeout(this._equipToastTimer);
    this._equipToastTimer = setTimeout(() => { t.style.opacity = '0'; }, 1700);
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
      // Name the body-part slot so the label matches the paper-doll.
      const SLOT_LABEL = { head: 'ศีรษะ', body: 'เสื้อเกราะ', garment: 'ผ้าคลุม', ring: 'แหวน', wrist: 'ข้อมือ', pants: 'กางเกง', feet: 'รองเท้า', accessory: 'เครื่องประดับ' };
      typeStr = 'Armor · ' + (SLOT_LABEL[getEquipSlot(item.item_name)] || 'เกราะ');
    } else if (item.item_type === 'shield') {
      typeStr = 'Shield';
    } else if (item.item_type === 'hat') {
      typeStr = 'Hat · หมวก';
    } else if (item.item_type === 'glasses') {
      typeStr = 'Glasses · แว่นตา';
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
    let durHtml = '';
    if (item.item_type === 'tool' && ITEMS[item.item_name] && ITEMS[item.item_name].durability) {
      const durLeft = item.stats ? (item.stats.durability || 0) : 0;
      const maxDur = ITEMS[item.item_name].durability;
      durHtml = `<br/><br/><strong style="color:${durLeft > 0 ? '#7fe0ff' : '#ff6060'}">🔧 ความทนทาน:</strong> ${durLeft}/${maxDur} ครั้ง${durLeft <= 0 ? ' (พังแล้ว)' : ''}`;
    }
    document.getElementById('detail-desc').innerHTML = item.desc + durHtml + droppedByHtml;
    document.getElementById('detail-price-val').textContent = item.price;

    const useBtn = document.getElementById('btn-use-item');
    if (item.item_type === 'consumable') {
      useBtn.style.display = 'block';
      useBtn.textContent = `ใช้งาน (x${item.quantity})`;
    } else if (['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses', 'tool'].includes(item.item_type)) {
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

    if (['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses', 'tool'].includes(item.item_type)) {
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
        const slot = getEquipSlot(item.item_name) || 'body';
        this.character.equippedGear[slot] = null;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = null;
      } else if (item.item_type === 'hat') {
        this.character.setHat(null);
      } else if (item.item_type === 'glasses') {
        this.character.setGlasses(null);
      } else if (item.item_type === 'tool') {
        // Unequipping the pickaxe stops any mining in progress.
        this.character.equippedPickaxe = null;
        this.stopMining();
      }
      if (this.characterId) {
        // Ensure the item row exists in DB with correct quantity before updating stats.
        await saveInventoryItem(this.characterId, item.item_name, item.item_type, item.quantity || 1, {});
        // Send the full stats object (not {}) so a tool's durability survives.
        await updateInventoryItemStats(this.characterId, item.item_name, item.stats || {});
        this.addCombatLog(`✅ บันทึกไอเทม [${item.item_name}] สำเร็จ`, 'system');
      }
      this.addCombatLog(`🛡️ ถอด ${item.emoji} ${item.item_name} ออกแล้ว`, 'system');
      this._equipToast(`ถอด ${item.item_name}`, true);
    } else {
      // Job lock: worn items (weapon / hat / glasses) are restricted to their
      // class. Novices (no job) may only wear universal items.
      if ((item.item_type === 'weapon' || item.item_type === 'hat' || item.item_type === 'glasses')
        && !canEquipItem(item.item_name, this.character.stats.job)) {
        const need = itemJob(item.item_name);
        const jobName = JOBS[need]?.name || need;
        const msg = `🔒 ${item.item_name} ใช้ได้เฉพาะอาชีพ ${jobName}`;
        this.addCombatLog(msg, 'warning');
        this._equipToast(msg, false); // visible over the inventory panel
        if (this.soundManager) this.soundManager.playErrorSound?.();
        return;
      }

      // Un-equip any currently equipped item of the SAME slot. Weapons and the
      // fishing rod share the weapon slot; armor pieces compare by body-part
      // slot so a helm and boots (both 'armor') don't fight over one slot.
      const mySlot = getEquipSlot(item.item_name);
      for (const otherItem of this.inventory) {
        let isSameSlot = false;
        if ((item.item_type === 'weapon' || item.item_type === 'fishing_rod') && (otherItem.item_type === 'weapon' || otherItem.item_type === 'fishing_rod')) {
          isSameSlot = true;
        } else if (item.item_type === 'armor' && otherItem.item_type === 'armor') {
          isSameSlot = getEquipSlot(otherItem.item_name) === mySlot;
        } else if (item.item_type === otherItem.item_type) {
          isSameSlot = true;
        }
        if (isSameSlot && otherItem.stats && otherItem.stats.equipped === true) {
          otherItem.stats.equipped = false;
          if (this.characterId) {
            // Ensure DB row exists with correct quantity before updating stats
            await saveInventoryItem(this.characterId, otherItem.item_name, otherItem.item_type, otherItem.quantity || 1, {});
            await updateInventoryItemStats(this.characterId, otherItem.item_name, otherItem.stats);
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
        this.character.equippedGear[getEquipSlot(item.item_name) || 'body'] = item.item_name;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = item.item_name;
      } else if (item.item_type === 'hat') {
        this.character.setHat(item.item_name);
      } else if (item.item_type === 'glasses') {
        this.character.setGlasses(item.item_name);
      } else if (item.item_type === 'tool') {
        this.character.equippedPickaxe = item.item_name;
      }

      if (this.characterId) {
        // Ensure the item row exists in DB with correct quantity before updating stats.
        // This handles the case where a player bought an item but the save was
        // interrupted before the DB row was created.
        await saveInventoryItem(this.characterId, item.item_name, item.item_type, item.quantity || 1, {});
        // Send the full stats object so a tool's durability isn't wiped.
        await updateInventoryItemStats(this.characterId, item.item_name, item.stats);
        this.addCombatLog(`✅ บันทึกไอเทม [${item.item_name}] สำเร็จ`, 'system');
      }
      this.addCombatLog(`⚔️ สวมใส่ ${item.emoji} ${item.item_name} เพิ่มความแข็งแกร่ง!`, 'system');
      this._equipToast(`สวมใส่ ${item.item_name}`, true);
    }

    // Fix: Ensure the character row itself is updated with the new appearance/weapon
    if (this.characterId) {
      await this.character.saveStatsToDatabase();
    }

    if (this.soundManager) {
      this.soundManager.playUseItemSound();
    }

    // Reflect the change on the 3D hero (helmet / armor / cape / boots / shield).
    if (this.character.updateGearVisuals) this.character.updateGearVisuals();

    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
    // Sync: Inventory → Profile Editor (refresh dropdowns if open)
    this._refreshProfileEditorEquipment();
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

    // Clicking a leaderboard row opens that player's profile popup (same as the
    // Online list). Delegated on the body since rows are re-rendered each refresh.
    const lbBody = document.getElementById('leaderboard-body');
    if (lbBody) {
      lbBody.addEventListener('click', (e) => {
        const row = e.target.closest('.lb-row');
        if (!row) return;
        const userId = row.getAttribute('data-user-id');
        if (!userId) return; // mock/guest entries with no real account
        this._showPlayerPopup({
          username: row.getAttribute('data-username'),
          level: Number(row.getAttribute('data-level')) || 1,
          userId,
        });
      });
    }
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
        else if (cat === 'pvp') {
          const w = entry.pvp_wins ?? 0, l = entry.pvp_losses ?? 0;
          const total = w + l;
          const wr = total > 0 ? Math.round((w / total) * 100) : 0;
          valueText = `🎖️ ${(entry.mmr ?? 1000).toLocaleString()} MMR &nbsp;·&nbsp; ${w}W/${l}L (${wr}%)`;
        }
        const zolText = `🪙 ${(entry.zol ?? 0).toLocaleString()} Zol`;
        const uid = entry.user_id || '';
        return `
          <div class="lb-row${uid ? ' lb-clickable' : ''}" data-user-id="${uid}" data-username="${username}" data-level="${entry.level ?? 1}">
            <span class="lb-rank">${rankIcon}</span>
            <span class="lb-name">
              <span class="lb-username">${username}</span>
              <span class="lb-zol">${zolText}</span>
            </span>
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

    // Initial map ID
    this.currentMapId = 'prontera';

    // Keep the ping badges fresh while the panel is open (offsetParent is null
    // when the panel is hidden, so this is a no-op the rest of the time).
    setInterval(() => {
      const body = document.getElementById('players-body');
      if (body && body.offsetParent !== null) this._renderOnlinePlayers();
    }, 2000);
  }

  updateOnlinePlayers(players) {
    this.onlinePlayers = players || [];

    // Update auth screen count
    const authCount = document.getElementById('online-players-auth');
    if (authCount) authCount.textContent = this.onlinePlayers.length;

    const hudCount = document.getElementById('hud-online-count');
    if (hudCount) hudCount.textContent = this.onlinePlayers.length;

    this._renderOnlinePlayers();
  }

  _renderOnlinePlayers() {
    const body = document.getElementById('players-body');
    if (!body) return;

    const friends = this.friends || [];
    const onlinePlayers = this.onlinePlayers || [];
    const onlineUsernames = new Set(onlinePlayers.map(p => p.username));

    let list = [];
    let onlineCount = 0;

    if (this.onlineView === 'friends') {
      // 1. Online friends
      const onlineFriends = onlinePlayers.filter(p => friends.includes(p.username));
      onlineCount = onlineFriends.length;
      list = [...onlineFriends];

      // 2. Offline friends
      friends.forEach(friendName => {
        if (!onlineUsernames.has(friendName)) {
          list.push({
            username: friendName,
            level: '?',
            isOffline: true
          });
        }
      });

      // Sort: Online first, then alphabetical
      list.sort((a, b) => {
        if (!!a.isOffline !== !!b.isOffline) return a.isOffline ? 1 : -1;
        return a.username.localeCompare(b.username);
      });
    } else {
      // Global view — everyone online across ALL cities/maps
      onlineCount = onlinePlayers.length;
      list = [...onlinePlayers];

      // Append offline friends who are not in the list
      const listUsernames = new Set(list.map(p => p.username));
      friends.forEach(friendName => {
        if (!onlineUsernames.has(friendName) && !listUsernames.has(friendName)) {
          list.push({
            username: friendName,
            level: '?',
            isOffline: true,
            isFriendOnly: true
          });
        }
      });

      // Sort: Online first, then alphabetical
      list.sort((a, b) => {
        if (!!a.isOffline !== !!b.isOffline) return a.isOffline ? 1 : -1;
        return a.username.localeCompare(b.username);
      });
    }

    if (list.length === 0) {
      const emptyMsg = this.onlineView === 'friends'
        ? 'คุณยังไม่มีรายชื่อเพื่อน — แตะชื่อผู้เล่นใน Global เพื่อเพิ่มเพื่อน'
        : 'No players online';
      body.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:10px">${emptyMsg}</div>`;
      return;
    }

    // Header
    const icon = this.onlineView === 'friends' ? '⭐' : '🌐';
    const totalCount = list.length;
    let html = `<div class="online-count-badge">${icon} ${onlineCount} online / ${totalCount} total</div>`;

    // mapId → short city label (players are now listed across all cities)
    const CITY = { prontera: 'Prontera', prontera_field: 'Prontera', payon: 'Payon', glast_heim: 'Glast Heim', mjolnir: 'Mjolnir', abyss_lake: 'Abyss Lake' };

    html += list.map(p => {
      const isFriend = friends.includes(p.username);
      const starHtml = isFriend ? '<span class="friend-star">⭐</span>' : '';
      const offlineStyle = p.isOffline ? 'opacity:0.6;filter:grayscale(100%);pointer-events:auto;' : '';
      const dotColor = p.isOffline ? '#666' : '#40e080';
      const nameColor = p.isOffline ? '#b0c0e0' : '#ffffff';
      const badgeStyle = p.isOffline ? 'background:rgba(0,0,0,0.5);color:#888;border-color:rgba(255,255,255,0.1);' : 'background:rgba(0,0,0,0.6);color:#ffffff;border-color:var(--primary-glow);';
      const cityHtml = (!p.isOffline && p.mapId)
        ? `<span class="player-city-tag" style="font-size:9px;color:#7fb0e0;background:rgba(60,110,180,0.18);border:1px solid rgba(120,170,230,0.3);border-radius:6px;padding:1px 6px;margin-left:4px;white-space:nowrap;">📍${CITY[p.mapId] || p.mapId}</span>`
        : '';

      // Ping (ms): the server measures each socket's latency and includes it in
      // the roster (players_global), so it works for everyone, cross-map.
      let pingHtml = '';
      if (!p.isOffline && p.ping != null) {
        const cls = p.ping < 80 ? 'ping-good' : p.ping < 160 ? 'ping-mid' : 'ping-bad';
        pingHtml = `<span class="player-ping ${cls}">📶 ${p.ping}ms</span>`;
      }

      return `
        <div class="player-row" data-username="${p.username}" data-user-id="${p.userId || ''}" data-offline="${p.isOffline || false}" style="${offlineStyle}">
          <span class="online-dot" style="background-color:${dotColor}"></span>
          <span style="color:${nameColor}; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${p.username}${starHtml}</span>
          ${cityHtml}
          <span class="player-level-badge" style="${badgeStyle}">Lv.${p.level}</span>
          ${pingHtml}
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
        this._stopPopupHero();
        this.updateMobileControlsVisibility();
      });
    }

    // Overlay click close
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
        this._stopPopupHero();
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
        const isOffline = row.getAttribute('data-offline') === 'true';
        
        if (isOffline) {
          const userId = row.getAttribute('data-user-id');
          // For offline friends, we might not have a full player object, but we can still try
          this._showPlayerPopup({
            username: targetUsername,
            level: row.querySelector('.player-level-badge')?.textContent.replace('Lv.', '') || '?',
            userId: userId || targetUsername,
            isOffline: true
          });
          return;
        }

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

    // Warp-to-friend from profile popup
    const popupWarpBtn = document.getElementById('btn-popup-warp');
    if (popupWarpBtn) {
      popupWarpBtn.addEventListener('click', async () => {
        const target = this.selectedProfilePlayer;
        if (!target || !target.userId) return;
        if (popup) popup.style.display = 'none';
        this.updateMobileControlsVisibility();
        const { sendWarpRequest } = await import('../network/GameSync.js');
        const res = sendWarpRequest(target.userId);
        if (res && res.success) {
          if (window.warpManager) window.warpManager.pending = { targetName: target.username };
          this.addCombatLog(`🌀 กำลังวาปไปหา ${target.username}...`, 'system');
        } else {
          this.addCombatLog('❌ วาปไม่ได้ (เซิร์ฟเวอร์ไม่เชื่อมต่อ)', 'warning');
        }
      });
    }

    // PVP duel challenge from profile popup
    const popupDuelBtn = document.getElementById('btn-popup-duel');
    if (popupDuelBtn) {
      popupDuelBtn.addEventListener('click', async () => {
        const target = this.selectedProfilePlayer;
        if (!target) return;
        if (popup) popup.style.display = 'none';
        this.updateMobileControlsVisibility();
        const { sendDuelRequest } = await import('../network/GameSync.js');
        const res = sendDuelRequest(
          target.userId,
          target.username,
          this.character?.stats?.name || 'Adventurer',
          this.character?.stats?.level || 1
        );
        if (res.success) {
          this.addCombatLog(`⚔️ ส่งคำท้าดวลไปยัง ${target.username} แล้ว รอการตอบรับ...`, 'system');
        } else {
          this.addCombatLog('❌ ท้าดวลไม่ได้ (ออฟไลน์/เซิร์ฟเวอร์ไม่เชื่อมต่อ)', 'warning');
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

  // Lazily create a rotating 3D hero on the popup canvas and apply `app`.
  _renderPopupHero(app) {
    const canvas = document.getElementById('player-popup-hero');
    const wrap = document.getElementById('player-popup-hero-wrap');
    if (!canvas) return;
    const fallback = wrap && wrap.querySelector('.player-hero-fallback');
    const boot = ({ JobPreview }) => {
      try {
        if (!this._popupHero) this._popupHero = new JobPreview(canvas);
        this._popupHero.setAppearance(app || {});
        this._popupHero.resize();
        this._popupHero.start();
        if (fallback) fallback.style.display = 'none';
        if (wrap) wrap.classList.add('has-3d');
      } catch (e) {
        // WebGL unavailable → keep the emoji fallback.
        if (fallback) fallback.style.display = '';
      }
    };
    if (this._popupHero) { boot({ JobPreview: this._popupHero.constructor }); return; }
    import('../engine/JobPreview.js').then(boot).catch(() => {});
  }

  _stopPopupHero() {
    if (this._popupHero && this._popupHero.stop) this._popupHero.stop();
  }

  _showPlayerPopup(player) {
    this.selectedProfilePlayer = player;
    
    // Fetch full character data and show beautiful profile modal
    this._fetchAndShowPlayerProfile(player);
  }

  async _fetchAndShowPlayerProfile(player) {
    // Safety: guard against missing/undefined userId which would crash
    // show() with a TypeError on .startsWith()
    if (!player || !player.userId) {
      console.error('[Profile] No userId for player:', player);
      return;
    }

    // 1. Get live appearance from remotePlayersMap if available
    let liveAppearance = null;
    const remotePlayer = window.remotePlayersMap && window.remotePlayersMap.get(player.userId);
    if (remotePlayer && remotePlayer.character) {
      liveAppearance = remotePlayer.character.getAppearance();
    }

    // 2. Show modal IMMEDIATELY with whatever we have so far (avoids the
    // user seeing nothing while the DB query is in flight).
    this.playerProfileModal.show(player, null, liveAppearance);

    // 3. Fetch DB stats in background — update the modal once data arrives.
    let dbData = null;
    try {
      const { fetchPublicCharacter } = await import('../network/GameSync.js');
      console.error(`[Profile] Fetching DB stats for ${player.username} (userId=${player.userId})...`);
      dbData = await fetchPublicCharacter(player.userId);
      if (!dbData) {
        // Fallback: try querying by username in case the userId doesn't
        // match the characters.user_id column (e.g. server sent a socket
        // id instead of the Supabase UUID).
        const { fetchCharacterByUsername } = await import('../network/GameSync.js');
        if (typeof fetchCharacterByUsername === 'function') {
          console.error(`[Profile] userId query returned null, trying username fallback for "${player.username}"...`);
          dbData = await fetchCharacterByUsername(player.username);
        }
      }
      console.error(`[Profile] DB Data for ${player.username}:`, dbData);
    } catch (e) {
      console.error('Failed to fetch player stats from DB:', e);
    }

    // 4. If DB data arrived, re-render the modal with full stats
    if (dbData) {
      this.playerProfileModal.show(player, dbData, liveAppearance);
    }
  }

  // Populate the profile popup with the target's stats + equipped gear.
  // Full stats come from the DB (characters is public-read); equipped gear also
  // falls back to the live remote avatar so guests still show their gear.
  async _renderPlayerProfileDetails(player) {
    const box = document.getElementById('player-popup-details');
    if (!box) return;
    box.style.width = '100%';
    box.innerHTML = '<div style="opacity:.6;font-size:12px;padding:6px 0;">กำลังโหลดข้อมูล...</div>';

    // Immediate equipped gear from the live remote avatar (works for guests too).
    // The remote CharacterManager carries the full loadout (armor/shield/…) via
    // the appearance broadcast, so we can show every worn piece — not just 3.
    let liveGear = null;
    const rp = window.remotePlayersMap && window.remotePlayersMap.get(player.userId);
    if (rp && rp.character) {
      liveGear = {
        weapon: rp.character.equippedWeapon,
        hat: rp.character.equippedHat,
        glasses: rp.character.equippedGlasses,
        shield: rp.character.equippedShield,
        gear: { ...(rp.character.equippedGear || {}) },
      };
    }

    // Full stats from the DB (real accounts only).
    let ch = null;
    try {
      const { fetchPublicCharacter } = await import('../network/GameSync.js');
      ch = await fetchPublicCharacter(player.userId);
    } catch (e) { /* ignore */ }

    // Bail if the popup moved on to a different player while awaiting.
    if (this.selectedProfilePlayer !== player) return;

    if (ch && ch.level != null) {
      const lvlEl = document.getElementById('player-popup-level');
      if (lvlEl) lvlEl.textContent = `Lv.${ch.level}`;
    }

    if (!ch && !liveGear) {
      box.innerHTML = '<div style="opacity:.6;font-size:12px;padding:6px 0;">ผู้เล่นชั่วคราว (Guest) — ดูข้อมูลเต็มไม่ได้</div>';
      return;
    }

    // Spin up the 3D hero preview mirroring this player's look.
    const heroApp = (rp && rp.character && rp.character.getAppearance)
      ? rp.character.getAppearance()
      : {
          job: ch && ch.job || null,
          weapon: ch && ch.weapon, hat: ch && ch.hat, glasses: ch && ch.glasses,
          shield: ch && ch.shield, gear: { body: ch && ch.armor },
          bodyColor: ch && (ch.body_color ?? ch.bodyColor),
          hairColor: ch && (ch.hair_color ?? ch.hairColor),
          pantsColor: ch && (ch.pants_color ?? ch.pantsColor),
          gender: ch && ch.gender,
        };
    this._renderPopupHero(heroApp);

    const gear = (name) => {
      if (!name || name === 'None') return null;
      return { emoji: (ITEMS[name] || {}).emoji || '📦', name };
    };
    const gearMap = (liveGear && liveGear.gear) || {};
    // Resolve the item worn in each doll slot: prefer the live avatar, fall back
    // to the DB columns we have (weapon/hat/glasses/armor/shield).
    const resolveSlot = (id) => {
      if (id === 'weapon') return (liveGear && liveGear.weapon) || (ch && ch.weapon) || null;
      if (id === 'hat') return (liveGear && liveGear.hat) || (ch && ch.hat) || null;
      if (id === 'glasses') return (liveGear && liveGear.glasses) || (ch && ch.glasses) || null;
      if (id === 'shield') return (liveGear && liveGear.shield) || (ch && ch.shield) || null;
      if (id === 'body') return gearMap.body || (ch && ch.armor) || null;
      return gearMap[id] || null;
    };

    const stat = (label, val) => `<div style="display:flex;justify-content:space-between;padding:4px 8px;background:rgba(255,255,255,.04);border-radius:6px;"><span style="color:var(--text-dim);font-size:11px;">${label}</span><span style="font-weight:800;font-size:12px;color:#fff;">${val}</span></div>`;

    // One cell per body-part slot (filled highlighted with a rarity glow, empty dimmed).
    const rarityColor = { common: 'rgba(180,190,210,.5)', rare: 'rgba(90,170,255,.7)', epic: 'rgba(190,120,255,.75)', legendary: 'rgba(255,190,70,.85)', mythic: 'rgba(255,90,140,.9)' };
    const cell = (s) => {
      const name = resolveSlot(s.id);
      const item = gear(name);
      const it = name ? ITEMS[name] : null;
      const bc = (it && rarityColor[it.rarity]) || 'var(--border)';
      const glow = item && it && ['epic', 'legendary', 'mythic'].includes(it.rarity)
        ? `box-shadow:0 0 10px -2px ${bc},inset 0 0 16px -8px ${bc};` : '';
      const bg = item
        ? `linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02))`
        : `rgba(255,255,255,.02)`;
      return `<div style="position:relative;text-align:center;padding:9px 4px 8px;border-radius:11px;background:${bg};
        border:1px solid ${item ? bc : 'var(--border)'};${glow}${item ? '' : 'opacity:.45;'}">
        <div style="font-size:9px;color:var(--text-dim);letter-spacing:.3px;">${s.icon} ${s.label}</div>
        <div style="font-size:23px;line-height:1.15;margin:2px 0;">${item ? item.emoji : '➖'}</div>
        <div style="font-size:10px;font-weight:700;color:${item ? '#fff' : 'var(--text-dim)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item ? item.name : '—'}</div>
      </div>`;
    };
    // Order: worn slots first for quick scanning, then empties.
    const ordered = ['weapon', 'shield', 'hat', 'glasses', 'head', 'body', 'garment', 'ring', 'wrist', 'pants', 'feet', 'accessory']
      .map(id => EQUIP_SLOTS.find(s => s.id === id)).filter(Boolean);
    const wornCount = ordered.filter(s => resolveSlot(s.id)).length;

    let statsHtml = '';
    if (ch) {
      statsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;">
          ${stat('⚔️ ATK', ch.atk ?? '-')}
          ${stat('🛡️ DEF', ch.def ?? '-')}
          ${stat('❤️ HP', `${ch.hp ?? '-'}/${ch.max_hp ?? '-'}`)}
          ${stat('💧 SP', `${ch.sp ?? '-'}/${ch.max_sp ?? '-'}`)}
          ${stat('💀 Kills', (ch.total_kills ?? 0).toLocaleString())}
          ${stat('💰 Zeny', (ch.gold ?? 0).toLocaleString())}
        </div>`;
    }

    // STR / AGI / INT — from the DB if stored, else derived from job + level.
    const jobForAttr = (ch && ch.job) || (heroApp && heroApp.job) || null;
    const lvlForAttr = (ch && ch.level) || player.level || 1;
    const js = getJobStats(jobForAttr, lvlForAttr);
    const attr = {
      str: (ch && ch.str != null) ? ch.str : js.str,
      agi: (ch && ch.agi != null) ? ch.agi : js.agi,
      int: (ch && ch.int != null) ? ch.int : js.int,
    };
    const attrChip = (label, val, color) => `<div style="flex:1;text-align:center;padding:7px 4px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid ${color}55;">
        <div style="font-size:10px;color:${color};font-weight:800;letter-spacing:.6px;">${label}</div>
        <div style="font-size:16px;font-weight:800;color:#fff;">${val}</div></div>`;
    const attrHtml = `<div style="font-size:11px;color:var(--text-dim);margin:2px 0 6px;text-align:left;">📊 พลังพื้นฐาน (Attributes)</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        ${attrChip('STR', attr.str, '#ff6b6b')}
        ${attrChip('AGI', attr.agi, '#51cf66')}
        ${attrChip('INT', attr.int, '#748ffc')}
      </div>`;

    box.innerHTML = `${statsHtml}${attrHtml}
      <div style="font-size:11px;color:var(--text-dim);margin:2px 0 6px;text-align:left;">🎽 อุปกรณ์ที่สวมใส่ (${wornCount}/${ordered.length})</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">
        ${ordered.map(cell).join('')}
      </div>`;
  }

  _toggleFriend(player) {
    const username = player.username;
    const isFriend = this.friends.includes(username);

    if (isFriend) {
      // Remove friend instantly (no confirmation needed from other side)
      const idx = this.friends.indexOf(username);
      this.friends.splice(idx, 1);
      this.addCombatLog(`💔 ลบ ${username} ออกจากรายชื่อเพื่อน`, 'system');
      this._saveFriendsListToDB();

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

  // ============ PVP Duel Request/Response ============
  receiveDuelRequest(payload) {
    if (!payload) return;
    this.addCombatLog(`⚔️ ${payload.senderName} (Lv.${payload.senderLevel || '?'}) ท้าดวล PVP!`, 'warning');
    // Simple accept dialog (same approach as layout-reset confirm)
    const accepted = confirm(`⚔️ ${payload.senderName} (Lv.${payload.senderLevel || '?'}) ท้าดวล PVP!\n\nรับคำท้าหรือไม่?`);
    import('../network/GameSync.js').then(({ sendDuelResponse }) => {
      sendDuelResponse(payload.senderUserId, accepted);
    });
    if (!accepted) this.addCombatLog('🚫 ปฏิเสธคำท้าดวล', 'system');
  }

  receiveDuelResponse(payload) {
    if (!payload) return;
    if (payload.accepted) {
      this.addCombatLog('✅ คู่ต่อสู้รับคำท้า! กำลังเข้าสู่สังเวียน...', 'system');
    } else {
      this.addCombatLog('🚫 คู่ต่อสู้ปฏิเสธคำท้าดวล', 'warning');
    }
  }

  _ensureDuelStyles() {
    if (document.getElementById('duel-fx-styles')) return;
    const s = document.createElement('style');
    s.id = 'duel-fx-styles';
    s.textContent = `
      #duel-overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        pointer-events:none;z-index:9000;font-family:'Press Start 2P','Fredoka One',sans-serif;text-align:center}
      #duel-overlay .duel-title{font-size:clamp(38px,9vw,96px);font-weight:900;letter-spacing:2px;
        animation:duelPop .6s cubic-bezier(.2,1.4,.4,1) both;text-shadow:0 4px 18px rgba(0,0,0,.6)}
      #duel-overlay .duel-sub{margin-top:18px;font-size:clamp(14px,2.6vw,24px);color:#fff;
        animation:duelFade .8s ease .35s both;text-shadow:0 2px 8px rgba(0,0,0,.7)}
      #duel-overlay .duel-mmr{margin-top:10px;font-size:clamp(13px,2.2vw,20px);animation:duelFade .8s ease .55s both}
      .duel-win .duel-title{color:#ffd94a;text-shadow:0 0 24px rgba(255,200,60,.8),0 4px 18px rgba(0,0,0,.6)}
      .duel-lose .duel-title{color:#ff5c5c;text-shadow:0 0 24px rgba(255,60,60,.6),0 4px 18px rgba(0,0,0,.6)}
      .duel-flash .duel-title{color:#fff;animation:duelFight .5s ease both}
      @keyframes duelPop{0%{transform:scale(.2) rotate(-8deg);opacity:0}60%{transform:scale(1.15) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
      @keyframes duelFight{0%{transform:scale(2.5);opacity:0}40%{opacity:1}100%{transform:scale(1);opacity:1}}
      @keyframes duelFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      #duel-overlay.duel-hide{animation:duelOut .5s ease forwards}
      @keyframes duelOut{to{opacity:0;transform:scale(1.05)}}
    `;
    document.head.appendChild(s);
  }

  _showDuelOverlay(cls, html, holdMs) {
    this._ensureDuelStyles();
    let ov = document.getElementById('duel-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'duel-overlay';
    ov.className = cls;
    ov.innerHTML = html;
    document.body.appendChild(ov);
    clearTimeout(this._duelOverlayTimer);
    this._duelOverlayTimer = setTimeout(() => {
      ov.classList.add('duel-hide');
      setTimeout(() => ov.remove(), 500);
    }, holdMs);
  }

  // "FIGHT!" flash when the cage drops and the duel begins
  showDuelBanner() {
    this._showDuelOverlay('duel-flash', `<div class="duel-title">⚔️ FIGHT! ⚔️</div>`, 1400);
  }

  // Big VICTORY / DEFEAT banner with MMR change
  showDuelResult(won, delta, mmr, forfeit) {
    const mmrLine = (delta !== undefined && mmr !== undefined)
      ? `<div class="duel-mmr" style="color:${won ? '#7CFC9A' : '#ff8a8a'}">${won ? '▲ +' : '▼ -'}${delta} MMR &nbsp;→&nbsp; ${mmr}</div>`
      : '';
    if (won) {
      this._showDuelOverlay('duel-win',
        `<div class="duel-title">🏆 VICTORY!</div>
         <div class="duel-sub">คุณคือผู้ชนะแห่งสังเวียน!${forfeit ? ' (คู่ต่อสู้ยอมแพ้)' : ''}</div>${mmrLine}`,
        4500);
    } else {
      this._showDuelOverlay('duel-lose',
        `<div class="duel-title">💀 DEFEAT</div>
         <div class="duel-sub">พ่ายแพ้ในสังเวียน... ฝึกฝนแล้วกลับมาใหม่!</div>${mmrLine}`,
        4500);
    }
  }

  showDeathBanner(killerName) {
    this._ensureDuelStyles();
    // Inject extra death-specific styles if missing
    if (!document.getElementById('death-fx-styles')) {
      const s = document.createElement('style');
      s.id = 'death-fx-styles';
      s.textContent = `
        .death-overlay .duel-title {
          color: #ff4444;
          text-shadow: 0 0 30px rgba(255, 0, 0, 0.8), 0 4px 20px rgba(0, 0, 0, 0.9);
          font-family: 'Press Start 2P', cursive;
          letter-spacing: -2px;
        }
        .death-overlay .killer-name {
          color: #fff;
          font-size: clamp(18px, 4vw, 32px);
          margin-top: 20px;
          font-weight: 800;
          text-transform: uppercase;
          background: linear-gradient(90deg, transparent, rgba(255,0,0,0.3), transparent);
          padding: 10px 40px;
          animation: deathSlideIn 0.8s ease-out both;
        }
        @keyframes deathSlideIn {
          from { opacity: 0; transform: scaleX(0); }
          to { opacity: 1; transform: scaleX(1); }
        }
      `;
      document.head.appendChild(s);
    }

    this._showDuelOverlay('duel-lose death-overlay',
      `<div class="duel-title">YOU DIED</div>
       <div class="duel-sub">คุณถูกกำจัดโดย</div>
       <div class="killer-name">💀 ${killerName} 💀</div>
       <div class="duel-sub" style="font-size: 12px; margin-top: 30px; opacity: 0.7;">กำลังรอการเกิดใหม่...</div>`,
      2800);
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
      this._saveFriendsListToDB();
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
        this._saveFriendsListToDB();
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
        if (chatPanel.classList.contains('preview-mode')) {
          this._openChatFull();
        } else {
          this._closeChatToPreview();
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this._closeChatToPreview();
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
      
      // Roblox style: after sending, keep focused or close? 
      // Usually it stays open until Escape or Enter again.
      chatInput.focus();
    };

    if (sendBtn) {
      sendBtn.addEventListener('click', sendMessage);
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const text = chatInput.value.trim();
          if (text) {
            sendMessage();
            e.stopPropagation();
          }
        }
      });
    }

    // Global hotkey: Enter to toggle/focus chat panel helper
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        // Ignore if focused on other input/textarea/select/editable elements
        if (activeEl &&
          activeEl !== chatInput &&
          (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
          return;
        }

        if (!chatPanel) return;

        if (chatPanel.classList.contains('preview-mode')) {
          // Roblox style: Enter opens the chat input
          this._openChatFull();
          e.preventDefault();
        } else {
          // Panel is open
          if (activeEl !== chatInput) {
            // Focus if not focused
            if (chatInput) {
              chatInput.focus();
              chatInput.select();
            }
            e.preventDefault();
          } else {
            // If already focused and we press Enter, the sendMessage() listener handles it.
            // But if it's empty, we close it back to preview.
            if (chatInput.value.trim() === '') {
              this._closeChatToPreview();
              e.preventDefault();
            }
          }
        }
      } else if (e.key === 'Escape') {
        if (chatPanel && !chatPanel.classList.contains('preview-mode')) {
          this._closeChatToPreview();
        }
      }
    });

    this._setupChatExtras(chatInput);
  }

  // Emoji picker + @mention autocomplete for the chat input.
  _setupChatExtras(chatInput) {
    if (!chatInput) return;
    const emojiBtn = document.getElementById('btn-emoji');
    const emojiPanel = document.getElementById('emoji-picker');
    const mentionBox = document.getElementById('mention-suggest');

    // ----- Emoji picker -----
    const EMOJIS = ['😀','😄','😁','😂','🤣','😊','😉','😍','😘','😎','🤩','🥳','😴','🤔','😮','😢','😭','😡','👍','👎','👏','🙏','💪','🔥','✨','💯','⚔️','🛡️','🏹','🐉','💰','💎','🎣','🐟','🏆','❤️','💔','😱','😅','🤝'];
    if (emojiPanel && !emojiPanel.dataset.built) {
      emojiPanel.innerHTML = EMOJIS.map(e => `<button type="button" class="emoji-cell">${e}</button>`).join('');
      emojiPanel.dataset.built = '1';
      emojiPanel.querySelectorAll('.emoji-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          this._insertAtCursor(chatInput, cell.textContent);
          emojiPanel.style.display = 'none';
          chatInput.focus();
        });
      });
    }
    if (emojiBtn && emojiPanel) {
      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPanel.style.display = emojiPanel.style.display === 'none' ? 'grid' : 'none';
        if (mentionBox) mentionBox.style.display = 'none';
      });
      document.addEventListener('click', (e) => {
        if (emojiPanel.style.display !== 'none' && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
          emojiPanel.style.display = 'none';
        }
      });
    }

    // ----- @mention autocomplete -----
    const renderMentions = () => {
      if (!mentionBox) return;
      const val = chatInput.value;
      const caret = chatInput.selectionStart ?? val.length;
      const upto = val.slice(0, caret);
      const m = upto.match(/@([^\s@]*)$/); // current @token being typed
      if (!m) { mentionBox.style.display = 'none'; return; }
      const q = m[1].toLowerCase();
      const names = [...new Set((this.onlinePlayers || []).map(p => p.username).filter(Boolean))]
        .filter(n => n.toLowerCase().includes(q) && n !== (this.character?.stats?.name))
        .slice(0, 6);
      if (!names.length) { mentionBox.style.display = 'none'; return; }
      mentionBox.innerHTML = names.map(n => `<button type="button" class="mention-cell" data-name="${n.replace(/"/g, '&quot;')}">👤 ${n.replace(/</g, '&lt;')}</button>`).join('');
      mentionBox.querySelectorAll('.mention-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const name = cell.getAttribute('data-name');
          const start = upto.lastIndexOf('@');
          chatInput.value = val.slice(0, start) + '@' + name + ' ' + val.slice(caret);
          mentionBox.style.display = 'none';
          chatInput.focus();
          const pos = start + name.length + 2;
          chatInput.setSelectionRange(pos, pos);
        });
      });
      mentionBox.style.display = 'flex';
    };
    chatInput.addEventListener('input', renderMentions);
    chatInput.addEventListener('blur', () => setTimeout(() => { if (mentionBox) mentionBox.style.display = 'none'; }, 150));
  }

  _insertAtCursor(input, text) {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + text + input.value.slice(e);
    const pos = s + text.length;
    input.setSelectionRange(pos, pos);
    input.focus();
  }

  _openChatFull() {
    const chatPanel = document.getElementById('chat-panel');
    const chatInput = document.getElementById('chat-input');
    const chatInputRow = chatPanel.querySelector('.chat-input-row');
    
    chatPanel.classList.remove('preview-mode');
    chatPanel.classList.remove('empty');
    if (chatInputRow) chatInputRow.style.display = 'flex';
    
    if (chatInput) {
      setTimeout(() => {
        chatInput.focus();
        chatInput.select();
      }, 50);
    }
    
    // Auto scroll to bottom when opening
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  _closeChatToPreview() {
    const chatPanel = document.getElementById('chat-panel');
    const chatInput = document.getElementById('chat-input');
    const chatInputRow = chatPanel.querySelector('.chat-input-row');

    chatPanel.classList.add('preview-mode');
    if (chatInputRow) chatInputRow.style.display = 'none';
    if (chatInput) chatInput.blur();
    
    // Auto scroll to bottom
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  setupChatSendCallback(callback) {
    this.chatSendCallback = callback;
  }

  // Reflect the current audio state onto the Settings controls (toggles + sliders).
  _syncAudioSettingsUI() {
    const musicOn = localStorage.getItem('zolos_music_enabled') !== 'false';
    const sfxOn = this.soundManager ? this.soundManager.enabled
      : (localStorage.getItem('zolos_sfx_enabled') !== 'false');
    const musicVol = window.youtubeBGM ? window.youtubeBGM.volume
      : parseInt(localStorage.getItem('zolos_music_volume') || '25', 10);
    const sfxVol = this.soundManager ? Math.round(this.soundManager.masterVolume * 100)
      : parseInt(localStorage.getItem('zolos_sfx_volume') || '30', 10);

    const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
    set('settings-music-enabled', 'checked', musicOn);
    set('settings-sfx-enabled', 'checked', sfxOn);
    set('settings-music-volume', 'value', musicVol);
    set('settings-sfx-volume', 'value', sfxVol);
    set('settings-music-vol-label', 'textContent', musicVol + '%');
    set('settings-sfx-vol-label', 'textContent', sfxVol + '%');
  }

  // ===== Device settings (localStorage-backed, per-device not per-character) =====
  _flag(key, def) { const v = localStorage.getItem(key); return v == null ? def : v === 'true'; }
  _num(key, def) { const v = parseInt(localStorage.getItem(key), 10); return Number.isNaN(v) ? def : v; }

  // Push persisted device settings into the live systems. Called once the game
  // is running so a reload restores what the player picked.
  applyDeviceSettings() {
    if (this.soundManager) this.soundManager.skillSoundsEnabled = this._flag('zolos_skill_sfx_enabled', true);
    if (window.particles) window.particles.effectsEnabled = !this._flag('zolos_hide_effects', false);
  }

  // Reflect the effects/performance/auto-potion controls from storage.
  _syncGameplaySettingsUI() {
    const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
    const musicOn = this._flag('zolos_music_enabled', true);
    const sfxOn = this._flag('zolos_sfx_enabled', true);
    set('settings-skill-sfx-enabled', 'checked', this._flag('zolos_skill_sfx_enabled', true));
    set('settings-mute-all', 'checked', !musicOn && !sfxOn);
    set('settings-hide-effects', 'checked', this._flag('zolos_hide_effects', false));
    set('settings-hide-others-gear', 'checked', this._flag('zolos_hide_others_gear', false));
    set('settings-hide-others', 'checked', this._flag('zolos_hide_others', false));

    const hpT = this._num('zolos_auto_hp_threshold', 40);
    const spT = this._num('zolos_auto_sp_threshold', 25);
    set('settings-auto-hp', 'checked', this._flag('zolos_auto_hp', false));
    set('settings-auto-sp', 'checked', this._flag('zolos_auto_sp', false));
    set('settings-auto-hp-threshold', 'value', hpT);
    set('settings-auto-sp-threshold', 'value', spT);
    set('settings-auto-hp-label', 'textContent', hpT + '%');
    set('settings-auto-sp-label', 'textContent', spT + '%');
  }

  // ===== Performance: hide other players' gear / bodies on THIS screen only =====
  // Purely local rendering — they stay online and everything else works. A duel
  // opponent is never hidden, so you can always see who you're fighting.
  applyRemoteVisibility(remotePlayersMap, protectedUserId = null) {
    if (!remotePlayersMap) return;
    const hideAll = this._flag('zolos_hide_others', false);
    const hideGear = this._flag('zolos_hide_others_gear', false);
    // Skip the walk entirely when nothing is hidden and nothing was hidden last
    // frame (so we don't fight normal visibility every frame for no reason).
    if (!hideAll && !hideGear && !this._remoteHidden) return;
    this._remoteHidden = hideAll || hideGear;

    for (const [uid, rp] of remotePlayersMap.entries()) {
      if (!rp) continue;
      const exempt = protectedUserId && uid === protectedUserId;
      if (rp.mesh) rp.mesh.visible = exempt ? true : !hideAll;
      const c = rp.character;
      if (!c) continue;
      const gearVisible = exempt ? true : (!hideAll && !hideGear);
      if (c.hatMesh) c.hatMesh.visible = gearVisible;
      if (c.glassesMesh) c.glassesMesh.visible = gearVisible;
      if (c.weaponMesh) c.weaponMesh.visible = gearVisible;
    }
  }

  // ===== Auto potion =====
  // Drinks automatically when HP/SP falls under the configured percentage,
  // preferring the smallest bottle that still covers what's missing so the good
  // stuff isn't wasted. ~1.5s between sips. Driven from the game loop, so it
  // also keeps you alive while the tab is backgrounded.
  updateAutoPotion(dt) {
    if (!this.character || !this.character.stats) return;
    this._potionCd = Math.max(0, (this._potionCd || 0) - dt);
    if (this._potionCd > 0) return;
    if (this.character.isAlive && !this.character.isAlive()) return;

    const s = this.character.stats;
    if (this._flag('zolos_auto_hp', false) && s.max_hp > 0) {
      const pct = (s.hp / s.max_hp) * 100;
      if (pct < this._num('zolos_auto_hp_threshold', 40) && this._drinkBestPotion('hp')) {
        this._potionCd = 1.5;
        return;
      }
    }
    if (this._flag('zolos_auto_sp', false) && s.max_sp > 0) {
      const pct = (s.sp / s.max_sp) * 100;
      if (pct < this._num('zolos_auto_sp_threshold', 25) && this._drinkBestPotion('sp')) {
        this._potionCd = 1.5;
      }
    }
  }

  _drinkBestPotion(kind) {
    const s = this.character.stats;
    const missing = kind === 'hp' ? (s.max_hp - s.hp) : (s.max_sp - s.sp);
    if (missing <= 0) return false;
    const field = kind === 'hp' ? 'healHp' : 'restoreSp';
    const amt = (i) => (ITEMS[i.item_name] && ITEMS[i.item_name][field]) || i[field] || 0;

    const candidates = this.inventory.filter(i =>
      i.item_type === 'consumable' && (i.quantity || 0) > 0 && amt(i) > 0);
    if (!candidates.length) return false;

    // Smallest bottle that still covers the gap; otherwise the biggest we have.
    const enough = candidates.filter(i => amt(i) >= missing).sort((a, b) => amt(a) - amt(b));
    const pick = enough[0] || candidates.slice().sort((a, b) => amt(b) - amt(a))[0];
    const healed = amt(pick);

    if (kind === 'hp') this.character.heal(healed);
    else this.character.restoreSp(healed);

    pick.quantity--;
    if (this.characterId) saveInventoryItem(this.characterId, pick.item_name, pick.item_type, -1).catch(() => { });
    if (pick.quantity <= 0) {
      const idx = this.inventory.findIndex(i => i.item_name === pick.item_name);
      if (idx >= 0) this.inventory.splice(idx, 1);
    }
    if (this.soundManager) this.soundManager.playUseItemSound();
    this.addCombatLog(`${kind === 'hp' ? '❤️' : '💧'} ออโต้ใช้ ${pick.emoji || '🧪'} ${pick.item_name} (+${healed})`, 'heal');
    this._renderInventory();
    this.updateHUD(this.character.stats);
    return true;
  }

  // Keep the legacy combined sound_enabled flag roughly in sync so anything
  // still reading it behaves sensibly (on if either music or SFX is on).
  _persistLegacySoundFlag() {
    const musicOn = localStorage.getItem('zolos_music_enabled') !== 'false';
    const sfxOn = localStorage.getItem('zolos_sfx_enabled') !== 'false';
    const combined = musicOn || sfxOn;
    if (this.character && this.character.gameSettings) {
      this.character.gameSettings.sound_enabled = combined;
      if (typeof this.character.saveStatsToDatabase === 'function') {
        this.character.saveStatsToDatabase();
      }
    }
  }

  // Emoticon → emoji shortcuts (applied to raw text before HTML-escaping).
  static _EMOTICONS = [
    ['<3', '❤️'], [':D', '😄'], [':)', '🙂'], ['=)', '🙂'], [':(', '🙁'], [';)', '😉'],
    [':P', '😛'], [':p', '😛'], ['xD', '😆'], ['XD', '😆'], [':O', '😮'], [':o', '😮'],
    ['B)', '😎'], ['8)', '😎'], [':|', '😐'], [":'(", '😢'], ['^^', '😊'], ['555', '😂'],
  ];
  _emojify(text) {
    let out = text;
    for (const [k, v] of GameUI._EMOTICONS) out = out.split(k).join(v);
    return out;
  }

  receiveChatMessage(username, message) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // SECURITY: escape everything — chat is untrusted input. (Rendering raw
    // innerHTML here was an XSS hole: a message could inject <img onerror=…>.)
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const myName = (this.character && this.character.stats && this.character.stats.name) || '';
    let mentionedMe = false;

    // emoji shortcuts on raw text, then escape, then highlight @mentions
    let body = esc(this._emojify(String(message == null ? '' : message)));
    body = body.replace(/@([^\s@<>&]{1,24})/g, (full, name) => {
      const isMe = myName && name.toLowerCase() === myName.toLowerCase();
      if (isMe) mentionedMe = true;
      return `<span class="chat-mention${isMe ? ' me' : ''}">@${name}</span>`;
    });

    const isSystem = typeof username === 'string' && username.includes('ระบบ');
    const row = document.createElement('div');
    row.className = 'chat-msg-row ' + (isSystem ? 'system' : 'user') + (mentionedMe ? ' mention-me' : '');
    row.innerHTML = `<span class="chat-msg-username">[${esc(username)}]:</span> <span class="chat-msg-text">${body}</span>`;
        chatMessages.appendChild(row);
    while (chatMessages.children.length > 80) chatMessages.removeChild(chatMessages.firstChild);

    setTimeout(() => {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    }, 50);

    // Ping when someone tags you (not your own message)
    if (mentionedMe && username !== myName) {
      if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
      this.addCombatLog(`💬 ${username} แท็กหาคุณในแชท!`, 'levelup');
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
      // Bind Account logic
      const bindBtn = document.getElementById('btn-link-account');
      const bindEmail = document.getElementById('link-account-email');
      const bindPass = document.getElementById('link-account-password');
      const bindStatus = document.getElementById('link-account-status');

      if (bindBtn) {
        bindBtn.addEventListener('click', async () => {
          const email = bindEmail?.value.trim();
          const password = bindPass?.value.trim();

          if (!email || !password) {
            if (bindStatus) {
              bindStatus.textContent = 'กรุณากรอกอีเมลและรหัสผ่าน';
              bindStatus.style.color = '#ff6080';
            }
            return;
          }

          if (password.length < 6) {
            if (bindStatus) {
              bindStatus.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
              bindStatus.style.color = '#ff6080';
            }
            return;
          }

          if (bindStatus) {
            bindStatus.textContent = 'กำลังผูกบัญชี...';
            bindStatus.style.color = '#60a0ff';
          }

          try {
            if (this.bindAccountCallback) {
              await this.bindAccountCallback(email, password);
              if (bindStatus) {
                bindStatus.textContent = '✅ ผูกบัญชีสำเร็จ! กรุณาจำอีเมลและรหัสผ่านไว้';
                bindStatus.style.color = '#40e080';
              }
              // Hide section after success after a delay
              setTimeout(() => {
                this.setGuestMode(false);
              }, 3000);
            }
          } catch (err) {
            if (bindStatus) {
              bindStatus.textContent = `❌ ผิดพลาด: ${err.message}`;
              bindStatus.style.color = '#ff6080';
            }
          }
        });
      }

      tabProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        tabProfilePane.style.display = 'block';
        tabSettingsPane.style.display = 'none';
        tabProfileBtn.classList.add('active-tab');
        tabSettingsBtn.classList.remove('active-tab');
        // Handled by CSS .active-tab class
      });

      tabSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        tabProfilePane.style.display = 'none';
        tabSettingsPane.style.display = 'block';
        tabProfileBtn.classList.remove('active-tab');
        tabSettingsBtn.classList.add('active-tab');
        // Handled by CSS .active-tab class

        // Sync audio config values when opening the Settings tab
        this._syncAudioSettingsUI();
        this._syncGameplaySettingsUI();
        
        // Use persisted character settings if available
        if (this.character && this.character.gameSettings) {
          const graphicsSelect = document.getElementById('settings-graphics-quality');
          if (graphicsSelect) {
            graphicsSelect.value = this.character.gameSettings.graphics_quality || 'medium';
          }
          const fpsCheckbox = document.getElementById('settings-fps-enabled');
          if (fpsCheckbox) {
            fpsCheckbox.checked = !!this.character.gameSettings.fps_enabled;
          }
        } else {
          const graphicsSelect = document.getElementById('settings-graphics-quality');
          if (graphicsSelect && window.rendererSystem) {
            graphicsSelect.value = window.rendererSystem.qualityLevel;
          }
          const fpsCheckbox = document.getElementById('settings-fps-enabled');
          if (fpsCheckbox) {
            fpsCheckbox.checked = localStorage.getItem('zolos_show_fps') === 'true';
          }
        }
      });
    }

    // ===== Audio settings: separate Music (BGM) & Sound Effects (SFX) =====
    // Each has an on/off toggle and a 0–100 volume slider. Persisted in
    // localStorage (these are device settings, not part of the DB schema).
    const musicToggle = document.getElementById('settings-music-enabled');
    const musicSlider = document.getElementById('settings-music-volume');
    const sfxToggle = document.getElementById('settings-sfx-enabled');
    const sfxSlider = document.getElementById('settings-sfx-volume');

    if (musicToggle) {
      musicToggle.addEventListener('change', (e) => {
        const on = e.target.checked;
        if (window.youtubeBGM) window.youtubeBGM.setEnabled(on);
        localStorage.setItem('zolos_music_enabled', on ? 'true' : 'false');
        // Keep the legacy combined flag roughly in sync (music || sfx = "sound on")
        this._persistLegacySoundFlag();
      });
    }
    if (musicSlider) {
      musicSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 0;
        if (window.youtubeBGM) window.youtubeBGM.setVolume(v);
        const lbl = document.getElementById('settings-music-vol-label');
        if (lbl) lbl.textContent = v + '%';
        localStorage.setItem('zolos_music_volume', String(v));
      });
    }

    if (sfxToggle) {
      sfxToggle.addEventListener('change', (e) => {
        const on = e.target.checked;
        if (this.soundManager) {
          this.soundManager.enabled = on;
          if (on) this.soundManager.playUseItemSound(); // preview
        }
        localStorage.setItem('zolos_sfx_enabled', on ? 'true' : 'false');
        this._persistLegacySoundFlag();
      });
    }
    if (sfxSlider) {
      sfxSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 0;
        if (this.soundManager) this.soundManager.masterVolume = v / 100;
        const lbl = document.getElementById('settings-sfx-vol-label');
        if (lbl) lbl.textContent = v + '%';
        localStorage.setItem('zolos_sfx_volume', String(v));
      });
      // Preview the new level when the user releases the slider
      sfxSlider.addEventListener('change', () => {
        if (this.soundManager && this.soundManager.enabled) this.soundManager.playHitSound();
      });
    }

    // ===== Effects / performance / auto-potion toggles =====
    // All device-local (localStorage), applied straight to the live systems.
    const bindFlag = (id, key, onChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', (e) => {
        const on = e.target.checked;
        localStorage.setItem(key, on ? 'true' : 'false');
        if (onChange) onChange(on);
      });
    };

    bindFlag('settings-skill-sfx-enabled', 'zolos_skill_sfx_enabled', (on) => {
      if (this.soundManager) this.soundManager.skillSoundsEnabled = on;
    });
    bindFlag('settings-hide-effects', 'zolos_hide_effects', (on) => {
      if (window.particles) window.particles.effectsEnabled = !on;
      this.addCombatLog(on ? '🎆 ปิดเอฟเฟกต์ภาพแล้ว' : '🎆 เปิดเอฟเฟกต์ภาพแล้ว', 'system');
    });
    bindFlag('settings-hide-others-gear', 'zolos_hide_others_gear');
    bindFlag('settings-hide-others', 'zolos_hide_others');
    bindFlag('settings-auto-hp', 'zolos_auto_hp', (on) => {
      this.addCombatLog(on ? `❤️ ออโต้ยาเลือด: เปิด (ต่ำกว่า ${this._num('zolos_auto_hp_threshold', 40)}%)` : '❤️ ออโต้ยาเลือด: ปิด', 'system');
    });
    bindFlag('settings-auto-sp', 'zolos_auto_sp', (on) => {
      this.addCombatLog(on ? `💧 ออโต้ยามานา: เปิด (ต่ำกว่า ${this._num('zolos_auto_sp_threshold', 25)}%)` : '💧 ออโต้ยามานา: ปิด', 'system');
    });

    // Mute All — flips both music and SFX together, then re-syncs their rows.
    const muteAll = document.getElementById('settings-mute-all');
    if (muteAll) {
      muteAll.addEventListener('change', (e) => {
        const on = !e.target.checked; // checked = muted
        if (window.youtubeBGM) window.youtubeBGM.setEnabled(on);
        if (this.soundManager) this.soundManager.enabled = on;
        localStorage.setItem('zolos_music_enabled', on ? 'true' : 'false');
        localStorage.setItem('zolos_sfx_enabled', on ? 'true' : 'false');
        this._persistLegacySoundFlag();
        this._syncAudioSettingsUI();
      });
    }

    const bindRange = (id, key, labelId) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 0;
        localStorage.setItem(key, String(v));
        const lbl = document.getElementById(labelId);
        if (lbl) lbl.textContent = v + '%';
      });
    };
    bindRange('settings-auto-hp-threshold', 'zolos_auto_hp_threshold', 'settings-auto-hp-label');
    bindRange('settings-auto-sp-threshold', 'zolos_auto_sp_threshold', 'settings-auto-sp-label');

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

    // Layout Manager listeners
    const editLayoutBtn = document.getElementById('btn-edit-layout');
    if (editLayoutBtn) {
      editLayoutBtn.addEventListener('click', () => {
        const isEditing = this.layoutManager.toggleEditMode();
        editLayoutBtn.textContent = isEditing ? '✅ Save Layout (บันทึกตำแหน่ง)' : '🛠️ Edit Layout Mode (เปิดโหมดแก้ไข)';
        // editLayoutBtn.style.background = isEditing ? '#40e080 !important' : 'var(--primary) !important';

        if (isEditing) {
          // Close settings panel so user can see the UI
          if (modal) modal.style.display = 'none';
          this.updateMobileControlsVisibility();
        }
      });
    }

    const resetLayoutBtn = document.getElementById('btn-reset-layout');
    if (resetLayoutBtn) {
      resetLayoutBtn.addEventListener('click', () => {
        if (confirm('คุณต้องการรีเซ็ตตำแหน่ง UI ทั้งหมดเป็นค่าเริ่มต้นใช่หรือไม่?')) {
          this.layoutManager.resetLayout();
        }
      });
    }



    const openEditor = () => {
      // Close the Fishing Almanac overlay if it's open
      const almanac = document.getElementById('almanac-modal');
      if (almanac) almanac.style.display = 'none';
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
        this._renderProfileJob();
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

        this._markLockedOptions(weaponSelect);
        this._markLockedOptions(hatSelect);
        this._markLockedOptions(glassesSelect);

        // Paper-doll equipment picker (replaces the old dropdowns).
        this._renderProfileEquipDoll();
        this._renderProfileAttributes();
      }

      modal.style.display = 'flex';
      this.updateMobileControlsVisibility();
    };

    const closeEditor = () => {
      modal.style.display = 'none';
      this.updateMobileControlsVisibility();
      
      // Part 1.4: Explicit save on close
      if (this.character && this.character.saveStatsToDatabase) {
        console.log('[Zolos] 💾 Profile/Settings panel closed, triggering save...');
        this.character.saveStatsToDatabase();
      }
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
          // Equipment is applied live via the paper-doll picker, so save just
          // carries the hero's CURRENT gear through (never clobbers it).
          weapon: this.character?.equippedWeapon || 'None',
          hat: (this.character?.equippedHat && this.character.equippedHat !== 'None') ? this.character.equippedHat : 'None',
          glasses: (this.character?.equippedGlasses && this.character.equippedGlasses !== 'None') ? this.character.equippedGlasses : 'None',
        };

        // Job lock: never apply a worn item this class can't use (guards against
        // a stale/forced selection). Blocked slots fall back to unequipped.
        const job = this.character?.stats?.job || null;
        for (const slot of ['weapon', 'hat', 'glasses']) {
          if (data[slot] && data[slot] !== 'None' && !canEquipItem(data[slot], job)) {
            const jobName = JOBS[itemJob(data[slot])]?.name || 'อื่น';
            this.addCombatLog(`🔒 ${data[slot]} ใช้ได้เฉพาะอาชีพ ${jobName} — ข้ามการสวมใส่`, 'warning');
            data[slot] = 'None';
          }
        }

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

  setupBindAccountCallback(callback) {
    this.bindAccountCallback = callback;
  }

  setGuestMode(isGuest) {
    this.isGuest = isGuest;
    const guestSection = document.getElementById('settings-guest-link-section');
    if (guestSection) {
      guestSection.style.display = isGuest ? 'block' : 'none';
    }
  }

  /**
   * Sync equipment state from Profile Editor → Inventory
   * Called when user changes weapon/hat/glasses/armor/shield from the Profile panel.
   * Updates inventory stats.equipped flags and persists to DB.
   * @param {string} slotType - 'weapon'|'hat'|'glasses'|'armor'|'shield'
   * @param {string} itemName - The item to equip, or 'None' to unequip
   */
  async syncEquipFromProfile(slotType, itemName) {
    // Determine which item_types belong to this slot
    const slotTypes = (slotType === 'weapon') ? ['weapon', 'fishing_rod'] : [slotType];

    // 1. Unequip all items currently equipped in this slot
    for (const invItem of this.inventory) {
      if (slotTypes.includes(invItem.item_type) && invItem.stats && invItem.stats.equipped === true) {
        invItem.stats.equipped = false;
        if (this.characterId) {
          // Persistence Fix: Pass the whole stats object, don't wipe it with {}
          await updateInventoryItemStats(this.characterId, invItem.item_name, invItem.stats);
        }
      }
    }

    // 2. Equip the selected item (if not 'None')
    if (itemName && itemName !== 'None') {
      const targetItem = this.inventory.find(i => slotTypes.includes(i.item_type) && i.item_name === itemName);
      if (targetItem) {
        if (!targetItem.stats) targetItem.stats = {};
        targetItem.stats.equipped = true;
        if (this.characterId) {
          // Persistence Fix: Pass the whole stats object, don't wipe it with {equipped:true}
          await updateInventoryItemStats(this.characterId, targetItem.item_name, targetItem.stats);
        }
      }
    }

    // 3. Handle fishing rod visibility
    if (slotType === 'weapon') {
      this.setFishingButtonVisible(itemName === 'Fishing Rod');
    }
  }

  /**
   * Refresh the Profile Editor equipment dropdowns to match current inventory state.
   * Called when equipment changes from the Inventory panel to keep Profile in sync.
   */
  // Disable (and 🔒-mark) equip-dropdown options this class can't wear.
  _markLockedOptions(selectEl) {
    if (!selectEl || !this.character) return;
    const job = this.character.stats?.job || null;
    Array.from(selectEl.options).forEach(opt => {
      if (!opt.value || opt.value === 'None') return;
      if (!canEquipItem(opt.value, job)) {
        opt.disabled = true;
        if (!opt.textContent.startsWith('🔒')) opt.textContent = `🔒 ${opt.textContent}`;
      }
    });
  }

  _refreshProfileEditorEquipment() {
    const modal = document.getElementById('profile-editor-modal');
    if (!modal || modal.style.display === 'none') return; // Only refresh if profile editor is open

    const weaponSelect = document.getElementById('profile-edit-weapon');
    const hatSelect = document.getElementById('profile-edit-hat');
    const glassesSelect = document.getElementById('profile-edit-glasses');

    // Refresh weapon dropdown
    if (weaponSelect) {
      weaponSelect.innerHTML = '<option value="None">👊 None / มือเปล่า</option>';
      const emojiMap = { 'Sword': '⚔️', 'Bow': '🏹', 'Gun': '🔫', 'Fishing Rod': '🎣', 'Katana': '⚔️', 'Crossbow': '🏹', 'Silver Dagger': '🗡️', 'Heavy Warhammer': '🔨', 'Excalibur': '🗡️', 'Rudra Bow': '🏹', 'Ragnarok Blade': '🔱', 'Novice Cutter': '🔪', 'Mage Staff': '🪄' };
      const weaponItems = (this.inventory || []).filter(i => i.item_type === 'weapon' || i.item_type === 'fishing_rod');
      weaponItems.forEach(i => {
        const opt = document.createElement('option');
        opt.value = i.item_name;
        opt.textContent = `${emojiMap[i.item_name] || '⚔️'} ${i.item_name}`;
        weaponSelect.appendChild(opt);
      });
      const equippedWeapon = weaponItems.find(i => i.stats && i.stats.equipped === true);
      weaponSelect.value = equippedWeapon ? equippedWeapon.item_name : 'None';
    }

    // Refresh hat dropdown
    if (hatSelect) {
      hatSelect.innerHTML = '<option value="None">❌ None / ไม่ใส่</option>';
      const hatEmojiMap = { 'Wizard Hat': '🧙', 'Crown': '👑', 'Cowboy Hat': '🤠' };
      const hatItems = (this.inventory || []).filter(i => i.item_type === 'hat');
      hatItems.forEach(i => {
        const opt = document.createElement('option');
        opt.value = i.item_name;
        opt.textContent = `${hatEmojiMap[i.item_name] || '🧙'} ${i.item_name}`;
        hatSelect.appendChild(opt);
      });
      const equippedHat = hatItems.find(i => i.stats && i.stats.equipped === true);
      hatSelect.value = equippedHat ? equippedHat.item_name : 'None';
    }

    // Refresh glasses dropdown
    if (glassesSelect) {
      glassesSelect.innerHTML = '<option value="None">❌ None / ไม่ใส่</option>';
      const glassesEmojiMap = { 'Sunglasses': '🕶️', 'Classic Glasses': '👓' };
      const glassesItems = (this.inventory || []).filter(i => i.item_type === 'glasses');
      glassesItems.forEach(i => {
        const opt = document.createElement('option');
        opt.value = i.item_name;
        opt.textContent = `${glassesEmojiMap[i.item_name] || '👓'} ${i.item_name}`;
        glassesSelect.appendChild(opt);
      });
      const equippedGlasses = glassesItems.find(i => i.stats && i.stats.equipped === true);
      glassesSelect.value = equippedGlasses ? equippedGlasses.item_name : 'None';
    }

    this._markLockedOptions(weaponSelect);
    this._markLockedOptions(hatSelect);
    this._markLockedOptions(glassesSelect);

    // Keep the profile paper-doll + attributes in sync too.
    this._renderProfileEquipDoll();
    this._renderProfileAttributes();
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
      buyBtn.addEventListener('click', async () => {
        await this._performShopAction();
      });
    }

  }

  // Open the buy shop pre-filtered to a tab ('all' | 'usable' | 'equip').
  openShopTab(tab = 'all') {
    this.currentShopTab = tab;
    this.selectedShopItem = null;
    const tabs = document.querySelectorAll('.shop-tab');
    tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
    this._togglePanel('shop-panel');
    this._renderShop();
    this._updateShopDetailBox();
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

  // ============ Heaven Merchant (Svarrga) — pickaxe shop + ore→ZOL ============
  // Sells the Celestial Pickaxe (needed to mine, level 25+ only) and converts
  // mined Celestial Ore into the in-game ZOL currency.
  static HEAVEN = { ORE_TO_ZOL: 100 };
  static RARITY = {
    common: { c: '#b8c4d0', b: '⚪', t: 'ธรรมดา' },
    uncommon: { c: '#5fdd7a', b: '🟢', t: 'พบบ่อย' },
    rare: { c: '#4aa3ff', b: '🔵', t: 'หายาก' },
    epic: { c: '#c774ff', b: '🟣', t: 'มหากาพย์' },
    legendary: { c: '#ffcf4a', b: '🟡', t: 'ตำนาน' },
  };

  // The equipped pickaxe inventory item that still has durability (or null).
  // Pickaxes bought before durability existed have no `durability` field — treat
  // those as a full bar (and fill it in) instead of reading them as broken,
  // which would make an equipped pickaxe unusable.
  equippedPickaxe() {
    const p = this.inventory.find(i =>
      i.item_type === 'tool' && ITEMS[i.item_name] && ITEMS[i.item_name].mineYield &&
      i.stats && i.stats.equipped === true
    );
    if (!p) return null;
    if (p.stats.durability == null) {
      p.stats.durability = ITEMS[p.item_name].durability || 1;
      if (this.characterId) updateInventoryItemStats(this.characterId, p.item_name, p.stats).catch(() => { });
    }
    return p.stats.durability > 0 ? p : null;
  }

  // Mining yield of the equipped pickaxe (0 = none equipped / broken).
  bestPickaxeYield() {
    const p = this.equippedPickaxe();
    return p ? (ITEMS[p.item_name].mineYield || 1) : 0;
  }

  openHeavenShop() {
    if (!this.character) return;
    if (!document.getElementById('heaven-style')) {
      const st = document.createElement('style');
      st.id = 'heaven-style';
      st.textContent = `
        #heaven-modal{position:fixed;inset:0;z-index:1450;display:none;align-items:center;justify-content:center;
          background:rgba(0,0,0,.66);backdrop-filter:blur(4px);padding:12px;box-sizing:border-box;}
        #heaven-card{width:min(520px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:16px;
          background:var(--bg-panel);border:4px solid var(--gold-border);
          box-shadow:0 10px 0 var(--primary-deep),0 24px 60px rgba(0,0,0,.7);overflow:hidden;}
        #heaven-card .heaven-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 18px;}
        .heaven-sec{background:var(--bg-item);border:1px solid var(--border);border-radius:12px;padding:13px 14px;margin-bottom:12px;}
        .heaven-btn{width:100%;border:none;border-radius:12px;padding:12px;cursor:pointer;font-family:var(--font-main);
          font-weight:800;font-size:14px;color:#3a2000;background:linear-gradient(135deg,#ffe89a,var(--primary) 50%,var(--primary-deep));}
        .heaven-btn:disabled{filter:grayscale(.7);opacity:.55;cursor:not-allowed;color:#5a5a5a;}
        @media (max-width:768px){#heaven-modal{align-items:flex-start;padding:8px 8px 116px;}
          #heaven-card{width:100%;max-height:calc(100dvh - 132px);}}`;
      document.head.appendChild(st);
    }
    let modal = document.getElementById('heaven-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'heaven-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); }
      });
      modal.innerHTML = `<div id="heaven-card"></div>`;
      document.body.appendChild(modal);
    }
    this._renderHeavenShop();
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderHeavenShop() {
    const card = document.getElementById('heaven-card');
    if (!card) return;
    const H = GameUI.HEAVEN;
    const s = this.character.stats;
    const level = s.level;
    const gold = Number(s.gold) || 0;
    const zol = Number(s.zol) || 0;
    const oreItem = this.inventory.find(i => i.item_name === 'Celestial Ore');
    const oreQty = oreItem ? (oreItem.quantity || 0) : 0;

    // Pickaxe ladder — each tier shows its rarity, yield and price, gated by level.
    const pickaxeRows = PICKAXES.map(name => {
      const it = ITEMS[name];
      const r = GameUI.RARITY[it.rarity] || GameUI.RARITY.common;
      const ownedItem = this.inventory.find(i => i.item_name === name && (i.quantity || 0) > 0);
      const owned = !!ownedItem;
      const isEquipped = ownedItem && ownedItem.stats && ownedItem.stats.equipped === true;
      const durLeft = ownedItem && ownedItem.stats ? (ownedItem.stats.durability || 0) : 0;
      let btn;
      if (owned) btn = `<button class="heaven-btn" disabled>${isEquipped ? '⛏️ สวมอยู่' : '✅ มีแล้ว'}</button>`;
      else if (level < it.levelReq) btn = `<button class="heaven-btn" disabled>🔒 เลเวล ${it.levelReq}+</button>`;
      else if (gold < it.price) btn = `<button class="heaven-btn" disabled>💰 Zeny ไม่พอ</button>`;
      else btn = `<button class="heaven-btn" style="font-size:12px;padding:9px;" data-pick="${name}">🛒 ${it.price.toLocaleString()}</button>`;
      const durLine = owned
        ? `<span style="color:${durLeft > 0 ? '#7fe0ff' : '#ff6060'}">🔧 ทน ${durLeft}/${it.durability}</span>`
        : `🔧 ทน ${it.durability} ครั้ง`;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,.06);">
          <div style="font-size:26px;">${it.emoji}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;color:#fff;font-size:13px;">${name}
              <span style="color:${r.c};font-size:10px;font-weight:800;">${r.b} ${r.t}</span></div>
            <div style="font-size:10px;color:var(--text-dim);">ขุดครั้งละ <b style="color:#7fe0ff">${it.mineYield}</b> แร่ · ⏱️ ${it.mineTime} วิ · ${durLine} · Lv.${it.levelReq}+</div>
          </div>
          <div style="flex:0 0 auto;width:120px;">${btn}</div>
        </div>`;
    }).join('');

    const convertBtn = oreQty > 0
      ? `<button id="heaven-convert" class="heaven-btn">✨ แปลงทั้งหมด → +${(oreQty * H.ORE_TO_ZOL).toLocaleString()} ZOL</button>`
      : `<button class="heaven-btn" disabled>ยังไม่มีแร่ให้แปลง — ไปขุดที่เมืองสวรรค์ก่อน</button>`;

    card.innerHTML = `
      <div style="padding:16px 18px 12px;background:linear-gradient(90deg,rgba(240,192,64,.14),transparent);border-bottom:1px solid var(--border);position:relative;">
        <button id="heaven-close" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.08);border:1px solid var(--border);color:var(--text-dim);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;">✕</button>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:32px;">⛏️</div>
          <div>
            <div style="font-family:var(--font-main);color:#fff;font-size:18px;text-shadow:0 0 12px rgba(240,192,64,.5);">พ่อค้าสวรรค์</div>
            <div style="font-size:12px;color:var(--text-dim);">💰 <b style="color:var(--primary)">${gold.toLocaleString()}</b> Zeny &nbsp;·&nbsp; 🪙 <b style="color:#7fe0ff">${zol.toLocaleString()}</b> ZOL</div>
          </div>
        </div>
      </div>
      <div class="heaven-body">
        <div class="heaven-sec">
          <div style="font-weight:800;color:#fff;font-size:13px;margin-bottom:2px;">⛏️ พลั่วขุดแร่</div>
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">ซื้อแล้ว <b>สวมใส่</b>ในกระเป๋าเพื่อขุด · ยิ่งแรร์ ยิ่งขุดเยอะ+เร็ว+ทนกว่า · ใช้ครบพัง ต้องซื้อใหม่</div>
          ${pickaxeRows}
        </div>
        <div class="heaven-sec">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:30px;">💠</div>
            <div>
              <div style="font-weight:800;color:#fff;font-size:14px;">แปลงแร่เป็นเหรียญ ZOL</div>
              <div style="font-size:11px;color:var(--text-dim);line-height:1.4;">มีแร่ <b style="color:#7fe0ff">${oreQty}</b> ก้อน · อัตรา 1 แร่ = ${H.ORE_TO_ZOL} ZOL</div>
            </div>
          </div>
          ${convertBtn}
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-dim);opacity:.7;">ZOL เป็นสกุลเงินภายในเกม ใช้/เทรดกันในเกมได้</div>
      </div>`;

    card.querySelector('#heaven-close').onclick = () => {
      const m = document.getElementById('heaven-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    card.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => this._buyPickaxe(b.dataset.pick); });
    const conv = card.querySelector('#heaven-convert');
    if (conv) conv.onclick = () => this._convertOreToZol();
  }

  async _buyPickaxe(name) {
    const meta = ITEMS[name];
    if (!meta) return;
    const s = this.character.stats;
    if ((Number(s.level) || 1) < meta.levelReq) { this.addCombatLog(`🔒 ต้องเลเวล ${meta.levelReq} ขึ้นไปจึงจะซื้อ ${name} ได้`, 'system'); return; }
    if ((Number(s.gold) || 0) < meta.price) { this.addCombatLog('❌ เงิน Zeny ไม่เพียงพอ!', 'system'); return; }
    if (this.inventory.find(i => i.item_name === name && (i.quantity || 0) > 0)) return;

    s.gold -= meta.price;
    // A fresh pickaxe comes full: durability = max swings before it breaks.
    // Auto-equip it if no pickaxe is currently equipped, so mining just works.
    const alreadyEquipped = this.inventory.some(i => i.item_type === 'tool' && i.stats && i.stats.equipped === true);
    const newStats = { durability: meta.durability || 1, equipped: !alreadyEquipped };
    const existing = this.inventory.find(i => i.item_name === name);
    if (existing) { existing.quantity = (existing.quantity || 0) + 1; existing.stats = newStats; }
    else this.inventory.push({ item_name: name, item_type: meta.type, emoji: meta.emoji, desc: meta.desc, price: meta.price, quantity: 1, stats: newStats });
    if (newStats.equipped && this.character) this.character.equippedPickaxe = name;

    if (this.characterId) {
      await saveInventoryItem(this.characterId, name, meta.type, 1, newStats).catch(() => { });
      // saveInventoryItem only writes stats on insert; make sure they persist.
      await updateInventoryItemStats(this.characterId, name, newStats).catch(() => { });
      if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
    }
    if (this.soundManager && this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
    this.addCombatLog(`🛒 ซื้อ ⛏️ ${name} สำเร็จ! ขุดครั้งละ ${meta.mineYield} แร่ · ทน ${meta.durability} ครั้ง${newStats.equipped ? ' · สวมใส่ให้อัตโนมัติแล้ว' : ''}`, 'levelup');
    this._renderHeavenShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
  }

  async _convertOreToZol() {
    const H = GameUI.HEAVEN;
    const oreItem = this.inventory.find(i => i.item_name === 'Celestial Ore');
    const oreQty = oreItem ? (oreItem.quantity || 0) : 0;
    if (oreQty <= 0) return;

    const gained = oreQty * H.ORE_TO_ZOL;
    this.character.stats.zol = (Number(this.character.stats.zol) || 0) + gained;
    oreItem.quantity = 0;
    const idx = this.inventory.findIndex(i => i.item_name === 'Celestial Ore');
    if (idx >= 0) this.inventory.splice(idx, 1);

    if (this.characterId) {
      await saveInventoryItem(this.characterId, 'Celestial Ore', 'material', -oreQty).catch(() => { });
      if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
    }
    if (this.soundManager && this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
    this.addCombatLog(`✨ แปลงแร่ ${oreQty} ก้อน → +${gained.toLocaleString()} ZOL (ยอดรวม ${(Number(this.character.stats.zol) || 0).toLocaleString()})`, 'levelup');
    this._renderHeavenShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
  }

  // ============ Celestial Mining (timed, auto-repeating "job") ============
  // Mining is a continuous task: each swing takes the equipped pickaxe's
  // mineTime seconds, yields ore, and costs 1 durability. It auto-repeats on
  // whatever ore node is in range until the pickaxe breaks or the player stops.
  // updateMining() is driven every frame from the game loop (foreground AND the
  // hidden-tab background loop, so mining keeps "working" while backgrounded).

  // Entry point from tapping an ore node / pressing the Mine button: toggle the
  // mining job on/off.
  mineOreNode(node) {
    if (node) this._mineTargetNode = node;
    if (this.miningActive) { this.stopMining('⛏️ หยุดขุดแล้ว'); return; }
    this.startMining();
  }

  startMining() {
    if (this.miningActive) return;
    const pick = this.equippedPickaxe();
    if (!pick) {
      this.addCombatLog('⛏️ ต้องสวมพลั่วขุดก่อน — ซื้อจากพ่อค้าสวรรค์แล้วสวมใส่ในกระเป๋า', 'system');
      return;
    }
    this.miningActive = true;
    this._miningSwing = null; // { node, finishAt, duration }
    this.addCombatLog(`⛏️ เริ่มขุดแร่ด้วย ${pick.emoji || '⛏️'} ${pick.item_name}...`, 'system');
    this._updateMineButton();
  }

  stopMining(msg) {
    if (!this.miningActive && !this._miningSwing) { this._updateMineButton(); return; }
    this.miningActive = false;
    this._miningSwing = null;
    if (msg) this.addCombatLog(msg, 'system');
    this._updateMineButton();
  }

  // Called each frame by the game loop. Advances the current swing and, when it
  // finishes, awards ore + spends durability, then lines up the next swing.
  updateMining() {
    if (!this.miningActive) return;
    const pick = this.equippedPickaxe();
    if (!pick) { this.stopMining('💥 ไม่มีพลั่วที่ใช้ได้ — หยุดขุด'); return; }

    if (!this._miningSwing) {
      // Wait until a live ore node is in range (setMineTarget keeps it fresh).
      const node = this._mineTargetNode;
      if (!node || !node.userData || node.userData.mined) return;
      const dur = ITEMS[pick.item_name].mineTime || 4;
      this._miningSwing = { node, finishAt: Date.now() + dur * 1000, duration: dur };
      this._updateMineButton();
      return;
    }

    const swing = this._miningSwing;
    if (!swing.node || !swing.node.userData || swing.node.userData.mined) {
      // The node got depleted from under us — drop this swing and re-target.
      this._miningSwing = null;
      return;
    }
    if (Date.now() >= swing.finishAt) {
      this._completeMineSwing(swing.node, pick);
      this._miningSwing = null;
    } else {
      this._updateMineButton();
    }
  }

  _completeMineSwing(node, pick) {
    // Deplete the node + schedule respawn (~25s); the scene loop restores it.
    node.userData.mined = true;
    node.visible = false;
    node.userData.respawnAt = Date.now() + 25000;
    if (node.userData.glow) node.userData.glow.intensity = 0;

    // Award ore.
    const yield_ = ITEMS[pick.item_name].mineYield || 1;
    const meta = ITEMS['Celestial Ore'];
    const existing = this.inventory.find(i => i.item_name === 'Celestial Ore');
    if (existing) existing.quantity = (existing.quantity || 0) + yield_;
    else this.inventory.push({ item_name: 'Celestial Ore', item_type: meta.type, emoji: meta.emoji, desc: meta.desc, price: meta.price || 0, quantity: yield_, stats: {} });
    if (this.characterId) saveInventoryItem(this.characterId, 'Celestial Ore', meta.type, yield_).catch(() => { });

    // Spend durability.
    const maxDur = ITEMS[pick.item_name].durability || 1;
    pick.stats.durability = (pick.stats.durability || 0) - 1;
    if (this.characterId) updateInventoryItemStats(this.characterId, pick.item_name, pick.stats).catch(() => { });

    if (this.soundManager && this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();

    if (pick.stats.durability <= 0) {
      // The pickaxe breaks — remove it and stop the job.
      this.addCombatLog(`💥 ${pick.emoji || '⛏️'} ${pick.item_name} พังแล้ว! ต้องซื้อพลั่วใหม่ที่พ่อค้าสวรรค์`, 'system');
      const idx = this.inventory.findIndex(i => i.item_name === pick.item_name);
      if (idx >= 0) this.inventory.splice(idx, 1);
      if (this.character) this.character.equippedPickaxe = null;
      if (this.characterId) saveInventoryItem(this.characterId, pick.item_name, pick.item_type, -1).catch(() => { });
      this.stopMining();
    } else {
      this.addCombatLog(`⛏️💠 ขุดได้ Celestial Ore ×${yield_}! · พลั่วเหลือ ${pick.stats.durability}/${maxDur}`, 'levelup');
    }
    this._renderInventory();
    this._updateMineButton();
  }

  // Reflect the mining state on the ⛏️ button (label + fill progress).
  _updateMineButton() {
    const btn = document.getElementById('btn-mine');
    if (!btn) return;
    // Visible when a node is near OR a mining job is running (so you can stop it).
    btn.style.display = (this._mineTargetNode || this.miningActive) ? 'flex' : 'none';
    const txt = btn.querySelector('.fishing-text');
    if (this.miningActive) {
      btn.classList.add('mining-active');
      let pct = 0;
      if (this._miningSwing) {
        const s = this._miningSwing;
        pct = Math.max(0, Math.min(100, 100 * (1 - (s.finishAt - Date.now()) / (s.duration * 1000))));
      }
      btn.style.background = `linear-gradient(90deg, rgba(127,224,255,.55) ${pct}%, rgba(0,0,0,.35) ${pct}%)`;
      if (txt) txt.textContent = this._miningSwing ? `ขุด ${Math.round(pct)}%` : 'หยุด';
    } else {
      btn.classList.remove('mining-active');
      btn.style.background = '';
      if (txt) txt.textContent = 'ขุด';
    }
  }

  // ============ Login Streak — Daily Rewards ============
  // 7-day cycle; missing a day resets the streak. Rewards escalate to a
  // Dragon Heart on day 7 (the forge's rarest catalyst) so the streak feeds
  // the crafting loop. State: { streak, lastClaim: 'YYYY-MM-DD' }.
  static _STREAK_REWARDS = [
    { day: 1, gold: 500, items: [], cosmetic: null, title: '🌅 วันแรก', color: '#ffcf4a' },
    { day: 2, gold: 1000, items: [{ name: 'Red Herb', qty: 5 }], cosmetic: null, title: '🌄 วันที่สอง', color: '#ff9a7a' },
    { day: 3, gold: 2000, items: [{ name: 'Iron Ore', qty: 5 }], cosmetic: null, title: '🌇 วันที่สาม', color: '#ff7a7a' },
    { day: 4, gold: 3500, items: [{ name: 'Crystal Blue', qty: 2 }], cosmetic: null, title: '🌆 วันที่สี่', color: '#7a9aff' },
    { day: 5, gold: 5000, items: [{ name: 'Oridecon Stone', qty: 2 }], cosmetic: null, title: '🌃 วันที่ห้า', color: '#9a7aff' },
    { day: 6, gold: 8000, items: [{ name: 'Fire Element Stone', qty: 1 }], cosmetic: null, title: '🌉 วันที่หก', color: '#ff7aaa' },
    { day: 7, gold: 15000, items: [{ name: 'Dragon Heart', qty: 1 }], cosmetic: 'legendary-aura', title: '🌟 วันที่เจ็ด (ยิ่งใหญ่!)', color: '#ffaa4a' },
  ];

  _todayStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Streak the player is ON if they claim today (also true streak after claim)
  _pendingStreak() {
    const s = this.loginStreak || { streak: 0, lastClaim: null };
    if (s.lastClaim === this._todayStr()) return s.streak;      // already claimed
    if (s.lastClaim === this._todayStr(-1)) return s.streak + 1; // continue
    return 1;                                                    // broken/new
  }

  _canClaimDaily() {
    const s = this.loginStreak || { streak: 0, lastClaim: null };
    return s.lastClaim !== this._todayStr();
  }

  async loadLoginStreakFromDB(characterId) {
    this.characterId = this.characterId || characterId;
    try {
      const dbData = await loadLoginStreak(characterId);
      const localKey = `zolos_login_streak_${characterId}`;
      let localData = null;
      try { localData = JSON.parse(localStorage.getItem(localKey) || 'null'); } catch (e) { /* ignore */ }
      // Prefer whichever record is most recent
      this.loginStreak = (dbData && (!localData || (dbData.lastClaim || '') >= (localData.lastClaim || ''))) ? dbData : (localData || dbData) || { streak: 0, lastClaim: null };
      localStorage.setItem(localKey, JSON.stringify(this.loginStreak));
    } catch (e) {
      this.loginStreak = { streak: 0, lastClaim: null };
    }
    this._updateDailyRewardBadge();
    // Auto-open once per session when there's a reward waiting
    if (this._canClaimDaily()) {
      setTimeout(() => this.openDailyReward(), 1600);
    }
  }

  async _saveLoginStreak() {
    if (!this.characterId) return;
    localStorage.setItem(`zolos_login_streak_${this.characterId}`, JSON.stringify(this.loginStreak));
    try { await saveLoginStreak(this.characterId, this.loginStreak); } catch (e) { /* keep local */ }
  }

  // Pulse the HUD 🎁 button while a reward is claimable
  _updateDailyRewardBadge() {
    const btn = document.getElementById('btn-daily-reward');
    if (!btn) return;
    if (this._canClaimDaily()) {
      btn.style.animation = 'dailyPulse 1.2s ease-in-out infinite';
      btn.style.boxShadow = '0 0 14px rgba(255,200,60,0.75)';
    } else {
      btn.style.animation = '';
      btn.style.boxShadow = '';
    }
  }

  openDailyReward() {
    if (!document.getElementById('daily-style')) {
      const st = document.createElement('style');
      st.id = 'daily-style';
      st.textContent = `
        #daily-modal{position:fixed;inset:0;z-index:1450;display:none;align-items:center;justify-content:center;
          background:rgba(0,0,0,.66);backdrop-filter:blur(4px);padding:12px;box-sizing:border-box;}
        #daily-card{width:min(560px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:16px;
          background:var(--bg-panel);border:4px solid var(--gold-border);
          box-shadow:0 10px 0 var(--primary-deep),0 24px 60px rgba(0,0,0,.7);overflow:hidden;}
        #daily-card .daily-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}
        @keyframes dailyPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}
        @keyframes dailyGlow{0%,100%{box-shadow:0 0 10px rgba(255,207,74,.45);}50%{box-shadow:0 0 26px rgba(255,207,74,.95);}}
        @keyframes dailyShine{0%{background-position:-140% 0;}100%{background-position:240% 0;}}
        @keyframes dailyIconBounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);}}
        .daily-slot-today{animation:dailyGlow 1.4s ease-in-out infinite;}
        .daily-claim-btn{position:relative;overflow:hidden;}
        .daily-claim-btn:hover{transform:scale(1.02);box-shadow:0 0 30px rgba(255,207,74,.6) !important;}
        .daily-claim-btn::after{content:'';position:absolute;inset:0;
          background:linear-gradient(110deg,transparent 38%,rgba(255,255,255,.5) 50%,transparent 62%);
          background-size:220% 100%;animation:dailyShine 2.2s linear infinite;}
        @media (max-width:768px){
          #daily-modal{align-items:flex-start;padding:8px 8px 116px;}
          #daily-card{width:100%;max-height:calc(100vh - 132px);max-height:calc(100dvh - 132px);}
        }`;
      document.head.appendChild(st);
    }
    let modal = document.getElementById('daily-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'daily-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); }
      });
      modal.innerHTML = `<div id="daily-card"></div>`;
      document.body.appendChild(modal);
    }
    document.querySelectorAll('.side-panel').forEach(p => { p.style.display = 'none'; });
    this._renderDailyReward();
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderDailyReward() {
    const card = document.getElementById('daily-card');
    if (!card) return;
    const rewards = GameUI._STREAK_REWARDS;
    const pending = this._pendingStreak();
    const todayIdx = ((pending - 1) % 7) + 1; // 1..7 within the cycle
    const canClaim = this._canClaimDaily();
    const streakShown = canClaim ? pending : (this.loginStreak?.streak || 0);
    const brokeStreak = canClaim && pending === 1 && (this.loginStreak?.streak || 0) > 0;

    const itemLine = (r) => r.items.map(it => `${(ITEMS[it.name] || {}).emoji || '📦'}×${it.qty}`).join(' ');

    const slots = rewards.map(r => {
      const isToday = r.day === todayIdx;
      const isPast = r.day < todayIdx || (!canClaim && r.day === todayIdx);
      const isDay7 = r.day === 7;
      const bg = isToday && canClaim
        ? `linear-gradient(160deg,rgba(${parseInt(r.color.slice(1,3), 16)},${parseInt(r.color.slice(3,5), 16)},${parseInt(r.color.slice(5,7), 16)},.25),rgba(255,122,46,.15))`
        : isPast ? 'rgba(95,221,122,.08)' : 'rgba(255,255,255,.04)';
      const border = isToday && canClaim ? r.color : isPast ? 'rgba(95,221,122,.4)' : 'rgba(255,255,255,.09)';
      const label = isPast ? '✅' : (isToday && canClaim ? '⭐ วันนี้' : r.title);
      return `
        <div class="${isToday && canClaim ? 'daily-slot-today' : ''}" style="border-radius:12px;padding:12px 6px;text-align:center;
          background:${bg};border:2px solid ${border};${isDay7 ? 'grid-column:span 2;' : ''}
          ${isPast && !(isToday && canClaim) ? 'opacity:.55;filter:saturate(.6);' : ''}
          transition: all 0.3s ease; cursor: ${isToday && canClaim ? 'pointer' : 'default'};">
          <div style="font-size:9px;font-weight:800;color:${isToday && canClaim ? r.color : '#9aa5c0'};margin-bottom:4px;">${label}</div>
          <div style="font-size:${isDay7 ? '32px' : '24px'};margin-bottom:4px;">${isDay7 ? '🐉' : '💰'}</div>
          <div style="font-size:11px;color:${r.color};font-weight:700;">${r.gold.toLocaleString()}g</div>
          ${r.items.length ? `<div style="font-size:10px;color:#9fccff;margin-top:3px;">${itemLine(r)}</div>` : ''}
          ${isDay7 ? `<div style="font-size:9px;color:#ff9a7a;font-weight:700;margin-top:3px;">🌟 Dragon Heart!</div>` : ''}
          ${r.cosmetic ? `<div style="font-size:8px;color:#aaffaa;margin-top:2px;">✨ ${r.cosmetic}</div>` : ''}
        </div>`;
    }).join('');

    const todayReward = rewards[todayIdx - 1];
    const claimArea = canClaim
      ? `<button id="daily-claim" class="daily-claim-btn" style="width:100%;border:none;border-radius:14px;padding:16px;cursor:pointer;
          font-weight:900;font-size:16px;background:linear-gradient(135deg,${todayReward.color},#ff7a2e);color:#fff;
          box-shadow: 0 0 20px rgba(255,207,74,.4); transition: all 0.3s;">
          🎁 รับรางวัลวัน ${todayIdx} — ${todayReward.gold.toLocaleString()} Gold${todayReward.items.length ? ' + ' + itemLine(todayReward) : ''}</button>`
      : `<div style="text-align:center;padding:14px;border-radius:12px;background:linear-gradient(135deg,rgba(95,221,122,.15),rgba(95,221,122,.05));border:2px solid rgba(95,221,122,.4);
          color:#7de89a;font-weight:800;font-size:13px;">✅ รับแล้ววันนี้ — กลับมาพรุ่งนี้เพื่อรักษาสตรีค! 🔥</div>`;

    card.innerHTML = `
      <div style="padding:18px 20px 14px;background:linear-gradient(90deg,rgba(240,192,64,.15),rgba(255,122,46,.08));border-bottom:2px solid var(--gold-border);position:relative;">
        <button id="daily-close" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.08);border:1px solid var(--border);color:var(--text-dim);
          width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,207,74,.2)'" onmouseout="this.style.background='rgba(255,255,255,.08)'">✕</button>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:40px;animation:dailyIconBounce 2s ease-in-out infinite;">🎁</div>
          <div>
            <div style="font-family:var(--font-main);color:#fff;font-size:20px;text-shadow:0 0 12px rgba(240,192,64,.6);">🎉 รางวัลเข้าเกมรายวัน</div>
            <div style="font-size:12px;color:var(--text-dim);">สตรีคปัจจุบัน: <span style="color:${todayReward.color};font-weight:900;font-size:13px;">🔥 ${streakShown} วัน</span>
            ${brokeStreak ? '<span style="color:#ff9a8a;"> (สตรีคขาด — เริ่มใหม่วัน 1)</span>' : ''}</div>
          </div>
        </div>
      </div>
      <div class="daily-body" style="padding:16px 18px;">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">${slots}</div>
        ${claimArea}
        <div style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(255,207,74,.05);border:1px solid rgba(255,207,74,.15);text-align:center;font-size:11px;color:var(--text-dim);">
          <span style="color:#ffcf4a;font-weight:700;">💡 เคล็ดลับ:</span> เข้าเกมทุกวันเพื่อรางวัลใหญ่ขึ้นเรื่อยๆ — ขาดวันใดวันหนึ่ง สตรีคจะเริ่มนับใหม่
        </div>
        </div>`;

    card.querySelector('#daily-close').onclick = () => {
      const m = document.getElementById('daily-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    const claimBtn = card.querySelector('#daily-claim');
    if (claimBtn) claimBtn.onclick = () => this._claimDailyReward();
  }

  async _claimDailyReward() {
    if (!this._canClaimDaily() || !this.character) return;
    const pending = this._pendingStreak();
    const dayIdx = ((pending - 1) % 7) + 1;
    const reward = GameUI._STREAK_REWARDS[dayIdx - 1];

    // Grant gold + items
    this.character.stats.gold = (Number(this.character.stats.gold) || 0) + reward.gold;
    for (const it of reward.items) {
      const meta = ITEMS[it.name] || {};
      const existing = this.inventory.find(i => i.item_name === it.name);
      if (existing) existing.quantity += it.qty;
      else this.inventory.push({ item_name: it.name, item_type: meta.type || 'material', emoji: meta.emoji, desc: meta.desc, price: meta.price || 0, quantity: it.qty, stats: {} });
      if (this.characterId) saveInventoryItem(this.characterId, it.name, meta.type || 'material', it.qty).catch(() => {});
    }

    // Advance the streak and persist
    this.loginStreak = { streak: pending, lastClaim: this._todayStr() };
    await this._saveLoginStreak();
    if (this.character.saveStatsToDatabase) this.character.saveStatsToDatabase().catch(() => {});

    // Celebration
    const itemTxt = reward.items.map(it => `${(ITEMS[it.name] || {}).emoji || ''} ${it.name}×${it.qty}`).join(', ');
    this.addCombatLog(`🎁 รับรางวัลวัน ${dayIdx} สำเร็จ! +${reward.gold.toLocaleString()}g${itemTxt ? ' + ' + itemTxt : ''} (สตรีค 🔥${pending})`, 'levelup');
    if (this.triggerScreenShake) this.triggerScreenShake(true);
    if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
    try {
      if (window.particles && this.character.getPosition) {
        window.particles.createExplosion(this.character.getPosition(), dayIdx === 7 ? 0xff5a7a : 0xffcf4a);
      }
    } catch (e) { /* non-fatal */ }

    this._renderDailyReward();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this._updateDailyRewardBadge();

    // Fade out and close the modal after a short delay to show the "claimed" state
    setTimeout(() => {
      const modal = document.getElementById('daily-modal');
      if (modal && modal.style.display !== 'none') {
        modal.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        modal.style.opacity = '0';
        modal.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
          modal.style.display = 'none';
          modal.style.opacity = '1';
          modal.style.transform = 'scale(1)';
          this.updateMobileControlsVisibility();
        }, 800);
      }
    }, 1500);
  }

  // ============ Vending Stalls (player shops) ============
  // The stall is a physical storefront over the player's marketplace listings:
  // buying from a stall IS a marketplace purchase, so offline owners get paid.
  _isMyStall(stall) {
    const uid = this.character && this.character.userId;
    return !!(uid && stall && stall.user_id === uid);
  }

  async openStallShop(stall) {
    if (!stall) return;
    if (!document.getElementById('stall-style')) {
      const st = document.createElement('style');
      st.id = 'stall-style';
      st.textContent = `
        #stall-modal{position:fixed;inset:0;z-index:1420;display:none;align-items:center;justify-content:center;
          background:rgba(0,0,0,.62);backdrop-filter:blur(3px);padding:12px;box-sizing:border-box;}
        #stall-card{width:min(560px,94vw);max-height:86vh;display:flex;flex-direction:column;border-radius:16px;
          background:linear-gradient(160deg,#2a2010,#171008);border:1.5px solid #ffd24a;
          box-shadow:0 0 34px rgba(255,210,74,.25),0 20px 60px rgba(0,0,0,.7);overflow:hidden;}
        #stall-card .stall-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}
        @media (max-width:768px){
          #stall-modal{align-items:flex-start;padding:8px 8px 116px;}
          #stall-card{width:100%;max-height:calc(100vh - 132px);max-height:calc(100dvh - 132px);}
        }`;
      document.head.appendChild(st);
    }
    let modal = document.getElementById('stall-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'stall-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); }
      });
      modal.innerHTML = `<div id="stall-card"></div>`;
      document.body.appendChild(modal);
    }
    document.querySelectorAll('.side-panel').forEach(p => { p.style.display = 'none'; });
    this._activeStall = stall;
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
    await this._renderStallShop();
  }

  async _renderStallShop() {
    const card = document.getElementById('stall-card');
    const stall = this._activeStall;
    if (!card || !stall) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mine = this._isMyStall(stall);

    card.innerHTML = `
      <div style="padding:16px 18px;background:linear-gradient(90deg,#4a3410,#241806);border-bottom:1px solid #ffd24a;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:26px;">🏪</div>
          <div style="flex:1;">
            <div style="font-weight:900;color:#ffd97a;font-size:17px;text-shadow:0 0 10px rgba(255,178,32,.5);">${esc(stall.shop_name)}</div>
            <div style="font-size:11px;color:#c8b088;">ร้านของ ${esc(stall.owner_name)}${mine ? ' (ร้านคุณเอง)' : ''}</div>
          </div>
          <button id="stall-close" style="background:rgba(255,255,255,.08);border:none;color:#f0dcb0;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;">✕</button>
        </div>
      </div>
      <div class="stall-body" style="padding:14px 16px;">
        <div style="text-align:center;color:#8a7a5a;font-size:11px;padding:14px;">⏳ กำลังโหลดสินค้า...</div>
      </div>`;
    card.querySelector('#stall-close').onclick = () => {
      const m = document.getElementById('stall-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };

    const { fetchStallListings } = await import('../network/GameSync.js');
    const listings = await fetchStallListings(stall.user_id);
    const body = card.querySelector('.stall-body');
    if (!body) return;

    const rows = listings.length ? listings.map(l => {
      const meta = ITEMS[l.item_name] || { emoji: '📦' };
      const rc = { epic: '#c774ff', legendary: '#ffcf4a', mythic: '#ff5a7a', rare: '#4aa3ff' }[meta.rarity] || '#c9d4df';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;margin-bottom:8px;
          background:rgba(0,0,0,.3);border:1px solid ${rc}44;">
          <div style="font-size:22px;">${meta.emoji}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;color:${rc};font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(l.item_name)} ×${l.quantity}</div>
            <div style="font-size:11px;color:#ffd97a;font-weight:700;">💰 ${Number(l.price).toLocaleString()} Zeny</div>
          </div>
          ${mine
          ? `<button data-stall-cancel="${l.id}" style="border:none;border-radius:10px;padding:7px 12px;cursor:pointer;font-weight:800;font-size:11px;background:rgba(224,72,58,.85);color:#fff;">ยกเลิก</button>`
          : `<button data-stall-buy="${l.id}" style="border:none;border-radius:10px;padding:7px 14px;cursor:pointer;font-weight:800;font-size:12px;background:linear-gradient(135deg,#ffcf4a,#ff9e2e);color:#3a2600;">ซื้อ</button>`}
        </div>`;
    }).join('') : `<div style="text-align:center;color:#8a7a5a;font-size:12px;padding:22px;">😴 ตอนนี้ไม่มีสินค้าวางขาย</div>`;

    const ownerBar = mine ? `
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="stall-add-items" style="flex:1;border:none;border-radius:10px;padding:9px;cursor:pointer;font-weight:800;font-size:11px;background:rgba(74,163,255,.2);border:1px solid #4aa3ff;color:#9fccff;">➕ เพิ่มสินค้า (ตั้งขายในตลาด)</button>
        <button id="stall-close-shop" style="flex:1;border:none;border-radius:10px;padding:9px;cursor:pointer;font-weight:800;font-size:11px;background:rgba(224,72,58,.2);border:1px solid #e0483a;color:#ffb0a8;">🚫 ปิดร้าน (เก็บแผง)</button>
      </div>` : '';

    body.innerHTML = rows + ownerBar;

    body.querySelectorAll('[data-stall-buy]').forEach(b => {
      b.onclick = async () => {
        const listing = listings.find(l => String(l.id) === b.getAttribute('data-stall-buy'));
        if (!listing) return;
        await this._performMarketBuyAction(listing);
        this._renderStallShop();
        if (window.stallManager) window.stallManager.refresh();
      };
    });
    body.querySelectorAll('[data-stall-cancel]').forEach(b => {
      b.onclick = async () => {
        const listing = listings.find(l => String(l.id) === b.getAttribute('data-stall-cancel'));
        if (!listing) return;
        await this._performMarketCancelAction(listing);
        this._renderStallShop();
        if (window.stallManager) window.stallManager.refresh();
      };
    });
    const addBtn = body.querySelector('#stall-add-items');
    if (addBtn) addBtn.onclick = () => {
      const m = document.getElementById('stall-modal'); if (m) m.style.display = 'none';
      this._togglePanel('market-panel');
      // Jump straight to the sell tab
      const sellTab = document.querySelector('.market-tab[data-tab="sell"]');
      if (sellTab) sellTab.click();
    };
    const closeShopBtn = body.querySelector('#stall-close-shop');
    if (closeShopBtn) closeShopBtn.onclick = async () => {
      const { closeVendingStall } = await import('../network/GameSync.js');
      const ok = await closeVendingStall();
      if (ok) {
        this.addCombatLog('🏪 เก็บแผงขายของเรียบร้อย', 'system');
        const m = document.getElementById('stall-modal'); if (m) m.style.display = 'none';
        this.updateMobileControlsVisibility();
        if (window.stallManager) window.stallManager.refresh();
      } else {
        this.addCombatLog('❌ ปิดร้านไม่สำเร็จ ลองอีกครั้ง', 'warning');
      }
    };
  }

  async _openVendingStallSetup() {
    if (!this.character) return;
    // Guests can't own a stall — the row needs a real auth user for RLS
    const uid = this.character.userId || '';
    if (!uid || uid.startsWith('guest_') || uid.startsWith('local_')) {
      this.addCombatLog('❌ ต้องผูกบัญชี (อีเมล) ก่อนจึงจะเปิดแผงขายของได้', 'warning');
      return;
    }
    const name = prompt('ตั้งชื่อร้านของคุณ (ไม่เกิน 24 ตัวอักษร):', `ร้าน${this.character.stats.name}`);
    if (!name) return;
    const app = this.character.getAppearance ? this.character.getAppearance() : {};
    const { openVendingStall } = await import('../network/GameSync.js');
    const res = await openVendingStall(this.characterId, this.character.stats.name, name, {
      bodyColor: app.bodyColor, hairColor: app.hairColor, pantsColor: app.pantsColor, gender: app.gender,
    });
    if (res.ok) {
      this.addCombatLog(`🏪✨ เปิดแผง "${name}" ที่ถนนตลาดแล้ว! (ช่องที่ ${res.slot + 1}) — ตั้งขายของในแท็บนี้ได้เลย`, 'levelup');
      if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
      if (window.stallManager) window.stallManager.refresh();
    } else if (res.reason === 'full') {
      this.addCombatLog('❌ ถนนตลาดเต็ม (8 แผง) — ลองใหม่ภายหลัง', 'warning');
    } else if (res.reason === 'guest') {
      this.addCombatLog('❌ ต้องผูกบัญชี (อีเมล) ก่อนจึงจะเปิดแผงขายของได้', 'warning');
    } else {
      this.addCombatLog('❌ เปิดร้านไม่สำเร็จ: ' + (res.reason || 'unknown'), 'warning');
    }
  }

  // ============ Weapon Smith — Forge (crafting) ============
  _invCount(name) {
    const it = (this.inventory || []).find(i => i.item_name === name);
    return it ? it.quantity : 0;
  }

  openForge() {
    if (!document.getElementById('forge-style')) {
      const st = document.createElement('style');
      st.id = 'forge-style';
      st.textContent = `
        #forge-modal{position:fixed;inset:0;z-index:1400;display:none;align-items:center;justify-content:center;
          background:rgba(0,0,0,.62);backdrop-filter:blur(3px);padding:12px;box-sizing:border-box;}
        #forge-card{width:min(680px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:16px;
          background:linear-gradient(160deg,#2a1712,#160d0a);border:1.5px solid #b5642a;
          box-shadow:0 20px 60px rgba(0,0,0,.7);overflow:hidden;}
        #forge-card .forge-head{flex:0 0 auto;}
        #forge-card .forge-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}
        @media (max-width:768px){
          #forge-modal{align-items:flex-start;padding:8px 8px 116px;}
          #forge-card{width:100%;max-height:calc(100vh - 132px);max-height:calc(100dvh - 132px);}
        }`;
      document.head.appendChild(st);
    }
    let modal = document.getElementById('forge-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'forge-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); }
      });
      modal.innerHTML = `<div id="forge-card"></div>`;
      document.body.appendChild(modal);
    }
    document.querySelectorAll('.side-panel').forEach(p => { p.style.display = 'none'; });
    this._renderForge();
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderForge() {
    const card = document.getElementById('forge-card');
    if (!card) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const gold = this.character ? (Number(this.character.stats.gold) || 0) : 0;
    const rarityColor = { epic: '#c774ff', legendary: '#ffcf4a', mythic: '#ff5a7a' };
    const effLabel = { fire: '🔥 ไฟ', frost: '❄️ น้ำแข็ง', storm: '⚡ สายฟ้า', soul: '👻 วิญญาณ', nova: '🌌 โนวา' };

    const cards = FORGE_RECIPES.map((r, idx) => {
      const res = ITEMS[r.result] || {};
      const rc = rarityColor[res.rarity] || '#c9d4df';
      const reqs = [{ name: r.base, qty: 1 }, ...r.materials];
      let allOk = gold >= r.gold;
      const reqHtml = reqs.map(req => {
        const have = this._invCount(req.name);
        const ok = have >= req.qty;
        if (!ok) allOk = false;
        const md = ITEMS[req.name] || {};
        return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${ok ? '#bfe0a8' : '#e69a8a'};">
          <span>${md.emoji || '📦'}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(req.name)}</span>
          <span style="font-weight:700;">${have}/${req.qty}</span></div>`;
      }).join('');

      const btn = allOk
        ? `<button data-forge="${idx}" style="border:none;border-radius:14px;padding:8px 16px;cursor:pointer;font-weight:800;font-size:12px;background:linear-gradient(135deg,#ff9e2e,#ff5a1a);color:#2a1000;">⚒️ ตี</button>`
        : `<span style="font-size:11px;color:#8a7a6a;">ส่วนผสมไม่ครบ</span>`;

      return `
        <div style="margin-bottom:12px;padding:12px;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid ${rc}55;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:26px;">${res.emoji || '🗡️'}</div>
            <div style="flex:1;">
              <div style="font-weight:800;color:${rc};font-size:14px;">${esc(r.result)}</div>
              <div style="font-size:11px;color:#d0b090;">ATK +${res.atkBonus || 0}${res.forgeEffect ? ' · ' + (effLabel[res.forgeEffect] || res.forgeEffect) : ''}</div>
            </div>
            ${btn}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">${reqHtml}</div>
          <div style="margin-top:6px;font-size:11px;color:${gold >= r.gold ? '#ffcf6a' : '#e69a8a'};">💰 ${r.gold.toLocaleString()} Zeny</div>
        </div>`;
    }).join('');

    card.innerHTML = `
      <div class="forge-head" style="padding:16px 18px;background:linear-gradient(90deg,#3a1c10,#241109);border-bottom:1px solid #b5642a;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-size:22px;">⚒️</div>
          <div style="flex:1;">
            <div style="font-weight:900;color:#ffdcb0;font-size:17px;">โรงตีอาวุธ</div>
            <div style="font-size:11px;color:#c79a78;">รวมส่วนผสมในกระเป๋า → อาวุธพิเศษพลังสูง + เอฟเฟกต์อลังการ</div>
          </div>
          <div style="font-size:12px;color:#ffcf6a;font-weight:700;">💰 ${gold.toLocaleString()}</div>
          <button id="forge-close" style="background:rgba(255,255,255,.08);border:none;color:#f0d0b0;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;">✕</button>
        </div>
      </div>
      <div class="forge-body" style="padding:14px 16px;">${cards}</div>`;

    card.querySelector('#forge-close').onclick = () => {
      const m = document.getElementById('forge-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    card.querySelectorAll('[data-forge]').forEach(b => {
      b.onclick = () => this._forgeItem(FORGE_RECIPES[parseInt(b.getAttribute('data-forge'), 10)]);
    });
  }

  _forgeItem(recipe) {
    if (!recipe || !this.character) return;
    const reqs = [{ name: recipe.base, qty: 1 }, ...recipe.materials];
    const gold = Number(this.character.stats.gold) || 0;
    // Re-validate — bag/gold may have changed since render
    for (const req of reqs) {
      if (this._invCount(req.name) < req.qty) { this.addCombatLog(`❌ ส่วนผสมไม่พอ: ${req.name}`, 'warning'); return; }
    }
    if (gold < recipe.gold) { this.addCombatLog('❌ เงิน Zeny ไม่พอ', 'warning'); return; }

    // Consume gold + all ingredients
    this.character.stats.gold = gold - recipe.gold;
    for (const req of reqs) {
      const inv = this.inventory.find(i => i.item_name === req.name);
      if (!inv) continue;
      const type = inv.item_type;
      inv.quantity -= req.qty;
      if (inv.quantity <= 0) this.inventory = this.inventory.filter(i => i !== inv);
      if (this.characterId) saveInventoryItem(this.characterId, req.name, type, -req.qty).catch(() => {});
    }

    // Add the forged weapon
    const resData = ITEMS[recipe.result] || {};
    const existing = this.inventory.find(i => i.item_name === recipe.result);
    if (existing) existing.quantity += 1;
    else this.inventory.push({ item_name: recipe.result, item_type: resData.type || 'weapon', emoji: resData.emoji, desc: resData.desc, price: resData.price || 0, quantity: 1, stats: {} });
    if (this.characterId) {
      saveInventoryItem(this.characterId, recipe.result, resData.type || 'weapon', 1).catch(() => {});
      if (this.character.saveStatsToDatabase) this.character.saveStatsToDatabase().catch(() => {});
    }

    // Spectacle
    this.addCombatLog(`⚒️✨ ตี ${resData.emoji || ''} ${recipe.result} สำเร็จ! (ATK +${resData.atkBonus || 0}) — ไปสวมที่กระเป๋าได้เลย`, 'levelup');
    if (this.triggerScreenShake) this.triggerScreenShake(true);
    if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
    else if (this.soundManager && this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
    try {
      const eff = { fire: 0xff5a1a, frost: 0x66ddff, storm: 0x9fc0ff, soul: 0xaa66ff, nova: 0xffe066 }[resData.forgeEffect] || 0xffcf4a;
      if (window.particles && this.character.getPosition) window.particles.createExplosion(this.character.getPosition(), eff);
    } catch (e) { /* non-fatal */ }

    this._renderForge();
    this._renderInventory();
    this.updateHUD(this.character.stats);
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


  // ============ NPC Sell Shop Logic ============
  _setupSellShopEvents() {
    this.selectedSellShopItem = null;

    const qtyInput = document.getElementById('sell-shop-qty-input');
    if (qtyInput) {
      qtyInput.addEventListener('input', () => this._updateSellShopDetail());
    }

    const maxBtn = document.getElementById('btn-sell-shop-max');
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        if (this.selectedSellShopItem && qtyInput) {
          const invItem = this.inventory.find(i => i.item_name === this.selectedSellShopItem.item_name);
          if (invItem) {
            qtyInput.value = invItem.quantity;
            this._updateSellShopDetail();
          }
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
    grid.style.cssText = 'width:100%;box-sizing:border-box;';
    grid.innerHTML = '';

    const goldDisplay = document.getElementById('sell-shop-gold-amount');
    if (goldDisplay && this.character) {
      goldDisplay.textContent = this.character.stats.gold.toLocaleString();
    }

    this.inventory.forEach(item => {
      if (item.quantity <= 0) return;
      const itemData = ITEMS[item.item_name] || {};
      const slot = document.createElement('div');
      slot.className = 'shop-slot inv-slot';
      if (itemData.rarity) slot.classList.add(`rarity-${itemData.rarity}`);
      if (this.selectedSellShopItem && this.selectedSellShopItem.item_name === item.item_name) {
        slot.classList.add('selected');
      }

      const basePrice = itemData.price || item.price || 10;
      const sellPrice = Math.max(1, Math.floor(basePrice * 0.5));

      slot.innerHTML = `
        <span class="slot-emoji">${item.emoji || itemData.emoji || '📦'}</span>
        <span class="slot-qty">${item.quantity}</span>
        <div class="slot-price-tag" style="font-size:8px;color:#ffdd44;">${sellPrice}z</div>
      `;

      slot.addEventListener('click', () => {
        this.selectedSellShopItem = item;
        const qtyInput = document.getElementById('sell-shop-qty-input');
        if (qtyInput) qtyInput.value = 1;
        this._renderSellShop();
        this._updateSellShopDetail();
      });

      grid.appendChild(slot);
    });

    if (!this.selectedSellShopItem) {
      const placeholder = document.getElementById('sell-shop-detail-placeholder');
      const content = document.getElementById('sell-shop-detail-content');
      if (placeholder) placeholder.style.display = 'block';
      if (content) content.style.display = 'none';
    }
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
    const itemData = ITEMS[item.item_name] || {};
    const basePrice = itemData.price || item.price || 10;
    const sellPrice = Math.max(1, Math.floor(basePrice * 0.5));

    document.getElementById('sell-shop-detail-icon').textContent = item.emoji || itemData.emoji || '📦';
    document.getElementById('sell-shop-detail-name').textContent = item.item_name;
    document.getElementById('sell-shop-detail-type').textContent = (itemData.type || item.item_type || 'etc').toUpperCase();
    document.getElementById('sell-shop-detail-desc').textContent = itemData.desc || item.desc || 'ไม่มีคำอธิบาย';

    const invItem = this.inventory.find(i => i.item_name === item.item_name);
    const ownedQty = invItem ? invItem.quantity : 0;
    document.getElementById('sell-shop-owned-qty').textContent = `มีอยู่: ${ownedQty} ชิ้น`;

    const qtyInput = document.getElementById('sell-shop-qty-input');
    const qty = Math.min(parseInt(qtyInput?.value) || 1, ownedQty);
    if (qtyInput) qtyInput.max = ownedQty;

    document.getElementById('sell-shop-unit-price').textContent = sellPrice.toLocaleString();
    document.getElementById('sell-shop-total-price').textContent = (sellPrice * qty).toLocaleString();
  }

  async _performSellShopAction() {
    if (!this.selectedSellShopItem || !this.character) return;

    const item = this.selectedSellShopItem;
    const invItem = this.inventory.find(i => i.item_name === item.item_name);
    if (!invItem || invItem.quantity <= 0) {
      this.addCombatLog('❌ ไม่มีไอเทมนี้ในกระเป๋า!', 'system');
      if (this.soundManager) this.soundManager.playErrorSound?.();
      return;
    }

    const qtyInput = document.getElementById('sell-shop-qty-input');
    const qty = Math.min(Math.max(1, parseInt(qtyInput?.value) || 1), invItem.quantity);

    const itemData = ITEMS[item.item_name] || {};
    const basePrice = itemData.price || item.price || 10;
    const sellPrice = Math.max(1, Math.floor(basePrice * 0.5));
    const totalGold = sellPrice * qty;

    invItem.quantity -= qty;
    if (invItem.quantity <= 0) {
      this.inventory = this.inventory.filter(i => i.quantity > 0);
      this.selectedSellShopItem = null;
    }

    this.character.stats.gold += totalGold;

    if (this.characterId) {
      await saveInventoryItem(this.characterId, item.item_name, itemData.type || item.item_type || 'etc', -qty);
      if (this.character.saveStatsToDatabase) {
        await this.character.saveStatsToDatabase();
      }
    }

    this.addCombatLog(`💰 ขาย ${item.emoji || '📦'} ${item.item_name} x${qty} ได้ ${totalGold.toLocaleString()} Zeny`, 'gold');
    if (this.soundManager) {
      if (this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      else if (this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    }

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

    // Category filter
    this.marketCategory = 'all';
    const catBtns = document.querySelectorAll('.market-cat-btn');
    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        catBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.marketCategory = btn.getAttribute('data-cat');
        this._renderMarket();
      });
    });

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
      const filtered = listings.filter(l => {
        const matchesQuery = l.item_name.toLowerCase().includes(query);
        const matchesCategory = this.marketCategory === 'all' || l.item_type === this.marketCategory;
        return matchesQuery && matchesCategory;
      });

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

      // Purchase service call (server-authoritative: checks gold, pays seller,
      // delivers the item, removes the listing — all in one transaction)
      const boughtResult = await buyMarketItem(listing.id, this.characterId, this.character.stats.name);

      if (boughtResult && boughtResult.success) {
        // Adopt the server's authoritative gold when provided (RPC path)
        if (boughtResult.buyerGold !== undefined) {
          this.character.stats.gold = boughtResult.buyerGold;
        }
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
        // Refund the optimistic deduction and explain the real reason.
        this.character.stats.gold += listing.price;
        const reason = (boughtResult && boughtResult.reason) || 'unknown';
        const msg = {
          guest_account_required: '❌ ต้องผูกบัญชี (อีเมล) ก่อนจึงจะซื้อของจากแผงผู้เล่นได้',
          own_listing: '❌ ซื้อของที่ตัวเองตั้งขายไม่ได้',
          not_enough_gold: '❌ เงิน Zeny ไม่เพียงพอ',
          no_character: '❌ ไม่พบตัวละคร ลองใหม่อีกครั้ง',
          not_authed: '❌ ต้องเข้าสู่ระบบก่อนจึงจะซื้อได้',
          gone: '❌ ไอเทมนี้ถูกซื้อไปแล้ว หรือไม่มีขายแล้ว',
        }[reason] || '❌ ซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        this.addCombatLog(msg, 'system');
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

  // ============ Jobs ============
  // Opens the job picker. `isChange` is the paid re-spec path (JOB_CHANGE_COST
  // Zeny); the first pick at JOB_UNLOCK_LEVEL is free.
  openJobSelect(isChange = false) {
    if (!this.character) return;
    const s = this.character.stats;
    if ((Number(s.level) || 1) < JOB_UNLOCK_LEVEL) {
      this.addCombatLog(`🔒 ต้องถึงเลเวล ${JOB_UNLOCK_LEVEL} ก่อนถึงจะเลือกอาชีพได้`, 'system');
      return;
    }

    if (!document.getElementById('job-style')) {
      const st = document.createElement('style');
      st.id = 'job-style';
      st.textContent = `
        #job-modal{position:fixed;inset:0;z-index:1500;display:none;align-items:center;justify-content:center;
          background:rgba(4,8,18,.80);backdrop-filter:blur(6px);padding:12px;box-sizing:border-box;}
        #job-card{width:min(780px,96vw);max-height:92vh;display:flex;flex-direction:column;border-radius:18px;
          background:linear-gradient(180deg,#151b30,#0d1120);border:1px solid rgba(240,192,64,.35);
          box-shadow:0 24px 70px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;}
        .job-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
          border-bottom:1px solid var(--border);background:linear-gradient(90deg,rgba(240,192,64,.14),transparent);}
        .job-head h2{font-family:var(--font-main);font-size:17px;color:#fff;text-shadow:0 0 14px rgba(240,192,64,.5);margin:0;}
        .job-head .sub{font-size:11px;color:var(--text-dim);margin-top:3px;}
        .job-x{background:rgba(255,255,255,.08);border:1px solid var(--border);color:var(--text-dim);width:36px;height:36px;
          border-radius:9px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
        .job-main{display:flex;gap:16px;padding:16px 18px;overflow-y:auto;min-height:0;}
        .job-pv-col{flex:0 0 44%;display:flex;flex-direction:column;gap:10px;}
        #job-canvas{width:100%;height:236px;border-radius:14px;border:1px solid var(--border);display:block;
          background:radial-gradient(circle at 50% 32%, rgba(96,130,210,.28), rgba(10,14,28,.55) 70%);}
        .job-title{text-align:center;}
        .job-title .n{font-size:20px;font-weight:800;color:#fff;}
        .job-title .en{font-size:12px;color:var(--text-dim);font-weight:600;margin-left:4px;}
        .job-title .r{font-size:11px;color:var(--primary);margin-top:2px;font-weight:700;}
        .job-chips{display:flex;gap:8px;}
        .job-chip{flex:1;padding:8px 2px;border-radius:11px;border:1px solid var(--border);background:rgba(255,255,255,.04);
          cursor:pointer;text-align:center;transition:all .18s;}
        .job-chip:hover{background:rgba(255,255,255,.08);}
        .job-chip .e{font-size:22px;line-height:1;}
        .job-chip .nm{font-size:10px;color:var(--text-dim);margin-top:3px;font-weight:800;}
        .job-chip.active{border-color:var(--primary);background:rgba(240,192,64,.15);box-shadow:0 0 16px rgba(240,192,64,.25);}
        .job-chip.active .nm{color:var(--primary);}
        .job-info-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;}
        .job-desc{font-size:12px;color:var(--text-dim);line-height:1.55;}
        .job-sec-t{font-family:var(--font-pixel,inherit);font-size:9px;letter-spacing:.5px;color:var(--primary);margin-bottom:8px;}
        .stat-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
        .stat-row .lbl{width:64px;font-size:11px;font-weight:800;color:#fff;}
        .stat-bar{flex:1;height:12px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;}
        .stat-bar > i{display:block;height:100%;border-radius:6px;transition:width .3s;}
        .stat-row .val{width:22px;text-align:right;font-size:11px;color:var(--text-dim);font-variant-numeric:tabular-nums;}
        .mod-pill{display:inline-block;font-size:10px;font-weight:800;border-radius:16px;padding:3px 9px;margin:3px 4px 0 0;border:1px solid transparent;}
        .mod-up{color:#57e08a;background:rgba(64,224,128,.14);border-color:rgba(64,224,128,.32);}
        .mod-dn{color:#ff8098;background:rgba(255,96,128,.14);border-color:rgba(255,96,128,.32);}
        .skill-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#cfe6ff;background:rgba(90,140,220,.14);
          border:1px solid rgba(120,170,230,.3);border-radius:20px;padding:3px 9px;margin:3px 4px 0 0;}
        .job-foot{padding:12px 18px 16px;border-top:1px solid var(--border);}
        #job-select-btn{width:100%;padding:13px;border:none;border-radius:12px;cursor:pointer;font-family:var(--font-main);
          font-weight:800;font-size:15px;color:#2a1c00;background:linear-gradient(135deg,#ffe89a,var(--primary) 50%,var(--primary-deep));
          box-shadow:0 6px 18px rgba(240,192,64,.3);}
        #job-select-btn:disabled{filter:grayscale(.7);opacity:.55;cursor:not-allowed;}
        @media (max-width:680px){.job-main{flex-direction:column;}.job-pv-col{flex:none;}#job-canvas{height:210px;}
          #job-card{max-height:calc(100dvh - 116px);}#job-modal{align-items:flex-start;padding:8px 8px 108px;}}`;
      document.head.appendChild(st);
    }

    let modal = document.getElementById('job-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'job-modal';
      modal.innerHTML = `<div id="job-card"></div>`;
      document.body.appendChild(modal);
    }
    this._renderJobSelect(isChange);
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderJobSelect(isChange) {
    const card = document.getElementById('job-card');
    if (!card) return;
    const s = this.character.stats;
    const gold = Number(s.gold) || 0;
    const current = s.job;
    this._jobIsChange = isChange;

    const headerSub = isChange
      ? `เปลี่ยนสายอาชีพ — ค่าใช้จ่าย <b style="color:var(--primary)">${JOB_CHANGE_COST.toLocaleString()}</b> Zeny (มี ${gold.toLocaleString()})`
      : `เลือกได้ตั้งแต่เลเวล 1 · หมุนดูฮีโร่แต่ละสาย แล้วเลือกที่ใช่`;

    const chips = Object.values(JOBS).map(j =>
      `<div class="job-chip" data-job="${j.id}"><div class="e">${j.emoji}</div><div class="nm">${j.name}</div></div>`
    ).join('');

    card.innerHTML = `
      <div class="job-head">
        <div><h2>🎖️ เลือกสายอาชีพ</h2><div class="sub">${headerSub}</div></div>
        <button class="job-x" id="job-close">✕</button>
      </div>
      <div class="job-main">
        <div class="job-pv-col">
          <canvas id="job-canvas"></canvas>
          <div class="job-title" id="job-title"></div>
          <div class="job-chips">${chips}</div>
        </div>
        <div class="job-info-col" id="job-info"></div>
      </div>
      <div class="job-foot"><button id="job-select-btn"></button></div>`;

    card.querySelector('#job-close').onclick = () => this._closeJobSelect();
    card.querySelectorAll('.job-chip').forEach(c => { c.onclick = () => this._setPreviewJob(c.dataset.job); });

    // Spin up the rotating 3D hero preview.
    const canvas = card.querySelector('#job-canvas');
    const startJob = (current && JOBS[current]) ? current : 'swordsman';
    this._previewJob = startJob;
    import('../engine/JobPreview.js').then(({ JobPreview }) => {
      if (!document.getElementById('job-canvas')) return; // closed before load
      try {
        if (this._jobPreview) this._jobPreview.dispose();
        this._jobPreview = new JobPreview(canvas);
        this._jobPreview.setJob(this._previewJob);
        this._jobPreview.start();
      } catch (e) { /* no WebGL — the info panel still works */ }
    }).catch(() => { });

    this._setPreviewJob(startJob);
  }

  // Switch the previewed class: rotate model + refresh the info panel.
  _setPreviewJob(jobId) {
    if (!JOBS[jobId]) return;
    this._previewJob = jobId;
    if (this._jobPreview) this._jobPreview.setJob(jobId);
    const card = document.getElementById('job-card');
    if (card) card.querySelectorAll('.job-chip').forEach(c => c.classList.toggle('active', c.dataset.job === jobId));
    this._renderJobInfo(jobId);
  }

  _renderJobInfo(jobId) {
    const job = JOBS[jobId];
    if (!job) return;
    const s = this.character.stats;
    const gold = Number(s.gold) || 0;
    const isChange = this._jobIsChange;
    const current = s.job;

    const titleEl = document.getElementById('job-title');
    if (titleEl) titleEl.innerHTML = `<div class="n">${job.emoji} ${job.name}<span class="en">${job.nameEn}</span></div><div class="r">${job.role || ''}</div>`;

    const bar = (label, val, color) => `
      <div class="stat-row"><span class="lbl">${label}</span>
        <span class="stat-bar"><i style="width:${Math.min(100, val * 10)}%;background:${color};"></i></span>
        <span class="val">${val}</span></div>`;
    const st = job.stats || { str: 0, agi: 0, int: 0 };
    const mods = job.mods || {};
    const modPill = (label, v) => {
      if (v == null || v === 1) return '';
      const pct = Math.round((v - 1) * 100);
      return `<span class="mod-pill ${pct >= 0 ? 'mod-up' : 'mod-dn'}">${label} ${pct >= 0 ? '+' : ''}${pct}%</span>`;
    };
    const skills = job.skills.map(id => { const sk = SKILLS[id]; return sk ? `<span class="skill-pill">${sk.emoji} ${sk.name}</span>` : ''; }).join('');

    const info = document.getElementById('job-info');
    if (info) info.innerHTML = `
      <div class="job-desc">${job.desc}</div>
      <div><div class="job-sec-t">📊 พลังพื้นฐาน (STR / AGI / INT)</div>
        ${bar('STR', st.str, '#ff6a6a')}${bar('AGI', st.agi, '#7be08a')}${bar('INT', st.int, '#7fb0ff')}</div>
      <div><div class="job-sec-t">⚖️ ค่าต่อสู้เทียบสายกลาง</div>
        ${modPill('HP', mods.hp)}${modPill('DEF', mods.def)}${modPill('ATK', mods.atk)}${modPill('SP', mods.sp)}</div>
      <div><div class="job-sec-t">✨ สกิลประจำสาย</div>${skills}</div>`;

    const btn = document.getElementById('job-select-btn');
    if (btn) {
      if (current === jobId) { btn.textContent = '✔ อาชีพปัจจุบันของคุณ'; btn.disabled = true; btn.onclick = null; }
      else if (isChange && gold < JOB_CHANGE_COST) { btn.textContent = `Zeny ไม่พอ (ต้องการ ${JOB_CHANGE_COST.toLocaleString()})`; btn.disabled = true; btn.onclick = null; }
      else {
        btn.disabled = false;
        btn.textContent = isChange ? `เปลี่ยนเป็น ${job.name} · ${JOB_CHANGE_COST.toLocaleString()} Zeny` : `⚔️ เลือกเป็น ${job.name}`;
        btn.onclick = () => this.chooseJob(jobId, isChange);
      }
    }
  }

  _closeJobSelect() {
    const m = document.getElementById('job-modal');
    if (m) m.style.display = 'none';
    if (this._jobPreview) { this._jobPreview.dispose(); this._jobPreview = null; }
    this.updateMobileControlsVisibility();
  }

  async chooseJob(jobId, isChange) {
    const job = JOBS[jobId];
    if (!job || !this.character) return;
    const s = this.character.stats;
    if (s.job === jobId) return;

    if (isChange) {
      if ((Number(s.gold) || 0) < JOB_CHANGE_COST) {
        this.addCombatLog('❌ Zeny ไม่พอสำหรับเปลี่ยนอาชีพ', 'system');
        return;
      }
      s.gold -= JOB_CHANGE_COST;
    }

    s.job = jobId;
    // Rebuild the class silhouette (hat/robe/cape/quiver/halo). Broadcasts to
    // others automatically via getAppearance() on the next position tick.
    if (this.character._applyJobAppearance) this.character._applyJobAppearance();
    // Old job's cooldowns are meaningless now — clear them so the new bar is live.
    if (this.character.cooldowns) {
      for (const k of Object.keys(this.character.cooldowns)) this.character.cooldowns[k] = 0;
    }
    this.renderSkillBar();

    // Hand out this job's free signature weapon and equip it, then drop any
    // worn gear the new class can't use.
    const sig = job.signatureWeapon;
    if (sig && ITEMS[sig]) {
      if (!this.inventory.find(i => i.item_name === sig)) {
        await this.addItem({ name: sig, type: 'weapon', emoji: ITEMS[sig].emoji });
      }
      for (const it of this.inventory) {
        if ((it.item_type === 'weapon' || it.item_type === 'fishing_rod') && it.stats && it.stats.equipped) {
          it.stats.equipped = false;
          if (this.characterId) updateInventoryItemStats(this.characterId, it.item_name, it.stats).catch(() => { });
        }
      }
      const sigItem = this.inventory.find(i => i.item_name === sig);
      if (sigItem) {
        sigItem.stats = sigItem.stats || {};
        sigItem.stats.equipped = true;
        if (this.characterId) updateInventoryItemStats(this.characterId, sig, sigItem.stats).catch(() => { });
        this.character.equipWeapon(sig);
        if (this.setFishingButtonVisible) this.setFishingButtonVisible(false);
      }
      this.addCombatLog(`${ITEMS[sig].emoji || '🗡️'} ได้รับอาวุธประจำอาชีพ: ${sig} (สวมใส่ให้แล้ว)`, 'loot');
    }
    // Remove hats/glasses (and any lingering weapon) the new job can't wear.
    for (const it of this.inventory) {
      if (it.item_type !== 'weapon' && it.item_type !== 'hat' && it.item_type !== 'glasses') continue;
      if (it.stats && it.stats.equipped && !canEquipItem(it.item_name, jobId)) {
        it.stats.equipped = false;
        if (this.characterId) updateInventoryItemStats(this.characterId, it.item_name, it.stats).catch(() => { });
        if (it.item_type === 'hat') this.character.setHat(null);
        else if (it.item_type === 'glasses') this.character.setGlasses(null);
        else this.character.equipWeapon(null);
      }
    }
    this._renderInventory();

    this._closeJobSelect();

    if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
    if (window.particles && this.character.getPosition) {
      window.particles.createExplosion(this.character.getPosition(), 0xffd24a);
    }
    this.addCombatLog(
      `${job.emoji} ${isChange ? 'เปลี่ยนอาชีพเป็น' : 'คุณคือ'} ${job.name} แล้ว! สกิลใหม่: ` +
      job.skills.map(id => SKILLS[id] ? SKILLS[id].name : id).join(', '), 'levelup');

    if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
    this.updateHUD(s);
    this.updateStats(s);
    this._renderProfileJob();

    /*
    // If this is a new player (just picked their first job), start the tutorial
    if (window.tutorialSystem && window.tutorialSystem.shouldAutoStart() && !window.tutorialSystem.isActive) {
      console.log('[GameUI] Starting tutorial after job selection...');
      setTimeout(() => window.tutorialSystem.initTutorialFlow(), 1000);
    }
    */
  }

  // Fill the Job row in the Profile tab and wire its change button.
  _renderProfileJob() {
    if (!this.character) return;
    const job = JOBS[this.character.stats.job] || null;
    const ids = this.character.getSkills ? this.character.getSkills() : [];
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    set('profile-job-emoji', job ? job.emoji : '🌱');
    set('profile-job-name', job ? `${job.name} (${job.nameEn})` : 'Novice — ยังไม่ได้เลือกอาชีพ');
    set('profile-job-skills', ids.map(id => SKILLS[id] ? `${SKILLS[id].emoji} ${SKILLS[id].name}` : id).join(' · '));

    const btn = document.getElementById('btn-change-job');
    if (btn) {
      const lv = Number(this.character.stats.level) || 1;
      if (lv < JOB_UNLOCK_LEVEL) {
        btn.textContent = `🔒 Lv.${JOB_UNLOCK_LEVEL}`;
        btn.disabled = true;
      } else {
        btn.disabled = false;
        // No job yet → the first pick is free; otherwise it's the paid change.
        btn.textContent = job ? `เปลี่ยน (${JOB_CHANGE_COST.toLocaleString()})` : 'เลือกอาชีพ';
        btn.onclick = () => this.openJobSelect(!!job);
      }
    }
  }

  // Called after leveling / on load: nudge an eligible character with no job
  // into picking one. Fires once per session so it can't nag every level-up.
  maybePromptJobSelect() {
    if (!this.character || this._jobPromptShown) return;
    const s = this.character.stats;
    if (s.job) return;
    if ((Number(s.level) || 1) < JOB_UNLOCK_LEVEL) return;
    this._jobPromptShown = true;
    this.openJobSelect(false);
  }

  // Cast whatever skill sits in a given bar slot (0-2) for the current job.
  // Hotkeys and the mobile buttons go through here so they follow a job change
  // without any rebinding.
  castSkillSlot(index) {
    if (!this.character || !this.character.getSkills) return false;
    const id = this.character.getSkills()[index];
    if (!id) return false;
    return this.castSkill(id);
  }

  // Paint the 3 skill slots (desktop bar + mobile buttons) from the active job.
  renderSkillBar() {
    if (!this.character || !this.character.getSkills) return;
    const ids = this.character.getSkills();

    document.querySelectorAll('.skill-slot').forEach((slot, i) => {
      const id = ids[i];
      const skill = id ? SKILLS[id] : null;
      slot.setAttribute('data-skill', id || '');
      slot.style.display = skill ? '' : 'none';
      if (!skill) return;
      slot.title = `[${i + 1}] ${skill.name}`;
      const icon = slot.querySelector('.skill-icon');
      if (icon) icon.textContent = skill.emoji;
      const overlay = slot.querySelector('.skill-cooldown-overlay');
      if (overlay) overlay.id = `cooldown-${id}`;
    });

    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`btn-mobile-skill-${i + 1}`);
      if (!btn) continue;
      const id = ids[i];
      const skill = id ? SKILLS[id] : null;
      btn.style.display = skill ? '' : 'none';
      if (!skill) continue;
      btn.title = skill.name;
      const icon = btn.querySelector('.skill-icon') || btn.querySelector('span');
      if (icon) icon.textContent = skill.emoji;
      const mob = btn.querySelector('.skill-cooldown-overlay') || document.getElementById(`mobile-cooldown-${id}`);
      if (mob) mob.id = `mobile-cooldown-${id}`;
    }
  }

  castSkill(skillId) {
    if (!this.character || !this.character.isAlive()) return false;

    // Determine target
    let target = this.character.targetMonster;
    if (window.duelState) {
      const opponentId = window.duelState.opponentUserId;
      const opponent = window.remotePlayersMap?.get(opponentId);
      if (opponent) {
        target = opponent.character;
      }
    } else if (!target && SKILLS[skillId]
      && (SKILLS[skillId].type === 'physical' || SKILLS[skillId].type === 'magic')) {
      // Any single-target damage skill auto-snaps to the nearest monster when
      // nothing is targeted (this used to be hardcoded to Bash only).
      if (this.combatSystem && this.combatSystem.monsters) {
        target = this.combatSystem.monsters.findNearest(this.character.getPosition());
        // Ranged skills may snap out to their cast range; melee gets 3x its reach.
        const reach = SKILLS[skillId].castRange || this.character.getAttackRange() * 3;
        if (target && this.character.getPosition().distanceTo(target.getPosition()) > reach) {
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
    let tapCandidate = false; // right-half touch: tap only, no movement joystick
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

      // Mouse fallback: only the left button drives movement/tap. Right-click is
      // reserved for the camera-rotate / view-profile gesture (see main.js), so
      // ignore it here to avoid a stray walk. Touch events have no `button`.
      if (e.button != null && e.button !== 0) return;

      const touch = e.touches ? e.touches[0] : e;

      // Ignore if touching an interactive element (buttons, panels, HUD, chat).
      const target = e.target;
      if (target.closest('#mobile-actions') || target.closest('#auto-farm-container') ||
        target.closest('#hud-bottom') || target.closest('.side-panel') ||
        target.closest('.modal-popup') || target.closest('#hud-top') ||
        target.closest('#minimap-container') || target.closest('#target-indicator') ||
        target.closest('#fps-counter') || target.closest('#kill-counter') ||
        target.closest('#chat-panel') || target.closest('#tutorial-tooltip') ||
        target.closest('.tutorial-tooltip') || target.closest('.tutorial-close') ||
        target.closest('.tutorial-btn-primary') || target.closest('.tutorial-btn-secondary') ||
        target.closest('#warp-modal') ||
        target.closest('.warp-tile') ||
        target.closest('.tile-warp-btn')) return;

      // Never spawn the joystick / tap over the chat UI. The chat panel is
      // click-through in preview mode, so a touch there can fall past it to the
      // canvas. Guard by geometry: always block the input bar; while the chat is
      // open (typing), block the whole panel.
      const chatPanel = document.getElementById('chat-panel');
      if (chatPanel && window.getComputedStyle(chatPanel).display !== 'none') {
        const chatOpen = !chatPanel.classList.contains('preview-mode');
        const guardEl = chatOpen ? chatPanel : chatPanel.querySelector('.chat-input-row');
        if (guardEl) {
          const r = guardEl.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 &&
            touch.clientX >= r.left && touch.clientX <= r.right &&
            touch.clientY >= r.top && touch.clientY <= r.bottom) return;
        }
      }

      e.preventDefault();
      joystickStartTime = performance.now();
      startX = touch.clientX;
      startY = touch.clientY;
      joystickTouchId = e.touches ? e.touches[0].identifier : null;

      if (touch.clientX <= window.innerWidth / 2) {
        // Left half → movement joystick (spawns where you press).
        joystickActive = true;
        showJoystickAt(startX, startY);
        knob.style.transform = 'translate(0px, 0px)';
        base.style.borderColor = 'var(--primary)';
      } else {
        // Right half → tap only (no joystick), so world interactions like mining
        // an ore node, targeting a monster or talking to an NPC also work on the
        // right side of the screen. (Previously the whole right half was ignored,
        // so those taps did nothing on mobile.)
        tapCandidate = true;
      }
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
      if (!joystickActive && !tapCandidate) return;

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

      const wasJoystick = joystickActive;
      joystickActive = false;
      tapCandidate = false;
      joystickTouchId = null;

      // Only the movement joystick (left half) needs its visual + input reset.
      if (wasJoystick) {
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
      }

      // Tap detection (both halves): a short tap with little movement acts on
      // the world — targeting a monster, talking to an NPC, mining ore, etc.
      if (duration < 250 && distance < 15) {
        if (window.handleCanvasTap) {
          window.handleCanvasTap({
            clientX: touch.clientX,
            clientY: touch.clientY,
            // Real touch (mobile) opens a player's profile on tap; the desktop
            // mouse fallback below must not, so main.js can route left-click to
            // walking instead. e.changedTouches is only present on touch events.
            fromTouch: !!e.changedTouches
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

    // Skill buttons touch and click triggers. Bound by SLOT, resolving the skill
    // at press time, so they keep working after a job change.
    [0, 1, 2].forEach((index) => {
      const btn = document.getElementById(`btn-mobile-skill-${index + 1}`);
      if (btn) {
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.castSkillSlot(index);
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.castSkillSlot(index);
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

    this.currentWikiTab = 'guide';
    this.selectedWikiItem = null;
  }

  _renderWiki() {
    this._renderWikiList();
    this._renderWikiDetail();
  }

  // How-to-play guide with the game's real formulas (kept in sync with
  // GameData/CombatSystem/CharacterManager). Static reference content.
  _guideHTML() {
    const F = (s) => `<div style="font-family:monospace;font-size:11px;color:#ffe08a;background:rgba(0,0,0,.35);border:1px solid var(--border);border-radius:6px;padding:6px 9px;margin:5px 0;overflow-x:auto;white-space:nowrap;">${s}</div>`;
    const sec = (emoji, title, body) => `
      <div style="background:var(--bg-item);border:1px solid var(--border);border-radius:10px;padding:12px 13px;margin-bottom:10px;">
        <div style="font-family:var(--font-main);color:var(--primary);font-size:14px;margin-bottom:7px;">${emoji} ${title}</div>
        <div style="font-size:12px;line-height:1.6;color:#dbe4f2;">${body}</div>
      </div>`;
    return `
      <div style="max-height:62vh;overflow-y:auto;padding:2px;-webkit-overflow-scrolling:touch;">
        <div style="text-align:center;margin-bottom:10px;font-size:12px;color:var(--text-dim);">คู่มือสำหรับผู้เล่นใหม่ — รวมวิธีเล่นและสูตรคำนวณทั้งหมด</div>
        ${sec('🎮', 'การควบคุม & เริ่มต้น', `
          • <b>เดิน:</b> คลิกพื้น / ปุ่ม WASD / จอยสติ๊ก (มือถือ)<br>
          • <b>โจมตี:</b> คลิกมอนสเตอร์เพื่อเข้าตี<br>
          • <b>AUTO:</b> ปุ่มขวาล่าง — ฟาร์มอัตโนมัติ (หามอน + ตี + ร่ายสกิล + ฮีลเมื่อ HP ต่ำ)<br>
          • <b>สกิล:</b> ปุ่ม 1 / 2 / 3<br>
          • <b>วาปข้ามเมือง:</b> เดินเข้าประตูวาป (วงแหวนเรืองแสง) ที่ขอบแมป`)}
        ${sec('⭐', 'เลเวล & EXP', `
          ฆ่ามอนสเตอร์ได้ EXP ตามค่าของมอนแต่ละตัว สะสมครบแล้วเลเวลอัป (สูงสุดเลเวล 300)
          ${F('EXP ที่ต้องใช้ต่อเลเวล = ⌊ 100 × 1.35^(เลเวล−1) ⌋')}`)}
        ${sec('💪', 'ค่าสเตตัสที่ได้ต่อการเลเวลอัป', `
          ทุกครั้งที่เลเวลอัป จะได้รับ (คิดจากเลเวลปัจจุบัน):
          ${F('HP สูงสุด += 15 + ⌊ เลเวล × 2 ⌋')}
          ${F('SP สูงสุด += 5 + ⌊ เลเวล × 0.8 ⌋')}
          ${F('ATK += 2 + ⌊ เลเวล × 0.5 ⌋')}
          ${F('DEF += 1 + ⌊ เลเวล × 0.3 ⌋')}`)}
        ${sec('⚔️', 'การต่อสู้ (สูตรดาเมจ)', `
          ${F('ดาเมจ = ATK + สุ่ม(0–4)')}
          ${F('คริติคอล: โอกาส 10% → ดาเมจ × 1.8')}
          ${F('ดาเมจจริง = max(1, ดาเมจ − ⌊ DEF ศัตรู × 0.3 ⌋)')}
          มอนสเตอร์จะโต้กลับถ้าคุณอยู่ใกล้ (ระยะ &lt; 4) ด้วยสูตรเดียวกัน (มอนโจมตี = ATKมอน + สุ่ม(0–2))<br>
          <b>ฟื้นฟู:</b> HP และ SP ฟื้นเอง ~15% ของค่าสูงสุดต่อวินาที`)}
        ${sec('✨', 'สกิล (ปุ่ม 1 / 2 / 3)', `
          ${F('Bash         ดาเมจ = ATK × 1.5   (ใช้ 8 SP)')}
          ${F('Magnum Break ดาเมจ = ATK × 2.0 รอบตัว (ใช้ 20 SP)')}
          ${F('Heal         ฟื้น HP = เลเวล × 8 + ⌊ ATK × 0.5 ⌋ (ใช้ 15 SP)')}
          ดาเมจสกิลมีความแปรผัน ±10% แล้วลดด้วย DEF ศัตรูตามปกติ`)}
        ${sec('💰', 'เงิน (Zeny) & ไอเทม', `
          ฆ่ามอนได้ Zeny สุ่มในช่วงของมอนตัวนั้น + มีโอกาสดรอปไอเทมตามอัตราของแต่ละไอเทม<br>
          • ซื้อ/ขายไอเทมที่ NPC ในเมือง<br>
          • ตั้งแผงขายของ (Vending Stall) หรือใช้ตลาดกลางเพื่อเทรดกับผู้เล่นอื่น`)}
        ${sec('🎣', 'ตกปลา', `
          เข้าใกล้ริมน้ำแล้วกดปุ่ม <b>FISH</b> สะสมชนิดปลาในสมุดสะสมปลา (Almanac) เพื่อรับรางวัลโบนัสตามความหายากและครบเซ็ต`)}
        ${sec('👹', 'บอสโลก (World Boss)', `
          บอสยักษ์เกิดกลางสนามเป็นระยะ ทุกคนแชร์เลือดก้อนเดียว ต้องร่วมกันตี:
          ${F('เลือดบอส = min( 45000 , 7000 + คนออนไลน์ × 3500 )')}
          เกิดทุก ~12 นาที มีเวลา ~6 นาทีในการล้ม รางวัลจัดอันดับตามดาเมจที่ทำได้ — อันดับ 1 ได้ทอง/EXP ก้อนใหญ่ + ไอเทมหายาก (Dragon Heart)`)}
        ${sec('🤺', 'ดวล PVP', `
          ท้าดวลผู้เล่นอื่นจากหน้าโปรไฟล์ ผลแพ้ชนะคิดเรตติ้ง (MMR) แบบ Elo (ค่า K = 32) — ชนะคนเก่งกว่าได้แต้มเยอะกว่า`)}
        ${sec('🎁', 'รางวัลเข้าเกมรายวัน', `
          เข้าเกมทุกวันรับรางวัลไล่ระดับ 7 วัน (วัน 1 = 500 Zeny … วัน 7 = 15,000 Zeny + Dragon Heart) <b>ขาดวันใดวันหนึ่ง สตรีคเริ่มนับใหม่</b>`)}
        ${sec('⛏️', 'เมืองสวรรค์ — ขุดแร่ & เหรียญ ZOL', `
          วาปจากเมือง Prontera (ประตูทองฝั่งตะวันตก) ไปเมือง <b>Svarrga สรวงสวรรค์</b><br>
          1. ซื้อ <b>พลั่วขุด</b> จากพ่อค้าสวรรค์ (ต้องเลเวล 25+) — มี 4 ระดับ ยิ่งแรร์ยิ่งขุดได้ต่อครั้งมาก:
          ${F('Stone(1) · Mythril(2) · Celestial(3) · Divine(5) แร่/ครั้ง')}
          2. คลิกก้อนแร่เรืองแสงเพื่อขุด (ได้ Celestial Ore, ก้อนแร่เกิดใหม่ใน ~25 วิ)<br>
          3. นำแร่ไปแปลงที่พ่อค้าสวรรค์:
          ${F('1 Celestial Ore = 100 ZOL')}
          <b>ZOL เป็นสกุลเงินภายในเกม</b> ใช้/เทรดกันในเกมได้ (ไม่เกี่ยวกับเงินจริง)`)}
      </div>`;
  }

  _renderWikiList() {
    // The คู่มือ tab shows a full-width how-to-play guide instead of the
    // list/detail browser, so toggle those chrome pieces accordingly.
    const guideEl = document.getElementById('wiki-guide');
    const mainC = document.querySelector('.wiki-main-container');
    const searchBox = document.querySelector('.wiki-search-box');
    if (this.currentWikiTab === 'guide') {
      if (guideEl) { guideEl.style.display = 'block'; if (!guideEl.dataset.built) { guideEl.innerHTML = this._guideHTML(); guideEl.dataset.built = '1'; } }
      if (mainC) mainC.style.display = 'none';
      if (searchBox) searchBox.style.display = 'none';
      return;
    }
    if (guideEl) guideEl.style.display = 'none';
    if (mainC) mainC.style.display = '';
    if (searchBox) searchBox.style.display = '';

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

  handleMonsterKill(monsterName) {
    this.killStreak++;
    const streaks = [10, 20, 50, 100, 200, 500];
    if (streaks.includes(this.killStreak)) {
      // Broadcast to others via socket
      const currentMap = window.sceneManager ? window.sceneManager.currentMap : 'prontera';
      broadcastKillStreak(window.userId, window.username, this.killStreak, currentMap);
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
      const key = this.characterId ? `zolos_daily_quests_${this.characterId}` : 'zolos_daily_quests';
      const stored = localStorage.getItem(key) || localStorage.getItem('zolos_daily_quests');
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

      this.dailyQuestsState = data;
      this._saveDailyQuestsToDB();
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
    this._saveDailyQuestsToDB();

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
    this._saveDailyQuestsToDB();
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
      this._saveDailyQuestsToDB();
      const panel = document.getElementById('daily-quests-panel');
      if (panel && panel.style.display !== 'none') {
        this._renderDailyQuests();
      }
    }
  }

  // ============ WARP MAP MODAL ============
  // Opens a beautiful map selection UI so the player can teleport to any map.

  // All available maps with their metadata for the warp UI.
  // These match MAP_CONFIGS in SceneManager.js and the portal graph.
  static _WARP_MAPS = [
    {
      id: 'prontera',
      name: 'Prontera Field',
      nameTh: 'เมืองประเทอร์รา',
      emoji: '🏰',
      color: '#40c0ff',
      bgGradient: 'linear-gradient(135deg, #0a3a6a 0%, #1a6a9a 40%, #3a9ac0 100%)',
      desc: 'เมืองหลวงศูนย์กลางของทวีป — จุดเริ่มต้นของการผจญภัย',
      level: 'Lv.1+',
      difficulty: 'Easy',
      difficultyClass: 'easy',
      monsters: ['Poring', 'Lunatic', 'Fabre', 'Pupa'],
    },
    {
      id: 'payon',
      name: 'Payon Forest',
      nameTh: 'ป่าเปยอง',
      emoji: '🌲',
      color: '#60ff80',
      bgGradient: 'linear-gradient(135deg, #1a3a1a 0%, #2a5a2a 40%, #4a8a4a 100%)',
      desc: 'ป่าเขียวขจีแห่งนักรบ — เต็มไปด้วยมอนสเตอร์ระดับกลาง',
      level: 'Lv.5+',
      difficulty: 'Medium',
      difficultyClass: 'medium',
      monsters: ['Horn', 'Bee', 'Coco', 'Wolf'],
    },
    {
      id: 'glast_heim',
      name: 'Glast Heim',
      nameTh: 'ปราสาทกลาสท์ไฮม์',
      emoji: '🏚️',
      color: '#c040ff',
      bgGradient: 'linear-gradient(135deg, #1a0a3a 0%, #3a1a5a 40%, #5a3a8a 100%)',
      desc: 'ซากปรักหักพังแห่งความมืด — ที่หลบซ่อนของสัตว์ประหลาด',
      level: 'Lv.10+',
      difficulty: 'Hard',
      difficultyClass: 'hard',
      monsters: ['Skeleton', 'Zombie', 'Ghoul', 'Mummy'],
    },
    {
      id: 'mjolnir',
      name: 'Mjolnir Mountains',
      nameTh: 'เทือกเขาหมิโอลนีร์',
      emoji: '⛰️',
      color: '#80a0d0',
      bgGradient: 'linear-gradient(135deg, #2a3a4a 0%, #4a6a7a 40%, #6a8aaa 100%)',
      desc: 'เทือกเขาสูงชัน — ที่พำนักของยักษ์และโกเล็ม',
      level: 'Lv.15+',
      difficulty: 'Hard',
      difficultyClass: 'hard',
      monsters: ['Golem', 'Ogre', 'Giant Spider'],
    },
    {
      id: 'abyss_lake',
      name: 'Abyss Lake',
      nameTh: 'ทะเลสาบห้วงลึก',
      emoji: '🌊',
      color: '#2060a0',
      bgGradient: 'linear-gradient(135deg, #0a1a2a 0%, #1a3a5a 40%, #2a5a8a 100%)',
      desc: 'ทะเลสาบลึกลับใต้น้ำ — บ้านของมังกรและสัตว์ทะเล',
      level: 'Lv.20+',
      difficulty: 'Very Hard',
      difficultyClass: 'very-hard',
      monsters: ['Dragon Egg', 'Triton', 'Sea Serpent'],
    },
    {
      id: 'svarrga',
      name: 'Svarrga',
      nameTh: 'สรวงสวรรค์',
      emoji: '✨',
      color: '#ffd700',
      bgGradient: 'linear-gradient(135deg, #e8d0a0 0%, #f5e8c0 40%, #fff8e0 100%)',
      desc: 'ดินแดนแห่งความสงบ — สถานที่พักผ่อนของเหล่านักรบ',
      level: 'All Levels',
      difficulty: 'Safe Zone',
      difficultyClass: 'safe',
      monsters: [],
    },
  ];

  openWarpMap() {
    console.log('[GameUI] openWarpMap called');
    // Inject styles once
    if (!document.getElementById('warp-style')) {
      const st = document.createElement('style');
      st.id = 'warp-style';
      st.textContent = `
        #warp-modal {
          position: fixed; inset: 0; z-index: 1800; pointer-events: auto;
          display: none; align-items: center; justify-content: center;
          background: rgba(4, 8, 18, 0.85); backdrop-filter: blur(6px);
          padding: 12px; box-sizing: border-box;
        }
        #warp-card {
          width: min(820px, 96vw); max-height: 92vh;
          display: flex; flex-direction: column;
          border-radius: 18px;
          background: linear-gradient(180deg, #151b30, #0d1120);
          border: 1px solid rgba(240, 192, 64, 0.35);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          overflow: hidden;
          pointer-events: auto;
        }
        .warp-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(240, 192, 64, 0.15);
          background: linear-gradient(90deg, rgba(240, 192, 64, 0.14), transparent);
        }
        .warp-head h2 {
          font-family: var(--font-main, inherit);
          font-size: 17px; color: #fff;
          text-shadow: 0 0 14px rgba(240, 192, 64, 0.5); margin: 0;
        }
        .warp-head .sub { font-size: 11px; color: #9aa5c0; margin-top: 3px; }
        .warp-x {
          background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15);
          color: #9aa5c0; width: 36px; height: 36px; border-radius: 9px;
          cursor: pointer; font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 auto; transition: all 0.2s;
        }
        .warp-x:hover { background: rgba(231, 76, 60, 0.2); color: #ff7675; border-color: rgba(231, 76, 60, 0.4); }
        .warp-main {
          flex: 1 1 auto; min-height: 0; overflow-y: auto;
          -webkit-overflow-scrolling: touch; padding: 12px;
        }
        .warp-grid {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (max-width: 680px) {
          .warp-grid { grid-template-columns: 1fr; }
          #warp-modal { align-items: flex-start; padding: 8px 8px 108px; }
          #warp-card { max-height: calc(100dvh - 116px); }
        }
        .warp-tile {
          position: relative; border-radius: 14px; overflow: hidden;
          cursor: pointer; transition: all 0.25s;
          border: 2px solid rgba(255, 255, 255, 0.08);
          background-size: cover; background-position: center;
        }
        .warp-tile:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          border-color: rgba(240, 192, 64, 0.5);
        }
        .warp-tile.current {
          border-color: rgba(240, 192, 64, 0.8);
          box-shadow: 0 0 20px rgba(240, 192, 64, 0.3);
        }
        .warp-tile .tile-bg {
          position: absolute; inset: 0; z-index: 0;
        }
        .warp-tile .tile-content {
          position: relative; z-index: 1;
          padding: 14px; display: flex; flex-direction: column; gap: 6px;
          min-height: 140px;
        }
        .warp-tile .tile-top {
          display: flex; align-items: center; justify-content: space-between;
        }
        .warp-tile .tile-emoji { font-size: 32px; }
        .warp-tile .tile-badge {
          font-size: 10px; font-weight: 800; padding: 2px 8px;
          border-radius: 10px; background: rgba(0, 0, 0, 0.5);
          color: #fff; backdrop-filter: blur(4px);
        }
        .warp-tile .tile-name {
          font-size: 16px; font-weight: 800; color: #fff;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
        }
        .warp-tile .tile-name-th {
          font-size: 12px; color: rgba(255, 255, 255, 0.75); font-weight: 600;
        }
        .warp-tile .tile-desc {
          font-size: 11px; color: rgba(255, 255, 255, 0.65);
          line-height: 1.4; margin-top: auto;
        }
        .warp-tile .tile-footer {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 4px; padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .warp-tile .tile-level {
          font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.6);
        }
        .warp-tile .tile-warp-btn {
          font-size: 11px; font-weight: 800; padding: 4px 12px;
          border-radius: 8px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #ffe89a, #f0c040);
          color: #2a1c00; transition: all 0.2s;
        }
        .warp-tile .tile-warp-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 0 16px rgba(240, 192, 64, 0.5);
        }
        .warp-tile .tile-current-badge {
          position: absolute; top: 8px; right: 8px; z-index: 2;
          font-size: 9px; font-weight: 800; padding: 3px 10px;
          border-radius: 10px; background: rgba(240, 192, 64, 0.9);
          color: #2a1c00; letter-spacing: 0.5px;
        }
        .warp-tile .tile-glow {
          position: absolute; inset: 0; z-index: 0;
          opacity: 0.35;
        }
        @keyframes warpPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `;
      document.head.appendChild(st);
    }

    // Create modal
    let modal = document.getElementById('warp-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'warp-modal';
      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); }
      });
      modal.innerHTML = `<div id="warp-card"></div>`;
      document.body.appendChild(modal);
    }

    // Close side panels
    document.querySelectorAll('.side-panel').forEach(p => { p.style.display = 'none'; });

    this._renderWarpMap();
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderWarpMap() {
    const card = document.getElementById('warp-card');
    if (!card) return;

    const currentMapId = this.currentMapId || 'prontera';
    const maps = GameUI._WARP_MAPS;
    const playerLevel = Number(this.character?.stats?.level) || 1;

    const tiles = maps.map(m => {
      const isCurrent = m.id === currentMapId;
      const glowOpacity = isCurrent ? '0.5' : '0.2';
      return `
        <div class="warp-tile ${isCurrent ? 'current' : ''}" data-map="${m.id}"
             style="background: ${m.bgGradient};">
          <div class="tile-glow"
               style="background: radial-gradient(ellipse at 30% 20%, ${m.color}40 0%, transparent 70%);
                      opacity: ${glowOpacity}; animation: warpPulse ${isCurrent ? '2s' : '3s'} ease-in-out infinite;">
          </div>
          ${isCurrent ? '<div class="tile-current-badge">📍 YOU ARE HERE</div>' : ''}
          <div class="tile-content">
            <div class="tile-top">
              <span class="tile-emoji">${m.emoji}</span>
              <span class="tile-badge ${m.difficultyClass}">${m.difficulty}</span>
            </div>
            <div class="tile-name">${m.name}</div>
            <div class="tile-name-th">${m.nameTh}</div>
            <div class="tile-desc">${m.desc}</div>
            <div class="tile-footer">
              <span class="tile-level">${m.level}</span>
              ${isCurrent
                ? '<span style="font-size:10px;color:#9aa5c0;font-weight:600;">คุณอยู่ที่นี่</span>'
                : `<button class="tile-warp-btn" data-warp="${m.id}" onclick="event.stopPropagation()">🌀 วาร์ป</button>`
              }
            </div>
            ${m.monsters.length > 0 ? `
              <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px;">
                👾 ${m.monsters.slice(0, 3).join(' · ')}${m.monsters.length > 3 ? ' · …' : ''}
              </div>
            ` : '<div style="font-size:10px;color:#57e08a;margin-top:2px;">✅ ไม่มีมอนสเตอร์ — พื้นที่ปลอดภัย</div>'}
          </div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="warp-head">
        <div>
          <h2>🌀 วาร์ปไปยังแผนที่</h2>
          <div class="sub">เลือกจุดหมายแล้วกดปุ่ม "วาร์ป" — ตำแหน่งปัจจุบัน: <b style="color:var(--primary)">${this._currentMapLabel()}</b></div>
        </div>
        <button class="warp-x" id="warp-close">✕</button>
      </div>
      <div class="warp-main">
        <div class="warp-grid">${tiles}</div>
      </div>
    `;

    card.querySelector('#warp-close').onclick = () => {
      const m = document.getElementById('warp-modal');
      if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };

    // Wire warp buttons
    card.querySelectorAll('[data-warp]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetMap = btn.dataset.warp;
        this._doWarp(targetMap);
      });
    });
  }

  _currentMapLabel() {
    const m = GameUI._WARP_MAPS.find(x => x.id === this.currentMapId);
    return m ? `${m.emoji} ${m.name}` : this.currentMapId;
  }

  _doWarp(targetMap) {
    console.log('[GameUI] _doWarp called with', targetMap);
    if (!window.sceneManager || !window.character) return;
    if (targetMap === window.sceneManager.currentMap) {
      this.addCombatLog('คุณอยู่ที่นี่แล้ว', 'system');
      return;
    }
    // Close modal
    const modal = document.getElementById('warp-modal');
    if (modal) modal.style.display = 'none';
    this.updateMobileControlsVisibility();
    this.addCombatLog('กำลังวาร์ปไป ' + targetMap + '...', 'system');

    const spawnX = (Math.random() - 0.5) * 8;
    const spawnZ = (Math.random() - 0.5) * 8;
    const spawn = { x: spawnX, y: 1.2, z: spawnZ };

    window.portalCooldown = 2.0;
    window.autoPath = null;
    if (window.character) { window.character.targetMonster = null; window.character.state = 'idle'; }
    if (window.combatSystem) { window.combatSystem.currentTarget = null; window.combatSystem.autoFarm = false; window.combatSystem.isFishing = false; }
    if (typeof this.clearTarget === 'function') this.clearTarget();

    window.character.baseY = spawn.y;
    window.character.mesh.position.set(spawn.x, spawn.y, spawn.z);
    window.sceneManager.loadMap(targetMap);

    if (window.monsters) {
      window.monsters.clearAll();
      window.monsters.mapId = targetMap;
      window.monsters.spawnInitial(window.character.stats.level);
    }
    if (typeof window.updatePresence === 'function') window.updatePresence(window.character.stats.level, window.username, targetMap);
    if (typeof window.broadcastPosition === 'function') window.broadcastPosition(window.userId, window.username, window.character.stats.level, window.character.getPosition(), window.character.mesh.rotation.y, window.character.state, window.character.getAppearance(), targetMap);
    if (window.remotePlayersMap) { for (const [, rp] of window.remotePlayersMap.entries()) { if (rp.mesh) window.sceneManager.scene.remove(rp.mesh); } window.remotePlayersMap.clear(); }
    if (window.stallManager) window.stallManager.refresh();
    if (window.particles && typeof window.particles.spawnWarpEffect === 'function') window.particles.spawnWarpEffect(window.character.getPosition());
    this.addCombatLog('วาร์ปไป ' + targetMap + ' สำเร็จ!', 'levelup');
  }
}

