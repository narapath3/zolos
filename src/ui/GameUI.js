import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, GLAST_MONSTERS, MJOLNIR_MONSTERS, ABYSS_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS, SKILLS, FISH_SPECIES, FORGE_RECIPES, PICKAXES, JOBS, JOB_UNLOCK_LEVEL, JOB_CHANGE_COST, canEquipItem, itemJob, EQUIP_SLOTS, ARMOR_SLOTS, getEquipSlot } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats, getDeterministicGuestName, isPlaceholderName, sendTradeRequestPacket, sendTradeResponsePacket, sendTradeCancelPacket, executeDecentralizedSenderTrade, executeDecentralizedReceiverTrade, sendFriendRequestPacket, sendFriendResponsePacket, saveDailyQuests, loadDailyQuests, saveFriendsList, loadFriendsList, saveFishingAlmanac, loadFishingAlmanac, saveLoginStreak, loadLoginStreak } from '../network/GameSync.js';
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

    // Kill streak tracking
    this.killStreak = 0;

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

    // Check the Warp Map modal
    const warpModal = document.getElementById('warp-modal');
    if (warpModal) {
      const display = warpModal.style.display || window.getComputedStyle(warpModal).display;
      if (display !== 'none') {
        anyPanelOpen = true;
      }
    }

    // Finally toggle the visibility of the mobile pad controls
    const mobileControls = document.getElementById('mobile-controls');
    const mobileActionPad = document.getElementById('mobile-action-pad');
    if (mobileControls) mobileControls.style.display = anyPanelOpen ? 'none' : 'flex';
    if (mobileActionPad) mobileActionPad.style.display = anyPanelOpen ? 'none' : 'flex';
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
    const killEl = document.getElementById('kill-count');
    if (killEl) killEl.textContent = stats.total_kills;

    // Gold
    const goldStr = stats.gold.toLocaleString();
    document.getElementById('gold-amount').textContent = goldStr;
    const hudGold = document.getElementById('hud-gold-amount');
    if (hudGold) hudGold.textContent = goldStr;

    const zolVal = (Number(stats.zol) || 0).toLocaleString();
    const zolEl = document.getElementById('zol-amount');
    if (zolEl) zolEl.textContent = zolVal;
    const hudZol = document.getElementById('hud-zol-amount');
    if (hudZol) hudZol.textContent = zolVal;
  }

  handleMonsterKill(monsterName) {
    this.killStreak++;
    const streaks = [5, 10, 20, 50];
    if (streaks.includes(this.killStreak)) {
      this.showKillStreakBanner(this.killStreak);
    }
  }

  showKillStreakBanner(count) {
    let msg = `${count} Kill Streak!`;
    let sub = "ยอดเยี่ยม!";
    if (count === 10) { msg = "10 Kill Streak! RAMPAGE!"; sub = "คุณกำลังคลั่ง!"; }
    if (count === 20) { msg = "20 Kill Streak! UNSTOPPABLE!"; sub = "ไม่มีใครหยุดคุณได้!"; }
    if (count === 50) { msg = "50 Kill Streak! GODLIKE!"; sub = "คุณคือตำนาน!"; }

    this._showDuelOverlay('duel-win streak-overlay',
      `<div class="duel-title">${msg}</div>
       <div class="duel-sub">${sub}</div>`,
      3000);
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
            <span class="stats-bar-value">${Math.floor(stats.hp)} / ${stats.max_hp}</span>
          </div>
          <div class="stats-bar-bg stats-hp-bg">
            <div class="stats-bar-fill stats-hp-fill" style="width: ${hpPct}%"></div>
          </div>
        </div>
        <!-- SP -->
        <div class="stats-bar-container">
          <div class="stats-bar-header">
            <span class="stats-bar-label">SP</span>
            <span class="stats-bar-value">${Math.floor(stats.sp)} / ${stats.max_sp}</span>
          </div>
          <div class="stats-bar-bg stats-sp-bg">
            <div class="stats-bar-fill stats-sp-fill" style="width: ${spPct}%"></div>
          </div>
        </div>
        <!-- EXP -->
        <div class="stats-bar-container">
          <div class="stats-bar-header">
            <span class="stats-bar-label">EXP</span>
            <span class="stats-bar-value">${stats.exp} / ${expRequired} (${expPct}%)</span>
          </div>
          <div class="stats-bar-bg stats-exp-bg">
            <div class="stats-bar-fill stats-exp-fill" style="width: ${expPct}%"></div>
          </div>
        </div>
      </div>

      <!-- Combat & Base Stats Grid -->
      <div class="stats-grid">
        <div class="stats-item">
          <div class="stats-label">⚔️ ATK</div>
          <div class="stats-value">${stats.atk}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">🛡️ DEF</div>
          <div class="stats-value">${stats.def}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">⚡ SPD</div>
          <div class="stats-value">${stats.speed.toFixed(1)}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">🎯 ACC</div>
          <div class="stats-value">${stats.acc || 0}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">💥 CRIT</div>
          <div class="stats-value">${stats.crit || 0}%</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">💀 Kills</div>
          <div class="stats-value">${stats.total_kills}</div>
        </div>
      </div>

      <!-- Secondary Attributes / Info -->
      <div class="stats-footer-info">
        <div class="stats-footer-row">
          <span>🗺️ Current Map:</span>
          <b>${document.getElementById('map-name').textContent}</b>
        </div>
        <div class="stats-footer-row">
          <span>⚖️ Status:</span>
          <b style="color: #40e080">NORMAL</b>
        </div>
      </div>
    `;
  }

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    let out = '';
    if (hrs > 0) out += `${hrs}h `;
    if (mins > 0 || hrs > 0) out += `${mins}m `;
    out += `${secs}s`;
    return out;
  }

  // ============ Inventory Rendering ============
  _renderInventory() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Create 40 slots (RO style grid)
    for (let i = 0; i < 40; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      grid.appendChild(slot);

      const item = this.inventory[i];
      if (item) {
        // Apply filter
        if (this.currentTab !== 'all') {
          if (this.currentTab === 'usable' && item.type !== 'usable') { slot.classList.add('filtered'); }
          if (this.currentTab === 'equip' && item.type !== 'equip') { slot.classList.add('filtered'); }
          if (this.currentTab === 'etc' && (item.type === 'usable' || item.type === 'equip' || item.type === 'fish')) { slot.classList.add('filtered'); }
          if (this.currentTab === 'fish' && item.type !== 'fish') { slot.classList.add('filtered'); }
        }

        slot.innerHTML = `
          <div class="inv-item" data-name="${item.name}">
            <span class="inv-item-icon">${item.icon || '📦'}</span>
            ${item.count > 1 ? `<span class="inv-item-count">${item.count}</span>` : ''}
          </div>
        `;

        if (item.equipped) {
          slot.classList.add('equipped');
        }

        if (this.selectedItemName === item.name) {
          slot.classList.add('selected');
        }

        slot.addEventListener('click', () => {
          this.selectedItemName = item.name;
          this._renderInventory();
          this._showItemDetail(item);
        });
      }
    }
  }

  _showItemDetail(item) {
    const placeholder = document.getElementById('detail-placeholder');
    const content = document.getElementById('detail-content');
    if (!placeholder || !content) return;

    placeholder.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('detail-icon').textContent = item.icon || '📦';
    document.getElementById('detail-name').textContent = item.name;
    document.getElementById('detail-type').textContent = item.type.toUpperCase();
    document.getElementById('detail-desc').textContent = item.description || 'No description.';
    document.getElementById('detail-price-val').textContent = item.price || 0;

    const useBtn = document.getElementById('btn-use-item');
    if (useBtn) {
      useBtn.style.display = 'block';
      if (item.type === 'equip') {
        useBtn.textContent = item.equipped ? 'Unequip' : 'Equip';
      } else if (item.type === 'usable') {
        useBtn.textContent = 'Use';
      } else {
        useBtn.style.display = 'none';
      }
    }
  }

  async _useSelectedItem() {
    if (!this.selectedItemName) return;
    const item = this.inventory.find(i => i.name === this.selectedItemName);
    if (!item) return;

    if (item.type === 'usable') {
      // Use item (heal, etc)
      if (item.heal_hp) this.character.heal(item.heal_hp);
      if (item.heal_sp) this.character.healSp(item.heal_sp);

      // Reduce count
      item.count--;
      if (item.count <= 0) {
        this.inventory = this.inventory.filter(i => i.name !== item.name);
        this.selectedItemName = null;
        document.getElementById('detail-placeholder').style.display = 'block';
        document.getElementById('detail-content').style.display = 'none';
      }

      // Save to DB
      if (this.characterId) {
        await saveInventoryItem(this.characterId, item.name, item.count);
      }
    } else if (item.type === 'equip') {
      // Toggle equip
      const wasEquipped = item.equipped;

      // If equipping, unequip others in same slot first
      if (!wasEquipped) {
        const slot = getEquipSlot(item.name);
        this.inventory.forEach(i => {
          if (i.type === 'equip' && getEquipSlot(i.name) === slot) {
            i.equipped = false;
          }
        });
      }

      item.equipped = !wasEquipped;

      // Update stats based on equipment
      this.character.updateStatsFromEquipment(this.inventory.filter(i => i.equipped));

      // Save to DB
      if (this.characterId) {
        // This would need a more complex sync for equipment status
        // For now we just update the count/stats
        await updateInventoryItemStats(this.characterId, item.name, { equipped: item.equipped });
      }
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
  }

  async _refreshLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    list.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const data = await fetchLeaderboard(this.leaderboardCategory);
      list.innerHTML = '';

      if (!data || data.length === 0) {
        list.innerHTML = '<div class="empty">No data found</div>';
        return;
      }

      data.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'lb-row';
        if (entry.user_id === this.characterId) row.classList.add('me');

        let val = entry.level;
        if (this.leaderboardCategory === 'gold') val = entry.gold.toLocaleString() + ' z';
        if (this.leaderboardCategory === 'kills') val = entry.total_kills;

        row.innerHTML = `
          <span class="lb-rank">${index + 1}</span>
          <span class="lb-name">${entry.name}</span>
          <span class="lb-val">${val}</span>
        `;
        list.appendChild(row);
      });
    } catch (e) {
      list.innerHTML = '<div class="error">Error loading data</div>';
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
    const count = this.onlinePlayers.length;
    const authCount = document.getElementById('online-players-auth');
    if (authCount) authCount.textContent = count;

    const hudCount = document.getElementById('hud-online-count');
    if (hudCount) hudCount.textContent = count;

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
            offline: true
          });
        }
      });
    } else {
      // Global online players
      list = onlinePlayers;
      onlineCount = onlinePlayers.length;
    }

    body.innerHTML = '';
    list.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row' + (p.offline ? ' offline' : '');
      if (p.username === window.username) row.classList.add('me');

      const isFriend = friends.includes(p.username);

      row.innerHTML = `
        <div class="player-row-left">
          <span class="status-dot ${p.offline ? 'offline' : 'online'}"></span>
          <span class="player-row-name">${p.username} ${isFriend ? '⭐' : ''}</span>
        </div>
        <div class="player-row-right">
          <span class="player-row-level">Lv.${p.level}</span>
          ${p.username !== window.username && !p.offline ? `<button class="btn-interact" data-user="${p.username}">Interact</button>` : ''}
        </div>
      `;

      if (p.username !== window.username && !p.offline) {
        row.querySelector('.btn-interact').addEventListener('click', (e) => {
          e.stopPropagation();
          this.playerProfileModal.show(p.username);
        });
      }

      body.appendChild(row);
    });
  }

  // ============ Combat Log ============
  addCombatLog(message, type = 'info') {
    const messages = document.getElementById('combat-log-messages');
    if (!messages) return;

    const row = document.createElement('div');
    row.className = `log-msg ${type}`;
    row.textContent = message;

    messages.appendChild(row);

    // Remove old messages
    while (messages.children.length > this.maxLogMessages) {
      messages.removeChild(messages.firstChild);
    }

    // Scroll to bottom
    messages.scrollTop = messages.scrollHeight;
  }

  triggerScreenShake(critical = false) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    
    canvas.classList.remove('shake-heavy', 'shake-light');
    void canvas.offsetWidth; // trigger reflow
    canvas.classList.add(critical ? 'shake-heavy' : 'shake-light');
    
    setTimeout(() => {
      canvas.classList.remove('shake-heavy', 'shake-light');
    }, 500);
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
      const charCounter = document.getElementById('chat-char-counter');
      if (charCounter) charCounter.textContent = '0 / 100';
      
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
      const charCounter = document.getElementById('chat-char-counter');
      chatInput.addEventListener('input', () => {
        if (charCounter) {
          charCounter.textContent = `${chatInput.value.length} / 100`;
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

    this._setupChatExtras();
  }

  _setupChatExtras() {
    const chatInput = document.getElementById('chat-input');
    const btnEmoji = document.getElementById('btn-emoji');
    const emojiPicker = document.getElementById('emoji-picker');
    const mentionBox = document.getElementById('mention-suggest');
    if (!chatInput || !btnEmoji || !emojiPicker || !mentionBox) return;

    // Toggle emoji picker
    btnEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
      mentionBox.style.display = 'none';
    });

    // Populate emojis
    const commonEmojis = ['😊', '😄', '😂', '🤣', '❤️', '🔥', '⚔️', '🛡️', '💰', '🎁', '👋', '👍', '🙏', '😭', '😡', '🤔'];
    emojiPicker.innerHTML = commonEmojis.map(emo => `<button type="button" class="emoji-cell">${emo}</button>`).join('');
    emojiPicker.querySelectorAll('.emoji-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        chatInput.value += cell.textContent;
        emojiPicker.style.display = 'none';
        chatInput.focus();
        const charCounter = document.getElementById('chat-char-counter');
        if (charCounter) charCounter.textContent = `${chatInput.value.length} / 100`;
      });
    });

    // Close on click outside
    document.addEventListener('click', () => {
      emojiPicker.style.display = 'none';
      mentionBox.style.display = 'none';
    });

    // @mention autocomplete logic
    chatInput.addEventListener('input', () => {
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
          const charCounter = document.getElementById('chat-char-counter');
          if (charCounter) charCounter.textContent = `${chatInput.value.length} / 100`;
        });
      });
      mentionBox.style.display = 'block';
    });
  }

  _openChatFull() {
    const chatPanel = document.getElementById('chat-panel');
    const chatInput = document.getElementById('chat-input');
    const chatInputRow = chatPanel.querySelector('.chat-input-row');
    
    chatPanel.classList.remove('preview-mode');
    chatPanel.style.display = 'flex'; // Ensure it's visible
    if (chatInputRow) chatInputRow.style.display = 'flex';
    
    if (chatInput) {
      chatInput.focus();
      chatInput.select();
    }
    
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
    
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
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

    const esc = (t) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let body = esc(this._emojify(message));

    // Handle @mentions
    let mentionedMe = false;
    const myName = this.character?.stats?.name;
    body = body.replace(/@([^\s@]+)/g, (match, name) => {
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
    
    // Smooth scroll to bottom
    setTimeout(() => {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
      });
    }, 50);

    // Ping when someone tags you (not your own message)
    if (mentionedMe && username !== myName) {
      if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
      this.addCombatLog(`💬 ${username} แท็กหาคุณในแชท!`, 'levelup');
    }

    // Auto-expand panel if in preview mode
    if (this.chatPanel && this.chatPanel.classList.contains('preview-mode')) {
      this.chatPanel.classList.remove('fade-out');
      void this.chatPanel.offsetWidth;
      this.chatPanel.classList.add('fade-out');
    }
  }

  // ============ Duel/Banner Infrastructure ============
  _ensureDuelStyles() {
    if (document.getElementById('duel-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'duel-ui-styles';
    s.textContent = `
      .duel-overlay {
        position: fixed; inset: 0; z-index: 2000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(circle, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.85) 100%);
        opacity: 0; pointer-events: none; transition: opacity 0.5s ease;
        text-align: center;
      }
      .duel-overlay.show { opacity: 1; }
      .duel-title {
        font-family: var(--font-main), cursive; font-size: clamp(40px, 10vw, 80px);
        margin-bottom: 10px; filter: drop-shadow(0 0 20px rgba(0,0,0,0.8));
        animation: duelTitleIn 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.28) both;
      }
      .duel-sub {
        font-size: clamp(16px, 3vw, 24px); color: #fff; opacity: 0.9;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
        animation: duelFadeIn 0.8s ease 0.3s both;
      }
      .duel-win .duel-title { color: #ffd700; text-shadow: 0 0 30px rgba(255,215,0,0.6); }
      .duel-lose .duel-title { color: #ff4d4d; text-shadow: 0 0 30px rgba(255,77,77,0.6); }
      @keyframes duelTitleIn {
        from { transform: scale(0.5) translateY(-50px); opacity: 0; }
        to { transform: scale(1) translateY(0); opacity: 1; }
      }
      @keyframes duelFadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(s);
  }

  _showDuelOverlay(className, html, duration = 3000) {
    this._ensureDuelStyles();
    let el = document.getElementById('duel-overlay-global');
    if (!el) {
      el = document.createElement('div');
      el.id = 'duel-overlay-global';
      document.body.appendChild(el);
    }
    el.className = 'duel-overlay ' + className;
    el.innerHTML = html;
    
    requestAnimationFrame(() => {
      el.classList.add('show');
    });

    setTimeout(() => {
      el.classList.remove('show');
    }, duration);
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
    
    const respawnBtn = document.getElementById('btn-respawn-now');
    if (respawnBtn) respawnBtn.style.display = 'block';
  }

  // ============ Minimap ============
  _setupMinimap() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCoords = document.getElementById('minimap-coords');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
  }

  updateMinimap(character, monsters, remotePlayersMap) {
    if (!this.minimapCtx) return;

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fill();

    const playerPos = character.getPosition();
    const scale = 2.0; // 1 unit = 2 pixels

    // Draw monsters
    ctx.fillStyle = '#ff4444';
    monsters.forEach(m => {
      if (!m.alive) return;
      const mPos = m.getPosition();
      const dx = (mPos.x - playerPos.x) * scale;
      const dz = (mPos.z - playerPos.z) * scale;
      
      // Check if within circular minimap
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < cx - 5) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dz, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw remote players
    ctx.fillStyle = '#4488ff';
    if (remotePlayersMap) {
      for (const rp of remotePlayersMap.values()) {
        const rpPos = rp.mesh.position;
        const dx = (rpPos.x - playerPos.x) * scale;
        const dz = (rpPos.z - playerPos.z) * scale;
        
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < cx - 5) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dz, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw player (center)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw direction arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(character.mesh.rotation.y);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-3, -3);
    ctx.lineTo(3, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Update coordinates
    if (this.minimapCoords) {
      this.minimapCoords.textContent = `X: ${Math.floor(playerPos.x)}, Z: ${Math.floor(playerPos.z)}`;
    }
  }

  // ============ WARP MAP MODAL ============
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
      difficulty: 'Safe Zone',
      difficultyClass: 'safe',
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
      difficulty: 'Easy',
      difficultyClass: 'easy',
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
      difficulty: 'Medium',
      difficultyClass: 'medium',
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
      desc: 'เมืองเหมืองแร่บนสรวงสวรรค์ — ไม่มีมอนสเตอร์ ปลอดภัย 100%',
      level: 'All Levels',
      difficulty: 'Safe Zone',
      difficultyClass: 'safe',
      monsters: [],
    },
  ];

  openWarpMap() {
    console.log('[GameUI] openWarpMap called');
    // Inject styles once
    if (!document.getElementById('warp-ui-styles')) {
      const st = document.createElement('style');
      st.id = 'warp-ui-styles';
      st.textContent = `
        #warp-modal {
          position: fixed; inset: 0; z-index: 1800;
          background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
          display: none; align-items: center; justify-content: center;
        }
        #warp-card {
          background: var(--bg-panel, #0c1220); border: 1px solid rgba(240, 192, 64, 0.3);
          border-radius: 24px; width: min(94vw, 720px); max-height: 90vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 32px 100px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          animation: warpEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes warpEnter { from { opacity: 0; transform: scale(0.95) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
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
    
    const spawn = { x: 0, y: 0, z: 0 };
    
    const m = GameUI._WARP_MAPS.find(x => x.id === targetMap);
    if (!m) return;

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
