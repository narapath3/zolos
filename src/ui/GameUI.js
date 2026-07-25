import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, GLAST_MONSTERS, MJOLNIR_MONSTERS, ABYSS_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS, SKILLS, FISH_SPECIES, FORGE_RECIPES, PICKAXES, JOBS, JOB_UNLOCK_LEVEL, JOB_CHANGE_COST, canEquipItem, itemJob, EQUIP_SLOTS, ARMOR_SLOTS, getEquipSlot, getJobStats, petModelOf, REFINABLE_TYPES, refineInfo, refineOreFor, getRefineMult, refineTierColor, cardFitsSlot, cardCategoryForSlot, RARITY_COLOR } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, setInventoryItemQuantity, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats, getDeterministicGuestName, isPlaceholderName, sendTradeRequestPacket, sendTradeResponsePacket, sendTradeCancelPacket, executeDecentralizedSenderTrade, executeDecentralizedReceiverTrade, resolveCharacterByUid, searchCharactersByName, sendCardMail, fetchCardMail, claimCardMail, returnCardMail, sendFriendRequestPacket, sendFriendResponsePacket, saveDailyQuests, loadDailyQuests, saveFriendsList, loadFriendsList, saveFishingAlmanac, loadFishingAlmanac, saveLoginStreak, loadLoginStreak, broadcastKillStreak, requestCardFusion } from '../network/GameSync.js';
import { LayoutManager } from './LayoutManager.js';
import { PlayerProfileModal } from './PlayerProfileModal.js';
import { CardAlbum } from './CardAlbum.js';
import { migrateLegacyCards } from '../cards/CardMigration.js';
import { getCard } from '../cards/CardCatalog.js';


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
    this.cardAlbum = null;
    this.cardDropRevealQueue = [];

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
    this._setupCardTradePanel();
    this._setupMailbox();
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

  destroy() {
    this.cardAlbum?.destroy();
    this.cardAlbum = null;
    this.cardDropRevealQueue.length = 0;
  }

  _setupPanels() {
    // Panel toggle buttons
    document.getElementById('btn-inventory').addEventListener('click', () => this._togglePanel('inventory-panel'));
    document.getElementById('btn-mycard')?.addEventListener('click', () => this._openMyCard());



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

  // My Card: dedicated card-collection storage (separate from the Bag).
  // Opens the panel and mounts the shared card album into its grid.
  _openMyCard() {
    this._togglePanel('mycard-panel');
    const panel = document.getElementById('mycard-panel');
    if (panel && panel.style.display !== 'none') {
      const grid = document.getElementById('mycard-grid');
      if (grid) this._mountCardAlbum(grid);
      this.refreshMailbox();
    }
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
      .eq-slot-sockets{display:flex;gap:2px;margin-top:2px;}
      .eq-socket{width:8px;height:8px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);}
      .eq-socket.filled{background:#f0c040;border-color:#fff;box-shadow:0 0 4px #f0c040;}
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
      
      // Card sockets
      let socketsHtml = '';
      if (filled && (it.type === 'weapon' || it.type === 'armor' || it.type === 'shield')) {
        const invItem = this.inventory.find(i => i.item_name === name && i.stats && i.stats.equipped && i.stats.slot === slot.id);
        const cardCount = (invItem && invItem.stats && invItem.stats.cards) ? invItem.stats.cards.length : 0;
        const maxSockets = 4;
        socketsHtml = '<div class="eq-slot-sockets">';
        for (let i = 0; i < maxSockets; i++) {
          socketsHtml += `<div class="eq-socket ${i < cardCount ? 'filled' : ''}"></div>`;
        }
        socketsHtml += '</div>';
      }

      return `<div class="eq-slot ${filled ? 'filled' : 'empty'}${rarity ? ' rarity-' + rarity : ''}${filterCls}"
        data-slot="${slot.id}" ${filled ? `data-item="${name}"` : ''}
        title="${filled ? name : slot.label + ' (ว่าง)'}">
        <div class="eq-slot-ic">${ic}</div>
        <div class="eq-slot-lb">${filled ? this._short(name) : slot.label}</div>
        ${socketsHtml}
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

  _renderEquipDoll() {
    this._ensureEquipDoll();
    const doll = document.getElementById('equip-doll');
    if (!doll) return;
    doll.style.display = 'grid';
    if (!this.character) { doll.innerHTML = ''; return; }
    doll.innerHTML = this._dollInnerHTML('แตะช่องที่ใส่ของอยู่เพื่อถอด · แตะช่องว่างเพื่อดูไอเทมที่สวมได้');
  }

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

  _itemsForSlot(slotId) {
    const inv = this.inventory || [];
    return inv.filter(i => {
      if (slotId === 'weapon') return i.item_type === 'weapon' || i.item_type === 'fishing_rod';
      return getEquipSlot(i.item_name) === slotId;
    });
  }

  _openCardSocketPicker(cardItem) {
    const equipped = this.inventory.filter(i => i.stats && i.stats.equipped && (i.item_type === 'weapon' || i.item_type === 'armor' || i.item_type === 'shield'));
    if (equipped.length === 0) {
      this._equipToast('❌ ไม่มีอุปกรณ์ที่สวมใส่เพื่อใส่การ์ด!', false);
      return;
    }

    const ov = document.getElementById('slot-picker');
    ov.style.display = 'flex';
    ov.querySelector('h3').textContent = `ใส่การ์ด ${cardItem.item_name}`;
    const list = ov.querySelector('#sp-list');
    list.innerHTML = '';

    equipped.forEach(eq => {
      const row = document.createElement('div');
      row.className = 'sp-row';
      const cardCount = (eq.stats && eq.stats.cards) ? eq.stats.cards.length : 0;
      row.innerHTML = `<span>${eq.emoji} ${eq.item_name}</span><span style="font-size:11px;color:#f0c040;">(${cardCount}/4 ช่อง)</span>`;
      row.onclick = async () => {
        if (cardCount >= 4) {
          this._equipToast('❌ อุปกรณ์นี้ช่องใส่การ์ดเต็มแล้ว!', false);
          return;
        }
        await this._socketCard(eq, cardItem);
        ov.style.display = 'none';
      };
      list.appendChild(row);
    });
  }

  async _socketCard(targetItem, cardItem) {
    if (!targetItem.stats.cards) targetItem.stats.cards = [];
    targetItem.stats.cards.push(cardItem.item_name);

    cardItem.quantity--;
    if (cardItem.quantity <= 0) {
      const idx = this.inventory.indexOf(cardItem);
      if (idx !== -1) this.inventory.splice(idx, 1);
      this.selectedItemName = null;
    }

    if (this.characterId) {
      try {
        await updateInventoryItemStats(this.characterId, targetItem.item_name, targetItem.stats);
        await saveInventoryItem(this.characterId, cardItem.item_name, cardItem.item_type, -1);
      } catch (e) {
        console.error('[Zolos] Card socket save failed:', e);
      }
    }

    this._equipToast(`✅ ใส่การ์ด ${cardItem.item_name} สำเร็จ!`);
    this._renderInventory();
    this.updateStats(this.character.stats);
  }

  _openSlotPicker(slotId) {
    const slot = EQUIP_SLOTS.find(s => s.id === slotId);
    if (!slot) return;
    const items = this._itemsForSlot(slotId);
    const current = this._slotItemName(slotId);
    const ov = document.getElementById('slot-picker');
    ov.style.display = 'flex';
    ov.querySelector('h3').textContent = `เลือก ${slot.label}`;
    const list = ov.querySelector('#sp-list');
    list.innerHTML = '';
    const none = document.createElement('div');
    none.className = 'sp-row';
    none.setAttribute('data-name', '__none__');
    none.innerHTML = `<span>❌ ถอดออก</span>`;
    list.appendChild(none);
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'sp-row' + (it.item_name === current ? ' active' : '');
      row.setAttribute('data-name', it.item_name);
      row.innerHTML = `<span>${it.emoji} ${it.item_name}</span>`;
      list.appendChild(row);
    });
    const close = () => { ov.style.display = 'none'; };
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

  _short(name) {
    if (!name) return '';
    return name.length > 11 ? name.slice(0, 10) + '…' : name;
  }

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
    } else if (item.item_type === 'card') {
      typeStr = 'Card · การ์ด';
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
    } else if (item.item_type === 'card') {
      useBtn.style.display = 'block';
      useBtn.textContent = 'ใส่การ์ด';
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
    if (item.item_type === 'card') {
      this._openCardSocketPicker(item);
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

  // ... rest of the file
}
