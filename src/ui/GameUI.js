import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, GLAST_MONSTERS, MJOLNIR_MONSTERS, ABYSS_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS, PET_SHOP, DIVINE_ZOL_SHOP, SKILLS, FISH_SPECIES, FORGE_RECIPES, PICKAXES, JOBS, JOB_UNLOCK_LEVEL, JOB_CHANGE_COST, canEquipItem, itemJob, EQUIP_SLOTS, ARMOR_SLOTS, getEquipSlot, getJobStats, petModelOf, REFINABLE_TYPES, refineInfo, refineOreFor, getRefineMult, refineTierColor, cardFitsSlot, cardCategoryForSlot, RARITY_COLOR, getPetCombat } from '../engine/GameData.js';
import { itemIconMarkup } from '../engine/ItemVisuals.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, setInventoryItemQuantity, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats, getDeterministicGuestName, isPlaceholderName, sendTradeRequestPacket, sendTradeResponsePacket, sendTradeCancelPacket, executeDecentralizedSenderTrade, executeDecentralizedReceiverTrade, resolveCharacterByUid, searchCharactersByName, sendCardMail, fetchCardMail, claimCardMail, returnCardMail, sendFriendRequestPacket, sendFriendResponsePacket, sendWarpRequest, saveDailyQuests, loadDailyQuests, saveFriendsList, loadFriendsList, saveFishingAlmanac, loadFishingAlmanac, saveAdventureJournal, loadAdventureJournal, saveLoginStreak, loadLoginStreak, broadcastKillStreak, requestCardFusion, requestCardRefine, requestCardEcon, requestOreConversion, requestPetPurchase, requestNpcSale, getClientPing } from '../network/GameSync.js';
import { createAdventureJournal, sanitizeAdventureJournal, recordMonsterDefeat, masteryForKills, getMonsterJournalEntry, summarizeJournal } from '../progression/AdventureJournal.js';
import { hydrateMonsterPortraits } from './MonsterPortraitRenderer.js';
import { observeItemPortraits } from './ItemPortraitRenderer.js';
import { LayoutManager } from './LayoutManager.js';
import { PlayerProfileModal } from './PlayerProfileModal.js';
import { CardAlbum } from './CardAlbum.js';
import { SKYRAIL_ACTIVITIES, SKYRAIL_MAP_ID, getSkyrailStatus } from '../events/SkyrailBazaar.js';

function petPortraitMarkup(key) {
  const order = ['poring','chick','kitten','puppy','sunfox','moss_turtle','owl','cloudling','moon_hare','baby_dragon','bloom_fairy','ember_phoenix'];
  const index = Math.max(0, order.indexOf(key));
  const col = index % 4;
  const row = Math.floor(index / 4);
  const x = col * 100 / 3;
  const y = row * 50;
  return `<span class="pet-atlas-portrait" aria-hidden="true" style="--pet-x:${x}%;--pet-y:${y}%"></span>`;
}
import { escapeOnlineText, formatOnlinePlayerMeta } from './OnlinePlayerMeta.js';
import { petModelMarkup, PetLiveViewer } from '../engine/PetPreview.js';
import {
  displayedCharacterUid,
  isRawCharacterUid,
  isTradeCharacterOnline,
  mergeTradeRecipients,
  resolveTradeRecipientInput,
} from './CardTradeRecipient.js';
import { migrateLegacyCards } from '../cards/CardMigration.js';
import { getCard } from '../cards/CardCatalog.js';

// Maps each skill id to a line-art glyph in the #ic-* SVG sprite (index.html),
// so the skill bar shows clean professional icons instead of emoji.
const SKILL_GLYPHS = {
  bash: 'ic-bash', heal: 'ic-heal', magnumBreak: 'ic-magnum',
  endure: 'ic-shield', fireBolt: 'ic-fire', frostNova: 'ic-frost',
  energyCoat: 'ic-orb', doubleStrafe: 'ic-arrow', arrowShower: 'ic-arrows',
  concentration: 'ic-target', holyLight: 'ic-holy', blessing: 'ic-bless',
};

export class GameUI {
  constructor(character = null, soundManager = null, combatSystem = null) {
    this.gameScreen = document.getElementById('game-screen');
    this.combatLogEl = document.getElementById('combat-log-messages');
    this.chatMessagesAllEl = document.getElementById('chat-messages-all');
    this.chatMessagesEl = document.getElementById('chat-messages');
    this.maxLogMessages = 80;
    this.chatActiveTab = 'all';
    this.inventory = [];
    this.characterId = null;

    this.character = character;
    this.soundManager = soundManager;
    this.combatSystem = combatSystem;
    this.particles = null;
    this._globalListenerRemovers = [];
    this._lifecycleGeneration = 0;
    this._destroyed = false;

    this.currentTab = 'all';
    this.selectedItemName = null;
    this.cardAlbum = null;
    this.cardDropRevealQueue = [];
    this.adventureJournal = createAdventureJournal();
    this._journalSaveTimer = null;

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
    this._itemPortraitObserver = observeItemPortraits(this.gameScreen || document.body);
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
    this._networkStatusInterval = setInterval(() => {
      if (!document.hidden) this.updateNetworkStatus();
    }, 2000);
  }

  async updateNetworkStatus() {
    if (this._destroyed || !this.networkDot || !this.networkText || this._networkStatusInFlight) return;
    const generation = this._lifecycleGeneration;
    const isCurrent = () => !this._destroyed && generation === this._lifecycleGeneration;
    this._networkStatusInFlight = true;
    try {

    const { isSocketConnected, isSocketMode } = await import('../network/SocketClient.js');
    if (!isCurrent()) return;
    const connected = isSocketConnected();
    const socketMode = isSocketMode();

    const { isOfflineMode } = await import('../network/SupabaseClient.js');
    if (!isCurrent()) return;

    if (!socketMode) {
      this.networkDot.style.background = isOfflineMode ? '#888' : '#40a0ff';
      this.networkText.textContent = isOfflineMode ? 'LOCAL' : 'CLOUD';
      this.networkText.style.color = isOfflineMode ? '#aaa' : '#40a0ff';
      if (this.networkStatusEl) this.networkStatusEl.style.color = isOfflineMode ? '#aaa' : '#40a0ff';
    } else if (connected) {
      // Use client-measured ping (RTT from client_ping/client_pong)
      let ping = this.myPing;
      try {
        const { getClientPing } = await import('../network/GameSync.js');
        if (!isCurrent()) return;
        const cp = getClientPing();
        if (cp != null) {
          ping = cp;
          this.myPing = cp;
        }
      } catch (e) { /* ignore */ }
      const pingStr = ping != null ? ` ${ping}ms` : '';
      this.networkText.textContent = 'ONLINE' + pingStr;

      let color = '#46e08a';
      if (ping != null) {
        if (ping >= 160) {
          color = '#ff7a90';
        } else if (ping >= 80) {
          color = '#ffcf5a';
        }
      }
      this.networkDot.style.background = color;
      this.networkText.style.color = color;
      if (this.networkStatusEl) this.networkStatusEl.style.color = color;
    } else {
      this.networkDot.style.background = '#f44';
      this.networkText.textContent = 'OFFLINE';
      this.networkText.style.color = '#f44';
      if (this.networkStatusEl) this.networkStatusEl.style.color = '#f44';
    }

    // Update map name and ping in local HUD
    this._updateHUDMapAndPing();
    } finally {
      this._networkStatusInFlight = false;
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
    if (this._destroyed) return;
    this._destroyed = true;
    this._lifecycleGeneration++;
    this._mobileControlCleanup?.();
    for (const remove of this._globalListenerRemovers.splice(0)) remove();
    this.cardAlbum?.destroy();
    this.cardAlbum = null;
    this._petViewer?.destroy?.();
    this._petViewer = null;
    this.playerProfileModal?.destroy?.();
    this.playerProfileModal = null;
    this.layoutManager?._disableDragging?.();
    document.removeEventListener('keydown', this._petBoutiqueEscapeHandler);
    this._petBoutiqueEscapeHandler = null;
    this.cardDropRevealQueue.length = 0;
    this._itemPortraitObserver?.disconnect?.();
    this._itemPortraitObserver = null;
    clearInterval(this._networkStatusInterval);
    this._networkStatusInterval = null;
    this._networkStatusInFlight = false;
    clearInterval(this._onlinePlayersInterval);
    this._onlinePlayersInterval = null;
    clearTimeout(this._equipToastTimer);
    clearTimeout(this._duelOverlayTimer);
    clearTimeout(this._chatIdleTimer);
    clearTimeout(this._journalSaveTimer);
    clearTimeout(this._cardTradeSuggestTimer);
    clearTimeout(this.tradeTimeout);
    this._equipToastTimer = null;
    this._duelOverlayTimer = null;
    this._chatIdleTimer = null;
    this._journalSaveTimer = null;
    this._cardTradeSuggestTimer = null;
    this.tradeTimeout = null;
    if (window.gameUI === this) window.gameUI = null;
  }

  _listenGlobal(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._globalListenerRemovers.push(() => target.removeEventListener(type, handler, options));
  }

  _isCharacterLoadCurrent(characterId, generation) {
    return !this._destroyed
      && generation === this._lifecycleGeneration
      && this.characterId === characterId;
  }

  _setupPanels() {
    // Compact categorized bottom HUD. Existing action IDs stay on the real
    // buttons, so grouping does not change any gameplay behavior.
    const hudTriggers = document.querySelectorAll('.hud-menu-trigger');
    const closeHudMenus = (except = null) => {
      document.querySelectorAll('.hud-menu-popover').forEach(panel => {
        if (panel !== except) panel.hidden = true;
      });
      hudTriggers.forEach(trigger => {
        const panel = document.querySelector(`[data-hud-panel="${trigger.dataset.hudMenu}"]`);
        trigger.setAttribute('aria-expanded', String(panel ? !panel.hidden : false));
      });
    };
    hudTriggers.forEach(trigger => {
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        const panel = document.querySelector(`[data-hud-panel="${trigger.dataset.hudMenu}"]`);
        if (!panel) return;
        const willOpen = panel.hidden;
        closeHudMenus(panel);
        panel.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
    });
    document.querySelectorAll('.hud-menu-popover .hud-btn').forEach(button => {
      button.addEventListener('click', () => closeHudMenus());
    });
    this._listenGlobal(document, 'click', event => {
      if (!event.target.closest?.('#hud-bottom')) closeHudMenus();
    });
    this._listenGlobal(document, 'keydown', event => {
      if (event.key === 'Escape') closeHudMenus();
    });

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
    const petBoutique = document.getElementById('pet-boutique-modal');
    if (petBoutique) petBoutique.style.display = 'none';
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

    // Full-screen boutique overlays must also suppress the floating joystick
    // and action buttons. Their mobile layer otherwise intercepts every tap.
    for (const id of ['pet-boutique-modal', 'divine-shop-modal']) {
      const shopModal = document.getElementById(id);
      if (!shopModal) continue;
      const display = shopModal.style.display || window.getComputedStyle(shopModal).display;
      if (display !== 'none') anyPanelOpen = true;
    }

    if (anyPanelOpen) {
      document.body.classList.add('panels-open');
    } else {
      document.body.classList.remove('panels-open');
    }
  }

  // ============ Map Name Update ============
  setMapName(mapName, mapId) {
    if (mapId) {
      this.currentMapId = mapId;
    }
    this._updateHUDMapAndPing();
    if (mapId) {
      // Refresh online players list when map changes to filter correctly
      this._renderOnlinePlayers();
    }
    this._syncSkyrailHud();
  }

  _syncSkyrailHud() {
    const active = this.currentMapId === SKYRAIL_MAP_ID;
    let hud = document.getElementById('skyrail-event-hud');
    if (!active) {
      if (hud) hud.remove();
      if (this._skyrailHudTimer) clearInterval(this._skyrailHudTimer);
      this._skyrailHudTimer = null;
      return;
    }
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'skyrail-event-hud';
      hud.style.cssText = 'position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:850;width:min(520px,calc(100vw - 24px));padding:10px 14px;border:1px solid rgba(255,205,92,.55);border-radius:14px;background:linear-gradient(135deg,rgba(38,22,68,.94),rgba(90,39,91,.94));box-shadow:0 8px 30px rgba(0,0,0,.45);color:#fff;pointer-events:auto';
      document.body.appendChild(hud);
    }
    const render = () => {
      const status = getSkyrailStatus();
      if (!status.isOpen) {
        hud.innerHTML = '<b>🚉 Skyrail Bazaar ปิดแล้ว</b><div style="font-size:11px;color:#d6c8e8">เปิดอีกครั้งทุกวัน 18:00 น.</div>';
        return;
      }
      const remaining = `${String(Math.floor(status.remainingSeconds / 60)).padStart(2, '0')}:${String(status.remainingSeconds % 60).padStart(2, '0')}`;
      hud.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><span style="font-size:25px">${status.current.icon}</span><div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:900;color:#ffe28a">${status.current.name}</div><div style="font-size:10px;color:#e1d8f1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${status.current.desc}</div></div><b style="font-size:14px;color:#7fffe0">${remaining}</b></div>${status.next ? `<div style="font-size:9px;color:#b9a8cf;margin-top:5px">ถัดไป ${status.next.start} · ${status.next.icon} ${status.next.name}</div>` : ''}`;
    };
    render();
    if (!this._skyrailHudTimer) this._skyrailHudTimer = setInterval(render, 1000);
  }

  _updateHUDMapAndPing() {
    const mapId = this.currentMapId || 'prontera';
    const MAP_NAMES_TH = {
      prontera: 'เมืองประเทอร์รา',
      prontera_field: 'ทุ่งประเทอร์รา',
      payon: 'ป่าเปยอง',
      glast_heim: 'ปราสาทกลาสท์ไฮม์',
      mjolnir: 'เทือกเขาหมิโอลนีร์',
      abyss_lake: 'ทะเลสาบห้วงลึก',
      svarrga: 'สรวงสวรรค์'
      ,skyrail_bazaar: 'ตลาดเวหา Skyrail'
    };
    const mapName = MAP_NAMES_TH[mapId] || mapId;
    const el = document.getElementById('map-name');
    if (el) {
      el.innerHTML = `📍 ${mapName}`;
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

    // Live pet level + XP badge.
    this.updatePetHud();
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
    const generation = this._lifecycleGeneration;
    const isCurrent = () => this._isCharacterLoadCurrent(characterId, generation);
    try {
      const rawInv = await loadInventory(characterId);
      if (!isCurrent()) return;
      const migration = migrateLegacyCards(rawInv, this.character?.equippedCards);
      const knownCards = rawInv.filter(row => row.item_type === 'card'
        && (getCard(row.item_name) || getCard(row.stats?.card_id)));
      const seenCardIds = new Set();
      const needsMigration = knownCards.some((row) => {
        const card = getCard(row.item_name) || getCard(row.stats?.card_id);
        const duplicate = seenCardIds.has(card.id);
        const stars = Math.min(5, Math.max(1, Math.floor(Number(row.stats?.card_stars) || 1)));
        seenCardIds.add(card.id);
        return duplicate || row.item_name !== card.itemName || row.stats?.card_id !== card.id
          || row.stats?.card_stars !== stars;
      });
      if (needsMigration) {
        for (const itemName of new Set(knownCards.map(row => row.item_name))) {
          await setInventoryItemQuantity(characterId, itemName, 'card', 0);
          if (!isCurrent()) return;
        }
        for (const row of migration.inventory) {
          if (row.item_type === 'card' && getCard(row.item_name)) {
            await setInventoryItemQuantity(characterId, row.item_name, 'card', row.quantity, row.stats);
            if (!isCurrent()) return;
          }
        }
      }
      this.inventory = migration.inventory.filter(i => i.item_type !== 'system').map(i => this._enrichItem(i));
      if (this.character) this.character.cardState = migration.cardState;

      // --- Self-heal for the quantity-inflation bug ---
      // A prior bug re-added the whole stack on every save/equip, ballooning
      // quantities into the tens/hundreds of thousands. Repair on load:
      // non-stackable items (gear/pets/tools) can only ever be 1; stackables
      // are clamped to a sane cap. Corrections are persisted (SET, not add) so
      // the fix is durable. Harmless once quantities are already sane.
      // Pets are excluded: they no longer force-to-1 because each pet is now an
      // individual instance stored inside one row's stats (quantity = count).
      const NON_STACK = new Set(['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses', 'tool']);
      const MAX_STACK = 9999;
      for (const it of this.inventory) {
        const before = it.quantity;
        if (NON_STACK.has(it.item_type)) {
          if (it.quantity !== 1) it.quantity = 1;
        } else if (it.quantity > MAX_STACK) {
          it.quantity = MAX_STACK;
        }
        if (it.quantity !== before && this.characterId) {
          setInventoryItemQuantity(this.characterId, it.item_name, it.item_type, it.quantity, it.stats || {}).catch(() => { });
        }
      }

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

      // Normalize every pet row into per-pet instances (migrates legacy stacks),
      // then re-summon whichever instance was out.
      for (const it of this.inventory) {
        if (it.item_type === 'pet') this._ensurePetInstances(it);
      }
      const equippedPetRow = this.inventory.find(i => i.item_type === 'pet' && i.stats && i.stats.equipped === true && i.stats.equippedUid);
      const equippedInst = equippedPetRow
        ? (equippedPetRow.stats.instances || []).find(x => x.uid === equippedPetRow.stats.equippedUid)
        : null;
      if (this.character && this.character.setPet) {
        if (equippedPetRow && equippedInst) {
          this.character.setPet(petModelOf(equippedPetRow.item_name), equippedInst.level || 1, equippedInst.xp || 0, equippedInst.name || null);
          this.character.equippedPetUid = equippedInst.uid;
        } else {
          this.character.setPet(null);
          this.character.equippedPetUid = null;
        }
      }

      // Restore socketed cards: rebuild equippedCards from card items flagged
      // equipped + a valid slot. Skips any whose slot no longer accepts it.
      if (this.character && this.character.equippedCards) {
        for (const s of Object.keys(this.character.equippedCards)) this.character.equippedCards[s] = null;
        // Fix Issue 1: CardMigration returns array-valued sockets [id, null, ...].
        // CharacterManager expects scalar values. Extract the first card.
        for (const [slot, value] of Object.entries(migration.equippedCards)) {
          const cardId = Array.isArray(value) ? value.find(v => v !== null) : value;
          if (cardId) this.character.equipCard(slot, cardId);
        }
      }

      // Apply the refine (+N) bonuses of everything equipped.
      this._syncEquipRefine();

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
      if (!isCurrent()) return;
      console.error('Failed to load inventory:', e);
      this.inventory = [];
    }
    if (!isCurrent()) return;
    this._renderInventory();
  }

  // ============ Daily Quests load/save helpers ============
  async loadDailyQuestsFromDB(characterId) {
    if (!characterId) return;
    this.characterId = characterId;
    const generation = this._lifecycleGeneration;
    try {
      const localKey = `zolos_daily_quests_${characterId}`;
      let localData = null;
      try {
        const stored = localStorage.getItem(localKey);
        if (stored) localData = JSON.parse(stored);
      } catch (e) { }

      // Load from DB
      const dbQuests = await loadDailyQuests(characterId);
      if (!this._isCharacterLoadCurrent(characterId, generation)) return;
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
        if (!this._isCharacterLoadCurrent(characterId, generation)) return;
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
    this.characterId = characterId;
    const generation = this._lifecycleGeneration;
    try {
      const localKey = `zolos_friends_${characterId}`;
      let localFriends = [];
      try {
        const stored = localStorage.getItem(localKey);
        if (stored) localFriends = JSON.parse(stored);
      } catch (e) { }

      const dbFriends = await loadFriendsList(characterId);
      if (!this._isCharacterLoadCurrent(characterId, generation)) return;
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
    // Fold live pet growth into its item's stats so it's saved with the batch.
    this._syncPetItemStats();
    // Fold live card sockets into card-row stats so they're saved with the batch.
    this._syncCardItemStats();
    const { setInventoryItemQuantity } = await import('../network/GameSync.js');

    // Flush ALL items (not just equipped ones) so that items bought but never
    // equipped still have a confirmed DB row with the right quantity.
    // IMPORTANT: SET the absolute quantity from our in-memory truth. Using the
    // delta-based saveInventoryItem here re-added the whole stack every flush,
    // which inflated quantities without bound (the "หลักหมื่นหลักแสน" bug).
    for (const item of this.inventory) {
      try {
        await setInventoryItemQuantity(this.characterId, item.item_name, item.item_type, item.quantity, item.stats || {});
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
    const generation = this._lifecycleGeneration;
    this.almanac = { caught: [], claimed: [], counts: {} };
    try {
      const localKey = `zolos_almanac_${characterId}`;
      let local = null;
      try { const s = localStorage.getItem(localKey); if (s) local = JSON.parse(s); } catch (e) { }
      const db = await loadFishingAlmanac(characterId);
      if (!this._isCharacterLoadCurrent(characterId, generation)) return;
      // Merge DB + local so nothing is ever lost (union of caught species)
      const merged = { caught: [], claimed: [], counts: {} };
      const caught = new Set([...(db?.caught || []), ...(local?.caught || [])]);
      const claimed = new Set([...(db?.claimed || []), ...(local?.claimed || [])]);
      merged.caught = [...caught];
      merged.claimed = [...claimed];
      for (const name of caught) {
        const dbCount = Number(db?.counts?.[name]) || 0;
        const localCount = Number(local?.counts?.[name]) || 0;
        merged.counts[name] = Math.max(1, dbCount, localCount);
      }
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
    if (!this.almanac) this.almanac = { caught: [], claimed: [], counts: {} };
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
    if (!this.almanac) this.almanac = { caught: [], claimed: [], counts: {} };
    if (!this.almanac.counts) this.almanac.counts = {};
    const firstDiscovery = !this.almanac.caught.includes(name);
    this.almanac.counts[name] = (Number(this.almanac.counts[name]) || 0) + 1;
    if (!firstDiscovery) {
      this._saveFishingAlmanac();
      const modal = document.getElementById('almanac-modal');
      if (modal && modal.style.display !== 'none') this._renderAlmanac();
      return;
    }

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
        #almanac-card .almanac-fish-slot{appearance:none;color:inherit;font:inherit;cursor:pointer;transition:transform .16s,border-color .16s,background .16s;}
        #almanac-card .almanac-fish-slot:hover,#almanac-card .almanac-fish-slot:focus-visible{transform:translateY(-2px);border-color:#69b8ff!important;outline:none;}
        #almanac-card .almanac-fish-slot.is-selected{border-color:#ffcf4a!important;background:rgba(255,207,74,.12)!important;box-shadow:0 0 16px rgba(255,207,74,.15);}
        #almanac-card .almanac-detail{display:grid;grid-template-columns:116px minmax(0,1fr);gap:14px;padding:14px;margin-bottom:16px;border:1px solid rgba(103,174,255,.35);border-radius:14px;background:linear-gradient(145deg,rgba(25,54,85,.9),rgba(10,20,36,.94));}
        #almanac-card .almanac-detail-art{display:grid;place-items:center;min-height:112px;border-radius:12px;background:radial-gradient(circle,rgba(74,163,255,.2),rgba(0,0,0,.15));}
        #almanac-card .almanac-detail-art .item-visual{width:104px;height:104px;border-radius:18px;}
        #almanac-card .almanac-sell-player{border:1px solid #59b8ff;border-radius:10px;padding:9px 13px;background:linear-gradient(135deg,#267bd4,#3a9cff);color:#fff;font-weight:800;cursor:pointer;}
        #almanac-card .almanac-sell-player:disabled{opacity:.42;cursor:not-allowed;filter:grayscale(.7);}
        @media (max-width:768px){
          #almanac-modal{align-items:flex-start;padding:8px 8px 116px;}
          #almanac-card{width:100%;max-height:calc(100vh - 132px);max-height:calc(100dvh - 132px);}
          #almanac-card .almanac-detail{grid-template-columns:82px minmax(0,1fr);gap:10px;padding:10px;}
          #almanac-card .almanac-detail-art{min-height:80px;}
          #almanac-card .almanac-detail-art .item-visual{width:74px;height:74px;}
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
    if (!this.almanac) this.almanac = { caught: [], claimed: [], counts: {} };
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

    const selectedName = caught.has(this.selectedAlmanacFish) ? this.selectedAlmanacFish : null;
    const selectedData = selectedName ? FISH_SPECIES[selectedName] : null;
    const selectedInventory = selectedName ? this.inventory.find(item => item.item_name === selectedName && item.item_type === 'fish') : null;
    const lifetimeCaught = selectedName ? Math.max(1, Number(this.almanac.counts?.[selectedName]) || 0) : 0;
    const ownedCount = Number(selectedInventory?.quantity) || 0;
    const tierLabel = { common: 'ธรรมดา', uncommon: 'พบไม่บ่อย', rare: 'หายาก', legendary: 'ตำนาน' };
    const detailPanel = selectedData ? `
      <section class="almanac-detail" aria-live="polite">
        <div class="almanac-detail-art">${itemIconMarkup(selectedName, selectedData.emoji || 'ปลา', 'item-visual--fish-detail')}</div>
        <div style="min-width:0;display:flex;flex-direction:column;gap:7px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><strong style="font-size:18px;color:#f4f8ff;">${esc(selectedName)}</strong><span style="font-size:10px;padding:3px 8px;border-radius:12px;background:rgba(74,163,255,.15);color:#8dccff;">${tierLabel[selectedData.rarity] || esc(selectedData.rarity)}</span></div>
          <div style="font-size:12px;line-height:1.55;color:#c6d4e2;">${esc(selectedData.desc)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;"><span style="padding:5px 8px;border-radius:8px;background:rgba(95,221,122,.1);color:#84e99b;">จับสะสมทั้งหมด <b>${lifetimeCaught.toLocaleString()}</b> ตัว</span><span style="padding:5px 8px;border-radius:8px;background:rgba(255,207,74,.1);color:#ffdc78;">มีในกระเป๋า <b>${ownedCount.toLocaleString()}</b> ตัว</span><span style="padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.06);color:#b9c8d8;">ราคา NPC ${Number(selectedData.price || 0).toLocaleString()} z</span></div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px;"><button class="almanac-sell-player" data-almanac-sell="${esc(selectedName)}" ${ownedCount < 1 ? 'disabled' : ''}>ขายให้ผู้เล่น</button><span data-almanac-market-price="${esc(selectedName)}" style="font-size:10px;color:#8092a5;">กำลังตรวจราคาตลาด...</span></div>
        </div>
      </section>` : '';

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
          class="almanac-fish-slot${selectedName === name ? ' is-selected' : ''}" data-almanac-fish="${has ? esc(name) : ''}" role="${has ? 'button' : 'presentation'}" tabindex="${has ? '0' : '-1'}"
          style="aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;
          background:${has ? 'rgba(74,163,255,.12)' : 'rgba(255,255,255,.03)'};border:1px solid ${has ? m.color + '66' : 'rgba(255,255,255,.06)'};">
          <div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;${has ? '' : 'filter:grayscale(1);opacity:.3;'}">${itemIconMarkup(name, '', 'item-visual--fish')}</div>
          <div style="font-size:8px;text-align:center;line-height:1.1;color:${has ? '#dfe8f2' : '#54606e'};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${has ? esc(name) : '???'}</div>
          ${has ? `<div style="font-size:7px;color:#80a9cf;">จับ ${Math.max(1, Number(this.almanac.counts?.[name]) || 0).toLocaleString()}</div>` : ''}
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
      <div class="almanac-body" style="padding:16px 18px;">${detailPanel}${sections}${grandBanner}</div>`;

    card.querySelector('#almanac-close').onclick = () => {
      const m = document.getElementById('almanac-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    card.querySelectorAll('[data-almanac-claim]').forEach(btn => {
      btn.onclick = () => this._claimAlmanacReward(btn.getAttribute('data-almanac-claim'));
    });
    card.querySelectorAll('[data-almanac-fish]').forEach(slot => {
      const selectFish = () => {
        const name = slot.getAttribute('data-almanac-fish');
        if (!name) return;
        this.selectedAlmanacFish = name;
        this._renderAlmanac();
      };
      slot.onclick = selectFish;
      slot.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFish(); } };
    });
    card.querySelector('[data-almanac-sell]')?.addEventListener('click', event => {
      this._sellFishFromAlmanac(event.currentTarget.getAttribute('data-almanac-sell'));
    });
    if (selectedName) {
      fetchMarketPriceStats(selectedName).then(stats => {
        const node = card.querySelector('[data-almanac-market-price]');
        if (!node || node.getAttribute('data-almanac-market-price') !== selectedName) return;
        node.textContent = stats?.avgPrice
          ? `ราคาตลาดเฉลี่ย ${stats.avgPrice.toLocaleString()} Zeny / ตัว`
          : 'ยังไม่มีข้อมูลราคาตลาด';
      }).catch(() => {});
    }
  }

  async _sellFishFromAlmanac(name) {
    const item = this.inventory.find(row => row.item_name === name && row.item_type === 'fish' && this._sellableQty(row) > 0);
    if (!item) {
      this.addCombatLog('ไม่มีปลาชนิดนี้ในกระเป๋าสำหรับตั้งขาย', 'system');
      return;
    }
    const modal = document.getElementById('almanac-modal');
    if (modal) modal.style.display = 'none';
    this.marketTab = 'sell';
    document.querySelectorAll('.market-tab').forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-tab') === 'sell'));
    this.selectedMarketItem = item;
    this._togglePanel('market-panel');
    await this._renderMarket();
    this._renderMarketSellInventory();
    await this._updateMarketSellForm();
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

  // Reflect a drop in the UI WITHOUT persisting — used when the server already
  // wrote the item to our inventory (Phase 2 server-authoritative drops), so we
  // must not re-add it to the DB.
  addItemLocal(item, qty = 1) {
    const existing = this.inventory.find(i => i.item_name === item.name);
    if (existing) {
      existing.quantity += qty;
    } else {
      this.inventory.push(this._enrichItem({
        item_name: item.name, item_type: item.type, quantity: qty, emoji: item.emoji,
      }));
    }
    this._renderInventory();
    if (this.selectedItemName === item.name) this._updateDetailBox();
  }

  _renderInventory() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.remove('card-album-host');

    // Paper-doll equipment screen shows only on the Equip tab.
    const doll = document.getElementById('equip-doll');
    if (this.currentTab === 'equip') {
      this._renderEquipDoll();
      this._renderLoadoutBar();
    } else {
      if (doll) {
        doll.style.display = 'none';
        this.equipSlotFilter = null;
      }
      const bar = document.getElementById('loadout-bar');
      if (bar) bar.style.display = 'none';
    }

    const detailBox = document.getElementById('item-detail-box');
    if (detailBox) detailBox.style.display = this.currentTab === 'card' ? 'none' : '';

    // The Card tab owns one persistent album instance. Its state providers read
    // the latest authoritative rows every time it renders.
    if (this.currentTab === 'card') {
      this._mountCardAlbum(grid);
      return;
    }

    // Filter based on tab. Pets and cards each live in their own tab, so
    // they're kept out of All / Equip and never mixed in with gear or materials.
    let filtered = this.inventory.filter(i => i.item_type !== 'pet' && i.item_type !== 'card');
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
    } else if (this.currentTab === 'pet') {
      // Expand each owned pet into its own slot so each can be named/summoned.
      filtered = this._allPetInstances().map(pi => ({ __pet: true, item: pi.item, inst: pi.inst }));
    }

    // Fill inventory slots
    const totalSlots = Math.max(25, filtered.length);
    for (let i = 0; i < totalSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';

      if (i < filtered.length) {
        const item = filtered[i];

        // Pet instance slot: one per owned pet, shows its custom name.
        if (item.__pet) {
          const petItem = item.item, inst = item.inst;
          const isEq = this.character && this.character.equippedPetUid === inst.uid;
          if (isEq) slot.classList.add('equipped');
          slot.classList.add(`rarity-${petItem.rarity || 'common'}`);
          const nm = this._petDisplayName(petItem, inst);
          const named = !!(inst && inst.name);
          slot.innerHTML = `
            ${itemIconMarkup(petItem, petItem.emoji)}
            <span class="inv-pet-name" style="position:absolute;bottom:1px;left:0;right:0;font-size:8px;font-weight:700;color:${named ? '#e8dcff' : '#8b82ad'};text-align:center;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px;">${this._short(nm)}</span>
            ${isEq ? '<span class="inv-equipped-badge">E</span>' : ''}
          `;
          slot.title = `${nm} · Lv.${(isEq ? this.character.petLevel : inst.level) || 1}${isEq ? ' — เรียกอยู่' : ''}`;
          if (this.selectedPetUid === inst.uid) slot.classList.add('selected');
          slot.addEventListener('click', () => {
            this.selectedPetUid = inst.uid;
            this._openPetInstance(inst.uid);
          });
          grid.appendChild(slot);
          continue;
        }

        const isEquipped = item.stats && item.stats.equipped === true;
        if (isEquipped) {
          slot.classList.add('equipped');
        }
        slot.classList.add(`rarity-${item.rarity || 'common'}`);

        const rfLvl = item.stats && item.stats.refine ? item.stats.refine : 0;
        slot.innerHTML = `
                  ${itemIconMarkup(item, ITEMS[item.item_name]?.emoji || item.emoji)}
                  <span class="inv-qty">${item.quantity}</span>
                  ${rfLvl > 0 ? `<span style="position:absolute;top:1px;left:3px;font-size:10px;font-weight:900;color:${refineTierColor(rfLvl)};text-shadow:0 1px 2px #000;">+${rfLvl}</span>` : ''}
                  ${isEquipped ? '<span class="inv-equipped-badge">E</span>' : ''}
                `;
        slot.title = `${item.item_name} x${item.quantity}${isEquipped ? ' (Equipped)' : ''}`;

        if (this.selectedItemName === item.item_name) {
          slot.classList.add('selected');
        }

        const equippable = ['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses', 'pet'].includes(item.item_type);
        slot.addEventListener('click', () => {
          document.querySelectorAll('.inv-slot').forEach(s => s.classList.remove('selected'));
          slot.classList.add('selected');
          this.selectedItemName = item.item_name;
          this._updateDetailBox();
          // On the Equip screen a single tap equips/unequips right away — the
          // detail box's "สวมใส่" button sits below the paper-doll and is easy
          // to miss on mobile, which made gear feel un-equippable.
          if ((this.currentTab === 'equip' || this.currentTab === 'pet') && equippable) {
            this._toggleEquipItem(item);
          }
        });
      }

      grid.appendChild(slot);
    }

    this._updateDetailBox();
  }

  _mountCardAlbum(grid) {
    if (!this.cardAlbum) {
      this.cardAlbum = new CardAlbum({
        cardState: () => this.character?.cardState || {},
        equippedSlots: () => this.character?.equippedCards || {},
        socketSlots: () => EQUIP_SLOTS.map(slot => ({
          id: slot.id,
          label: slot.label,
          category: cardCategoryForSlot(slot.id),
        })),
        onSocket: async (cardId, slotId) => {
          const card = getCard(cardId);
          if (!card) return false;
          await this._socketCard(slotId, card.itemName);
          return this.character?.equippedCards?.[slotId] === card.id;
        },
        onUnsocket: async (slotId) => {
          await this._unsocketCard(slotId);
          return !this.character?.equippedCards?.[slotId];
        },
        onFuse: cardId => this.requestCardFusion(cardId),
        onFuseWithDust: cardId => this.requestCardFusion(cardId, undefined, { useDust: true }),
        onRefine: (cardId, count) => this.requestCardRefine(cardId, count),
        stardust: () => this.character?.stardust || 0,
        cardEconomy: () => this.cardEconomy || {},
        onSell: cardId => this._openCardTrade(cardId),
        onRareDrop: (card) => {
          window.globalAnnouncements?.addAnnouncement?.({
            type: 'rare-drop',
            playerName: this.character?.name || this.character?.stats?.name || 'You',
            itemName: card.itemName,
            rarity: card.rarity,
            icon: '✦',
            color: RARITY_COLOR[card.rarity],
          });
        },
      });
    }
    this.cardAlbum.mount(grid);
    // Pull the Stardust balance + economy rates so the album header + fusion
    // forge can show them (server replies via onCardEcon).
    try { requestCardEcon(); } catch { /* offline / not connected */ }
    const pendingReveals = this.cardDropRevealQueue.splice(0);
    for (const reveal of pendingReveals) {
      this.cardAlbum.showDropReveal(reveal.cardId, reveal.context);
    }
  }

  refreshCardAlbum() {
    if (!this.cardAlbum) return;
    const mycardOpen = document.getElementById('mycard-panel')?.style.display !== 'none';
    if (this.currentTab === 'card' || mycardOpen) this.cardAlbum.render();
  }

  // Cards are traded ONLY player-to-player through a dedicated P2P modal —
  // never through the market or the NPC shop. Open that modal with this card
  // preselected; the seller then enters the recipient's UID and a price
  // (0 = free) and a live trade popup is delivered to the recipient.
  _openCardTrade(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    // The card row must have at least one spare copy to send. A socketed card
    // keeps its whole stack in one row (quantity stays intact) but reserves the
    // single copy that is actually socketed — see _sellableQty.
    const row = (this.inventory || []).find(i =>
      i.item_type === 'card' && getCard(i.item_name)?.id === cardId && (i.quantity || 0) >= 1);
    if (!row || this._sellableQty(row) < 1) {
      this.addCombatLog('❌ ไม่มีการ์ดใบนี้เหลือให้โอน (การ์ดที่ใส่ในช่องอยู่ต้องถอดก่อน หรือมีเพียงใบเดียว)', 'warning');
      return;
    }
    this._cardTradeItem = row;

    const sellable = this._sellableQty(row);
    const iconEl = document.getElementById('card-trade-icon');
    if (iconEl) iconEl.innerHTML = this._itemIconHtml(row);
    const nameEl = document.getElementById('card-trade-name');
    if (nameEl) nameEl.textContent = card.displayName || card.itemName || row.item_name;
    const ownedEl = document.getElementById('card-trade-owned');
    if (ownedEl) ownedEl.textContent = `ส่งได้สูงสุด: ${sellable} ใบ`;

    const uidInput = document.getElementById('card-trade-uid-input');
    if (uidInput) uidInput.value = '';
    const qtyInput = document.getElementById('card-trade-qty-input');
    if (qtyInput) { qtyInput.value = 1; qtyInput.max = sellable; }
    const priceInput = document.getElementById('card-trade-price-input');
    if (priceInput) priceInput.value = 0;
    const statusEl = document.getElementById('card-trade-status');
    if (statusEl) statusEl.textContent = '';
    const waiting = document.getElementById('card-trade-waiting');
    if (waiting) waiting.style.display = 'none';
    // Clear autocomplete state
    this._cardTradeResolvedTarget = null;
    const suggestBox = document.getElementById('card-trade-suggest');
    if (suggestBox) suggestBox.style.display = 'none';
    const resolvedBox = document.getElementById('card-trade-resolved');
    if (resolvedBox) resolvedBox.style.display = 'none';

    const modal = document.getElementById('card-trade-modal');
    if (modal) modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  showCardDropReveal(cardId, context = {}) {
    if (this.cardAlbum) return this.cardAlbum.showDropReveal(cardId, context);
    this.cardDropRevealQueue.push({ cardId, context });
    return Promise.resolve(false);
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
      @media (hover: hover) {
        .eq-slot:hover{transform:translateY(-2px);border-color:rgba(150,180,255,.6);box-shadow:0 4px 14px rgba(60,90,190,.35);}
      }
      .eq-slot:active{transform:translateY(1px);border-color:rgba(150,180,255,.6);}
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
      /* Card socket: a small gem-frame at the bottom-left of each gear slot. */
      .eq-card-socket{position:absolute;left:3px;bottom:2px;width:20px;height:20px;border-radius:6px;
        display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;cursor:pointer;
        background:rgba(6,10,20,.85);border:1.5px solid rgba(150,160,190,.5);box-shadow:0 1px 3px rgba(0,0,0,.5);
        transition:transform .1s,box-shadow .15s,border-color .15s;z-index:2;}
      @media (hover: hover) {
        .eq-card-socket:hover{transform:scale(1.18);box-shadow:0 0 10px rgba(160,190,255,.7);}
      }
      .eq-card-socket.empty{color:#7c88a8;border-style:dashed;}
      .eq-card-socket.filled{background:radial-gradient(circle at 40% 30%,rgba(60,70,110,.9),rgba(10,14,28,.95));}
      .eq-card-socket.rc-common{border-color:#b8c0cc;}
      .eq-card-socket.rc-rare{border-color:#5aa9ff;box-shadow:0 0 8px rgba(90,169,255,.6);}
      .eq-card-socket.rc-epic{border-color:#c07bff;box-shadow:0 0 9px rgba(192,123,255,.65);}
      .eq-card-socket.rc-legendary{border-color:#ffb43a;box-shadow:0 0 11px rgba(255,180,58,.75);}
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
      // Card socket takes priority over the gear slot it sits inside.
      const socket = e.target.closest('.eq-card-socket');
      if (socket) {
        e.stopPropagation();
        this._openCardPicker(socket.getAttribute('data-cardslot'));
        return;
      }
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
      const ic = filled && it
        ? itemIconMarkup(name, '', 'item-visual--equipped')
        : `<span class="empty-slot-mark" data-slot-kind="${slot.id}" aria-hidden="true"></span>`;
      // Card socket for this slot (shows the socketed card, or a ＋ to add one).
      const cardId = (ch.equippedCards && ch.equippedCards[slot.id]) || null;
      const card = cardId && getCard(cardId);
      const cardName = card?.itemName || cardId;
      const cardRar = card?.rarity || 'common';
      const socket = cardId
        ? `<div class="eq-card-socket filled rc-${cardRar}" data-cardslot="${slot.id}" title="การ์ด: ${cardName} — แตะเพื่อเปลี่ยน/ถอด"><img src="${card?.art || '/assets/items/fallback/unknown-loot.png'}" alt=""></div>`
        : `<div class="eq-card-socket empty" data-cardslot="${slot.id}" title="ช่องการ์ด (ว่าง) — แตะเพื่อใส่การ์ด">＋</div>`;
      return `<div class="eq-slot ${filled ? 'filled' : 'empty'}${rarity ? ' rarity-' + rarity : ''}${filterCls}"
        data-slot="${slot.id}" ${filled ? `data-item="${name}"` : ''}
        title="${filled ? name : slot.label + ' (ว่าง)'}">
        <div class="eq-slot-ic">${ic}</div>
        <div class="eq-slot-lb">${filled ? (this._refinePrefix(name) + this._short(name)) : slot.label}</div>
        ${filled ? '<div class="eq-slot-x">✕</div>' : ''}
        ${socket}
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

  // ===== LOADOUT SETS (PUBG-style outfit presets) =====
  // A "เซ็ทชุด" is a saved snapshot of what's worn in every EQUIP_SLOTS slot.
  // Tapping one re-equips the whole outfit at once, so players can switch a
  // full class/costume build in one tap. Stored per-character in localStorage
  // (they only reference owned item names — no server state needed).

  _loadoutKey() {
    return `zolos_loadouts_${this.characterId || 'guest'}`;
  }

  // Sets live on the character (persisted inside the appearance JSON so they
  // sync across devices). localStorage is only a local cache/fallback used
  // before the character has loaded or when offline.
  _getLoadouts() {
    const ch = this.character;
    if (ch && Array.isArray(ch.loadouts)) return ch.loadouts;
    try {
      const raw = localStorage.getItem(this._loadoutKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  _saveLoadouts(arr) {
    const list = Array.isArray(arr) ? arr : [];
    if (this.character) this.character.loadouts = list;
    // Local cache (instant, survives reload before the DB round-trip / offline).
    try { localStorage.setItem(this._loadoutKey(), JSON.stringify(list)); }
    catch { /* localStorage unavailable / full */ }
    // Persist to the DB so the sets follow the player to other devices. Rides
    // inside the appearance JSON via saveStatsToDatabase (online or offline).
    if (this.character && this.characterId && this.character.saveStatsToDatabase) {
      Promise.resolve()
        .then(() => this.character.saveStatsToDatabase())
        .catch(() => { /* best-effort; local cache still holds the sets */ });
    }
  }

  // Snapshot the currently-worn item in every slot (name or null).
  _captureCurrentLoadout() {
    const slots = {};
    for (const s of EQUIP_SLOTS) slots[s.id] = this._slotItemName(s.id) || null;
    return slots;
  }

  // True if a saved set's slots exactly match what's worn right now.
  _loadoutIsActive(set) {
    if (!set || !set.slots) return false;
    for (const s of EQUIP_SLOTS) {
      if ((set.slots[s.id] || null) !== (this._slotItemName(s.id) || null)) return false;
    }
    return true;
  }

  // Equip a saved set: bring every slot to match the snapshot. Missing items
  // (sold/lost) or class-locked weapons are skipped with a heads-up.
  async _applyLoadout(set) {
    if (!set || !set.slots || !this.character) return;
    let missing = 0;
    for (const s of EQUIP_SLOTS) {
      const desired = set.slots[s.id] || null;
      const current = this._slotItemName(s.id) || null;
      if (desired === current) continue;

      if (desired) {
        // Equipping auto-swaps out whatever shares the slot.
        const it = (this.inventory || []).find(i => i.item_name === desired && !(i.stats && i.stats.equipped));
        if (it) {
          await this._toggleEquipItem(it);
        } else if (!(this.inventory || []).some(i => i.item_name === desired)) {
          missing++;
        }
      } else if (current) {
        // Slot should be empty — take off what's worn there.
        const it = (this.inventory || []).find(i => i.item_name === current && i.stats && i.stats.equipped);
        if (it) await this._toggleEquipItem(it);
      }
    }
    this._equipToast(`สวมเซ็ท "${set.name}"`, true);
    if (missing > 0) {
      this.addCombatLog(`⚠️ เซ็ท "${set.name}": มี ${missing} ชิ้นที่ไม่มีในกระเป๋าแล้ว จึงข้ามไป`, 'warning');
    }
    this._refreshLoadoutBars();
  }

  // Save the current outfit as a new set (asks for a name).
  _saveCurrentLoadout() {
    const sets = this._getLoadouts();
    const dflt = `ชุดที่ ${sets.length + 1}`;
    const name = (window.prompt('ตั้งชื่อเซ็ทชุดนี้', dflt) || '').trim();
    if (!name) return; // cancelled
    sets.push({ id: `ld_${Date.now()}`, name: name.slice(0, 24), slots: this._captureCurrentLoadout() });
    this._saveLoadouts(sets);
    this._equipToast(`บันทึกเซ็ท "${name}" แล้ว`, true);
    this._refreshLoadoutBars();
  }

  _renameLoadout(id) {
    const sets = this._getLoadouts();
    const set = sets.find(s => s.id === id);
    if (!set) return;
    const name = (window.prompt('เปลี่ยนชื่อเซ็ท', set.name) || '').trim();
    if (!name) return;
    set.name = name.slice(0, 24);
    this._saveLoadouts(sets);
    this._refreshLoadoutBars();
  }

  _deleteLoadout(id) {
    const sets = this._getLoadouts();
    const set = sets.find(s => s.id === id);
    if (!set) return;
    if (!window.confirm(`ลบเซ็ท "${set.name}"?`)) return;
    this._saveLoadouts(sets.filter(s => s.id !== id));
    this._refreshLoadoutBars();
  }

  // Overwrite an existing set with the current outfit.
  _updateLoadout(id) {
    const sets = this._getLoadouts();
    const set = sets.find(s => s.id === id);
    if (!set) return;
    set.slots = this._captureCurrentLoadout();
    this._saveLoadouts(sets);
    this._equipToast(`อัปเดตเซ็ท "${set.name}" ตามชุดปัจจุบัน`, true);
    this._refreshLoadoutBars();
  }

  // A couple of representative emoji so each set chip is recognisable at a glance.
  _loadoutPreviewIcons(set) {
    const pick = ['weapon', 'hat', 'body', 'garment']
      .map(id => set.slots && set.slots[id])
      .filter(Boolean)
      .map(name => ITEMS[name]?.emoji)
      .filter(Boolean)
      .slice(0, 3);
    return pick.length ? pick.join('') : '👤';
  }

  _ensureLoadoutBar() {
    if (document.getElementById('loadout-bar')) return;
    const doll = document.getElementById('equip-doll');
    const grid = document.getElementById('inventory-grid');
    const anchor = doll || grid;
    if (!anchor || !anchor.parentNode) return;

    if (!document.getElementById('loadout-bar-styles')) {
      const st = document.createElement('style');
      st.id = 'loadout-bar-styles';
      st.textContent = `
      .loadout-bar{margin:6px 0 4px;}
      .loadout-bar-title{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;
        color:#aeb8d6;letter-spacing:.4px;margin:0 2px 6px;}
      .loadout-bar-title .lb-hint{font-weight:500;color:#7c88a8;font-size:10px;}
      .loadout-scroll{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:2px 2px 8px;
        scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;}
      .loadout-scroll::-webkit-scrollbar{height:5px;}
      .loadout-scroll::-webkit-scrollbar-thumb{background:rgba(120,150,220,.4);border-radius:4px;}
      .ld-chip{flex:0 0 auto;scroll-snap-align:start;position:relative;min-width:92px;max-width:120px;
        display:flex;flex-direction:column;gap:3px;padding:8px 10px 7px;border-radius:12px;cursor:pointer;
        background:linear-gradient(160deg,rgba(30,40,72,.85),rgba(16,20,34,.9));
        border:1.5px solid rgba(120,140,200,.28);transition:transform .1s,border-color .15s,box-shadow .15s;user-select:none;}
      @media (hover:hover){.ld-chip:hover{transform:translateY(-2px);border-color:rgba(150,180,255,.6);box-shadow:0 4px 14px rgba(60,90,190,.35);}}
      .ld-chip:active{transform:translateY(1px);}
      .ld-chip.active{border-color:#7fe0ff;box-shadow:0 0 12px rgba(127,224,255,.5);}
      .ld-chip-ic{font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));}
      .ld-chip-nm{font-size:11px;font-weight:700;color:#e8ecff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .ld-chip.active .ld-chip-nm{color:#bff0ff;}
      .ld-chip-tools{display:flex;gap:8px;margin-top:1px;}
      .ld-chip-tools span{font-size:11px;color:#9fb0e0;line-height:1;padding:1px 2px;border-radius:5px;}
      @media (hover:hover){.ld-chip-tools span:hover{color:#fff;background:rgba(120,150,220,.35);}}
      .ld-chip-badge{position:absolute;top:4px;right:6px;font-size:9px;color:#7fe0ff;font-weight:800;}
      .ld-add{flex:0 0 auto;min-width:92px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
        padding:8px 10px;border-radius:12px;cursor:pointer;border:1.5px dashed rgba(130,160,230,.45);
        background:rgba(20,26,46,.5);color:#aeb8d6;transition:border-color .15s,color .15s,background .15s;}
      @media (hover:hover){.ld-add:hover{border-color:#8fd0ff;color:#fff;background:rgba(40,60,110,.5);}}
      .ld-add .ld-add-ic{font-size:20px;line-height:1;}
      .ld-add .ld-add-lb{font-size:10.5px;font-weight:700;}
      `;
      document.head.appendChild(st);
    }

    const bar = document.createElement('div');
    bar.id = 'loadout-bar';
    bar.className = 'loadout-bar';
    // Sit ABOVE the paper-doll so worn gear + sets are at the very top.
    anchor.parentNode.insertBefore(bar, anchor);
    this._wireLoadoutBar(bar);
  }

  // One delegated click handler per bar element: wear a set, edit/delete via its
  // tool row, or add a new one. Shared by the Equip-tab bar and the Profile bar.
  _wireLoadoutBar(bar) {
    if (!bar || bar._ldWired) return;
    bar._ldWired = true;
    bar.addEventListener('click', (e) => {
      const tool = e.target.closest('[data-ld-act]');
      if (tool) {
        e.stopPropagation();
        const id = tool.getAttribute('data-ld-id');
        const act = tool.getAttribute('data-ld-act');
        if (act === 'rename') this._renameLoadout(id);
        else if (act === 'delete') this._deleteLoadout(id);
        else if (act === 'update') this._updateLoadout(id);
        return;
      }
      if (e.target.closest('.ld-add')) { this._saveCurrentLoadout(); return; }
      const chip = e.target.closest('.ld-chip');
      if (chip) this._applyLoadout(this._getLoadouts().find(s => s.id === chip.getAttribute('data-ld-id')));
    });
  }

  // The bar's inner markup (title + scrollable chips + add button), shared by
  // every host surface. `hint` tweaks the subtitle per surface.
  _loadoutBarInnerHTML(hint) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sets = this._getLoadouts();
    const chips = sets.map(set => {
      const active = this._loadoutIsActive(set);
      const label = esc(this._short ? this._short(set.name) : set.name);
      return `<div class="ld-chip${active ? ' active' : ''}" data-ld-id="${esc(set.id)}" title="แตะเพื่อสวมทั้งเซ็ท">
        ${active ? '<span class="ld-chip-badge">● ใส่อยู่</span>' : ''}
        <span class="ld-chip-ic">${this._loadoutPreviewIcons(set)}</span>
        <span class="ld-chip-nm">${label}</span>
        <span class="ld-chip-tools">
          <span data-ld-act="update" data-ld-id="${esc(set.id)}" title="บันทึกทับด้วยชุดปัจจุบัน">💾</span>
          <span data-ld-act="rename" data-ld-id="${esc(set.id)}" title="เปลี่ยนชื่อ">✎</span>
          <span data-ld-act="delete" data-ld-id="${esc(set.id)}" title="ลบ">🗑️</span>
        </span>
      </div>`;
    }).join('');

    return `
      <div class="loadout-bar-title">🎽 เซ็ทชุด <span class="lb-hint">${hint || 'แตะเพื่อสวมทั้งชุด · เลื่อนซ้าย-ขวาดูเพิ่ม'}</span></div>
      <div class="loadout-scroll">
        ${chips}
        <div class="ld-add" title="บันทึกชุดที่ใส่อยู่ตอนนี้เป็นเซ็ทใหม่">
          <span class="ld-add-ic">＋</span><span class="ld-add-lb">บันทึกชุดปัจจุบัน</span>
        </div>
      </div>`;
  }

  // Equip-tab bar (above the paper-doll in the inventory panel).
  _renderLoadoutBar() {
    this._ensureLoadoutBar();
    const bar = document.getElementById('loadout-bar');
    if (!bar) return;
    bar.style.display = '';
    if (!this.character) { bar.innerHTML = ''; return; }
    bar.innerHTML = this._loadoutBarInnerHTML();
  }

  // Profile-panel bar (top of the "Equipment / อุปกรณ์สวมใส่" section).
  _renderProfileLoadoutBar() {
    const bar = document.getElementById('profile-loadout-bar');
    if (!bar) return;
    this._ensureLoadoutBar();   // guarantees the shared .loadout-* styles exist
    bar.className = 'loadout-bar';
    this._wireLoadoutBar(bar);
    if (!this.character) { bar.innerHTML = ''; return; }
    bar.innerHTML = this._loadoutBarInnerHTML();
  }

  // Re-render whichever loadout bars are in the DOM so the Equip-tab and Profile
  // surfaces stay in sync after any add/apply/rename/delete/update.
  _refreshLoadoutBars() {
    if (this.currentTab === 'equip' && document.getElementById('loadout-bar')) this._renderLoadoutBar();
    if (document.getElementById('profile-loadout-bar')) this._renderProfileLoadoutBar();
  }

  // Same paper-doll, embedded in the Settings & Profile panel (replaces the old
  // weapon/hat/glasses dropdowns). Tapping any slot opens a picker of items that
  // fit it; equip/unequip applies live.
  _renderProfileEquipDoll() {
    const host = document.getElementById('profile-equip-doll');
    if (!host || !this.character) return;
    this._renderProfileLoadoutBar(); // outfit sets sit at the top of this section
    this._ensureEquipDoll(); // guarantees the shared .equip-doll styles exist
    host.className = 'equip-doll';
    host.innerHTML = this._dollInnerHTML('แตะช่องเพื่อเลือก/เปลี่ยน/ถอดอุปกรณ์');
    if (!host._wired) {
      host._wired = true;
      host.addEventListener('click', (e) => {
        // Card socket takes priority over the gear slot it sits inside.
        const socket = e.target.closest('.eq-card-socket');
        if (socket) {
          e.stopPropagation();
          this._openCardPicker(socket.getAttribute('data-cardslot'));
          return;
        }
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
    // Derived from class + level (no manual allocation → ignore stored str/agi/int
    // which default to 1 and would show 1/1/1).
    const attr = getJobStats(st.job || null, st.level || 1);
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

  // Push the refine level (+N) of each equipped item onto the character so its
  // stat getters scale by refine. Called on load and after every equip/refine.
  _syncEquipRefine() {
    const r = this.character && this.character.equipRefine;
    if (!r) return;
    for (const k of Object.keys(r)) r[k] = 0;
    for (const it of (this.inventory || [])) {
      if (!it.stats || it.stats.equipped !== true) continue;
      const rf = it.stats.refine || 0;
      if (it.item_type === 'weapon' || it.item_type === 'fishing_rod') r.weapon = rf;
      else if (it.item_type === 'shield') r.shield = rf;
      else if (it.item_type === 'armor') {
        const slot = getEquipSlot(it.item_name);
        if (slot && r[slot] !== undefined) r[slot] = rf;
      }
    }
  }

  // "+N " prefix for a refined item name (or '' if not refined / not found).
  _refinePrefix(itemName) {
    const it = (this.inventory || []).find(i => i.item_name === itemName);
    const rf = it && it.stats ? (it.stats.refine || 0) : 0;
    return rf > 0 ? `+${rf} ` : '';
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
        <span class="sp-ic">${itemIconMarkup(i, i.emoji || slot.icon, 'item-visual--forge-cell')}</span>
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

  // Popup list of cards that fit a slot's card socket (plus "remove"). Selecting
  // one sockets it live; stats + the paper-doll refresh instantly.
  _openCardPicker(slotId) {
    if (!this.character) return;
    const slot = EQUIP_SLOTS.find(s => s.id === slotId);
    if (!slot) return;
    const category = cardCategoryForSlot(slotId);
    const current = this.character.equippedCards ? this.character.equippedCards[slotId] : null;

    // Fix Issue 2: Filter out cards already equipped in other slots.
    // Also handle quantity: if quantity is 1 and it's in this slot, it's fine.
    // If it's in another slot, it shouldn't show up.
    const cards = (this.inventory || []).filter(i => {
      if (i.item_type !== 'card' || !cardFitsSlot(i.item_name, slotId)) return false;
      const catalogCard = getCard(i.item_name);
      const inThis = catalogCard?.id === current;
      const inOther = !inThis && i.stats && i.stats.equipped === true;
      return inThis || !inOther;
    });

    const catLabel = { weapon: 'อาวุธ', armor: 'เกราะ', shield: 'โล่', accessory: 'เครื่องประดับ' }[category] || category;

    let ov = document.getElementById('card-picker-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'card-picker-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(4,7,16,.62);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;';

    const rows = cards.map(i => {
      const it = ITEMS[i.item_name] || {};
      const catalogCard = getCard(i.item_name);
      const rar = i.rarity || it.rarity || 'common';
      const col = RARITY_COLOR[rar] || '#b8c0cc';
      const inThis = catalogCard?.id === current;
      // Build stat bonus summary from catalog card stats
      const bonuses = [];
      const cStats = catalogCard?.stats || {};
      if (cStats.atkBonus) bonuses.push(`ATK+${cStats.atkBonus}`);
      if (cStats.defBonus) bonuses.push(`DEF+${cStats.defBonus}`);
      if (cStats.hpBonus) bonuses.push(`HP+${cStats.hpBonus}`);
      if (cStats.spBonus) bonuses.push(`SP+${cStats.spBonus}`);
      const bonusStr = bonuses.length ? bonuses.join(' · ') : (it.desc || catalogCard?.abilityName || '');

      return `<div class="sp-row cp-row${inThis ? ' sp-eq' : ''}" data-name="${i.item_name}" style="display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;cursor:pointer;border:1px solid transparent;border-left:3px solid ${col};transition:background .12s,border-color .12s;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid ${col};flex-shrink:0"><img src="${catalogCard?.art || '/assets/items/fallback/unknown-loot.png'}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:5px"></span>
        <span style="flex:1;color:#e6ecff;font-size:13.5px;line-height:1.3;">
          <b style="color:${col}">${i.item_name}</b>
          <span style="font-size:10px;color:#8b97ba;margin-left:4px">(${rar})</span>
          <br><span style="font-size:11px;color:#9fb0e0">${bonusStr}</span>
        </span>
        <span style="font-size:11px;color:#8b97ba">${inThis ? '✅ ใส่อยู่' : 'x' + (i.quantity || 1)}</span>
      </div>`;
    }).join('');

    ov.innerHTML = `
      <div class="sp-box" style="background:linear-gradient(160deg,#1b2340,#121627);border:1px solid rgba(130,160,230,.35);
        border-radius:16px;max-width:360px;width:100%;max-height:72vh;overflow:auto;padding:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="font-weight:800;color:#fff;font-size:15px;">🃏 ช่องการ์ด · ${slot.icon} ${slot.label}</div>
          <div id="cp-close" style="cursor:pointer;color:#9fb0e0;font-size:20px;line-height:1;padding:2px 6px;">✕</div>
        </div>
        <div style="font-size:11px;color:#8b97ba;margin-bottom:10px;">ใส่ได้เฉพาะการ์ดประเภท "${catLabel}"</div>
        <div class="sp-row sp-none" data-name="__none__" style="display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;cursor:pointer;background:rgba(200,70,70,.12);margin-bottom:6px;opacity:${current ? 1 : .5};">
          <span style="font-size:20px;width:32px;text-align:center">🚫</span>
          <span style="flex:1;color:#e6ecff;font-size:13.5px">ถอดการ์ดออก</span>
        </div>
        ${cards.length ? rows : '<div style="color:#8b97ba;text-align:center;padding:16px 4px;font-size:13px;">ยังไม่มีการ์ดประเภทนี้ — ล่าบอสโลกเพื่อลุ้นการ์ดดรอป!</div>'}
      </div>`;

    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#cp-close').addEventListener('click', close);
    ov.querySelectorAll('.sp-row').forEach(row => {
      row.addEventListener('click', async () => {
        const name = row.getAttribute('data-name');
        if (name === '__none__') await this._unsocketCard(slotId);
        else if (getCard(name)?.id !== current) await this._socketCard(slotId, name);
        close();
      });
    });
  }

  // Socket `cardName` into `slotId`, retaining the one-card/one-socket rule.
  async _socketCard(slotId, cardName) {
    const ch = this.character;
    if (!ch || !ch.equippedCards) return;
    const card = this.inventory.find(i => i.item_name === cardName && i.item_type === 'card');
    if (!card) return;
    const catalogCard = getCard(cardName);
    const cardId = catalogCard?.id;
    if (!cardId || !cardFitsSlot(cardId, slotId)) return;
    const changed = [];

    // Compare catalog IDs, not display aliases: aliases such as Andre Card and
    // Willow Card still represent one card and may occupy only one socket.
    if (Object.entries(ch.equippedCards).some(([slot, id]) => slot !== slotId && getCard(id)?.id === cardId)) return;
    // Displace whatever card currently sits in the target slot.
    const prev = ch.equippedCards[slotId];
    if (prev && prev !== cardId) {
      const prevItem = this.inventory.find(i => getCard(i.item_name)?.id === prev);
      if (prevItem && prevItem.stats) { prevItem.stats.equipped = false; delete prevItem.stats.slot; changed.push(prevItem); }
    }
    if (!ch.equipCard(slotId, cardId)) return;
    if (!card.stats) card.stats = {};
    card.stats.equipped = true;
    card.stats.slot = slotId;
    changed.push(card);

    await this._persistCardStats(changed);
    this._afterCardChange(`ใส่การ์ด ${card.emoji || '🃏'} ${cardName}`);
    // Fix Issue 2: Refresh the profile paper-doll instantly.
    this._renderProfileEquipDoll();
  }

  async _unsocketCard(slotId) {
    const ch = this.character;
    if (!ch || !ch.equippedCards) return;
    const cardId = ch.equippedCards[slotId];
    if (!cardId) return;
    ch.equippedCards[slotId] = null;
    const card = this.inventory.find(i => getCard(i.item_name)?.id === cardId);
    const cardName = card?.item_name || cardId;
    if (card && card.stats) { card.stats.equipped = false; delete card.stats.slot; }
    if (card) await this._persistCardStats([card]);
    this._afterCardChange(`ถอดการ์ด ${card ? (card.emoji || '🃏') + ' ' + cardName : ''}`);
    // Fix Issue 2: Refresh the profile paper-doll instantly.
    this._renderProfileEquipDoll();
  }

  async _persistCardStats(items) {
    if (!this.characterId) return;
    for (const it of items) {
      try { await updateInventoryItemStats(this.characterId, it.item_name, it.stats || {}); } catch (e) { /* ignore */ }
    }
  }

  async requestCardFusion(cardId, requestId = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fusion_${Date.now()}_${Math.random().toString(36).slice(2)}`), opts = {}) {
    try {
      return await requestCardFusion(cardId, requestId, opts);
    } catch (error) {
      if (!error.cardFusionPublished) {
        this.onCardFusionError({ requestId, message: error.message || 'หลอมการ์ดไม่สำเร็จ' });
      }
      return null;
    }
  }

  async requestCardRefine(cardId, count, requestId = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `refine_${Date.now()}_${Math.random().toString(36).slice(2)}`)) {
    try {
      return await requestCardRefine(cardId, count, requestId);
    } catch (error) {
      if (!error.cardFusionPublished) this.addCombatLog(`❌ ${error.message || 'ถลุงการ์ดไม่สำเร็จ'}`, 'warning');
      return null;
    }
  }

  onCardFusionResult(result) {
    const card = getCard(result?.cardId);
    if (!card || !this.character?.cardState || !Number.isInteger(result.owned)
      || !Number.isInteger(result.stars) || !Number.isInteger(result.pity)) return false;
    this.character.cardState[result.cardId] = {
      owned: result.owned,
      stars: result.stars,
      pity: result.pity,
    };
    // Dust-assisted fusions return the new Stardust balance.
    if (this.character && Number.isInteger(result.stardust)) this.character.stardust = result.stardust;
    const inventoryCard = this.inventory.find(item => item?.item_type === 'card' && getCard(item.item_name)?.id === result.cardId);
    if (inventoryCard) {
      inventoryCard.quantity = result.owned;
      inventoryCard.stats = {
        ...(inventoryCard.stats || {}),
        card_id: result.cardId,
        card_stars: result.stars,
        card_pity: result.pity,
      };
    }
    this._afterCardChange(`หลอม ${card.itemName} สำเร็จ ★${result.stars}`);
    return true;
  }

  // A refine committed on the server: sync the reduced dupe count + new balance.
  onCardRefineResult(result) {
    const card = getCard(result?.cardId);
    if (!card || !this.character?.cardState || !Number.isInteger(result.owned)) return false;
    const prev = this.character.cardState[result.cardId] || { owned: result.owned, stars: 1, pity: 0 };
    this.character.cardState[result.cardId] = { ...prev, owned: result.owned };
    if (Number.isInteger(result.stardust)) this.character.stardust = result.stardust;
    const inventoryCard = this.inventory.find(item => item?.item_type === 'card' && getCard(item.item_name)?.id === result.cardId);
    if (inventoryCard) inventoryCard.quantity = result.owned;
    this._afterCardChange(`ถลุง ${card.itemName} → ผงดาว (มี ${result.stardust} ✦)`);
    return true;
  }

  // Server pushed our Stardust balance + economy rates (on load / after change).
  onCardEcon(payload) {
    if (!payload) return;
    if (this.character && Number.isInteger(payload.stardust)) this.character.stardust = payload.stardust;
    if (payload.economy && typeof payload.economy === 'object') this.cardEconomy = payload.economy;
    this.refreshCardAlbum?.();
  }

  onCardFusionError(error) {
    const message = error?.message || 'หลอมการ์ดไม่สำเร็จ';
    this.addCombatLog(`❌ ${message}`, 'warning');
    this._equipToast(message, false);
  }

  // Shared refresh after any card change: recompute stats, redraw doll + HUD.
  async _afterCardChange(msg) {
    if (msg) { this.addCombatLog(`🃏 ${msg}`, 'system'); this._equipToast(msg, true); }
    if (this.soundManager && this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    if (this.currentTab === 'equip') this._renderEquipDoll();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
    // Persist equippedCards + cardState to Supabase so they survive page reload.
    if (this.characterId && this.character?.saveStatsToDatabase) {
      try { await this.character.saveStatsToDatabase(); }
      catch (e) { console.warn('[GameUI] Card persistence save failed:', e?.message || e); }
    }
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

    document.getElementById('detail-icon').innerHTML = itemIconMarkup(item, ITEMS[item.item_name]?.emoji || item.emoji, 'item-visual--detail');
    const nameEl = document.getElementById('detail-name');
    const rfx = (item.stats && item.stats.refine) ? `+${item.stats.refine} ` : '';
    nameEl.textContent = rfx + item.item_name;
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
    } else if (item.item_type === 'pet') {
      typeStr = 'Pet · สัตว์เลี้ยง';
    } else if (item.item_type === 'card') {
      const catLabel = { weapon: 'อาวุธ', armor: 'เกราะ', shield: 'โล่', accessory: 'เครื่องประดับ' }[ITEMS[item.item_name]?.cardSlot] || 'การ์ด';
      typeStr = 'Card · ' + catLabel;
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
    let petHtml = '';
    if (item.item_type === 'pet') {
      const isEq = item.stats && item.stats.equipped === true;
      // Live values for the active pet; stored values otherwise.
      const lvl = (isEq && this.character) ? this.character.petLevel : (item.stats?.petLevel || 1);
      const xp = (isEq && this.character) ? Math.floor(this.character.petXp) : (item.stats?.petXp || 0);
      const need = (this.character && this.character.getPetXpRequired) ? this.character.getPetXpRequired(lvl) : Math.floor(60 * Math.pow(lvl, 1.5));
      const pct = lvl >= 40 ? 100 : Math.min(100, Math.round((xp / need) * 100));
      const tierName = ['ธรรมดา', 'ประกายออร่า ✨', 'ออร่า+เกล็ดแสง 🌟', 'เรืองรอง+วงแหวน 💫', 'สุดยอดตำนาน 🌈'][
        lvl >= 30 ? 4 : lvl >= 20 ? 3 : lvl >= 10 ? 2 : lvl >= 5 ? 1 : 0
      ];
      const barCol = lvl >= 30 ? '#ffcf6a' : lvl >= 20 ? '#c9a0ff' : lvl >= 10 ? '#7be0ff' : '#8fd0a0';
      petHtml = `<br/><br/><strong style="color:${barCol}">🐾 เลเวลสัตว์เลี้ยง:</strong> Lv.${lvl}${lvl >= 40 ? ' (สูงสุด)' : ''} · ${tierName}`
        + `<div style="margin-top:5px;height:8px;border-radius:5px;background:rgba(255,255,255,0.12);overflow:hidden">`
        + `<div style="height:100%;width:${pct}%;background:${barCol};border-radius:5px"></div></div>`
        + (lvl >= 40 ? '' : `<span style="font-size:11px;color:var(--text-dim)">EXP ${xp}/${need} — ฆ่ามอนสเตอร์เพื่อเพิ่มเลเวลและเอฟเฟค</span>`);
    }
    let cardHtml = '';
    if (item.item_type === 'card') {
      const it = ITEMS[item.item_name] || {};
      const rar = item.rarity || it.rarity || 'common';
      const col = RARITY_COLOR[rar] || '#b8c0cc';
      const catLabel = { weapon: 'อาวุธ', armor: 'เกราะ', shield: 'โล่', accessory: 'เครื่องประดับ' }[it.cardSlot] || 'การ์ด';
      const socketed = item.stats && item.stats.equipped === true;
      cardHtml = `<br/><br/><strong style="color:${col}">🃏 ความสามารถการ์ด (${rar.toUpperCase()}):</strong> ${it.desc || ''}`
        + `<br/><span style="font-size:12px;color:var(--text-dim)">ใส่ได้กับช่องประเภท "${catLabel}"`
        + (socketed ? ` · <span style="color:#8fe0a8">กำลังใส่อยู่</span>` : ` · ไปที่แท็บ Equip แล้วแตะช่องการ์ด (🃏) บนอุปกรณ์เพื่อสวม`)
        + `</span>`;
    }

    let socketHtml = '';
    const equipmentSlot = this._equipmentSlotForItem(item);
    if (equipmentSlot && item.stats && item.stats.equipped === true) {
      const equippedCardId = this.character?.equippedCards?.[equipmentSlot] || null;
      const equippedCard = equippedCardId ? getCard(equippedCardId) : null;
      const cards = equippedCardId ? [equippedCard?.itemName || equippedCardId] : [];
      const maxSockets = 1;
      socketHtml = `<br/><br/><strong style="color:var(--secondary)">🕳️ Sockets / ช่องใส่การ์ด:</strong><br/>`;
      socketHtml += `<div style="display:flex;flex-direction:column;gap:5px;margin-top:5px">`;
      for (let i = 0; i < maxSockets; i++) {
        const cardName = cards[i];
        if (cardName) {
          const cardData = ITEMS[cardName] || {};
          const catalogCard = getCard(cardName);
          const rar = cardData.rarity || catalogCard?.rarity || 'common';
          const rarCol = RARITY_COLOR[rar] || '#b8c0cc';
          const cardEmoji = cardData.emoji || catalogCard?.displayName?.charAt(0) || '🃏';
          const bonusText = [];
          if (cardData.card) {
            if (cardData.card.atkBonus) bonusText.push(`ATK+${cardData.card.atkBonus}`);
            if (cardData.card.defBonus) bonusText.push(`DEF+${cardData.card.defBonus}`);
            if (cardData.card.hpBonus) bonusText.push(`HP+${cardData.card.hpBonus}`);
            if (cardData.card.spBonus) bonusText.push(`SP+${cardData.card.spBonus}`);
          }
          const bonusStr = bonusText.length ? bonusText.join(' ') : (cardData.desc || '');
          socketHtml += `<div class="eq-detail-socket filled" style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:13px;border-left:3px solid ${rarCol};">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;background:rgba(255,255,255,0.08);border:1px solid ${rarCol};font-size:13px">${cardEmoji}</span>
              <div style="line-height:1.3">
                <span style="color:${rarCol};font-weight:600">${cardName}</span>
                ${bonusStr ? `<span style="font-size:10px;color:var(--text-dim);margin-left:4px">${bonusStr}</span>` : ''}
              </div>
            </div>
            <button class="btn-remove-card" data-slot="${equipmentSlot}" style="background:#ff4444;border:none;color:white;padding:2px 6px;border-radius:3px;font-size:11px;cursor:pointer">ถอด</button>
          </div>`;
        } else {
          socketHtml += `<div class="eq-detail-socket empty-slot" data-equip-slot="${equipmentSlot}" style="display:flex;align-items:center;gap:6px;color:var(--text-dim);font-size:13px;padding:4px 8px;cursor:pointer;border-radius:4px;border:1px dashed rgba(150,160,190,0.4);transition:background .15s,border-color .15s;" onmouseover="this.style.background='rgba(255,255,255,0.06)';this.style.borderColor='rgba(150,160,190,0.7)'" onmouseout="this.style.background='transparent';this.style.borderColor='rgba(150,160,190,0.4)'" title="เลือกการ์ดประจำช่อง (สูงสุด 1 ใบ)">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;background:rgba(255,255,255,0.04);font-size:14px;color:#7c88a8">＋</span>
            <span>Empty Slot (ว่าง) — คลิกเพื่อเลือกการ์ด</span>
          </div>`;
        }
      }
      socketHtml += `</div>`;
    }

    document.getElementById('detail-desc').innerHTML = item.desc + durHtml + petHtml + cardHtml + socketHtml + droppedByHtml;

    // Attach removal events
    document.querySelectorAll('.btn-remove-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = btn.getAttribute('data-slot');
        if (slotId) this._unsocketCard(slotId);
      });
    });
    // Attach empty-socket click handlers to open the direct card picker
    document.querySelectorAll('.eq-detail-socket.empty-slot').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = el.getAttribute('data-equip-slot');
        if (slotId) this._openCardPicker(slotId);
      });
    });
    document.getElementById('detail-price-val').textContent = item.price;

    const useBtn = document.getElementById('btn-use-item');
    if (item.item_type === 'consumable') {
      useBtn.style.display = 'block';
      useBtn.textContent = `ใช้งาน (x${item.quantity})`;
    } else if (['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses', 'tool', 'pet'].includes(item.item_type)) {
      useBtn.style.display = 'block';
      const isEquipped = item.stats && item.stats.equipped === true;
      if (item.item_type === 'pet') useBtn.textContent = isEquipped ? 'เก็บกลับ' : 'เรียกออกมา';
      else useBtn.textContent = isEquipped ? 'ถอดออก' : 'สวมใส่';
    } else if (item.item_type === 'card') {
      useBtn.style.display = 'block';
      useBtn.textContent = 'ใส่การ์ด';
    } else {
      useBtn.style.display = 'none';
    }
  }

  _equipmentSlotForItem(item) {
    if (!item) return null;
    if (item.item_type === 'weapon' || item.item_type === 'fishing_rod') return 'weapon';
    if (item.item_type === 'shield') return 'shield';
    if (item.item_type === 'hat') return 'hat';
    if (item.item_type === 'glasses') return 'glasses';
    if (item.item_type === 'armor' || ['ring', 'wrist', 'accessory'].includes(item.item_type)) {
      return getEquipSlot(item.item_name) || item.item_type;
    }
    return null;
  }

  async _useSelectedItem() {
    if (!this.selectedItemName || !this.character) return;

    const itemIdx = this.inventory.findIndex(i => i.item_name === this.selectedItemName);
    if (itemIdx === -1) return;

    const item = this.inventory[itemIdx];

    if (['weapon', 'fishing_rod', 'armor', 'shield', 'hat', 'glasses', 'tool', 'pet'].includes(item.item_type)) {
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
      } else if (item.item_type === 'pet') {
        // Preserve the pet's grown level/xp on its item before storing it away,
        // so a fattened pet keeps its level (and higher sell value).
        if (!item.stats) item.stats = {};
        item.stats.petLevel = this.character.petLevel;
        item.stats.petXp = Math.floor(this.character.petXp);
        this.character.setPet(null);
      }
      if (this.characterId) {
        // SET (not add) the row's quantity + stats so equipping never inflates
        // the stack. The full stats object keeps a tool's durability, etc.
        await setInventoryItemQuantity(this.characterId, item.item_name, item.item_type, item.quantity || 1, item.stats || {});
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
            // SET (not add) quantity + stats so swapping gear never inflates it.
            await setInventoryItemQuantity(this.characterId, otherItem.item_name, otherItem.item_type, otherItem.quantity || 1, otherItem.stats || {});
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
      } else if (item.item_type === 'pet') {
        this.character.setPet(petModelOf(item.item_name), item.stats.petLevel || 1, item.stats.petXp || 0);
      }

      if (this.characterId) {
        // SET (not add) the row's quantity + stats. Also creates the row if a
        // buy save was interrupted. Never inflates the stack on equip.
        await setInventoryItemQuantity(this.characterId, item.item_name, item.item_type, item.quantity || 1, item.stats || {});
        this.addCombatLog(`✅ บันทึกไอเทม [${item.item_name}] สำเร็จ`, 'system');
      }
      const isPet = item.item_type === 'pet';
      this.addCombatLog(`${isPet ? '🐾 เรียก' : '⚔️ สวมใส่'} ${item.emoji} ${item.item_name}${isPet ? ' ออกมาเป็นเพื่อน!' : ' เพิ่มความแข็งแกร่ง!'}`, 'system');
      this._equipToast(`${isPet ? 'เรียก' : 'สวมใส่'} ${item.item_name}`, true);
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
    this._syncEquipRefine(); // apply the newly-equipped item's +N bonus

    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
    // Sync: Inventory → Profile Editor (refresh dropdowns if open)
    this._refreshProfileEditorEquipment();
  }

  // Live pet badge on the top HUD: real pet atlas art + level + XP bar.
  // time the HUD updates (which happens on every kill / exp gain), so the cat
  // visibly fills its bar and levels up while you fight.
  updatePetHud() {
    const el = document.getElementById('pet-hud');
    if (!el) return;
    const c = this.character;
    if (!c || !c.equippedPet) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const petItem = this.inventory
      ? this.inventory.find(i => i.item_type === 'pet' && i.stats && i.stats.equipped === true)
      : null;
    const lvl = c.petLevel || 1;
    const xp = Math.floor(c.petXp || 0);
    const need = c.getPetXpRequired ? c.getPetXpRequired(lvl) : Math.floor(60 * Math.pow(lvl, 1.5));
    const emojiEl = document.getElementById('pet-hud-emoji');
    const nameEl = document.getElementById('pet-hud-name');
    const lvlEl = document.getElementById('pet-hud-level');
    const fillEl = document.getElementById('pet-xp-fill');
    const txtEl = document.getElementById('pet-xp-text');
    if (emojiEl && petItem) emojiEl.innerHTML = itemIconMarkup(petItem, '', 'item-visual--pet-hud');
    if (nameEl) nameEl.textContent = c.petName || (petItem ? petItem.item_name.replace(/ Pet$/, '') : 'สัตว์เลี้ยง');
    if (lvlEl) lvlEl.textContent = 'Lv.' + lvl + (lvl >= 40 ? ' MAX' : '');
    if (lvl >= 40) {
      if (fillEl) fillEl.style.width = '100%';
      if (txtEl) txtEl.textContent = 'สูงสุด';
    } else {
      const pct = Math.min(100, Math.round((xp / need) * 100));
      if (fillEl) fillEl.style.width = pct + '%';
      if (txtEl) txtEl.textContent = `${xp}/${need}`;
    }
  }

  // Brief pop on the pet badge when it levels up (draws the eye).
  flashPetHud() {
    const el = document.getElementById('pet-hud');
    if (!el) return;
    this.updatePetHud();
    el.classList.remove('pet-levelup');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('pet-levelup');
    setTimeout(() => el.classList.remove('pet-levelup'), 700);
  }

  // ===== Pet instances (each owned pet is individual: own name + level/xp) =====
  _newPetUid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Ensure a pet row carries a per-pet `instances` array, migrating legacy
  // stacked pets (that only had petLevel/petXp + a quantity). Returns the array.
  _ensurePetInstances(item) {
    if (!item || item.item_type !== 'pet') return [];
    if (!item.stats) item.stats = {};
    if (!Array.isArray(item.stats.instances)) {
      const n = Math.max(1, item.quantity || 1);
      const arr = [];
      for (let k = 0; k < n; k++) {
        // A legacy/market-delivered pet may carry a single petName in stats —
        // keep it on the first instance so a bought named pet isn't anonymised.
        arr.push({ uid: this._newPetUid(), name: k === 0 ? (item.stats.petName || null) : null, level: item.stats.petLevel || 1, xp: item.stats.petXp || 0 });
      }
      if (item.stats.equipped === true) item.stats.equippedUid = arr[0].uid;
      item.stats.instances = arr;
    }
    item.quantity = item.stats.instances.length;
    return item.stats.instances;
  }

  // Every owned pet as {item, inst}, for expanding into one slot each.
  _allPetInstances() {
    const out = [];
    for (const item of (this.inventory || [])) {
      if (item.item_type !== 'pet') continue;
      for (const inst of this._ensurePetInstances(item)) out.push({ item, inst });
    }
    return out;
  }

  // Locate a pet instance by uid → {item, inst} or null.
  _findPetInstance(uid) {
    for (const item of (this.inventory || [])) {
      if (item.item_type !== 'pet' || !item.stats || !Array.isArray(item.stats.instances)) continue;
      const inst = item.stats.instances.find(x => x.uid === uid);
      if (inst) return { item, inst };
    }
    return null;
  }

  // Display name for a pet instance (its custom name, else the species).
  _petDisplayName(item, inst) {
    if (inst && inst.name) return inst.name;
    return (item.item_name || 'Pet').replace(/ Pet$/, '');
  }

  // Copy the live level/xp of the SUMMONED pet back onto its instance so the
  // values ride along on the next DB flush (keeps in-memory in sync).
  _syncPetItemStats() {
    const c = this.character;
    if (!c || !c.equippedPet || !c.equippedPetUid) return null;
    const found = this._findPetInstance(c.equippedPetUid);
    if (!found) return null;
    found.inst.level = c.petLevel;
    found.inst.xp = Math.floor(c.petXp);
    if (c.petName !== undefined) found.inst.name = c.petName || null;
    found.item.stats.equipped = true;
    found.item.stats.equippedUid = c.equippedPetUid;
    return found.item;
  }

  /**
   * Sync live character equippedCards back to the card items in inventory.
   * This ensures the "equipped" and "slot" flags in inventory row stats
   * match the live paper-doll, which is critical for persistence.
   */
  _syncCardItemStats() {
    const c = this.character;
    if (!c || !c.equippedCards) return;

    // Reset all cards to unequipped first
    this.inventory.forEach(it => {
      if (it.item_type === 'card' && it.stats) {
        it.stats.equipped = false;
        delete it.stats.slot;
      }
    });

    // Mark currently equipped cards
    for (const [slot, cardId] of Object.entries(c.equippedCards)) {
      if (!cardId) continue;
      const card = this.inventory.find(it => it.item_type === 'card' && getCard(it.item_name)?.id === cardId);
      if (card) {
        if (!card.stats) card.stats = {};
        card.stats.equipped = true;
        card.stats.slot = slot;
      }
    }
  }

  // Persist the active pet's progress immediately (called on level-up).
  async persistPetProgress() {
    const petItem = this._syncPetItemStats();
    if (petItem && this.characterId) {
      const { updateInventoryItemStats } = await import('../network/GameSync.js');
      await updateInventoryItemStats(this.characterId, petItem.item_name, petItem.stats);
    }
  }

  // Persist a pet row's stats (instances/equipped) to the DB.
  async _persistPetRow(item) {
    if (item && this.characterId) {
      const { updateInventoryItemStats } = await import('../network/GameSync.js');
      await updateInventoryItemStats(this.characterId, item.item_name, item.stats || {});
    }
  }

  // Summon / store a specific pet instance.
  async _equipPetInstance(uid) {
    const found = this._findPetInstance(uid);
    if (!found || !this.character) return;
    const { item, inst } = found;
    const c = this.character;
    const alreadyThis = c.equippedPetUid === uid && c.equippedPet;

    // Save the currently-summoned pet's progress back to its instance first.
    if (c.equippedPetUid) this._syncPetItemStats();

    const touched = new Set();
    // Clear equipped flags on all pet rows (only one pet out at a time).
    for (const it of this.inventory) {
      if (it.item_type === 'pet' && it.stats && (it.stats.equipped || it.stats.equippedUid)) {
        it.stats.equipped = false; it.stats.equippedUid = null; touched.add(it);
      }
    }

    if (alreadyThis) {
      // Toggle off → store the pet.
      c.setPet(null);
      c.equippedPetUid = null;
      this._equipToast(`เก็บ ${this._petDisplayName(item, inst)} กลับกระเป๋า`, true);
    } else {
      c.setPet(petModelOf(item.item_name), inst.level || 1, inst.xp || 0, inst.name || null);
      c.equippedPetUid = uid;
      item.stats.equipped = true;
      item.stats.equippedUid = uid;
      touched.add(item);
      this._equipToast(`เรียก ${this._petDisplayName(item, inst)} ออกมา!`, true);
    }

    for (const it of touched) await this._persistPetRow(it);
    if (this.soundManager && this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    this._renderInventory();
    this.updateHUD(this.character.stats);
  }

  // Rename a pet instance (max 16 chars). Others see it via the appearance.
  async _renamePetInstance(uid, rawName) {
    const found = this._findPetInstance(uid);
    if (!found) return;
    const name = (rawName || '').trim().slice(0, 16) || null;
    found.inst.name = name;
    // If this pet is currently summoned, update the live name so teammates see it.
    if (this.character && this.character.equippedPetUid === uid) {
      this.character.petName = name;
    }
    await this._persistPetRow(found.item);
    this.addCombatLog(`🐾 ตั้งชื่อสัตว์เลี้ยงเป็น "${name || '(ไม่มีชื่อ)'}" แล้ว`, 'system');
    this.updatePetHud();
    this._renderInventory();
  }

  _ensurePetInstStyles() {
    if (document.getElementById('pet-inst-styles')) return;
    const st = document.createElement('style');
    st.id = 'pet-inst-styles';
    st.textContent = `
    #pet-inst-overlay{position:fixed;inset:0;z-index:100001;background:rgba(4,7,16,.66);
      display:flex;align-items:center;justify-content:center;padding:20px;animation:bcFade .15s ease;}
    .pi-box{width:100%;max-width:320px;background:linear-gradient(160deg,#231a3a,#12111f);
      border:1px solid rgba(180,150,255,.4);border-radius:18px;padding:20px 18px 14px;text-align:center;
      box-shadow:0 24px 70px rgba(0,0,0,.7);animation:bcPop .2s cubic-bezier(.34,1.56,.64,1);}
    .pi-emoji{height:150px;display:flex;align-items:center;justify-content:center;margin:-4px -2px 4px;}
    .pi-emoji .item-visual{width:142px;height:142px;border-radius:20px;border-color:rgba(180,150,255,.5);}
    #pi-name{width:100%;margin:12px 0 6px;padding:10px 12px;text-align:center;font-size:16px;font-weight:800;
      color:#fff;background:rgba(0,0,0,.3);border:1px solid rgba(180,150,255,.35);border-radius:10px;
      font-family:var(--font-ui);}
    #pi-name:focus{outline:none;border-color:#b89cff;box-shadow:0 0 10px rgba(180,150,255,.4);}
    .pi-species{font-size:12px;color:#c8bce8;margin-bottom:8px;}
    .pi-bar{height:8px;border-radius:5px;background:rgba(120,90,180,.28);overflow:hidden;margin-bottom:4px;}
    .pi-fill{height:100%;background:linear-gradient(90deg,#a070ff,#d0a0ff);border-radius:5px;}
    .pi-xp{font-size:11px;color:var(--text-dim);margin-bottom:12px;}
    .pi-actions{display:flex;gap:8px;}
    .pi-btn{flex:1;padding:11px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;border:none;font-family:var(--font-ui);}
    .pi-btn:active{transform:scale(.96);}
    .pi-cancel{background:rgba(255,255,255,.08);color:#cdd6ee;border:1px solid rgba(255,255,255,.12);}
    .pi-equip{background:#a070ff;color:#fff;}
    .pi-hint{font-size:10.5px;color:#8b82ad;margin-top:10px;}
    `;
    document.head.appendChild(st);
  }

  // Per-pet popup: rename the pet + summon/store it. Naming persists and, if the
  // pet is summoned, broadcasts so other players see its name.
  _openPetInstance(uid) {
    const found = this._findPetInstance(uid);
    if (!found || !this.character) return;
    this._ensurePetInstStyles();
    const { item, inst } = found;
    const c = this.character;
    const isEq = c.equippedPetUid === uid;
    const lvl = isEq ? (c.petLevel || 1) : (inst.level || 1);
    const xp = isEq ? Math.floor(c.petXp || 0) : (inst.xp || 0);
    const need = c.getPetXpRequired ? c.getPetXpRequired(lvl) : Math.floor(60 * Math.pow(lvl, 1.5));
    const pct = lvl >= 40 ? 100 : Math.min(100, Math.round((xp / need) * 100));
    const tier = ['ธรรมดา', 'ออร่า ✨', 'ออร่า+เกล็ดแสง 🌟', 'เรืองรอง 💫', 'สุดยอดตำนาน 🌈'][
      lvl >= 30 ? 4 : lvl >= 20 ? 3 : lvl >= 10 ? 2 : lvl >= 5 ? 1 : 0];

    let ov = document.getElementById('pet-inst-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'pet-inst-overlay';
    ov.innerHTML = `
      <div class="pi-box">
        <div class="pi-emoji">${itemIconMarkup(item, item.emoji, 'item-visual--pet-profile')}</div>
        <input id="pi-name" maxlength="16" placeholder="ตั้งชื่อน้อง..." value="${(inst.name || '').replace(/"/g, '&quot;')}" />
        <div class="pi-species">${item.item_name.replace(/ Pet$/, '')} · Lv.${lvl}${lvl >= 40 ? ' MAX' : ''} · ${tier}</div>
        <div class="pi-bar"><div class="pi-fill" style="width:${pct}%"></div></div>
        <div class="pi-xp">${lvl >= 40 ? 'สูงสุด' : `EXP ${xp}/${need}`}</div>
        <div class="pi-actions">
          <button class="pi-btn pi-cancel">ปิด</button>
          <button class="pi-btn pi-equip">${isEq ? '🔙 เก็บกลับ' : '🐾 เรียกออกมา'}</button>
        </div>
        <button class="pi-btn pi-sell" style="width:100%;margin-top:8px;background:#c88f1a;color:#fff;">💰 ขายให้ NPC (${this._petSellPrice(item, inst).toLocaleString()} z)</button>
        <div class="pi-market" style="display:flex;gap:6px;margin-top:8px;">
          <input id="pi-price" type="number" min="1" placeholder="ราคาตั้งขาย (z)"
            style="flex:1;padding:9px;background:rgba(0,0,0,.3);border:1px solid rgba(180,150,255,.35);border-radius:10px;color:#fff;text-align:center;font-family:var(--font-pixel);" />
          <button class="pi-btn pi-list" style="flex:0 0 auto;padding:0 14px;background:#3a7ad9;color:#fff;">🏪 ลงตลาด</button>
        </div>
        <div class="pi-hint">ตั้งชื่อก่อนลงตลาด — คนซื้อจะเห็นชื่อน้องของคุณ</div>
      </div>`;
    document.body.appendChild(ov);
    const nameInput = ov.querySelector('#pi-name');
    const saveName = async () => { await this._renamePetInstance(uid, nameInput.value); };
    const close = async () => { await saveName(); ov.remove(); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.pi-cancel').onclick = close;
    ov.querySelector('.pi-equip').onclick = async () => { await saveName(); ov.remove(); await this._equipPetInstance(uid); };
    // Sell: two-tap confirm on the button itself.
    const sellBtn = ov.querySelector('.pi-sell');
    let armed = false;
    sellBtn.onclick = async () => {
      if (!armed) {
        armed = true;
        sellBtn.textContent = `⚠️ กดอีกครั้งเพื่อยืนยันขาย (${this._petSellPrice(item, inst).toLocaleString()} z)`;
        sellBtn.style.background = '#d9534f';
        setTimeout(() => { if (sellBtn.isConnected) { armed = false; sellBtn.textContent = `💰 ขายให้ NPC (${this._petSellPrice(item, inst).toLocaleString()} z)`; sellBtn.style.background = '#c88f1a'; } }, 2500);
        return;
      }
      ov.remove();
      await this._sellPetInstanceNpc(uid);
    };
    // List on the player market with the pet's name shown to buyers.
    const listBtn = ov.querySelector('.pi-list');
    if (listBtn) listBtn.onclick = async () => {
      const price = parseInt(ov.querySelector('#pi-price').value);
      if (isNaN(price) || price < 1) {
        this._equipToast('กรอกราคาตั้งขายก่อน', false);
        return;
      }
      await saveName();
      ov.remove();
      await this._listPetInstanceMarket(uid, price);
    };
  }

  // List one pet instance on the player market, carrying its custom name so
  // other players see exactly which named pet is for sale.
  async _listPetInstanceMarket(uid, price) {
    const found = this._findPetInstance(uid);
    if (!found || !this.character || !this.characterId) return;
    const { item, inst } = found;
    if (this.character.equippedPetUid === uid) {
      this._equipToast('เก็บน้องกลับกระเป๋าก่อนจึงจะลงตลาดได้', false);
      return;
    }
    const stats = {
      petName: inst.name || null,
      petLevel: inst.level || 1,
      petXp: inst.xp || 0,
    };
    try {
      const listing = await listMarketItem(
        this.characterId, this.character.stats.name,
        item.item_name, 'pet', 1, price, stats,
      );
      if (!listing || listing._failed) throw new Error('list failed');

      // Remove the sold instance from inventory.
      const arr = item.stats.instances;
      const idx = arr.findIndex(x => x.uid === uid);
      if (idx >= 0) arr.splice(idx, 1);
      item.quantity = arr.length;
      const { setInventoryItemQuantity } = await import('../network/GameSync.js');
      await setInventoryItemQuantity(this.characterId, item.item_name, 'pet', item.quantity, item.stats);
      if (item.quantity <= 0) {
        const i = this.inventory.indexOf(item);
        if (i >= 0) this.inventory.splice(i, 1);
      }

      const nm = this._petDisplayName(item, inst);
      this.addCombatLog(`🏪 ตั้งขาย ${nm} ในตลาด ราคา ${price.toLocaleString()} Zeny แล้ว`, 'system');
      this._equipToast(`ลงตลาดสำเร็จ: ${nm}`, true);
      if (this.soundManager && this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      this._renderInventory();
      if (this._renderMarket) this._renderMarket();
    } catch (e) {
      this.addCombatLog('❌ ตั้งขายในตลาดไม่สำเร็จ ลองใหม่อีกครั้ง', 'system');
      this._equipToast('ลงตลาดไม่สำเร็จ', false);
    }
  }

  // Level-scaled NPC sell price for one pet instance (mirrors _sellUnitPrice).
  _petSellPrice(item, inst) {
    const lvl = (inst && inst.level) || 1;
    return Math.floor((item.price || 0) * 0.8 * (1 + (lvl - 1) * 0.12));
  }

  // Sell one pet instance to the NPC for gold, removing it from its row.
  async _sellPetInstanceNpc(uid) {
    const found = this._findPetInstance(uid);
    if (!found || !this.character) return;
    const { item, inst } = found;
    const gold = this._petSellPrice(item, inst);
    const wasEquipped = this.character.equippedPetUid === uid;

    // Remove the instance.
    const arr = item.stats.instances;
    const idx = arr.findIndex(x => x.uid === uid);
    if (idx < 0) return;
    arr.splice(idx, 1);
    item.quantity = arr.length;

    if (wasEquipped) { this.character.setPet(null); this.character.equippedPetUid = null; item.stats.equipped = false; item.stats.equippedUid = null; }

    this.character.stats.gold = (this.character.stats.gold || 0) + gold;

    // Persist: update the row (or delete it if no pets of this type remain).
    if (this.characterId) {
      const { setInventoryItemQuantity } = await import('../network/GameSync.js');
      await setInventoryItemQuantity(this.characterId, item.item_name, 'pet', item.quantity, item.stats);
      if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
    }
    if (item.quantity <= 0) {
      const i = this.inventory.indexOf(item);
      if (i >= 0) this.inventory.splice(i, 1);
    }

    this.addCombatLog(`💰 ขาย ${this._petDisplayName(item, inst)} สำเร็จ (+${gold.toLocaleString()} Zeny)`, 'system');
    this._equipToast(`ขายสัตว์เลี้ยงสำเร็จ +${gold.toLocaleString()}z`, true);
    if (this.soundManager && this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
    this._renderInventory();
    this.updateHUD(this.character.stats);
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
        const isSelf = (uid && uid === window.userId) || (username === this.character?.stats?.name);
        const selfClass = isSelf ? ' lb-row-self' : '';
        return `
          <div class="lb-row${uid ? ' lb-clickable' : ''}${selfClass}" data-user-id="${uid}" data-username="${username}" data-level="${entry.level ?? 1}">
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
    this._onlinePlayersInterval = setInterval(() => {
      const body = document.getElementById('players-body');
      if (body && body.offsetParent !== null) this._renderOnlinePlayers();
    }, 2000);
  }

  updateOnlinePlayers(players) {
    this.onlinePlayers = players || [];

    // Inject client-measured ping into local player's roster entry.
    const cp = getClientPing ? getClientPing() : null;
    if (cp != null) {
      this.myPing = cp;
      const me = this.onlinePlayers.find(p =>
        p.userId === window.userId || p.username === this.character?.stats?.name
      );
      if (me && me.ping == null) me.ping = cp;
    }

    // Track local player's ping from server-provided data as fallback
    const me = this.onlinePlayers.find(p =>
      p.userId === window.userId || p.username === this.character?.stats?.name
    );
    if (me && me.ping != null) this.myPing = me.ping;

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

    html += list.map(p => {
      const isFriend = friends.includes(p.username);
      const starHtml = isFriend ? '<span class="friend-star">⭐</span>' : '';
      const isLocal = p.userId === window.userId
        || p.username === this.character?.stats?.name;
      const meta = formatOnlinePlayerMeta(p, {
        isLocal,
        localPing: this.myPing,
      });

      // Device Icon Map
      const deviceIcons = {
        desktop: '💻',
        tablet: '📲',
        mobile: '📱'
      };
      const deviceIcon = deviceIcons[p.device] || '💻';
      const safeUsername = escapeOnlineText(p.username);
      const safeUserId = escapeOnlineText(p.userId || '');
      const safeDevice = escapeOnlineText(p.device || 'desktop');
      const rowStateClass = meta.isOffline
        ? 'player-row--offline'
        : 'player-row--online';

      return `
        <div class="player-row ${rowStateClass}" data-username="${safeUsername}" data-user-id="${safeUserId}" data-offline="${meta.isOffline}">
          <span class="online-dot" aria-hidden="true"></span>
          <span class="player-device-icon" aria-label="${safeDevice}" title="${safeDevice}">${deviceIcon}</span>
          <span class="player-row-content">
            <span class="player-row-main">
              <span class="player-name">${safeUsername}</span>
              ${starHtml}
            </span>
            <span class="player-row-meta">
              <span class="player-city-tag">📍 ${escapeOnlineText(meta.cityLabel)}</span>
              <span class="player-level-tag">${escapeOnlineText(meta.levelLabel)}</span>
              <span class="player-ping ${meta.pingClass}">📶 ${escapeOnlineText(meta.pingLabel)}</span>
            </span>
          </span>
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

        // 1. Try to find the player in the live online list first (most accurate)
        let player = this.onlinePlayers ? this.onlinePlayers.find(p => p.username === targetUsername) : null;
        
        // 2. If not found online, check if it's an offline friend row
        if (!player && isOffline) {
          const userId = row.getAttribute('data-user-id');
          player = {
            username: targetUsername,
            level: row.querySelector('.player-level-badge')?.textContent.replace('Lv.', '') || '?',
            userId: userId || targetUsername,
            isOffline: true
          };
        }

        // 3. Show popup if we found a valid target
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
        // Allow warp by userId OR username (fallback when userId is missing)
        if (!target || (!target.userId && !target.username)) {
          console.error('[Warp] Warp blocked: no target or missing both userId and username');
          return;
        }

        // Determine the friend's map — same approach as warp menu.
        // 1. Try to find friend in the live online roster (has mapId from server)
        if (popup) popup.style.display = 'none';
        this.updateMobileControlsVisibility();
        this.addCombatLog(`🌀 กำลังวาปไปหา ${target.username}...`, 'system');

        // Use the same _doWarp mechanism as the warp menu — proven working.
        // This bypasses the socket round-trip entirely and directly loads the
        // friend's city, exactly like the normal warp menu does.
        const warpResult = sendWarpRequest(target.userId || target.username);
        if (!warpResult.success) {
          this.addCombatLog('Warp failed: server is not connected.', 'warning');
          return;
        }
        window.warpManager.pending = { targetName: target.username, requestId: warpResult.requestId };

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
          this.pendingDuelRequestId = res.requestId;
          this.addCombatLog(`⚔️ ส่งคำท้าดวลไปยัง ${target.username} แล้ว รอการตอบรับ...`, 'system');
        } else {
          this.addCombatLog('❌ ท้าดวลไม่ได้ (ออฟไลน์/เซิร์ฟเวอร์ไม่เชื่อมต่อ)', 'warning');
        }
      });
    }

    // Friend request confirmation modal buttons
    this.activeIncomingFriendRequest = null;
    this.pendingFriendRequestId = null;
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
    import('../engine/JobPreview.js').then(boot).catch(() => { });
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
        <div style="line-height:1.15;margin:2px 0;">${item ? itemIconMarkup(item.name, item.emoji, 'item-visual--equipped') : '➖'}</div>
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
    const attr = getJobStats(jobForAttr, lvlForAttr);
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

      sendFriendRequestPacket(myName, myLevel, targetUserId, username).then(result => {
        this.pendingFriendRequestId = result?.requestId || null;
      });
      this.addCombatLog(`✉️ ส่งคำขอเป็นเพื่อนไปยัง ${username} แล้ว`, 'system');
    }
  }

  // ============ PVP Duel Request/Response ============
  receiveDuelRequest(payload) {
    if (!payload || typeof payload.senderUserId !== 'string' || !payload.senderUserId
      || !/^duel:[A-Za-z0-9:_-]{1,214}$/.test(payload.requestId || '')
      || !Number.isInteger(payload.senderLevel) || payload.senderLevel < 1 || payload.senderLevel > 9999) return;
    this.addCombatLog(`⚔️ ${payload.senderName} (Lv.${payload.senderLevel || '?'}) ท้าดวล PVP!`, 'warning');
    // Simple accept dialog (same approach as layout-reset confirm)
    const accepted = confirm(`⚔️ ${payload.senderName} (Lv.${payload.senderLevel || '?'}) ท้าดวล PVP!\n\nรับคำท้าหรือไม่?`);
    import('../network/GameSync.js').then(({ sendDuelResponse }) => {
      sendDuelResponse(payload.senderUserId, accepted, payload.requestId);
    });
    if (!accepted) this.addCombatLog('🚫 ปฏิเสธคำท้าดวล', 'system');
  }

  receiveDuelResponse(payload) {
    if (!payload || typeof payload.accepted !== 'boolean'
      || !this.pendingDuelRequestId || payload.requestId !== this.pendingDuelRequestId) return;
    this.pendingDuelRequestId = null;
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
    if (!payload || typeof payload.senderUserId !== 'string' || !payload.senderUserId
      || typeof payload.senderName !== 'string' || !payload.senderName
      || !/^friend:[A-Za-z0-9:_-]{1,214}$/.test(payload.requestId || '')
      || !Number.isInteger(payload.senderLevel) || payload.senderLevel < 1 || payload.senderLevel > 9999) return;
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
    if (!payload || typeof payload.accepted !== 'boolean') return;
    const req = payload.requestPayload;
    if (!req || !this.pendingFriendRequestId || req.requestId !== this.pendingFriendRequestId) return;
    this.pendingFriendRequestId = null;
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

    // Start idle/faint (no messages yet).
    if (chatPanel) chatPanel.classList.add('empty');

    // Tab switching setup
    if (chatPanel) {
      const tabs = chatPanel.querySelectorAll('.chat-tab');
      tabs.forEach(tabBtn => {
        tabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tabName = tabBtn.getAttribute('data-tab');
          this._switchChatTab(tabName);
        });
      });
    }

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        if (chatPanel.classList.contains('preview-mode')) {
          this._openChatFull();
        } else {
          this._closeChatToPreview();
        }
      });
    }

    // Mobile: tapping the chat preview focuses the (always-visible) input,
    // which pops the keyboard natively — focus() here runs inside the tap
    // gesture so iOS/Android honour it.
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.addEventListener('click', () => {
        if (chatPanel.classList.contains('preview-mode') && chatInput) {
          try { chatInput.focus(); } catch (e) { /* ignore */ }
        }
      });
    }

    // Tap anywhere OUTSIDE the open chat (the world, a button, the HUD) fades it
    // back to the faint preview and drops the keyboard — no need to hunt for a
    // close button on mobile.
    this._listenGlobal(document, 'pointerdown', (e) => {
      if (!chatPanel || chatPanel.classList.contains('preview-mode')) return;
      if (e.target.closest('#chat-panel') || e.target.closest('#btn-chat-toggle')) return;
      this._closeChatToPreview();
    });

    // Tapping anywhere on the input bar (padding, label, gaps — not the emoji
    // or send buttons) focuses the input so the whole bar is one big tap target.
    const chatInputRow = chatPanel.querySelector('.chat-input-row');
    if (chatInputRow && chatInput) {
      chatInputRow.addEventListener('click', (e) => {
        if (e.target.closest('#btn-emoji') || e.target.closest('#btn-send-chat')) return;
        try { chatInput.focus(); } catch (err) { /* ignore */ }
      });
    }

    // Focusing the input (tap on mobile, or click on desktop) expands the panel
    // out of preview. Done here — not by re-focusing — to avoid a focus loop.
    if (chatInput) {
      chatInput.addEventListener('focus', () => {
        if (chatPanel.classList.contains('preview-mode')) {
          chatPanel.classList.remove('preview-mode');
          chatPanel.classList.remove('empty');
          const cm = document.getElementById('chat-messages');
          if (cm) cm.scrollTop = cm.scrollHeight;
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this._closeChatToPreview();
      });
    }

    let isSendingMessage = false;
    const sendMessage = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!chatInput || isSendingMessage) return false;
      const text = chatInput.value.trim();
      if (!text) return false;

      // Keep click, hardware Enter and mobile `enterkeyhint=send` on one path.
      // The guard prevents Chrome from dispatching the same send twice when a
      // virtual keyboard synthesizes both keyboard and click-style events.
      isSendingMessage = true;
      try {
        if (this.chatSendCallback) this.chatSendCallback(text);
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      } finally {
        isSendingMessage = false;
      }
      chatInput.focus();
      return true;
    };

    if (sendBtn) {
      sendBtn.addEventListener('click', (event) => sendMessage(event));
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
        sendMessage(e);
      });
    }

    // Global hotkey: Enter to toggle/focus chat panel helper
    this._listenGlobal(window, 'keydown', (e) => {
      if (e.defaultPrevented) return;
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
    const EMOJIS = ['😀', '😄', '😁', '😂', '🤣', '😊', '😉', '😍', '😘', '😎', '🤩', '🥳', '😴', '🤔', '😮', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🔥', '✨', '💯', '⚔️', '🛡️', '🏹', '🐉', '💰', '💎', '🎣', '🐟', '🏆', '❤️', '💔', '😱', '😅', '🤝'];
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
      this._listenGlobal(document, 'click', (e) => {
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
      mentionBox.replaceChildren(...names.map(name => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mention-cell';
        button.dataset.name = name;
        button.textContent = `👤 ${name}`;
        return button;
      }));
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
      // Focus SYNCHRONOUSLY so mobile browsers open the keyboard — a deferred
      // focus() (setTimeout) is ignored on iOS/Android because it's no longer
      // inside the user's tap gesture. The timeout is only a desktop fallback.
      try { chatInput.focus(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        try { chatInput.focus(); chatInput.select(); } catch (e) { /* ignore */ }
      }, 50);
    }

    // Auto scroll active tab to bottom when opening
    const cm = this.chatActiveTab === 'all'
      ? document.getElementById('chat-messages-all')
      : (this.chatActiveTab === 'general' ? document.getElementById('chat-messages') : document.getElementById('combat-log-messages'));
    if (cm) cm.scrollTop = cm.scrollHeight;
  }

  _closeChatToPreview() {
    const chatPanel = document.getElementById('chat-panel');
    const chatInput = document.getElementById('chat-input');
    const chatInputRow = chatPanel.querySelector('.chat-input-row');

    chatPanel.classList.add('preview-mode');
    // Keep the input row VISIBLE (dimmed via CSS) as a "tap to type" bar so
    // mobile users have something to tap; hiding it left no way to open it.
    if (chatInputRow) chatInputRow.style.display = 'flex';
    if (chatInput) chatInput.blur();

    // Auto scroll active tab to bottom
    const cm = this.chatActiveTab === 'all'
      ? document.getElementById('chat-messages-all')
      : (this.chatActiveTab === 'general' ? document.getElementById('chat-messages') : document.getElementById('combat-log-messages'));
    if (cm) cm.scrollTop = cm.scrollHeight;

    // Back to faint idle look if there's no conversation on screen.
    if (cm && cm.children.length === 0) chatPanel.classList.add('empty');
  }

  _switchChatTab(tabName) {
    this.chatActiveTab = tabName;
    const chatPanel = document.getElementById('chat-panel');
    if (!chatPanel) return;

    // Toggle active classes on tab buttons
    const tabs = chatPanel.querySelectorAll('.chat-tab');
    tabs.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Toggle display of message containers
    const containers = {
      all: document.getElementById('chat-messages-all'),
      general: document.getElementById('chat-messages'),
      system: document.getElementById('combat-log-messages')
    };

    for (const [key, el] of Object.entries(containers)) {
      if (el) {
        if (key === tabName) {
          el.style.display = 'block';
          // Auto-scroll to bottom of the active tab
          el.scrollTop = el.scrollHeight;
        } else {
          el.style.display = 'none';
        }
      }
    }
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
    if (window.sceneManager?.setFogEnabled) window.sceneManager.setFogEnabled(false);
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
    const chatMessages = this.chatMessagesEl || document.getElementById('chat-messages');
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

    // Append to general tab
    chatMessages.appendChild(row);
    while (chatMessages.children.length > 80) chatMessages.removeChild(chatMessages.firstChild);

    // Append to all tab
    const chatMessagesAll = this.chatMessagesAllEl || document.getElementById('chat-messages-all');
    if (chatMessagesAll) {
      chatMessagesAll.appendChild(row.cloneNode(true));
      while (chatMessagesAll.children.length > 80) chatMessagesAll.removeChild(chatMessagesAll.firstChild);
    }

    // A new message wakes the chat out of its faint idle state; it fades back
    // ~12s after the last message so an idle chat stays unobtrusive.
    const cp = document.getElementById('chat-panel');
    if (cp) {
      cp.classList.remove('empty');
      clearTimeout(this._chatIdleTimer);
      this._chatIdleTimer = setTimeout(() => {
        if (cp.classList.contains('preview-mode')) cp.classList.add('empty');
      }, 12000);
    }

    setTimeout(() => {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
      if (chatMessagesAll) {
        chatMessagesAll.scrollTo({ top: chatMessagesAll.scrollHeight, behavior: 'smooth' });
      }
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

    // Append to system tab
    if (this.combatLogEl) {
      this.combatLogEl.appendChild(el);
      while (this.combatLogEl.children.length > this.maxLogMessages) {
        this.combatLogEl.removeChild(this.combatLogEl.firstChild);
      }
    }

    // Append to all tab as clone
    const chatMessagesAll = this.chatMessagesAllEl || document.getElementById('chat-messages-all');
    if (chatMessagesAll) {
      chatMessagesAll.appendChild(el.cloneNode(true));
      while (chatMessagesAll.children.length > this.maxLogMessages) {
        chatMessagesAll.removeChild(chatMessagesAll.firstChild);
      }
    }

    setTimeout(() => {
      if (this.combatLogEl) {
        this.combatLogEl.scrollTo({ top: this.combatLogEl.scrollHeight, behavior: 'smooth' });
      }
      if (chatMessagesAll) {
        chatMessagesAll.scrollTo({ top: chatMessagesAll.scrollHeight, behavior: 'smooth' });
      }
    }, 50);
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
            // Fall back to what is actually being rendered rather than a fixed
            // 'medium', which mislabelled the tier whenever no explicit choice
            // had been saved for this character.
            graphicsSelect.value = this.character.gameSettings.graphics_quality
              || window.rendererSystem?.qualityLevel
              || localStorage.getItem('zolos_graphics_quality')
              || 'auto';
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
        // Scene density, instancing and composer passes are constructed at map
        // startup. Reload immediately so the selected tier is fully applied,
        // rather than presenting an unchanged scene until the next visit.
        setTimeout(() => window.location.reload(), 450);
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
        // Disable immediately to prevent double-tap
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        // Direct logout without confirm() to avoid blocking on mobile WebViews
        Promise.resolve(callback()).catch(err => {
          console.error('Logout callback error:', err);
          // Force reload as last resort
          window.location.reload();
        });
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

    // Buy button → open a confirmation dialog first.
    const buyBtn = document.getElementById('btn-buy-npc-item');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        this._confirmBuyDialog();
      });
    }

    // Quantity controls (− / + / MAX / manual input) for the buy shop.
    const qtyInput = document.getElementById('shop-qty-input');
    const stepQty = (delta) => {
      if (!qtyInput) return;
      qtyInput.value = (parseInt(qtyInput.value) || 1) + delta;
      this._updateShopTotal(true);
    };
    const minusBtn = document.getElementById('btn-shop-qty-minus');
    const plusBtn = document.getElementById('btn-shop-qty-plus');
    const maxBtn = document.getElementById('btn-shop-qty-max');
    if (minusBtn) minusBtn.addEventListener('click', () => stepQty(-1));
    if (plusBtn) plusBtn.addEventListener('click', () => stepQty(1));
    if (maxBtn) maxBtn.addEventListener('click', () => {
      if (qtyInput) qtyInput.value = Math.max(1, this._shopMaxAffordable());
      this._updateShopTotal(true);
    });
    if (qtyInput) {
      // Live total while typing, but the field itself is only corrected once
      // the player has finished entering a number.
      qtyInput.addEventListener('input', () => this._updateShopTotal(false));
      qtyInput.addEventListener('change', () => this._updateShopTotal(true));
      qtyInput.addEventListener('blur', () => this._updateShopTotal(true));
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

      if (this.currentShopTab === 'all') return itemData.type !== 'pet'; // pets have their own tab
      if (this.currentShopTab === 'usable') return itemData.type === 'usable' || itemData.type === 'consumable';
      if (this.currentShopTab === 'equip') return ['weapon', 'armor', 'shield', 'hat', 'glasses'].includes(itemData.type);
      if (this.currentShopTab === 'pet') return itemData.type === 'pet';
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
        ${itemIconMarkup(item.name, itemData.emoji, 'slot-emoji')}
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
    document.getElementById('shop-detail-icon').innerHTML = itemIconMarkup(this.selectedShopItem.name, itemData.emoji, 'item-visual--detail');
    document.getElementById('shop-detail-name').textContent = this.selectedShopItem.name;
    document.getElementById('shop-detail-type').textContent = itemData.type.toUpperCase();
    document.getElementById('shop-detail-desc').textContent = itemData.desc || 'ไม่มีคำอธิบาย';
    document.getElementById('shop-detail-price-val').textContent = this.selectedShopItem.price;

    const buyBtn = document.getElementById('btn-buy-npc-item');
    if (buyBtn) buyBtn.style.display = 'block';
    const priceLabel = document.getElementById('shop-price-label');
    if (priceLabel) priceLabel.textContent = 'ราคา';

    // Reset the quantity to 1 whenever a new item is selected, then refresh
    // the "affordable" hint + total.
    const qtyInput = document.getElementById('shop-qty-input');
    if (qtyInput) qtyInput.value = 1;
    this._updateShopTotal(true);
  }

  // How many of the selected item the player can afford (min 1 shown, 0 real).
  _shopMaxAffordable() {
    if (!this.selectedShopItem || !this.character) return 0;
    const price = this.selectedShopItem.price || 0;
    if (price <= 0) return 999;
    return Math.floor((this.character.stats.gold || 0) / price);
  }

  // Recompute the total price for the chosen quantity.
  //
  // `writeBack` must stay false while the player is typing. Rewriting a
  // number field's value on every keystroke made it impossible to enter a
  // quantity: clearing the box snapped it straight back to 1, and each digit
  // that pushed the value past what the player could afford was replaced by
  // the cap, so the typed number never appeared. The field is clamped on
  // change/blur and again before the purchase instead.
  _updateShopTotal(writeBack = false) {
    if (!this.selectedShopItem) return;
    const qtyInput = document.getElementById('shop-qty-input');
    const totalEl = document.getElementById('shop-total-price');
    const affEl = document.getElementById('shop-affordable');
    const price = this.selectedShopItem.price || 0;
    const affordable = this._shopMaxAffordable();

    let qty = parseInt(qtyInput && qtyInput.value) || 1;
    if (qty < 1) qty = 1;
    // Cap at what they can afford (but allow 1 so the buy button can warn).
    if (affordable >= 1 && qty > affordable) qty = affordable;
    if (writeBack && qtyInput && qtyInput.value !== String(qty)) qtyInput.value = qty;

    if (totalEl) totalEl.textContent = (price * qty).toLocaleString();
    if (affEl) affEl.textContent = `ซื้อได้สูงสุด: ${affordable.toLocaleString()}`;
  }

  _ensureBuyDialogStyles() {
    if (document.getElementById('buy-dialog-styles')) return;
    const st = document.createElement('style');
    st.id = 'buy-dialog-styles';
    st.textContent = `
    #buy-confirm-overlay{position:fixed;inset:0;z-index:100001;background:rgba(4,7,16,.66);
      display:flex;align-items:center;justify-content:center;padding:20px;animation:bcFade .15s ease;}
    @keyframes bcFade{from{opacity:0}to{opacity:1}}
    .bc-box{width:100%;max-width:320px;background:linear-gradient(160deg,#1c2542,#111528);
      border:1px solid rgba(240,192,64,.4);border-radius:18px;padding:20px 18px 16px;text-align:center;
      box-shadow:0 24px 70px rgba(0,0,0,.7);animation:bcPop .2s cubic-bezier(.34,1.56,.64,1);}
    @keyframes bcPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
    .bc-emoji{font-size:44px;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5));}
    .bc-title{font-size:16px;font-weight:800;color:#fff;margin:8px 0 10px;}
    .bc-item{font-size:14px;color:#ffe6a2;margin-bottom:12px;}
    .bc-rows{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;text-align:left;}
    .bc-row{display:flex;justify-content:space-between;font-size:12px;color:var(--text-dim);
      padding:6px 10px;background:rgba(255,255,255,.04);border-radius:8px;}
    .bc-row span:last-child{color:#fff;font-weight:700;}
    .bc-row.bc-total{background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.25);}
    .bc-row.bc-total span:last-child{color:#ffd94a;}
    .bc-warn{color:#ff7a7a;font-size:12px;font-weight:700;margin-bottom:10px;}
    .bc-actions{display:flex;gap:8px;}
    .bc-btn{flex:1;padding:11px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;border:none;
      font-family:var(--font-ui);transition:transform .1s,filter .15s;}
    .bc-btn:active{transform:scale(.96);}
    .bc-cancel{background:rgba(255,255,255,.08);color:#cdd6ee;border:1px solid rgba(255,255,255,.12);}
    .bc-ok{background:#f0c040;color:#000;}
    .bc-ok:hover:not(:disabled){filter:brightness(1.08);}
    .bc-ok:disabled{opacity:.4;cursor:not-allowed;filter:grayscale(1);}
    #buy-success-toast{position:fixed;left:50%;top:26%;transform:translate(-50%,-8px);z-index:100002;
      display:flex;align-items:center;gap:12px;padding:14px 20px;border-radius:14px;pointer-events:none;
      background:linear-gradient(135deg,#1e6b3a,#134a28);border:1px solid rgba(120,255,160,.4);
      box-shadow:0 12px 34px rgba(0,0,0,.55);opacity:0;transition:opacity .2s,transform .2s;}
    #buy-success-toast.show{opacity:1;transform:translate(-50%,0);}
    #buy-success-toast .bs-check{font-size:30px;animation:bsPop .4s ease;}
    @keyframes bsPop{0%{transform:scale(.3)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
    #buy-success-toast .bs-text{font-size:14px;font-weight:800;color:#fff;line-height:1.35;text-align:left;}
    #buy-success-toast .bs-text span{font-size:12px;font-weight:600;color:#c7f6d4;}
    `;
    document.head.appendChild(st);
  }

  // Confirmation popup shown when the player taps "Buy". Confirming runs the
  // purchase; the success status then pops up.
  _confirmBuyDialog() {
    if (!this.selectedShopItem || !this.character) return;
    this._ensureBuyDialogStyles();
    const item = this.selectedShopItem;
    const itemData = ITEMS[item.name];
    if (!itemData) return;
    const qtyInput = document.getElementById('shop-qty-input');
    let qty = parseInt(qtyInput && qtyInput.value) || 1;
    if (qty < 1) qty = 1;
    const total = item.price * qty;
    const gold = this.character.stats.gold || 0;
    const enough = gold >= total;

    let ov = document.getElementById('buy-confirm-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'buy-confirm-overlay';
    ov.innerHTML = `
      <div class="bc-box">
        <div class="bc-emoji">${itemIconMarkup(item.name, '', 'item-visual--detail')}</div>
        <div class="bc-title">ยืนยันการซื้อ?</div>
        <div class="bc-item">${itemIconMarkup(item.name, '', 'item-visual--market')} ${item.name} <b>x${qty}</b></div>
        <div class="bc-rows">
          <div class="bc-row"><span>ราคาชิ้นละ</span><span>${item.price.toLocaleString()} z</span></div>
          <div class="bc-row bc-total"><span>รวมทั้งหมด</span><span>${total.toLocaleString()} z</span></div>
          <div class="bc-row"><span>เงินคงเหลือหลังซื้อ</span><span style="color:${enough ? '#8fe0a8' : '#ff7a7a'}">${(gold - total).toLocaleString()} z</span></div>
        </div>
        ${enough ? '' : '<div class="bc-warn">❌ เงิน Zeny ไม่พอ</div>'}
        <div class="bc-actions">
          <button class="bc-btn bc-cancel">ยกเลิก</button>
          <button class="bc-btn bc-ok" ${enough ? '' : 'disabled'}>✅ ตกลง ซื้อเลย</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.bc-cancel').onclick = close;
    const ok = ov.querySelector('.bc-ok');
    if (ok && enough) {
      ok.onclick = async () => { close(); await this._performShopAction(); };
    }
  }

  // Success status popup after a completed purchase.
  _purchaseSuccessToast(itemData, item, qty) {
    this._ensureBuyDialogStyles();
    let t = document.getElementById('buy-success-toast');
    if (t) t.remove();
    t = document.createElement('div');
    t.id = 'buy-success-toast';
    t.innerHTML = `<div class="bs-check"><img src="/assets/zolos_icon.png" alt=""></div><div class="bs-text">ซื้อไอเทมสำเร็จ!<br><span>${itemIconMarkup(item.name, '', 'item-visual--market')} ${item.name} x${qty}</span></div>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2000);
  }

  async _performShopAction() {
    if (!this.selectedShopItem || !this.character) return;

    const item = this.selectedShopItem;
    const itemData = ITEMS[item.name];

    // Quantity chosen in the detail box (clamped to a sane range).
    const qtyInput = document.getElementById('shop-qty-input');
    let qty = parseInt(qtyInput && qtyInput.value) || 1;
    if (qty < 1) qty = 1;
    const totalCost = item.price * qty;

    if (this.character.stats.gold < totalCost) {
      this.addCombatLog(`❌ เงิน Zeny ไม่พอ (ต้องใช้ ${totalCost.toLocaleString()})`, 'system');
      if (this.soundManager && this.soundManager.playErrorSound) this.soundManager.playErrorSound();
      return;
    }

    // Deduct gold
    this.character.stats.gold -= totalCost;

    if (itemData.type === 'pet') {
      // Pets don't stack — each purchased pet becomes its own nameable instance.
      let row = this.inventory.find(i => i.item_name === item.name && i.item_type === 'pet');
      if (!row) {
        row = {
          item_name: item.name, item_type: 'pet', emoji: itemData.emoji, desc: itemData.desc,
          price: itemData.price || item.price, rarity: itemData.rarity || 'common',
          quantity: 0, stats: { instances: [] },
        };
        this.inventory.push(row);
      }
      this._ensurePetInstances(row);
      for (let k = 0; k < qty; k++) {
        row.stats.instances.push({ uid: this._newPetUid(), name: null, level: 1, xp: 0 });
      }
      row.quantity = row.stats.instances.length;
      if (this.characterId) {
        const { setInventoryItemQuantity } = await import('../network/GameSync.js');
        await setInventoryItemQuantity(this.characterId, item.name, 'pet', row.quantity, row.stats);
        if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
      }
    } else {
      // Add to inventory (normal stackable/equipment path).
      const existing = this.inventory.find(i => i.item_name === item.name);
      if (existing) {
        existing.quantity += qty;
      } else {
        this.inventory.push({
          item_name: item.name,
          item_type: itemData.type,
          emoji: itemData.emoji,
          desc: itemData.desc,
          price: itemData.price || item.price,
          healHp: itemData.healHp || 0,
          restoreSp: itemData.restoreSp || 0,
          quantity: qty,
          stats: itemData.stats || {}
        });
      }
      // Save persistence
      if (this.characterId) {
        // Fixed argument order: (characterId, itemName, itemType, quantity)
        await saveInventoryItem(this.characterId, item.name, itemData.type, qty);
        if (this.character.saveStatsToDatabase) {
          await this.character.saveStatsToDatabase();
        }
      }
    }

    this.addCombatLog(`🛒 ซื้อ ${itemData.emoji} ${item.name} x${qty} สำเร็จ (-${totalCost.toLocaleString()} Zeny)`, 'system');
    this._purchaseSuccessToast(itemData, item, qty);

    if (this.soundManager) {
      if (this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      else if (this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    }

    // Refresh UI (gold changed → re-clamp the affordable count + total).
    this._renderShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
    this._updateShopTotal();
  }

  openPetBoutique() {
    document.querySelectorAll('.side-panel').forEach(panel => { panel.style.display = 'none'; });
    if (this._petBoutiqueEscapeHandler) document.removeEventListener('keydown', this._petBoutiqueEscapeHandler);
    let modal = document.getElementById('pet-boutique-modal');
    if (!modal) {
      const style = document.createElement('style');
      style.id = 'pet-boutique-style';
      style.textContent = `#pet-boutique-modal{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(2,7,20,.9);backdrop-filter:blur(9px);box-sizing:border-box;pointer-events:auto!important;touch-action:pan-y}.pet-boutique{position:relative;z-index:1;width:min(1040px,96vw);max-height:91dvh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #394c70;border-radius:20px;background:#0d1425;box-shadow:0 30px 90px #000;pointer-events:auto}.pet-boutique__hero{position:relative;padding:20px 24px 17px;border-bottom:1px solid #2b3b5b;background:linear-gradient(110deg,#182743,#11192c)}.pet-boutique__hero h2{margin:0;color:#fff;font-size:clamp(20px,3vw,29px);letter-spacing:.04em}.pet-boutique__hero p{margin:5px 0 0;color:#aebed5;font-size:13px}.pet-boutique__close{position:absolute;right:15px;top:14px;z-index:5;width:48px;height:48px;border-radius:11px;border:1px solid #65789b;background:#10172b;color:white;font-size:25px;cursor:pointer;pointer-events:auto!important;touch-action:manipulation}.pet-boutique__wallet{position:absolute;right:78px;top:18px;padding:8px 13px;border-radius:9px;background:#0a1020;color:#ffd76f;font-weight:900}.pet-boutique__grid{padding:14px;overflow:auto;overscroll-behavior:contain;display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:11px;pointer-events:auto}.pet-card{position:relative;overflow:hidden;border:1px solid #273858;border-radius:14px;background:#111a2d;padding:9px;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s;text-align:left;color:white;min-width:0;pointer-events:auto;touch-action:manipulation}.pet-card:hover,.pet-card:focus-visible{transform:translateY(-2px);border-color:#7faeff;box-shadow:0 12px 26px rgba(0,0,0,.32);outline:none}.pet-card__art{height:150px;border-radius:10px;background:#071020;overflow:hidden;pointer-events:none}.pet-atlas-portrait{display:block;width:100%;height:100%;background-image:url('/assets/pets/pet-sanctuary-atlas-v1.png');background-repeat:no-repeat;background-size:400% 300%;background-position:var(--pet-x) var(--pet-y)}.pet-card__rarity{position:absolute;left:15px;top:15px;z-index:2;padding:4px 7px;border-radius:6px;background:rgba(5,10,24,.86);font-size:9px;font-weight:900;text-transform:uppercase;color:#ffe79d;pointer-events:none}.pet-card h3{font-size:14px;margin:9px 0 3px;color:#fff}.pet-card p{height:35px;overflow:hidden;margin:0;color:#aebdd3;font-size:10px;line-height:1.65}.pet-card__foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}.pet-card__price{font-weight:900;color:#ffd567}.pet-card__buy{position:relative;z-index:3;border:1px solid #5f8dcc;border-radius:8px;padding:8px 11px;background:#2f65a8;color:#fff;font-weight:900;cursor:pointer;pointer-events:auto!important;touch-action:manipulation}.pet-card__buy:disabled{filter:grayscale(1);opacity:.45}@media(max-width:620px){#pet-boutique-modal{padding:6px 6px calc(98px + env(safe-area-inset-bottom));align-items:flex-start}.pet-boutique{width:100%;max-height:calc(100dvh - 108px);border-radius:14px}.pet-boutique__hero{padding:14px}.pet-boutique__hero h2{font-size:19px}.pet-boutique__hero p{font-size:10px;max-width:58%}.pet-boutique__wallet{position:static;display:inline-block;margin-top:8px;font-size:11px}.pet-boutique__grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:7px}.pet-card{padding:6px}.pet-card__art{height:118px}.pet-card p{display:none}.pet-card h3{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pet-card__foot{display:block}.pet-card__price{font-size:11px}.pet-card__buy{width:100%;margin-top:5px;min-height:42px}}`;
      style.textContent += `.pet-boutique__body{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 320px;overflow:hidden}.pet-boutique__grid{border-right:1px solid #223353}.pet-boutique__detail{margin:14px;padding:14px;border:1px solid #31466b;border-radius:14px;background:#0a1120;overflow:auto;align-self:stretch}.pet-detail__art{height:220px;border-radius:11px;overflow:hidden;background:#050b16}.pet-detail__art .pet-atlas-portrait{height:100%}.pet-model-shot{width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 7px 11px rgba(0,0,0,.5))}.pet-card__art,.pet-detail__art{background:radial-gradient(circle at 50% 64%,#1b2942,#070d18 72%)}.pet-detail__rarity{display:inline-block;margin-top:12px;padding:4px 8px;border-radius:6px;background:#263a5c;color:#ffe19a;font-size:10px;font-weight:900;text-transform:uppercase}.pet-detail__name{margin:7px 0 4px;color:#fff;font-size:21px}.pet-detail__desc{margin:0;color:#b8c7dc;font-size:12px;line-height:1.7}.pet-detail__price-row{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:10px;border-radius:9px;background:#111c31}.pet-detail__price{color:#ffd464;font-size:17px;font-weight:900}.pet-detail__buy{width:100%;min-height:48px;margin-top:10px;border:1px solid #76a8ec;border-radius:10px;background:#356fb8;color:#fff;font-size:14px;font-weight:900;cursor:pointer;touch-action:manipulation}.pet-detail__buy:disabled{opacity:.45;filter:grayscale(1)}.pet-detail__back{display:none}.pet-card.is-selected{border-color:#8ab8ff;box-shadow:0 0 0 2px rgba(94,155,239,.35)}.pet-detail__combat{margin-top:11px;padding:10px 11px;border:1px solid #3a2f52;border-radius:11px;background:linear-gradient(150deg,#1a1330,#12182b)}.pet-detail__combat-title{display:flex;justify-content:space-between;align-items:center;color:#ffdf9a;font-size:12px;font-weight:900;letter-spacing:.02em}.pet-detail__elem{font-size:11px;font-weight:900}.pet-detail__move{margin:6px 0 8px;color:#e7d6ff;font-size:11px;line-height:1.55}.pet-detail__stats{display:flex;gap:7px;flex-wrap:wrap}.pet-detail__stats span{flex:1;min-width:64px;text-align:center;padding:6px 4px;border-radius:8px;background:#0c1424;color:#9fb2cd;font-size:10px}.pet-detail__stats strong{display:block;color:#fff;font-size:15px;margin-top:2px}.pet-detail__scale{margin-top:8px;color:#8fe3b0;font-size:10px;text-align:center}@media(max-width:700px){.pet-boutique__body{position:relative;display:flex;flex-direction:column;overflow:hidden}.pet-boutique__grid{border-right:none;order:1;flex:1 1 auto;min-height:0;overflow:auto;padding:9px}.pet-detail__back{display:block;width:100%;margin-bottom:11px;padding:12px;border:1px solid #3a4f75;border-radius:11px;background:#16233c;color:#cfe0ff;font-size:13px;font-weight:800;cursor:pointer;touch-action:manipulation}.pet-boutique__detail{position:absolute;inset:0;z-index:8;order:0;margin:0;display:block;padding:13px 13px calc(16px + env(safe-area-inset-bottom));border:none;border-radius:0;background:#0a1120;overflow:auto;transform:translateY(101%);transition:transform .24s ease;will-change:transform}.pet-boutique__detail.is-open{transform:translateY(0)}.pet-detail__art{height:200px;grid-row:auto}.pet-detail__rarity{margin-top:11px;width:max-content}.pet-detail__name{font-size:20px;margin:7px 0 4px}.pet-detail__desc{font-size:12px;line-height:1.6;max-height:none;overflow:visible}.pet-detail__price-row{margin-top:13px}.pet-detail__buy{min-height:50px;margin-top:11px}}`;
      document.head.appendChild(style);
      modal = document.createElement('div'); modal.id = 'pet-boutique-modal'; document.body.appendChild(modal);
    }
    const gold = Number(this.character?.stats?.gold) || 0;
    modal.innerHTML = `<section class="pet-boutique" role="dialog" aria-modal="true" aria-label="Pet Sanctuary"><header class="pet-boutique__hero"><h2>✦ Pet Sanctuary</h2><p>แตะสัตว์เลี้ยงเพื่อดูรายละเอียด ราคา และรับเลี้ยง</p><div class="pet-boutique__wallet">Zeny ${gold.toLocaleString()}</div><button class="pet-boutique__close" aria-label="ปิด">×</button></header><div class="pet-boutique__body"><div class="pet-boutique__grid">${PET_SHOP.map(entry=>{const data=ITEMS[entry.name];return `<article class="pet-card" tabindex="0" data-pet="${entry.name}"><span class="pet-card__rarity">${data.rarity}</span><div class="pet-card__art">${petModelMarkup(data.pet,320)||petPortraitMarkup(data.pet)}</div><h3>${entry.name.replace(' Pet','')}</h3><div class="pet-card__foot"><span class="pet-card__price">${entry.price.toLocaleString()} z</span><button class="pet-card__buy" ${gold<entry.price?'disabled':''}>เลือก</button></div></article>`}).join('')}</div><aside class="pet-boutique__detail" aria-live="polite"></aside></div></section>`;
    modal.style.display = 'flex'; this.updateMobileControlsVisibility();
    const close=()=>{modal.style.display='none';document.removeEventListener('keydown', onEscape);this._petBoutiqueEscapeHandler=null;if(this._petViewer)this._petViewer.pause();this.updateMobileControlsVisibility();};
    const onEscape=e=>{if(e.key==='Escape')close();};
    this._petBoutiqueEscapeHandler=onEscape;
    document.addEventListener('keydown',onEscape);
    modal.querySelector('.pet-boutique__close').onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
    const buyEntry=async(entry,button)=>{
        if(!entry||this.character.stats.gold<entry.price)return;
        const itemData=ITEMS[entry.name];
        const requestId=`pet:${this.characterId}:${Date.now()}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        button.disabled=true;button.textContent='กำลังรับเลี้ยง…';
        try {
          const result=await requestPetPurchase(this.characterId,entry.name,requestId,{price:entry.price,pet:itemData.pet});
          this.character.stats.gold=Number(result.gold);
          let row=this.inventory.find(i=>i.item_name===entry.name&&i.item_type==='pet');
          if(!row){row={item_name:entry.name,item_type:'pet',emoji:itemData.emoji,desc:itemData.desc,price:entry.price,rarity:itemData.rarity,quantity:0,stats:{instances:[]}};this.inventory.push(row);}
          row.quantity=Number(result.quantity)||1;
          row.stats=result.stats||{instances:result.instance?[result.instance]:[]};
          this.addCombatLog(`รับเลี้ยง ${entry.name} สำเร็จ (-${Number(result.price).toLocaleString()} Zeny)`,'system');
          this._purchaseSuccessToast(itemData,entry,1);
          this.soundManager?.playBuySellSound?.();
          this.updateHUD(this.character.stats);this.updateStats(this.character.stats);this._renderInventory();
          this.openPetBoutique();
        }
        catch(error){
          button.disabled=false;button.textContent='ลองใหม่';
          this.showToast?.(error?.message || 'ซื้อไม่สำเร็จ เงินยังอยู่ครบ');
          this.addCombatLog(`ซื้อสัตว์เลี้ยงไม่สำเร็จ: ${error?.message || 'กรุณาลองใหม่'}`,'system');
          console.error('[Pet Boutique] Purchase failed:',error);
        }
    };
    const detail=modal.querySelector('.pet-boutique__detail');
    const selectEntry=(entry,card,open=true)=>{
      const data=ITEMS[entry.name];
      modal.querySelectorAll('.pet-card').forEach(x=>x.classList.toggle('is-selected',x===card));
      const cb=getPetCombat(data.pet,1);
      const combatHtml=cb?`<div class="pet-detail__combat"><div class="pet-detail__combat-title">⚔️ พลังโจมตี <span class="pet-detail__elem" style="color:#${(cb.color&0xffffff).toString(16).padStart(6,'0')}">● ธาตุ${cb.elementName}</span></div><div class="pet-detail__move">${cb.attackName} — ${cb.desc}</div><div class="pet-detail__stats"><span>ATK <strong>${cb.atk}</strong></span><span>คูลดาวน์ <strong>${cb.cooldown}s</strong></span><span>คริ <strong>${Math.round(cb.crit*100)}%</strong></span></div><div class="pet-detail__scale">ยิ่งเลเวลสูง ยิ่งแรงขึ้น (+${getPetCombat(data.pet,2).atk-cb.atk} ATK/เลเวล)</div></div>`:'';
      detail.innerHTML=`<button class="pet-detail__back" type="button">← กลับไปเลือกตัวอื่น</button><div class="pet-detail__art">${petModelMarkup(data.pet,560)||petPortraitMarkup(data.pet)}</div><div><span class="pet-detail__rarity">${data.rarity}</span><h3 class="pet-detail__name">${entry.name.replace(' Pet','')}</h3><p class="pet-detail__desc">${data.desc}</p>${combatHtml}<div class="pet-detail__price-row"><span>ราคา</span><strong class="pet-detail__price">${entry.price.toLocaleString()} Zeny</strong></div></div><button class="pet-detail__buy" ${this.character.stats.gold<entry.price?'disabled':''}>${this.character.stats.gold<entry.price?'Zeny ไม่พอ':'รับเลี้ยงตัวนี้'}</button>`;
      const detailBuy=detail.querySelector('.pet-detail__buy');
      detailBuy.onclick=()=>buyEntry(entry,detailBuy);
      // Live animated 3D of the selected pet (the real in-game model, breathing
      // + swaying), mounted into the art slot. One shared viewer/context.
      const art=detail.querySelector('.pet-detail__art');
      if(art){
        if(this._petViewer===undefined){ try{ this._petViewer=new PetLiveViewer(); }catch(e){ this._petViewer=null; } }
        if(this._petViewer){ art.innerHTML=''; this._petViewer.mount(art); this._petViewer.show(data.pet); }
      }
      // Mobile: the detail is a slide-up sheet over the grid. Tapping a card
      // opens it; the back button returns to the full-height card list.
      detail.querySelector('.pet-detail__back').onclick=()=>{detail.classList.remove('is-open');if(this._petViewer)this._petViewer.pause();};
      if(open){detail.classList.add('is-open');detail.scrollTop=0;}else{detail.classList.remove('is-open');}
      // Run the animation when the detail is actually on-screen (always on
      // desktop; on mobile only once the sheet is opened) to spare the GPU.
      const isMobile=matchMedia('(max-width:700px)').matches;
      if(this._petViewer){ (open||!isMobile)?this._petViewer.resume():this._petViewer.pause(); }
    };
    modal.querySelectorAll('.pet-card').forEach(card=>{
      const entry=PET_SHOP.find(x=>x.name===card.dataset.pet);
      card.onclick=e=>{if(e.target.closest('.pet-card__buy'))return;selectEntry(entry,card);};
      card.querySelector('.pet-card__buy').onclick=e=>{e.stopPropagation();selectEntry(entry,card);};
      card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectEntry(entry,card);}};
    });
    const firstCard=modal.querySelector('.pet-card');
    if(firstCard)selectEntry(PET_SHOP[0],firstCard,false);
    modal.querySelector('.pet-boutique__close').focus();
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
    mythic: { c: '#ff78d1', b: '💠', t: 'มหาเทพ' },
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
          <div>${itemIconMarkup(it.name, '', 'item-visual--detail')}</div>
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
    const button = document.getElementById('heaven-convert');
    if (button) { button.disabled = true; button.textContent = 'กำลังยืนยันกับเซิร์ฟเวอร์…'; }
    try {
      const requestId = `ore:${this.characterId}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
      const result = await requestOreConversion(this.characterId, requestId);
      this.character.stats.zol = Number(result.zol) || 0;
      this.inventory = this.inventory.filter(i => i.item_name !== 'Celestial Ore');
      if (this.soundManager && this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      this.addCombatLog(`✨ แปลงแร่ ${result.ore_spent} ก้อน → +${Number(result.zol_gained).toLocaleString()} ZOL (ยอดรวม ${this.character.stats.zol.toLocaleString()})`, 'levelup');
      this._renderHeavenShop();
      this._renderInventory();
      this.updateHUD(this.character.stats);
    } catch (error) {
      this.showToast?.(error.message || 'แปลงแร่ไม่สำเร็จ แร่ยังอยู่ครบ');
      if (button) { button.disabled = false; button.textContent = `✨ แปลงทั้งหมด → +${(oreQty * H.ORE_TO_ZOL).toLocaleString()} ZOL`; }
    }
  }

  openDivineZolShop() {
    if (!this.character) return;
    this._divineCategory = this._divineCategory || 'all';
    let modal = document.getElementById('divine-shop-modal');
    if (!modal) {
      const style = document.createElement('style');
      style.id = 'divine-shop-style';
      style.textContent = `#divine-shop-modal{position:fixed;inset:0;z-index:1460;display:none;align-items:center;justify-content:center;background:rgba(1,4,15,.78);backdrop-filter:blur(6px);padding:12px;box-sizing:border-box}.divine-card{width:min(900px,96vw);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;border:2px solid #7defff;border-radius:18px;background:linear-gradient(145deg,#111a38,#090d20);box-shadow:0 0 38px rgba(74,223,255,.35),0 24px 70px #000}.divine-body{padding:14px;overflow:auto}.divine-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}.divine-tab{border:1px solid #345681;background:#101a36;color:#afc5e9;border-radius:999px;padding:8px 13px;cursor:pointer;font-weight:800}.divine-tab.on{color:#12203b;background:linear-gradient(135deg,#fff2a5,#64eaff);border-color:#fff}.divine-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:10px}.divine-item{border:1px solid rgba(112,225,255,.28);border-radius:14px;padding:11px;background:rgba(16,25,55,.85);display:grid;grid-template-columns:64px 1fr;gap:10px}.divine-buy{grid-column:1/-1;border:0;border-radius:10px;padding:10px;background:linear-gradient(135deg,#ffe780,#41dff7);color:#10203d;font-weight:900;cursor:pointer}.divine-buy:disabled{filter:grayscale(.75);opacity:.5;cursor:not-allowed}@media(max-width:600px){#divine-shop-modal{align-items:flex-start;padding:7px 7px 112px}.divine-card{max-height:calc(100dvh - 124px)}.divine-grid{grid-template-columns:1fr}}`;
      document.head.appendChild(style);
      modal = document.createElement('div');
      modal.id = 'divine-shop-modal';
      modal.innerHTML = '<div class="divine-card"></div>';
      modal.onclick = e => { if (e.target === modal) { modal.style.display = 'none'; this.updateMobileControlsVisibility(); } };
      document.body.appendChild(modal);
    }
    this._renderDivineZolShop();
    modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
  }

  _renderDivineZolShop() {
    const card = document.querySelector('#divine-shop-modal .divine-card');
    if (!card || !this.character) return;
    const zol = Number(this.character.stats.zol) || 0;
    const level = Number(this.character.stats.level) || 1;
    const categories = [['all', '✨ ทั้งหมด'], ['hat', '🎩 หมวก'], ['glasses', '👓 แว่นตา'], ['head', '🪖 ศีรษะ'], ['body', '👕 เสื้อเกราะ'], ['garment', '🧥 ผ้าคลุม'], ['wrist', '⌚ ข้อมือ'], ['pants', '👖 กางเกง'], ['feet', '🥾 รองเท้า'], ['weapon', '⚔️ อาวุธ'], ['shield', '🛡️ โล่'], ['ring', '💍 แหวน'], ['accessory', '💎 เครื่องประดับ']];
    const rows = DIVINE_ZOL_SHOP.filter(x => this._divineCategory === 'all' || x.category === this._divineCategory).map(entry => {
      const item = ITEMS[entry.name];
      const owned = this.inventory.some(x => x.item_name === entry.name && Number(x.quantity) > 0);
      const locked = level < (item.levelReq || 1);
      const poor = zol < entry.zolPrice;
      const job = itemJob(entry.name);
      const stats = [['ATK', item.atkBonus], ['DEF', item.defBonus], ['HP', item.hpBonus], ['SP', item.spBonus]].filter(x => x[1]).map(x => `${x[0]} +${Number(x[1]).toLocaleString()}`).join(' · ');
      const disabled = owned || locked || poor || this._divinePurchasePending;
      const label = owned ? '✅ มีแล้ว' : locked ? `🔒 เลเวล ${item.levelReq}` : poor ? '🪙 ZOL ไม่พอ' : `ซื้อ ${entry.zolPrice.toLocaleString()} ZOL`;
      return `<div class="divine-item"><div>${itemIconMarkup(entry.name, item.emoji, 'item-visual--detail')}</div><div><div style="font-weight:900;color:#fff">${entry.name}</div><div style="font-size:11px;color:#ff8fdd">💠 มหาเทพ · Lv.${item.levelReq}${job ? ` · ${JOBS[job]?.name || job}` : ''}</div><div style="font-size:11px;color:#75eaff;margin-top:5px">${stats}</div></div><button class="divine-buy" data-divine-buy="${entry.name}" ${disabled ? 'disabled' : ''}>${label}</button></div>`;
    }).join('');
    card.innerHTML = `<div style="padding:16px 18px;border-bottom:1px solid #29476e;position:relative;background:linear-gradient(90deg,rgba(255,216,75,.14),rgba(68,225,255,.1))"><button id="divine-close" style="position:absolute;right:13px;top:12px;border:1px solid #45658c;background:#101831;color:#d8eaff;border-radius:8px;width:32px;height:32px;cursor:pointer">✕</button><div style="font-size:21px;font-weight:900;color:#fff">⚜️ ร้านเทพ ZOL</div><div style="color:#8eeeff;font-size:12px">ของมหาเทพหายาก ซื้อด้วย ZOL เท่านั้น · ยอดคงเหลือ <b>${zol.toLocaleString()} ZOL</b></div></div><div class="divine-body"><div class="divine-tabs">${categories.map(([id, label]) => `<button class="divine-tab ${this._divineCategory === id ? 'on' : ''}" data-divine-cat="${id}">${label}</button>`).join('')}</div><div class="divine-grid">${rows}</div></div>`;
    card.querySelector('#divine-close').onclick = () => { document.getElementById('divine-shop-modal').style.display = 'none'; this.updateMobileControlsVisibility(); };
    card.querySelectorAll('[data-divine-cat]').forEach(button => { button.onclick = () => { this._divineCategory = button.dataset.divineCat; this._renderDivineZolShop(); }; });
    card.querySelectorAll('[data-divine-buy]').forEach(button => { button.onclick = () => this._buyDivineItem(button.dataset.divineBuy); });
  }

  async _buyDivineItem(name) {
    if (this._divinePurchasePending) return;
    const entry = DIVINE_ZOL_SHOP.find(x => x.name === name);
    const item = entry && ITEMS[name];
    if (!entry || !item || !this.character) return;
    const stats = this.character.stats;
    if ((Number(stats.level) || 1) < item.levelReq || (Number(stats.zol) || 0) < entry.zolPrice) return this._renderDivineZolShop();
    if (this.inventory.some(x => x.item_name === name && Number(x.quantity) > 0)) return;
    if (!window.confirm(`ซื้อ ${name} ราคา ${entry.zolPrice.toLocaleString()} ZOL ใช่หรือไม่?`)) return;
    this._divinePurchasePending = true;
    const beforeZol = Number(stats.zol) || 0;
    stats.zol = beforeZol - entry.zolPrice;
    const record = { item_name: name, item_type: item.type, emoji: item.emoji, desc: item.desc, price: 0, quantity: 1, stats: { equipped: false } };
    this.inventory.push(record);
    this._renderDivineZolShop();
    try {
      if (this.characterId) {
        await saveInventoryItem(this.characterId, name, item.type, 1, record.stats);
        if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
      }
      this.soundManager?.playBuySellSound?.();
      this.addCombatLog(`⚜️ ซื้อ ${name} สำเร็จ — ใช้ ${entry.zolPrice.toLocaleString()} ZOL`, 'levelup');
    } catch (error) {
      stats.zol = beforeZol;
      const rollbackIndex = this.inventory.indexOf(record);
      if (rollbackIndex >= 0) this.inventory.splice(rollbackIndex, 1);
      if (this.characterId) await saveInventoryItem(this.characterId, name, item.type, -1).catch(() => {});
      this.addCombatLog('❌ ซื้อไม่สำเร็จ ระบบคืน ZOL แล้ว กรุณาลองใหม่', 'system');
      console.error('[DivineShop] purchase rolled back:', error);
    } finally {
      this._divinePurchasePending = false;
      this._renderDivineZolShop(); this._renderInventory(); this.updateHUD(this.character.stats);
    }
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
        @media (hover: hover) {
          .daily-claim-btn:hover{transform:scale(1.02);box-shadow:0 0 30px rgba(255,207,74,.6) !important;}
        }
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

    const itemLine = (r) => r.items.map(it => `${itemIconMarkup(it.name, '', 'item-visual--market')}×${it.qty}`).join(' ');

    const slots = rewards.map(r => {
      const isToday = r.day === todayIdx;
      const isPast = r.day < todayIdx || (!canClaim && r.day === todayIdx);
      const isDay7 = r.day === 7;
      const bg = isToday && canClaim
        ? `linear-gradient(160deg,rgba(${parseInt(r.color.slice(1, 3), 16)},${parseInt(r.color.slice(3, 5), 16)},${parseInt(r.color.slice(5, 7), 16)},.25),rgba(255,122,46,.15))`
        : isPast ? 'rgba(95,221,122,.08)' : 'rgba(255,255,255,.04)';
      const border = isToday && canClaim ? r.color : isPast ? 'rgba(95,221,122,.4)' : 'rgba(255,255,255,.09)';
      const label = isPast ? '✅' : (isToday && canClaim ? '⭐ วันนี้' : r.title);
      return `
        <div class="${isToday && canClaim ? 'daily-slot-today' : ''}" style="border-radius:12px;padding:12px 6px;text-align:center;
          background:${bg};border:2px solid ${border};${isDay7 ? 'grid-column:span 2;' : ''}
          ${isPast && !(isToday && canClaim) ? 'opacity:.55;filter:saturate(.6);' : ''}
          transition: all 0.3s ease; cursor: ${isToday && canClaim ? 'pointer' : 'default'};">
          <div style="font-size:9px;font-weight:800;color:${isToday && canClaim ? r.color : '#9aa5c0'};margin-bottom:4px;">${label}</div>
          <div style="height:${isDay7 ? '42px' : '34px'};margin-bottom:4px;display:flex;justify-content:center;">${itemIconMarkup(isDay7 ? 'Dragon Heart' : 'Copper Coin', '', 'item-visual--detail')}</div>
          <div style="font-size:11px;color:${r.color};font-weight:700;">${r.gold.toLocaleString()}g</div>
          ${r.items.length ? `<div style="font-size:10px;color:#9fccff;margin-top:3px;">${itemLine(r)}</div>` : ''}
          ${isDay7 ? `<div style="font-size:9px;color:#ff9a7a;font-weight:700;margin-top:3px;">Dragon Heart!</div>` : ''}
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
      if (this.characterId) saveInventoryItem(this.characterId, it.name, meta.type || 'material', it.qty).catch(() => { });
    }

    // Advance the streak and persist
    this.loginStreak = { streak: pending, lastClaim: this._todayStr() };
    await this._saveLoginStreak();
    if (this.character.saveStatsToDatabase) this.character.saveStatsToDatabase().catch(() => { });

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
        #stall-card .stall-header-row,#stall-card .stall-listing{display:flex;align-items:center;min-width:0;}
        #stall-card .stall-header-row{gap:10px;}
        #stall-card .stall-header-copy,#stall-card .stall-listing-copy{flex:1 1 auto;min-width:0;}
        #stall-card .stall-shop-name{font-weight:900;color:#ffd97a;font-size:17px;line-height:1.35;
          text-shadow:0 0 10px rgba(255,178,32,.5);overflow-wrap:anywhere;word-break:break-word;}
        #stall-card .stall-owner-name{font-size:11px;line-height:1.5;color:#c8b088;overflow-wrap:anywhere;}
        #stall-card .stall-listing{gap:10px;padding:9px 10px;border-radius:10px;margin-bottom:8px;}
        #stall-card .stall-listing-name{font-weight:800;font-size:12px;line-height:1.4;
          overflow-wrap:anywhere;word-break:break-word;}
        #stall-card .stall-price{font-size:11px;color:#ffd97a;font-weight:700;font-variant-numeric:tabular-nums;}
        #stall-card .stall-action{flex:0 0 auto;min-width:58px;min-height:44px;white-space:normal;line-height:1.25;}
        #stall-card #stall-close{flex:0 0 44px;width:44px;height:44px;}
        @media (max-width:768px){
          #stall-modal{align-items:flex-start;padding:8px 8px 116px;}
          #stall-card{width:100%;max-height:calc(100vh - 132px);max-height:calc(100dvh - 132px);}
          #stall-card .stall-body{padding:12px!important;}
          #stall-card .stall-listing{align-items:flex-start;gap:8px;}
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
        <div class="stall-header-row">
          <div style="font-size:26px;">🏪</div>
          <div class="stall-header-copy">
            <div class="stall-shop-name">${esc(stall.shop_name)}</div>
            <div class="stall-owner-name">ร้านของ ${esc(stall.owner_name)}${mine ? ' (ร้านคุณเอง)' : ''}</div>
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
      // Pets: show the custom name (each is its own separate listing, never merged).
      const isPet = l.item_type === 'pet';
      const petNm = (isPet && l.stats && l.stats.petName) ? l.stats.petName : null;
      const petLv = (isPet && l.stats && l.stats.petLevel) ? l.stats.petLevel : null;
      const disp = isPet
        ? `${esc(l.item_name.replace(/ Pet$/, ''))}${petNm ? ` 「${esc(petNm)}」` : ''}${petLv ? ` Lv.${petLv}` : ''}`
        : `${esc(l.item_name)} ×${l.quantity}`;
      return `
        <div class="stall-listing" style="background:rgba(0,0,0,.3);border:1px solid ${rc}44;">
          <div>${itemIconMarkup(l.item_name, '', 'item-visual--market')}</div>
          <div class="stall-listing-copy">
            <div class="stall-listing-name" style="color:${rc};">${disp}</div>
            <div class="stall-price">💰 ${Number(l.price).toLocaleString()} Zeny</div>
          </div>
          ${mine
          ? `<button class="stall-action" data-stall-cancel="${l.id}" style="border:none;border-radius:10px;padding:7px 12px;cursor:pointer;font-weight:800;font-size:11px;background:rgba(224,72,58,.85);color:#fff;">ยกเลิก</button>`
          : `<button class="stall-action" data-stall-buy="${l.id}" style="border:none;border-radius:10px;padding:7px 14px;cursor:pointer;font-weight:800;font-size:12px;background:linear-gradient(135deg,#ffcf4a,#ff9e2e);color:#3a2600;">ซื้อ</button>`}
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
      this.addCombatLog(`🏪✨ เปิดแผง "${name}" ที่ถนนตลาดแล้ว! (ช่องที่ ${res.slot + 1}) — ร้านมีอายุ 48 ชั่วโมง ครบกำหนดจะคืนสินค้าทั้งหมดเข้ากระเป๋าและเก็บแผงอัตโนมัติ`, 'levelup');
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
          <span>${itemIconMarkup(req.name, md.emoji || '📦', 'item-visual--forge-material')}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(req.name)}</span>
          <span style="font-weight:700;">${have}/${req.qty}</span></div>`;
      }).join('');

      const btn = allOk
        ? `<button data-forge="${idx}" style="border:none;border-radius:14px;padding:8px 16px;cursor:pointer;font-weight:800;font-size:12px;background:linear-gradient(135deg,#ff9e2e,#ff5a1a);color:#2a1000;">⚒️ ตี</button>`
        : `<span style="font-size:11px;color:#8a7a6a;">ส่วนผสมไม่ครบ</span>`;

      return `
        <div style="margin-bottom:12px;padding:12px;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid ${rc}55;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div>${itemIconMarkup(r.result, res.emoji || '🗡️', 'item-visual--forge-result')}</div>
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

    const tab = this.forgeTab || 'craft';
    const tabBtn = (id, label) => `<button data-forgetab="${id}" style="flex:1;padding:8px 4px;border:none;cursor:pointer;font-weight:800;font-size:12px;border-radius:10px;
      background:${tab === id ? 'linear-gradient(135deg,#ff9e2e,#ff5a1a)' : 'rgba(255,255,255,.06)'};color:${tab === id ? '#2a1000' : '#e0c0a0'};">${label}</button>`;

    card.innerHTML = `
      <div class="forge-head" style="padding:14px 16px 10px;background:linear-gradient(90deg,#3a1c10,#241109);border-bottom:1px solid #b5642a;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="font-size:22px;">⚒️</div>
          <div style="flex:1;">
            <div style="font-weight:900;color:#ffdcb0;font-size:17px;">โรงตีเหล็ก</div>
            <div style="font-size:11px;color:#c79a78;">ตีอาวุธพิเศษ · ตีบวกเสริมพลังไม่มีเพดาน</div>
          </div>
          <div style="font-size:12px;color:#ffcf6a;font-weight:700;">💰 ${gold.toLocaleString()}</div>
          <button id="forge-close" style="background:rgba(255,255,255,.08);border:none;color:#f0d0b0;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;">✕</button>
        </div>
        <div style="display:flex;gap:6px;">${tabBtn('craft', '⚒️ ตีอาวุธ')}${tabBtn('refine', '✨ ตีบวก')}</div>
      </div>
      <div class="forge-body" style="padding:14px 16px;">${tab === 'refine' ? this._refineBodyHTML() : cards}</div>`;

    card.querySelector('#forge-close').onclick = () => {
      const m = document.getElementById('forge-modal'); if (m) m.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    card.querySelectorAll('[data-forgetab]').forEach(b => {
      b.onclick = () => { this.forgeTab = b.getAttribute('data-forgetab'); this._renderForge(); };
    });
    card.querySelectorAll('[data-forge]').forEach(b => {
      b.onclick = () => this._forgeItem(FORGE_RECIPES[parseInt(b.getAttribute('data-forge'), 10)]);
    });
    card.querySelectorAll('[data-rf]').forEach(b => {
      b.onclick = () => { this.refineSel = b.getAttribute('data-rf'); this._renderForge(); };
    });
    const rfBtn = card.querySelector('#refine-go');
    if (rfBtn) rfBtn.onclick = () => this._performRefine();
  }

  // The "✨ ตีบวก" tab body: pick a refinable item, preview the next level, cost
  // and success %, then hammer it. Refine is stored in item.stats.refine.
  _refineBodyHTML() {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const gold = this.character ? (Number(this.character.stats.gold) || 0) : 0;
    const list = (this.inventory || []).filter(i => REFINABLE_TYPES.includes(i.item_type));
    if (list.length === 0) {
      return `<div style="text-align:center;color:#c79a78;font-size:13px;padding:24px 8px;">ยังไม่มีอาวุธ/เกราะ/โล่ให้ตีบวก<br/>ไปซื้อหรือฟาร์มมาก่อนนะ แล้วกลับมาตีบวกได้เลย ✨</div>`;
    }
    if (!this.refineSel || !list.find(i => i.item_name === this.refineSel)) this.refineSel = list[0].item_name;

    const cells = list.map(i => {
      const rf = (i.stats && i.stats.refine) || 0;
      const sel = this.refineSel === i.item_name;
      const col = refineTierColor(rf);
      return `<div data-rf="${esc(i.item_name)}" style="position:relative;cursor:pointer;text-align:center;padding:8px 4px;border-radius:10px;
        background:${sel ? 'rgba(255,180,80,.16)' : 'rgba(0,0,0,.28)'};border:1.5px solid ${sel ? '#ff9e2e' : (rf > 0 ? col + '66' : 'rgba(180,150,120,.25)')};">
        <div style="line-height:1;">${itemIconMarkup(i, i.emoji || '📦', 'item-visual--forge-cell')}</div>
        ${rf > 0 ? `<div style="position:absolute;top:2px;right:5px;font-size:10px;font-weight:900;color:${col};">+${rf}</div>` : ''}
        <div style="font-size:8.5px;color:#d9c4ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${esc(i.item_name)}</div>
      </div>`;
    }).join('');

    const sel = list.find(i => i.item_name === this.refineSel);
    const data = ITEMS[sel.item_name] || {};
    const L = (sel.stats && sel.stats.refine) || 0;
    const info = refineInfo(L);
    const col = refineTierColor(L);
    const nextCol = refineTierColor(L + 1);
    const ore = refineOreFor(sel.item_type);
    const oreHave = this._invCount(ore);
    const mNow = getRefineMult(L), mNext = getRefineMult(L + 1);
    const statLine = (label, base) => base ? `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;">
        <span style="color:#c9b79c;">${label}</span>
        <span style="color:#fff;font-weight:700;">${Math.round(base * mNow)} <span style="color:#7fe0a0;">→ ${Math.round(base * mNext)}</span></span></div>` : '';
    const stats = statLine('⚔️ ATK', data.atkBonus) + statLine('🛡️ DEF', data.defBonus) + statLine('❤️ HP', data.hpBonus) + statLine('💧 SP', data.spBonus);

    const chancePct = Math.round(info.chance * 100);
    const chanceCol = info.chance >= 0.8 ? '#7fe0a0' : info.chance >= 0.5 ? '#ffcf6a' : '#ff8f7a';
    const goldOk = gold >= info.gold, oreOk = oreHave >= info.ore;
    const canDo = goldOk && oreOk;

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:6px;margin-bottom:12px;max-height:120px;overflow-y:auto;">${cells}</div>
      <div id="refine-stage" style="text-align:center;margin:4px 0 10px;">
        <div style="line-height:1;filter:drop-shadow(0 0 10px ${col});">${itemIconMarkup(sel, sel.emoji || '🗡️', 'item-visual--forge-stage')}</div>
        <div style="font-weight:900;font-size:16px;color:${col};margin-top:4px;">${L > 0 ? '+' + L + ' ' : ''}${esc(sel.item_name)}</div>
      </div>
      <div style="background:rgba(0,0,0,.3);border:1px solid rgba(180,150,120,.25);border-radius:12px;padding:10px 12px;margin-bottom:10px;">
        ${stats || '<div style="font-size:12px;color:#c9b79c;text-align:center;">ไอเทมนี้เพิ่มพลังตามระดับตีบวก</div>'}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:12px;color:#c9b79c;">โอกาสสำเร็จ +${L}→+${L + 1}</span>
        <span style="font-weight:900;font-size:16px;color:${chanceCol};">${chancePct}%</span>
      </div>
      ${info.downgrade ? `<div style="font-size:10.5px;color:#ff9a7a;margin-bottom:8px;">⚠️ ถ้าล้มเหลว ระดับตีบวกจะลดลง ${info.downgrade} ระดับ</div>`
        : `<div style="font-size:10.5px;color:#9fd0a0;margin-bottom:8px;">🛡️ ปลอดภัย: ล้มเหลวก็ไม่ลดระดับ</div>`}
      <div style="display:flex;gap:14px;justify-content:center;font-size:12px;margin-bottom:12px;">
        <span style="color:${goldOk ? '#ffcf6a' : '#ff8f7a'};">💰 ${info.gold.toLocaleString()}</span>
        <span style="display:inline-flex;align-items:center;gap:5px;color:${oreOk ? '#cfe0ff' : '#ff8f7a'};">${itemIconMarkup(ore, ITEMS[ore]?.emoji || '🔩', 'item-visual--forge-material')} ${ore} ${oreHave}/${info.ore}</span>
      </div>
      <button id="refine-go" ${canDo ? '' : 'disabled'} style="width:100%;padding:12px;border:none;border-radius:14px;cursor:${canDo ? 'pointer' : 'not-allowed'};
        font-weight:900;font-size:15px;color:${canDo ? '#2a1000' : '#8a7a6a'};
        background:${canDo ? `linear-gradient(135deg,${nextCol},#ff7a2a)` : 'rgba(255,255,255,.06)'};box-shadow:${canDo ? '0 6px 18px rgba(255,140,40,.4)' : 'none'};">
        ✨ ตีบวก → +${L + 1}
      </button>`;
  }

  async _performRefine() {
    if (!this.character) return;
    const item = (this.inventory || []).find(i => i.item_name === this.refineSel);
    if (!item || !REFINABLE_TYPES.includes(item.item_type)) return;

    const L = (item.stats && item.stats.refine) || 0;
    const info = refineInfo(L);
    const ore = refineOreFor(item.item_type);
    const gold = Number(this.character.stats.gold) || 0;

    if (gold < info.gold) { this.addCombatLog('❌ เงิน Zeny ไม่พอตีบวก', 'warning'); return; }
    if (this._invCount(ore) < info.ore) { this.addCombatLog(`❌ ${ore} ไม่พอ (ต้องใช้ ${info.ore})`, 'warning'); return; }

    // Consume gold + ore up front (win or lose).
    this.character.stats.gold = gold - info.gold;
    const oreInv = this.inventory.find(i => i.item_name === ore);
    if (oreInv) {
      oreInv.quantity -= info.ore;
      if (oreInv.quantity <= 0) this.inventory = this.inventory.filter(i => i !== oreInv);
      if (this.characterId) saveInventoryItem(this.characterId, ore, 'material', -info.ore).catch(() => { });
    }

    const success = Math.random() < info.chance;
    if (!item.stats) item.stats = {};
    let newLevel = L;
    if (success) {
      newLevel = L + 1;
    } else if (info.downgrade) {
      newLevel = Math.max(0, L - info.downgrade);
    }
    item.stats.refine = newLevel;

    // Persist item stats + gold.
    if (this.characterId) {
      updateInventoryItemStats(this.characterId, item.item_name, item.stats).catch(() => { });
      if (this.character.saveStatsToDatabase) this.character.saveStatsToDatabase().catch(() => { });
    }

    // If this item is equipped, its bonus just changed → re-apply + refresh HUD.
    if (item.stats.equipped === true) {
      this._syncEquipRefine();
      this.updateHUD(this.character.stats);
      this.updateStats(this.character.stats);
    }

    // Feedback + spectacle.
    if (success) {
      this.addCombatLog(`✨✅ ตีบวก ${item.emoji || ''} ${item.item_name} สำเร็จ! เป็น +${newLevel}`, 'levelup');
      if (this.triggerScreenShake) this.triggerScreenShake(true);
      if (this.soundManager && this.soundManager.playLevelUpSound) this.soundManager.playLevelUpSound();
      this._refineFlash(true, newLevel);
    } else {
      const msg = info.downgrade && newLevel < L
        ? `💥 ตีบวกล้มเหลว! ${item.item_name} ลดเหลือ +${newLevel}`
        : `💨 ตีบวกล้มเหลว! ${item.item_name} ยังคง +${newLevel}`;
      this.addCombatLog(msg, 'warning');
      if (this.soundManager && this.soundManager.playErrorSound) this.soundManager.playErrorSound();
      this._refineFlash(false, newLevel);
    }

    this._renderForge();
    this._renderInventory();
  }

  // Quick success/fail flash over the refine stage.
  _refineFlash(success, level) {
    const stage = document.getElementById('refine-stage');
    if (!stage) return;
    const badge = document.createElement('div');
    badge.textContent = success ? `✨ +${level} SUCCESS!` : '💥 FAIL';
    badge.style.cssText = `position:absolute;left:50%;top:0;transform:translate(-50%,-6px);font-weight:900;font-size:18px;pointer-events:none;
      color:${success ? '#ffe27a' : '#ff8f7a'};text-shadow:0 2px 10px rgba(0,0,0,.7);opacity:0;transition:opacity .15s,transform .5s;z-index:5;`;
    stage.style.position = 'relative';
    stage.appendChild(badge);
    requestAnimationFrame(() => { badge.style.opacity = '1'; badge.style.transform = 'translate(-50%,-34px)'; });
    setTimeout(() => { badge.style.opacity = '0'; }, 900);
    setTimeout(() => badge.remove(), 1200);
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
      if (this.characterId) saveInventoryItem(this.characterId, req.name, type, -req.qty).catch(() => { });
    }

    // Add the forged weapon
    const resData = ITEMS[recipe.result] || {};
    const existing = this.inventory.find(i => i.item_name === recipe.result);
    if (existing) existing.quantity += 1;
    else this.inventory.push({ item_name: recipe.result, item_type: resData.type || 'weapon', emoji: resData.emoji, desc: resData.desc, price: resData.price || 0, quantity: 1, stats: {} });
    if (this.characterId) {
      saveInventoryItem(this.characterId, recipe.result, resData.type || 'weapon', 1).catch(() => { });
      if (this.character.saveStatsToDatabase) this.character.saveStatsToDatabase().catch(() => { });
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

  // Legacy NPC shop implementation retained only for old saved UI layouts.
  // The active implementation is the single "NPC Sell Shop Logic" path below.
  _setupSellShopEventsLegacy() {
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

  // Sell price for one unit. Base is 80% of buy price; a pet earns +12% per
  // level so a fattened pet is worth far more than a fresh one ("ขุนแล้วขาย").
  _sellUnitPrice(item) {
    if (item.item_type === 'pet') {
      const lvl = (item.stats && item.stats.petLevel) || 1;
      return Math.floor((item.price || 0) * 0.8 * (1 + (lvl - 1) * 0.12));
    }
    return Math.floor((item.price || 0) * 0.8);
  }

  _renderSellShopLegacy() {
    const grid = document.getElementById('sell-shop-inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const goldDisplay = document.getElementById('sell-shop-gold-amount');
    if (goldDisplay && this.character) {
      goldDisplay.textContent = this.character.stats.gold.toLocaleString();
    }

    // Show only non-equipped sellable items. Pets are excluded — they're sold
    // per-instance from the pet popup so each named pet is handled individually.
    // Cards are excluded — they can only be traded to other players via the
    // P2P market (My Card → ตั้งขายให้ผู้เล่น), never sold to the NPC shop.
    const sellableItems = this.inventory.filter(i => !this._isItemEquipped(i) && i.item_type !== 'pet' && i.item_type !== 'card');

    sellableItems.forEach(item => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (item.rarity) slot.classList.add(`rarity-${item.rarity}`);
      if (this.selectedSellShopItem && this.selectedSellShopItem.item_name === item.item_name) {
        slot.classList.add('selected');
      }

      slot.innerHTML = `
        ${itemIconMarkup(item, ITEMS[item.item_name]?.emoji || item.emoji)}
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

  _updateSellShopDetailLegacy() {
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
    document.getElementById('sell-shop-detail-icon').innerHTML = itemIconMarkup(item, ITEMS[item.item_name]?.emoji || item.emoji, 'item-visual--detail');
    document.getElementById('sell-shop-detail-name').textContent = item.item_name;
    document.getElementById('sell-shop-detail-type').textContent = item.item_type.toUpperCase();
    // For pets, spell out that the higher price comes from its level.
    let descText = item.desc || '';
    if (item.item_type === 'pet') {
      const lvl = (item.stats && item.stats.petLevel) || 1;
      descText += `\n🐾 เลเวลสัตว์เลี้ยง: Lv.${lvl} — ยิ่งเลเวลสูง ราคาขายยิ่งแพง (ขุนแล้วขาย)`;
    }
    document.getElementById('sell-shop-detail-desc').textContent = descText;
    document.getElementById('sell-shop-owned-qty').textContent = `มีอยู่: ${item.quantity} ชิ้น`;

    const unitPrice = this._sellUnitPrice(item);
    document.getElementById('sell-shop-unit-price').textContent = unitPrice.toLocaleString();

    const qtyInput = document.getElementById('sell-shop-qty-input');
    if (qtyInput) {
      if (parseInt(qtyInput.value) > item.quantity) qtyInput.value = item.quantity;
      if (parseInt(qtyInput.value) < 1) qtyInput.value = 1;
    }

    this._updateSellShopTotal();
  }

  _updateSellShopTotalLegacy() {
    if (!this.selectedSellShopItem) return;
    const qtyInput = document.getElementById('sell-shop-qty-input');
    const totalDisplay = document.getElementById('sell-shop-total-price');
    if (!qtyInput || !totalDisplay) return;

    const unitPrice = this._sellUnitPrice(this.selectedSellShopItem);
    const qty = parseInt(qtyInput.value) || 0;
    totalDisplay.textContent = (unitPrice * qty).toLocaleString();
  }

  async _performSellShopActionLegacy() {
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

    const unitPrice = this._sellUnitPrice(item);
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
      // While typing, only refresh the total. _updateSellShopDetail() clamps the
      // field to the stack size, which meant every digit that took the value
      // past what the player owned was overwritten mid-keystroke — the typed
      // number could never be seen. Clamp on change/blur instead; the sell
      // action re-validates the quantity against the inventory anyway.
      qtyInput.addEventListener('input', () => this._updateSellShopTotal());
      qtyInput.addEventListener('change', () => this._updateSellShopDetail());
      qtyInput.addEventListener('blur', () => this._updateSellShopDetail());
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

      const sellPrice = this._sellUnitPrice({ ...item, price: itemData.price || item.price || 10 });

      slot.innerHTML = `
        <span class="slot-emoji">${itemIconMarkup(item, item.emoji || itemData.emoji || '📦')}</span>
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
    const sellPrice = this._sellUnitPrice({ ...item, price: itemData.price || item.price || 10 });

    document.getElementById('sell-shop-detail-icon').innerHTML = itemIconMarkup(item, item.emoji || itemData.emoji || '📦', 'item-visual--detail');
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
    const sellPrice = this._sellUnitPrice({ ...item, price: itemData.price || item.price || 10 });
    const totalGold = sellPrice * qty;

    const isOnlineAccount = this.characterId && !String(this.characterId).startsWith('guest_') && !String(this.characterId).startsWith('local_');
    if (isOnlineAccount) {
      try {
        const requestId = `npc-sell:${this.characterId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
        const result = await requestNpcSale(item.item_name, qty, requestId);
        invItem.quantity = result.remaining;
        if (invItem.quantity <= 0) { this.inventory = this.inventory.filter(i => i !== invItem); this.selectedSellShopItem = null; }
        this.character.stats.gold = result.gold;
        this._renderSellShop(); this._renderInventory(); this.updateHUD(this.character.stats); this.updateStats(this.character.stats);
        this.addCombatLog(`💰 ขาย ${item.emoji || '📦'} ${item.item_name} x${qty} ได้ ${result.gold_gained.toLocaleString()} Zeny`, 'gold');
        this.soundManager?.playBuySellSound?.();
      } catch (error) { this.addCombatLog(`❌ ขายไม่สำเร็จ: ${error.message}`, 'warning'); }
      return;
    }

    invItem.quantity -= qty;
    if (invItem.quantity <= 0) {
      this.inventory = this.inventory.filter(i => i.quantity > 0);
      this.selectedSellShopItem = null;
    }

    this.character.stats.gold = (Number(this.character.stats.gold) || 0) + totalGold;

    // Reflect the completed transaction immediately. Persistence can involve a
    // network round trip and must never leave the player looking at stale gold.
    this._renderSellShop();
    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);

    if (this.characterId) {
      await saveInventoryItem(this.characterId, item.item_name, itemData.type || item.item_type || 'etc', -qty);
      // Online direct stat writes are intentionally skipped; push the trusted
      // socket snapshot now instead of waiting up to three minutes for autosave.
      if (typeof window.zolosSaveNow === 'function') window.zolosSaveNow();
      else if (this.character.saveStatsToDatabase) await this.character.saveStatsToDatabase();
    }

    this.addCombatLog(`💰 ขาย ${item.emoji || '📦'} ${item.item_name} x${qty} ได้ ${totalGold.toLocaleString()} Zeny`, 'gold');
    if (this.soundManager) {
      if (this.soundManager.playBuySellSound) this.soundManager.playBuySellSound();
      else if (this.soundManager.playUseItemSound) this.soundManager.playUseItemSound();
    }

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

  // How many copies of an item the player may list on the P2P market.
  // Worn gear cannot be sold at all. A socketed card keeps its whole stack in a
  // single inventory row but reserves the one copy that is physically socketed,
  // so only the spare duplicates are listable.
  _sellableQty(item) {
    if (!item) return 0;
    const owned = item.quantity || 0;
    if (item.item_type === 'card') {
      const socketedReserve = (item.stats && item.stats.equipped === true) ? 1 : 0;
      return Math.max(0, owned - socketedReserve);
    }
    if (this._isItemEquipped(item)) return 0;
    return owned;
  }

  // Canonical artwork for every market surface. Inventory rows may contain an
  // old emoji, but the market must render the same asset used by inventory,
  // shops and equipment previews. Cards keep their dedicated album art.
  _itemIconHtml(item) {
    if (item && item.item_type === 'card') {
      const card = getCard(item.item_name);
      if (card && card.art) {
        return `<img src="${card.art}" alt="" style="width:1.3em;height:1.3em;object-fit:contain;vertical-align:middle;" onerror="this.src='/assets/items/fallback/unknown-loot.png';this.onerror=null">`;
      }
      return `<img src="/assets/items/fallback/unknown-loot.png" alt="" style="width:1.3em;height:1.3em;object-fit:contain;vertical-align:middle;">`;
    }
    const fallback = ITEMS[item?.item_name]?.emoji || item?.emoji || '📦';
    return itemIconMarkup(item, fallback, 'item-visual--market');
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
        // For pets, show the seller's custom name so buyers see the exact pet.
        const petNm = (listing.item_type === 'pet' && listing.stats && listing.stats.petName) ? listing.stats.petName : null;
        const petLv = (listing.item_type === 'pet' && listing.stats && listing.stats.petLevel) ? listing.stats.petLevel : null;
        const displayName = petNm
          ? `${listing.item_name.replace(/ Pet$/, '')} 「${petNm}」${petLv ? ` Lv.${petLv}` : ''}`
          : listing.item_name;
        row.innerHTML = `
          <div class="market-item-name-cell ${rarityClass}">
            ${itemIconMarkup(listing.item_name, itemInfo.emoji, 'item-visual--market-row')}
            <span class="market-item-name-text" title="${displayName}">${displayName}</span>
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

    // Show every item with at least one listable copy. Pets are listed
    // per-instance from the pet popup; cards are excluded entirely — they are
    // traded only player-to-player via the dedicated card P2P modal (My Card).
    const sellable = this.inventory.filter(item =>
      item.item_type !== 'pet' && item.item_type !== 'card' && this._sellableQty(item) >= 1);

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
        <div class="slot-icon">${this._itemIconHtml(item)}</div>
        <div class="slot-quantity">x${this._sellableQty(item)}</div>
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
    const iconEl = document.getElementById('market-sell-item-icon');
    if (iconEl) iconEl.innerHTML = this._itemIconHtml(this.selectedMarketItem);
    document.getElementById('market-sell-item-name').textContent = this.selectedMarketItem.item_name;
    const sellableQty = this._sellableQty(this.selectedMarketItem);
    document.getElementById('market-sell-item-qty-info').textContent = `จำนวนที่ขายได้: ${sellableQty}`;

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
      qtyInput.max = sellableQty;
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

    const maxQty = this._sellableQty(item);
    if (isNaN(qty) || qty < 1 || qty > maxQty) {
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

      if (listing && !listing._failed) {
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
        if (listing.item_type === 'pet') {
          // Receive the pet as its own named instance (keeps the seller's name).
          let row = this.inventory.find(i => i.item_name === listing.item_name && i.item_type === 'pet');
          if (!row) {
            row = { item_name: listing.item_name, item_type: 'pet', emoji: itemRegistry.emoji || '🐾', desc: itemRegistry.desc || '', price: itemRegistry.price || 10, rarity: itemRegistry.rarity || 'common', quantity: 0, stats: { instances: [] } };
            this.inventory.push(row);
          }
          this._ensurePetInstances(row);
          const s = listing.stats || {};
          row.stats.instances.push({ uid: this._newPetUid(), name: s.petName || null, level: s.petLevel || 1, xp: s.petXp || 0 });
          row.quantity = row.stats.instances.length;
          if (this.characterId) {
            const { setInventoryItemQuantity } = await import('../network/GameSync.js');
            await setInventoryItemQuantity(this.characterId, listing.item_name, 'pet', row.quantity, row.stats);
          }
        } else {
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
        if (listing.item_type === 'pet') {
          // Return the pet as its own named instance (keep name/level, never merge).
          let row = this.inventory.find(i => i.item_name === listing.item_name && i.item_type === 'pet');
          if (!row) {
            row = { item_name: listing.item_name, item_type: 'pet', emoji: itemRegistry.emoji || '🐾', desc: itemRegistry.desc || '', price: itemRegistry.price || 10, rarity: itemRegistry.rarity || 'common', quantity: 0, stats: { instances: [] } };
            this.inventory.push(row);
          }
          this._ensurePetInstances(row);
          const s = listing.stats || {};
          row.stats.instances.push({ uid: this._newPetUid(), name: s.petName || null, level: s.petLevel || 1, xp: s.petXp || 0 });
          row.quantity = row.stats.instances.length;
          if (this.characterId) {
            const { setInventoryItemQuantity } = await import('../network/GameSync.js');
            await setInventoryItemQuantity(this.characterId, listing.item_name, 'pet', row.quantity, row.stats);
          }
        } else {
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
    // Clock-style radial cooldown: a dark shroud that unwinds clockwise to
    // reveal the icon, with the seconds remaining counting down in the centre.
    const apply = (overlay) => {
      if (!overlay) return;
      if (currentCooldown <= 0 || !maxCooldown) {
        overlay.classList.remove('cd-active');
        overlay.style.background = '';
        overlay.textContent = '';
        return;
      }
      const frac = Math.max(0, Math.min(1, currentCooldown / maxCooldown));
      const elapsed = (1 - frac) * 360; // revealed (light) wedge grows clockwise
      overlay.style.background =
        `conic-gradient(rgba(6,10,20,0.10) 0deg ${elapsed}deg, rgba(4,7,16,0.72) ${elapsed}deg 360deg)`;
      overlay.textContent = currentCooldown >= 1 ? Math.ceil(currentCooldown) : currentCooldown.toFixed(1);
      overlay.classList.add('cd-active');
    };
    apply(document.getElementById(`cooldown-${skillId}`));
    apply(document.getElementById(`mobile-cooldown-${skillId}`));
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
  // Clean line-art glyph (from the #ic-* SVG sprite) for each skill, tinted with
  // the skill's own colour. Falls back to the emoji if a skill has no glyph.
  _skillIconHTML(id, skill) {
    const glyph = SKILL_GLYPHS[id];
    if (!glyph) return null;
    const hex = '#' + ((skill.color >>> 0) & 0xffffff).toString(16).padStart(6, '0');
    return `<svg class="skill-glyph" style="color:${hex}"><use href="#${glyph}" /></svg>`;
  }

  _paintSkillIcon(iconEl, id, skill) {
    if (!iconEl) return;
    const html = this._skillIconHTML(id, skill);
    if (html) iconEl.innerHTML = html;
    else iconEl.textContent = skill.emoji; // graceful fallback
  }

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
      this._paintSkillIcon(slot.querySelector('.skill-icon'), id, skill);
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
      const icon = btn.querySelector('.btn-icon') || btn.querySelector('.skill-icon') || btn.querySelector('span');
      this._paintSkillIcon(icon, id, skill);
      // Mobile buttons use .mobile-cooldown-overlay. Re-point its id to the CURRENT
      // skill every render so the cooldown clock tracks the right skill after a
      // job change (the hard-coded ids in index.html are only the defaults).
      const mob = btn.querySelector('.mobile-cooldown-overlay') || btn.querySelector('.skill-cooldown-overlay');
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
      (skillType, hitTarget, dmg, hitMeta = {}) => {
        if (hitMeta.serverOwned && hitTarget && typeof hitTarget.id === 'string' && dmg > 0) {
          // Server-owned monsters are render-only locally. Send skill damage via
          // CombatSystem's authoritative hit callback, exactly like a normal hit.
          this.combatSystem?.onMonsterDamaged?.(hitTarget.id, dmg, !!hitMeta.isCritical);
          return;
        }
        // Handle monster death if this skill killed it
        if (hitTarget && !hitTarget.alive) {
          if (this.combatSystem) {
            this.combatSystem._onMonsterKilled(hitTarget);
          }
        }
      }
    );

    // Broadcast the cast so everyone on the map sees the skill effect too.
    if (success && window.broadcastSkillCast) {
      const tp = target && target.getPosition ? target.getPosition() : null;
      window.broadcastSkillCast(skillId, tp ? tp.x : null, tp ? tp.z : null);
    }

    return success;
  }

  _setupMobileControls() {
    this._mobileControlCleanup?.();
    const removers = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      removers.push(() => target.removeEventListener(type, handler, options));
    };
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
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    const maxRadius = 45; // Max knob movement radius in pixels
    const getPinchDistance = (touches) => Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

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

    const resetMovementInput = () => {
      const inputManager = this.character ? this.character.inputManager : null;
      if (inputManager) inputManager.setJoystickInput(0, 0);
      for (const key of Object.keys(activeKeys)) triggerKeyEvent(key, false);
    };

    // Mobile browsers synthesize a click after touchstart. Run an action once
    // immediately on touch and suppress only that follow-up click.
    const bindTouchAction = (button, action) => {
      let lastTouchAt = 0;
      button.addEventListener('touchstart', event => {
        event.preventDefault();
        lastTouchAt = performance.now();
        action();
      }, { passive: false });
      button.addEventListener('click', event => {
        event.preventDefault();
        if (performance.now() - lastTouchAt < 700) return;
        action();
      });
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

      // Two fingers on the world canvas are reserved for camera pinch-zoom.
      // Cancel any movement started by the first finger so zooming cannot make
      // the hero walk at the same time.
      if ((e.touches && e.touches.length >= 2) || window.__zolosPinching) {
        if (e.touches && e.touches.length >= 2 && !window.__zolosPinching) {
          pinchStartDistance = getPinchDistance(e.touches);
          pinchStartZoom = window.sceneManager?.cameraZoom || 1;
          window.__zolosPinching = true;
        }
        joystickActive = false;
        tapCandidate = false;
        joystickTouchId = null;
        knob.style.transform = 'translate(0px, 0px)';
        hideJoystick();
        resetMovementInput();
        e.preventDefault();
        return;
      }

      // Mouse fallback: only the left button drives movement/tap. Right-click is
      // reserved for the camera-rotate / view-profile gesture (see main.js), so
      // ignore it here to avoid a stray walk. Touch events have no `button`.
      if (e.button != null && e.button !== 0) return;

      const touch = e.touches ? e.touches[0] : e;

      // Ignore if touching an interactive element (buttons, panels, HUD, chat).
      const target = e.target;
      if (target.closest('#mobile-actions') || target.closest('#auto-farm-container') ||
        target.closest('#hud-bottom') || target.closest('.side-panel') || target.closest('#pet-boutique-modal') ||
        target.closest('.modal-popup') || target.closest('#hud-top') ||
        target.closest('#minimap-container') || target.closest('#target-indicator') ||
        target.closest('#fps-counter') || target.closest('#kill-counter') ||
        target.closest('#chat-panel') || target.closest('#tutorial-tooltip') ||
        target.closest('.tutorial-tooltip') || target.closest('.tutorial-close') ||
        target.closest('.tutorial-btn-primary') || target.closest('.tutorial-btn-secondary') ||
        target.closest('#warp-modal') ||
        target.closest('.warp-tile') ||
        target.closest('.tile-warp-btn')) return;

      // Never spawn the joystick over the chat UI — block the WHOLE panel
      // (messages + input) so a tap on the chat bar opens the input/keyboard
      // instead of moving the hero. Returning early (no preventDefault) lets the
      // tap fall through to the chat's own click/focus handlers.
      const chatPanel = document.getElementById('chat-panel');
      if (chatPanel && window.getComputedStyle(chatPanel).display !== 'none') {
        const r = chatPanel.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 &&
          touch.clientX >= r.left && touch.clientX <= r.right &&
          touch.clientY >= r.top && touch.clientY <= r.bottom) return;
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
      if (window.__zolosPinching) {
        if (e.touches && e.touches.length >= 2 && pinchStartDistance > 0) {
          const distance = getPinchDistance(e.touches);
          if (distance > 0) window.sceneManager?.setCameraZoom?.(pinchStartZoom * pinchStartDistance / distance);
        }
        e.preventDefault();
        return;
      }
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
      if (window.__zolosPinching) {
        if (!e.touches || e.touches.length < 2) {
          window.__zolosPinching = false;
          pinchStartDistance = 0;
        }
        e.preventDefault();
        return;
      }
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
      if (e.type !== 'touchcancel' && duration < 250 && distance < 15) {
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
    listen(window, 'touchstart', handleStart, { passive: false });
    listen(window, 'touchmove', handleMove, { passive: false });
    listen(window, 'touchend', handleEnd, { passive: false });
    listen(window, 'touchcancel', handleEnd, { passive: false });

    // Safari/iOS also exposes native gesture events for pinch. Supporting this
    // path makes zoom reliable even when WebKit coalesces the underlying touch
    // sequence before the regular touchmove handler sees both fingers.
    const gameCanvas = document.getElementById('game-canvas');
    let gestureStartZoom = 1;
    if (gameCanvas) {
      const onGestureStart = (e) => {
        gestureStartZoom = window.sceneManager?.cameraZoom || 1;
        window.__zolosPinching = true;
        e.preventDefault();
      };
      const onGestureChange = (e) => {
        const scale = Number(e.scale) || 1;
        window.sceneManager?.setCameraZoom?.(gestureStartZoom / scale);
        e.preventDefault();
      };
      const onGestureEnd = (e) => {
        window.__zolosPinching = false;
        pinchStartDistance = 0;
        e.preventDefault();
      };
      listen(gameCanvas, 'gesturestart', onGestureStart, { passive: false });
      listen(gameCanvas, 'gesturechange', onGestureChange, { passive: false });
      listen(gameCanvas, 'gestureend', onGestureEnd, { passive: false });
    }

    // Desktop/mouse fallback (for browser mobile simulation mode)
    listen(window, 'mousedown', handleStart);
    listen(window, 'mousemove', handleMove);
    listen(window, 'mouseup', handleEnd);
    this._mobileControlCleanup = () => {
      resetMovementInput();
      joystickActive = false;
      tapCandidate = false;
      joystickTouchId = null;
      pinchStartDistance = 0;
      window.__zolosPinching = false;
      hideJoystick();
      removers.splice(0).forEach(remove => remove());
      this._mobileControlCleanup = null;
    };

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

      bindTouchAction(sprintBtn, toggleSprint);
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

      bindTouchAction(attackBtn, triggerAttack);
    }

    // Skill buttons touch and click triggers. Bound by SLOT, resolving the skill
    // at press time, so they keep working after a job change.
    [0, 1, 2].forEach((index) => {
      const btn = document.getElementById(`btn-mobile-skill-${index + 1}`);
      if (btn) {
        bindTouchAction(btn, () => this.castSkillSlot(index));
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
        this._renderWiki();
      });
    });

    // Search events
    const searchInput = document.getElementById('wiki-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._renderWikiList();
      });
    }

    this.currentWikiTab = 'journal';
    this.selectedWikiItem = null;
  }

  _renderWiki() {
    this._renderWikiList();
    this._renderWikiDetail();
    hydrateMonsterPortraits(document.getElementById('wiki-panel') || document);
  }

  async loadAdventureJournalFromDB(characterId) {
    if (!characterId) return;
    this.characterId = characterId;
    const generation = this._lifecycleGeneration;
    let local = null;
    try { local = JSON.parse(localStorage.getItem(`zolos_adventure_journal_${characterId}`) || 'null'); } catch { /* ignore */ }
    const remote = await loadAdventureJournal(characterId);
    if (!this._isCharacterLoadCurrent(characterId, generation)) return;
    this.adventureJournal = sanitizeAdventureJournal(remote || local);
    this._renderWiki();
  }

  _saveAdventureJournalSoon() {
    if (!this.characterId) return;
    localStorage.setItem(`zolos_adventure_journal_${this.characterId}`, JSON.stringify(this.adventureJournal));
    clearTimeout(this._journalSaveTimer);
    this._journalSaveTimer = setTimeout(() => saveAdventureJournal(this.characterId, this.adventureJournal), 700);
  }

  _journalHTML() {
    const summary = summarizeJournal(this.adventureJournal, getAllMonsters());
    const nextDiscoveries = summary.entries.filter(row => !row.entry.kills).slice(0, 4);
    const recent = summary.entries.filter(row => row.entry.lastDefeatedAt)
      .sort((a, b) => String(b.entry.lastDefeatedAt).localeCompare(String(a.entry.lastDefeatedAt))).slice(0, 5);
    const cards = [
      ['ค้นพบมอนสเตอร์', `${summary.discovered}/${summary.totalSpecies}`, `${summary.discoveryPercent}%`, '#65d9ff'],
      ['จำนวนที่กำจัด', summary.totalKills.toLocaleString(), 'ทั้งหมด', '#ff8f6b'],
      ['Bronze Mastery', summary.tierCounts.bronze, '10 kills', '#cd7f32'],
      ['Silver Mastery', summary.tierCounts.silver, '50 kills', '#c7d2df'],
      ['Gold Mastery', summary.tierCounts.gold, '200 kills', '#ffd65a'],
    ];
    return `<div class="journal-hero"><div><small>ADVENTURE JOURNAL</small><h2>Monster Codex</h2><p>ออกสำรวจ กำจัด และเชี่ยวชาญมอนสเตอร์ทุกสายพันธุ์</p></div><div class="journal-ring" style="--pct:${summary.discoveryPercent * 3.6}deg"><b>${summary.discoveryPercent}%</b><span>DISCOVERED</span></div></div>
      <div class="journal-stat-grid">${cards.map(([label,value,note,color]) => `<div class="journal-stat" style="--accent:${color}"><span>${label}</span><b>${value}</b><small>${note}</small></div>`).join('')}</div>
      <div class="journal-section"><h4>Mastery Path</h4><div class="journal-mastery-path"><span class="bronze">10 ⚔ Bronze</span><i></i><span class="silver">50 ⚔ Silver</span><i></i><span class="gold">200 ⚔ Gold</span></div></div>
      <div class="journal-columns"><div class="journal-section"><h4>พบล่าสุด</h4>${recent.length ? recent.map(row => `<button class="journal-row" data-monster-key="${row.monster.key}">${this._wikiMonsterPortrait(row.monster)}<span><b>${row.monster.name}</b><small>${row.entry.kills} kills • ${masteryForKills(row.entry.kills).label}</small></span></button>`).join('') : '<p class="journal-empty">ยังไม่มีบันทึก ออกไปกำจัดมอนสเตอร์ตัวแรกกันเลย!</p>'}</div>
      <div class="journal-section"><h4>ยังไม่ค้นพบ</h4>${nextDiscoveries.length ? nextDiscoveries.map(row => `<button class="journal-row undiscovered" data-monster-key="${row.monster.key}">${this._wikiMonsterPortrait(row.monster)}<span><b>???</b><small>${row.monster.environment || 'unknown'} habitat</small></span></button>`).join('') : '<p class="journal-empty">ค้นพบครบทุกสายพันธุ์แล้ว!</p>'}</div></div>`;
  }

  _wikiMonsterPortrait(monster, large = false, monsterKey = '') {
    const hex = `#${Number(monster.color || 0x808080).toString(16).padStart(6, '0')}`;
    const family = monster.family || (monster.waterOnly ? 'aquatic' : 'unknown');
    const flags = `${monster.isBoss ? ' boss' : ''}${monster.isElite ? ' elite' : ''}`;
    const key = monsterKey || monster.key || '';
    return `<span class="wiki-monster-portrait ${large ? 'large' : ''}${flags}" style="--monster-color:${hex}" data-family="${family}"><i class="wiki-model-fallback"></i><img data-monster-model="${key}" alt="โมเดล ${monster.name || 'monster'}" loading="lazy"></span>`;
  }

  _wikiItemPortrait(item, large = false) {
    const rarity = item.rarity || 'common';
    return `<span class="wiki-item-portrait ${large ? 'large' : ''} rarity-${rarity}">${itemIconMarkup(item, '', large ? 'item-visual--detail' : '')}<i></i></span>`;
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
    const journalEl = document.getElementById('adventure-journal');
    if (this.currentWikiTab === 'journal') {
      if (journalEl) {
        journalEl.style.display = 'block';
        journalEl.innerHTML = this._journalHTML();
        journalEl.querySelectorAll('[data-monster-key]').forEach(el => el.addEventListener('click', () => {
          this.currentWikiTab = 'monsters'; this.selectedWikiItem = el.dataset.monsterKey;
          document.querySelectorAll('.wiki-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'monsters'));
          this._renderWikiList(); this._renderWikiDetail();
        }));
      }
      if (guideEl) guideEl.style.display = 'none';
      if (mainC) mainC.style.display = 'none';
      if (searchBox) searchBox.style.display = 'none';
      queueMicrotask(() => hydrateMonsterPortraits(journalEl));
      return;
    }
    if (journalEl) journalEl.style.display = 'none';
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
          ${this._wikiMonsterPortrait(monster, false, key)}
          <span class="wiki-slot-name">${monster.name}<small>${getMonsterJournalEntry(this.adventureJournal, { key, ...monster }).kills} kills</small></span>
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
          ${this._wikiItemPortrait(item)}
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
          ${this._wikiItemPortrait(item)}
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
    queueMicrotask(() => hydrateMonsterPortraits(listContainer));
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
      let mapArea = monster.environment === 'mountain' ? 'Prontera Mountain Farm ⛰️' : 'Prontera Field';
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
      const journalEntry = getMonsterJournalEntry(this.adventureJournal, { key, ...monster });
      const mastery = masteryForKills(journalEntry.kills);
      const masteryPct = mastery.next ? Math.min(100, journalEntry.kills / mastery.next.kills * 100) : 100;

      const envDict = {
        water: 'Water Zone / แหล่งน้ำ 🌊',
        ground: 'Main Land / พื้นดิน 🏜️',
        cave: 'Cave / ในถ้ำ 🪨',
        mountain: 'Mountain / ภูเขา 🏔️'
      };
      const envName = envDict[monster.environment] || monster.environment || 'Unknown';
      content.innerHTML = `
        <div class="detail-row">
          ${this._wikiMonsterPortrait(monster, true, key)}
          <div class="detail-info-block">
            <div class="wiki-detail-title">${monster.name}</div>
            <div class="detail-type" style="color:#ff6080">${monster.isBoss ? 'WORLD BOSS' : monster.isElite ? 'ELITE MONSTER' : 'MONSTER'} • Lv.${approxLevel}</div>
          </div>
        </div>
        <div class="detail-desc" style="margin-top:8px">
          HP: ${monster.hp} | ATK: ${monster.atk} | DEF: ${monster.def}<br />
          EXP Gain: ${monster.exp} | Zeny: ${goldText}<br />
          Area: ${mapArea}<br />
          Environment: ${envName}<br />
          Family: ${(monster.family || 'unknown').toUpperCase()} • Visual: Remaster R3
        </div>
        <div class="monster-mastery-card" style="--mastery-color:${mastery.color}">
          <div><span>MONSTER MASTERY</span><b>${mastery.label}</b><em>${journalEntry.kills} kills</em></div>
          <div class="mastery-progress"><i style="width:${masteryPct}%"></i></div>
          <small>${mastery.next ? `อีก ${mastery.remaining} ตัว เพื่อปลดล็อก ${mastery.next.label}` : 'เชี่ยวชาญสูงสุดแล้ว'}</small>
        </div>
        ${dropHtml}
      `;
      queueMicrotask(() => hydrateMonsterPortraits(content));
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
          ${this._wikiItemPortrait(item, true)}
          <div class="detail-info-block">
            <div class="wiki-detail-title color-${item.rarity || 'common'}">${key}</div>
            <div class="detail-type color-${item.rarity || 'common'}">${item.type.toUpperCase()} (${item.rarity || 'common'})</div>
          </div>
        </div>
        <div class="detail-desc" style="margin-top:8px">
          ${item.desc}<br />
          <span style="color:#d0d040">Zeny Price: ${item.price ?? 0}z</span><br />
          <span style="color:#8fcfff">Latest catalog • ${String(item.type || 'item').toUpperCase()} • ${String(item.rarity || 'common').toUpperCase()}</span>
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
    this.incrementQuestProgress('hunt', monsterName);
    const result = recordMonsterDefeat(this.adventureJournal, monsterName);
    this.adventureJournal = result.journal;
    this._saveAdventureJournalSoon();
    if (result.firstDiscovery) this.addCombatLog(`📔 Monster Codex: ค้นพบ ${monsterName}!`, 'loot');
    if (result.tierUnlocked) this.addCombatLog(`🏅 ${monsterName} ถึงระดับ ${masteryForKills(result.entry.kills).label} Mastery!`, 'levelup');
    if (this.currentWikiTab === 'journal' || this.currentWikiTab === 'monsters') this._renderWiki();
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
    this.pendingTradeRequestId = null;
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
      this.pendingTradeRequestId = null;
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
            senderName: this.character && this.character.stats ? this.character.stats.name : 'Player',
            requestId: this.pendingTradeRequestId
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

  // ============ Card P2P Trade (send a card to a player by UID) ============
  _setupCardTradePanel() {
    this._cardTradeItem = null;

    const closeCardTrade = () => {
      const modal = document.getElementById('card-trade-modal');
      if (modal) modal.style.display = 'none';
      const waiting = document.getElementById('card-trade-waiting');
      if (waiting) waiting.style.display = 'none';
      this._cardTradeItem = null;
      this.updateMobileControlsVisibility();
    };

    document.getElementById('btn-close-card-trade')?.addEventListener('click', closeCardTrade);
    document.getElementById('card-trade-overlay')?.addEventListener('click', closeCardTrade);

    // Cancel while waiting: tell the recipient the offer is withdrawn.
    document.getElementById('btn-cancel-card-trade')?.addEventListener('click', async () => {
      if (this.tradeTimeout) { clearTimeout(this.tradeTimeout); this.tradeTimeout = null; }
      if (this.tradeTarget && this.characterId) {
        const req = {
          senderUserId: this.characterId,
          targetUserId: this.tradeTarget.userId,
          senderName: this.character?.stats?.name || 'Player',
        };
        try { await sendTradeCancelPacket(this.characterId, this.tradeTarget.userId, req); } catch (e) { /* ignore */ }
      }
      this.tradeTarget = null;
      this.tradeSelectedItem = null;
      this.pendingTradeRequestId = null;
      closeCardTrade();
    });

    document.getElementById('btn-send-card-trade')?.addEventListener('click', () => this._sendCardTrade());

    // ---- Autocomplete: name → UID resolution ----
    this._cardTradeResolvedTarget = null;
    this._cardTradeSuggestTimer = null;

    const uidInput = document.getElementById('card-trade-uid-input');
    const suggestBox = document.getElementById('card-trade-suggest');
    const resolvedBox = document.getElementById('card-trade-resolved');
    if (!uidInput || !suggestBox) return;

    // On every keystroke: debounce → search
    uidInput.addEventListener('input', () => {
      // Clear previous resolved state when user types
      this._cardTradeResolvedTarget = null;
      if (resolvedBox) resolvedBox.style.display = 'none';

      const val = uidInput.value.trim();
      if (!val || val.length < 1) { suggestBox.style.display = 'none'; return; }

      // If it looks like a raw UID (all hex), skip autocomplete
      if (isRawCharacterUid(val)) { suggestBox.style.display = 'none'; return; }

      clearTimeout(this._cardTradeSuggestTimer);
      this._cardTradeSuggestTimer = setTimeout(() => this._cardTradeAutocomplete(val), 300);
    });

    // Hide dropdown on blur (slight delay so a click on a suggestion registers)
    uidInput.addEventListener('blur', () => {
      setTimeout(() => { if (suggestBox) suggestBox.style.display = 'none'; }, 200);
    });
    uidInput.addEventListener('focus', () => {
      const val = uidInput.value.trim();
      if (val && !isRawCharacterUid(val) && !this._cardTradeResolvedTarget) {
        clearTimeout(this._cardTradeSuggestTimer);
        this._cardTradeSuggestTimer = setTimeout(() => this._cardTradeAutocomplete(val), 150);
      }
    });
  }

  /** Search online players + DB and render suggestion dropdown. */
  async _cardTradeAutocomplete(query) {
    const suggestBox = document.getElementById('card-trade-suggest');
    if (!suggestBox) return;

    const q = query.toLowerCase();
    const onlineMatches = [];

    // 1. Check online players first (instant, no network)
    if (this.onlinePlayers && this.onlinePlayers.length) {
      for (const p of this.onlinePlayers) {
        if (p.username && p.username.toLowerCase().startsWith(q) && p.userId !== this.characterId) {
          onlineMatches.push({
            username: p.username,
            level: p.level || 1,
            userId: p.userId,
            characterId: p.characterId || null,
          });
        }
        if (onlineMatches.length >= 5) break;
      }
    }

    // Always enrich online matches with the database character identity.
    let dbResults = [];
    try {
      dbResults = await searchCharactersByName(query);
    } catch (e) {
      console.warn('[CardTrade] autocomplete DB error:', e);
    }
    const results = mergeTradeRecipients(onlineMatches, dbResults, this.characterId);

    if (results.length === 0) {
      suggestBox.style.display = 'none';
      return;
    }

    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    suggestBox.innerHTML = results.map((r, i) => `
      <div class="card-trade-suggest-item" data-idx="${i}"
        style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(100,120,200,0.15);transition:background .12s;"
        onmouseenter="this.style.background='rgba(80,110,220,0.25)'" onmouseleave="this.style.background='transparent'">
        <span style="font-size:11px;font-weight:600;color:#fff;flex:1;">${esc(r.username)}</span>
        <span style="font-size:10px;color:#9fb0e0;">Lv.${r.level}</span>
        <span style="font-size:9px;color:${r.online ? '#40e080' : '#8b97ba'};">${r.online ? '🟢 Online' : '⚫ Offline'}</span>
      </div>
    `).join('');
    suggestBox.style.display = 'block';

    // Attach click handlers
    suggestBox.querySelectorAll('.card-trade-suggest-item').forEach((el, i) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // prevent blur from hiding dropdown
        const r = results[i];
        if (!r) return;
        const uid = displayedCharacterUid(r.characterId);
        const input = document.getElementById('card-trade-uid-input');
        if (input) input.value = uid || r.username;
        this._cardTradeResolvedTarget = r;
        suggestBox.style.display = 'none';
        // Show resolved preview
        const resolvedBox = document.getElementById('card-trade-resolved');
        if (resolvedBox) {
          resolvedBox.innerHTML = `✅ <strong>${esc(r.username)}</strong> (Lv.${r.level}) ${r.online ? '<span style="color:#40e080;">🟢 Online</span>' : '<span style="color:#8b97ba;">⚫ Offline</span>'}`;
          resolvedBox.style.display = 'block';
        }
      });
    });
  }

  async _sendCardTrade() {
    const item = this._cardTradeItem;
    const statusEl = document.getElementById('card-trade-status');
    const setStatus = (msg, color) => {
      if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || 'var(--text-dim)'; }
    };
    if (!item || !this.characterId) { setStatus('❌ ไม่ได้เลือกการ์ด', '#ff8f8f'); return; }

    const rawInput = (document.getElementById('card-trade-uid-input')?.value || '').trim();
    const maxQty = this._sellableQty(item);
    const qty = Math.min(Math.max(1, parseInt(document.getElementById('card-trade-qty-input')?.value) || 1), maxQty);
    const price = Math.max(0, parseInt(document.getElementById('card-trade-price-input')?.value) || 0);

    if (!rawInput) { setStatus('❌ กรุณากรอกชื่อผู้เล่น หรือ UID ผู้รับ', '#ff8f8f'); return; }
    if (maxQty < 1) { setStatus('❌ ไม่มีการ์ดใบนี้เหลือให้ส่ง', '#ff8f8f'); return; }

    setStatus('⌛ กำลังค้นหาผู้รับ...', 'var(--text-dim)');
    const resolved = await resolveTradeRecipientInput({
      rawInput,
      selectedTarget: this._cardTradeResolvedTarget,
      searchByName: searchCharactersByName,
      resolveByUid: resolveCharacterByUid,
    });
    if (!resolved.ok) {
      const message = resolved.reason === 'uid_not_found'
        ? '❌ ไม่พบผู้เล่นที่มี UID นี้'
        : '❌ ไม่พบผู้เล่นชื่อนี้ กรุณาเลือกชื่อจากรายการค้นหา';
      setStatus(message, '#ff8f8f');
      return;
    }
    const target = resolved.target;
    if (!target.userId || !target.characterId) {
      setStatus('❌ ข้อมูลตัวละครผู้รับไม่สมบูรณ์ กรุณาค้นหาชื่อใหม่อีกครั้ง', '#ff8f8f');
      return;
    }

    // Guard against sending to yourself using the canonical character ID.
    if (target.characterId === this.characterId) {
      setStatus('❌ ส่งการ์ดให้ตัวเองไม่ได้', '#ff8f8f');
      return;
    }

    // Never carry the sender's socket state onto the recipient's fresh copy.
    const catalog = getCard(item.item_name);
    const cardId = catalog?.id || item.stats?.card_id;
    // A traded copy always starts at the base tier. Star refinement belongs
    // to its current owner and is never transferred to another character.
    const cleanStats = { card_id: cardId, card_stars: 1, card_pity: 0 };
    // Mail keeps the original stats only so a rejected parcel can be restored
    // unchanged to its sender; the claim RPC sanitizes the recipient copy.
    const returnableMailStats = { ...(item.stats || {}), card_id: cardId };
    const targetLabel = target.username || displayedCharacterUid(target.characterId);

    // Online recipient → live trade popup (instant, accept/decline).
    // Offline recipient → drop it in their mailbox (escrow, claim later).
    // Cards always use the transactional mailbox, even while both players are
    // online. This keeps inventory and character_cards counts synchronized.
    if (false) {
      this.tradeTarget = { userId: target.userId, username: target.username };
      this.tradeSelectedItem = item;

      const waiting = document.getElementById('card-trade-waiting');
      if (waiting) waiting.style.display = 'flex';

      try {
        const myName = this.character?.stats?.name || 'Player';
        const sent = await sendTradeRequestPacket(
          this.characterId, myName, target.userId, target.username || 'Player',
          item.item_name, 'card', qty, price, cleanStats, target.characterId
        );
        this.pendingTradeRequestId = sent?.requestId || null;

        this.tradeTimeout = setTimeout(() => {
          if (waiting && waiting.style.display !== 'none') {
            waiting.style.display = 'none';
            this.addCombatLog('⏱️ คำขอเทรดการ์ดหมดเวลา ไม่มีการตอบรับ', 'warning');
            this.tradeTarget = null;
            this.tradeSelectedItem = null;
            this.pendingTradeRequestId = null;
          }
        }, 30000);
      } catch (err) {
        console.error('[CardTrade] Request Error:', err);
        if (waiting) waiting.style.display = 'none';
        setStatus('❌ ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง', '#ff8f8f');
      }
      return;
    }

    // Offline → mailbox delivery.
    setStatus(`📬 ผู้รับ (${targetLabel}) ออฟไลน์ กำลังส่งเข้ากล่องจดหมาย...`, 'var(--text-dim)');
    const res = await sendCardMail(target.characterId, item.item_name, 'card', qty, price, returnableMailStats);
    if (!res || !res.ok) {
      const reason = res && res.reason;
      const msg = reason === 'not_enough' ? '❌ การ์ดไม่พอสำหรับส่ง'
        : reason === 'socketed_reserve' ? '❌ ต้องถอดการ์ดออกจากช่องก่อน (เหลือใบเดียว)'
          : reason === 'self' ? '❌ ส่งการ์ดให้ตัวเองไม่ได้'
            : reason === 'no_recipient' ? '❌ ไม่พบผู้รับ'
              : '❌ ส่งเข้ากล่องจดหมายไม่สำเร็จ';
      setStatus(msg, '#ff8f8f');
      return;
    }
    // Escrow already removed the card server-side — refresh local truth.
    await this.loadInventoryFromDB(this.characterId);
    if (this.cardAlbum) this.cardAlbum.render();
    this.addCombatLog(`📬 ส่งการ์ด ${item.item_name} x${qty} เข้ากล่องจดหมายของ ${targetLabel} แล้ว${price > 0 ? ` (ราคา ${price} Zeny)` : ' (ฟรี)'}`, 'system');
    const modal = document.getElementById('card-trade-modal');
    if (modal) modal.style.display = 'none';
    this._cardTradeItem = null;
    this.updateMobileControlsVisibility();
  }

  // ============ Card Mailbox (offline delivery) ============
  _setupMailbox() {
    this._mailTab = 'inbox';
    this._mail = [];

    const closeMail = () => {
      const modal = document.getElementById('mail-modal');
      if (modal) modal.style.display = 'none';
      this.updateMobileControlsVisibility();
    };
    document.getElementById('btn-close-mail')?.addEventListener('click', closeMail);
    document.getElementById('mail-overlay')?.addEventListener('click', closeMail);
    document.getElementById('btn-open-mailbox')?.addEventListener('click', () => this.openMailbox());

    document.querySelectorAll('.mail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mail-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._mailTab = tab.getAttribute('data-mailtab');
        this._renderMailList();
      });
    });
  }

  // Fetch pending mail and update the unread badge on the My Card button.
  async refreshMailbox() {
    this._mail = await fetchCardMail();
    const inboxCount = (this._mail || []).filter(m => m.recipient_char_id === this.characterId).length;
    const badge = document.getElementById('mailbox-badge');
    if (badge) {
      if (inboxCount > 0) { badge.style.display = 'block'; badge.textContent = inboxCount > 99 ? '99+' : String(inboxCount); }
      else badge.style.display = 'none';
    }
    return this._mail;
  }

  async openMailbox() {
    const modal = document.getElementById('mail-modal');
    if (modal) modal.style.display = 'flex';
    this.updateMobileControlsVisibility();
    const list = document.getElementById('mail-list');
    if (list) list.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:24px;font-size:11px;">⌛ กำลังโหลด...</div>';
    await this.refreshMailbox();
    this._renderMailList();
  }

  _renderMailList() {
    const list = document.getElementById('mail-list');
    if (!list) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const inbox = this._mailTab === 'inbox';
    const rows = (this._mail || []).filter(m =>
      inbox ? m.recipient_char_id === this.characterId : m.sender_char_id === this.characterId);

    if (rows.length === 0) {
      list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:28px 8px;font-size:11px;">${inbox ? 'ยังไม่มีการ์ดในกล่องจดหมาย' : 'ยังไม่มีการ์ดที่ส่งค้างอยู่'}</div>`;
      return;
    }

    list.innerHTML = rows.map(m => {
      const card = getCard(m.item_name);
      const icon = this._itemIconHtml({ item_type: 'card', item_name: m.item_name });
      const title = card ? (card.displayName || m.item_name) : m.item_name;
      const priceLabel = m.price > 0
        ? `<span style="color:#ffd97a;">${Number(m.price).toLocaleString()} Zeny</span>`
        : `<span style="color:#40e080;">ฟรี</span>`;
      const who = inbox
        ? `จาก ${esc(m.sender_name)}`
        : `ถึง UID ${esc(m.recipient_char_id.split('_').pop().substring(0, 8).toUpperCase())}`;
      const actions = inbox
        ? `<button class="btn-primary mail-claim" data-id="${m.id}" style="flex:1;font-size:11px;padding:6px;">${m.price > 0 ? '💰 ซื้อ/รับ' : '📥 รับ'}</button>
           <button class="btn-secondary mail-reject" data-id="${m.id}" style="flex:1;font-size:11px;padding:6px;">ปฏิเสธ</button>`
        : `<button class="btn-secondary mail-cancel" data-id="${m.id}" style="flex:1;font-size:11px;padding:6px;">↩️ ยกเลิก (คืนการ์ด)</button>`;
      return `
        <div style="display:flex;flex-direction:column;gap:6px;padding:10px;margin-bottom:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(120,140,200,.2);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="detail-icon" style="font-size:24px;">${icon}</span>
            <div style="flex:1;text-align:left;">
              <div style="font-weight:bold;color:var(--primary);font-size:12px;">${esc(title)} x${m.quantity}</div>
              <div style="font-size:10.5px;color:var(--text-dim);">${who} · ${priceLabel}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;">${actions}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.mail-claim').forEach(b => b.addEventListener('click', () => this._claimMail(b.getAttribute('data-id'))));
    list.querySelectorAll('.mail-reject').forEach(b => b.addEventListener('click', () => this._returnMail(b.getAttribute('data-id'), 'reject')));
    list.querySelectorAll('.mail-cancel').forEach(b => b.addEventListener('click', () => this._returnMail(b.getAttribute('data-id'), 'cancel')));
  }

  async _claimMail(mailId) {
    if (!mailId) return;
    const res = await claimCardMail(mailId);
    if (!res || !res.ok) {
      const reason = res && res.reason;
      const msg = reason === 'not_enough_gold' ? '❌ Zeny ไม่พอสำหรับรับการ์ดใบนี้'
        : reason === 'gone' ? '❌ จดหมายนี้ถูกจัดการไปแล้ว'
          : '❌ รับการ์ดไม่สำเร็จ';
      this.addCombatLog(msg, 'warning');
      await this.refreshMailbox(); this._renderMailList();
      return;
    }
    await this.loadInventoryFromDB(this.characterId);
    if (this.cardAlbum) this.cardAlbum.render();
    if (this.character && this.character.stats && Number.isFinite(res.recipient_gold)) {
      this.character.stats.gold = res.recipient_gold;
      this.updateHUD(this.character.stats);
      this.updateStats(this.character.stats);
    }
    this.addCombatLog(`🤝 รับการ์ด ${res.item_name} x${res.quantity} จาก ${res.sender_name}${res.price > 0 ? ` (จ่าย ${res.price} Zeny)` : ' (ฟรี)'} แล้ว!`, 'loot');
    await this.refreshMailbox(); this._renderMailList();
  }

  async _returnMail(mailId, mode) {
    if (!mailId) return;
    const res = await returnCardMail(mailId);
    if (!res || !res.ok) {
      this.addCombatLog('❌ ดำเนินการไม่สำเร็จ', 'warning');
    } else if (mode === 'cancel') {
      // Sender got the escrowed card back — refresh own inventory/album.
      await this.loadInventoryFromDB(this.characterId);
      if (this.cardAlbum) this.cardAlbum.render();
      this.addCombatLog(`↩️ ยกเลิกและรับการ์ด ${res.item_name} x${res.quantity} คืนแล้ว`, 'system');
    } else {
      this.addCombatLog(`🚫 ปฏิเสธการ์ด ${res.item_name} x${res.quantity} (คืนให้ผู้ส่ง)`, 'system');
    }
    await this.refreshMailbox(); this._renderMailList();
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
      const sent = await sendTradeRequestPacket(
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
      this.pendingTradeRequestId = sent?.requestId || null;

      // Start 30 seconds timeout
      this.tradeTimeout = setTimeout(() => {
        if (waitOverlay && waitOverlay.style.display !== 'none') {
          waitOverlay.style.display = 'none';
          this.addCombatLog('⏱️ คำขอการซื้อขายหมดเวลาไม่มีการตอบรับ', 'warning');
          this.tradeTarget = null;
          this.tradeSelectedItem = null;
          this.pendingTradeRequestId = null;
        }
      }, 30000);

    } catch (err) {
      console.error('[Trade] Request Error:', err);
      this.addCombatLog('❌ เกิดข้อผิดพลาดในการส่งคำขอซื้อขาย', 'warning');
      if (waitOverlay) waitOverlay.style.display = 'none';
    }
  }

  receiveTradeRequest(payload) {
    const request = this._normalizeIncomingTradeRequest(payload);
    if (!request) return;
    payload = request;
    this.activeTradeRequest = request;

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

    // Cards carry no ITEMS entry — resolve their art/rarity from the catalog
    // so the recipient sees the real card, not a generic 📦.
    const cardCatalog = payload.itemType === 'card' ? getCard(payload.itemName) : null;
    const meta = cardCatalog
      ? { emoji: null, rarity: cardCatalog.rarity }
      : (ITEMS[payload.itemName] || {});
    if (itemIcon) {
      if (cardCatalog) itemIcon.innerHTML = this._itemIconHtml({ item_type: 'card', item_name: payload.itemName });
      else itemIcon.textContent = meta.emoji || '📦';
    }
    if (itemName) {
      itemName.textContent = cardCatalog ? (cardCatalog.displayName || payload.itemName) : payload.itemName;
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
    const activeId = this.activeTradeRequest?.requestId;
    const cancelledId = payload.requestPayload?.requestId;
    if (this.activeTradeRequest && this.activeTradeRequest.senderUserId === payload.senderUserId
      && activeId && cancelledId === activeId) {
      const panel = document.getElementById('trade-confirm-modal');
      if (panel) panel.style.display = 'none';
      this.activeTradeRequest = null;
      const senderName = payload.requestPayload?.senderName || 'ผู้เล่น';
      this.addCombatLog(`🤝 ${senderName} ได้ยกเลิกคำขอโอนไอเทมและราคาเสนอแล้ว`, 'system');
    }
  }

  _normalizeIncomingTradeRequest(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.targetCharacterId && payload.targetCharacterId !== this.characterId) return null;
    const itemName = typeof payload.itemName === 'string' ? payload.itemName.trim() : '';
    const itemType = typeof payload.itemType === 'string' ? payload.itemType.trim() : '';
    const knownItem = itemType === 'card' ? getCard(itemName) : ITEMS[itemName];
    if (!knownItem || !/^trade:[A-Za-z0-9:_-]{1,214}$/.test(payload.requestId || '')) return null;
    if (!Number.isInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 9999) return null;
    if (!Number.isSafeInteger(payload.price) || payload.price < 0 || payload.price > 2_147_483_647) return null;
    if (typeof payload.senderUserId !== 'string' || !payload.senderUserId || payload.senderUserId.length > 160) return null;
    if (payload.stats && (typeof payload.stats !== 'object' || Array.isArray(payload.stats))) return null;
    try {
      if (JSON.stringify(payload.stats || {}).length > 8192) return null;
    } catch (_) {
      return null;
    }
    return { ...payload, itemName, itemType, stats: { ...(payload.stats || {}) } };
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
      // A received card must show up in the album/collection immediately.
      if (req.itemType === 'card' && this.cardAlbum) this.cardAlbum.render();

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
    const req = payload?.requestPayload;
    if (!req || typeof payload.accepted !== 'boolean') return;
    if (this.pendingTradeRequestId) {
      if (req.requestId !== this.pendingTradeRequestId) return;
    } else if (!this.tradeTarget || req.targetUserId !== this.tradeTarget.userId
      || !this.tradeSelectedItem || req.itemName !== this.tradeSelectedItem.item_name) {
      return;
    }

    // Clear timeout & wait overlay
    if (this.tradeTimeout) {
      clearTimeout(this.tradeTimeout);
      this.tradeTimeout = null;
    }

    const waitOverlay = document.getElementById('trade-waiting-overlay');
    if (waitOverlay) waitOverlay.style.display = 'none';

    // Close both trade panels (generic item trade + card P2P trade).
    const panel = document.getElementById('trade-panel');
    if (panel) panel.style.display = 'none';
    const cardModal = document.getElementById('card-trade-modal');
    if (cardModal) cardModal.style.display = 'none';
    const cardWaiting = document.getElementById('card-trade-waiting');
    if (cardWaiting) cardWaiting.style.display = 'none';
    this.updateMobileControlsVisibility();

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

        if (req.itemType === 'card') {
          // Rebuild inventory + card collection state from the DB so the album
          // and duplicate/fusion counts reflect the card that just left.
          await this.loadInventoryFromDB(this.characterId);
          if (this.cardAlbum) this.cardAlbum.render();
        } else {
          // Deduct from local inventory
          const localItem = this.inventory.find(i => i.item_name === req.itemName);
          if (localItem) {
            localItem.quantity -= req.quantity;
            if (localItem.quantity <= 0) {
              const idx = this.inventory.indexOf(localItem);
              this.inventory.splice(idx, 1);
            }
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
    this.pendingTradeRequestId = null;
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
      const monsterPool = ['Poring', 'Fabre', 'Moonhare', 'Bigfoot', 'Fly'];
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
      monsters: ['Poring', 'Moonhare', 'Fabre', 'Pupa'],
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
    {
      id: SKYRAIL_MAP_ID,
      name: 'Skyrail Bazaar',
      nameTh: 'ตลาดเวหายามค่ำคืน',
      emoji: '🚉',
      color: '#ff68c5',
      bgGradient: 'linear-gradient(135deg, #21143f 0%, #713b7d 48%, #dd765f 100%)',
      desc: 'ตลาดเทศกาลบนเกาะลอยฟ้า · กิจกรรมหมุนทุก 30 นาที · โหมดทดสอบเปิดตลอด 24 ชั่วโมง',
      level: 'ทุกเลเวล · QA เปิดทั้งวัน',
      difficulty: 'Daily Event',
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
        @media (hover: hover) {
          .warp-tile:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            border-color: rgba(240, 192, 64, 0.5);
          }
        }
        .warp-tile.current {
          border-color: rgba(240, 192, 64, 0.8);
          box-shadow: 0 0 20px rgba(240, 192, 64, 0.3);
        }
        .warp-tile.locked { filter: saturate(.55); opacity:.72; cursor:not-allowed; }
        .warp-tile.locked .tile-warp-btn { background:#5c5670;color:#c7bfd7;cursor:not-allowed; }
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
        @media (hover: hover) {
          .warp-tile .tile-warp-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 0 16px rgba(240, 192, 64, 0.5);
          }
        }
        .warp-tile .tile-warp-btn:active {
          transform: scale(0.97);
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
    const skyrailStatus = getSkyrailStatus();

    const tiles = maps.map(m => {
      const isCurrent = m.id === currentMapId;
      const isLocked = m.id === SKYRAIL_MAP_ID && !skyrailStatus.isOpen;
      const glowOpacity = isCurrent ? '0.5' : '0.2';
      return `
        <div class="warp-tile ${isCurrent ? 'current' : ''} ${isLocked ? 'locked' : ''}" data-map="${m.id}"
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
          : isLocked
            ? '<button class="tile-warp-btn" disabled>🔒 เปิด 18:00</button>'
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

  _openCardSocketPicker(cardItem) {
    if (!this.character) return;
    const cardData = ITEMS[cardItem.item_name];
    if (!cardData || !cardData.cardSlot) return;

    // Filter equipped items that match the card's required slot type
    const targets = this.inventory.filter(i => {
      const slotId = this._equipmentSlotForItem(i);
      return i.stats?.equipped === true && slotId && cardFitsSlot(cardItem.item_name, slotId);
    });

    if (targets.length === 0) {
      this.addCombatLog(`❌ คุณไม่มีอุปกรณ์ประเภท "${cardData.cardSlot}" ที่สวมใส่อยู่`, 'system');
      return;
    }

    let html = `<div style="padding:10px;color:white">
      <div style="margin-bottom:10px;font-weight:bold;color:var(--secondary)">เลือกอุปกรณ์ที่จะใส่การ์ด ${cardItem.emoji} ${cardItem.item_name}:</div>
      <div style="display:grid;gap:8px">`;

    targets.forEach(t => {
      const slotId = this._equipmentSlotForItem(t);
      const occupied = Boolean(this.character?.equippedCards?.[slotId]);
      html += `<div class="socket-target-row" style="background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center" data-slot="${slotId}">
        <div>${t.emoji} ${t.item_name} <span style="font-size:12px;color:var(--text-dim)">(${occupied ? 1 : 0}/1 socket)</span></div>
        <div style="width:8px;height:8px;border-radius:50%;background:${occupied ? '#ffd700' : 'rgba(255,255,255,0.2)'}"></div>
      </div>`;
    });

    html += `</div></div>`;

    const modal = document.createElement('div');
    modal.className = 'modal-popup card-socket-picker';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:300px;background:#1a1a2e;border:1px solid #4060c0;border-radius:8px;z-index:10000;box-shadow:0 0 20px rgba(0,0,0,0.5)';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    const closeHandler = (e) => {
      if (!modal.contains(e.target)) {
        modal.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);

    modal.querySelectorAll('.socket-target-row').forEach(row => {
      row.addEventListener('click', async () => {
        const slotId = row.getAttribute('data-slot');
        if (slotId) {
          modal.remove();
          document.removeEventListener('mousedown', closeHandler);
          await this._socketCard(slotId, cardItem.item_name);
        }
      });
    });
  }

  async _socketCardToItem(targetItem, cardItem) {
    if (!this.characterId || !targetItem || !cardItem) return;

    if (!targetItem.stats) targetItem.stats = {};
    if (!targetItem.stats.cards) targetItem.stats.cards = [];

    if (targetItem.stats.cards.length >= 1) {
      this.addCombatLog(`❌ อุปกรณ์นี้มีช่องการ์ดเต็มแล้ว (สูงสุด 1 ใบ)`, 'system');
      return;
    }

    targetItem.stats.cards.push(cardItem.item_name);

    try {
      // Save the target item's new stats
      await updateInventoryItemStats(this.characterId, targetItem.item_name, targetItem.stats);

      // Consume one card
      cardItem.quantity--;
      await saveInventoryItem(this.characterId, cardItem.item_name, cardItem.item_type, -1);

      if (cardItem.quantity <= 0) {
        const idx = this.inventory.findIndex(i => i.item_name === cardItem.item_name && i.item_type === 'card');
        if (idx !== -1) this.inventory.splice(idx, 1);
        this.selectedItemName = null;
      }

      this.addCombatLog(`✅ ใส่การ์ด ${cardItem.item_name} ลงใน ${targetItem.item_name} สำเร็จ!`, 'levelup');
      if (this.soundManager) this.soundManager.playLevelUpSound();

      this._renderInventory();
      this._updateDetailBox();

      // BRIDGE: Also update the character's canonical equippedCards so it's persisted in the appearance blob
      if (this.character && this.character.equipCard) {
        const slot = targetItem.stats.slot || targetItem.stats.equippedSlot;
        if (slot) {
          this.character.equipCard(slot, cardItem.item_name);
        }
      }

      this.updateStats(this.character.stats);

      // Persist card socket state + inventory stats to Supabase
      if (this.characterId && this.character?.saveStatsToDatabase) {
        try { await this.character.saveStatsToDatabase(); }
        catch (e) { console.warn('[GameUI] Card socket persistence save failed:', e?.message || e); }
      }
    } catch (err) {
      console.error('Socketing failed:', err);
      this.addCombatLog('❌ เกิดข้อผิดพลาดในการใส่การ์ด', 'system');
    }
  }

  async _removeCardFromItem(targetItem, cardIdx) {
    if (!this.characterId || !targetItem || !targetItem.stats || !targetItem.stats.cards) return;

    const cardName = targetItem.stats.cards[cardIdx];
    if (!cardName) return;

    // Remove from item stats
    targetItem.stats.cards.splice(cardIdx, 1);

    try {
      // Save the target item's new stats
      await updateInventoryItemStats(this.characterId, targetItem.item_name, targetItem.stats);

      // Return card to inventory
      await saveInventoryItem(this.characterId, cardName, 'card', 1);

      // Update local inventory array
      const existingCard = this.inventory.find(i => i.item_name === cardName && i.item_type === 'card');
      if (existingCard) {
        existingCard.quantity++;
      } else {
        // If not in local inventory, we'd need to fetch it or just re-render after a full load
        // For simplicity, let's assume it's either there or we'll just re-render and it will appear next time
        this.addCombatLog(`⚠️ ถอดการ์ดสำเร็จ แต่กรุณาเปิดกระเป๋าใหม่เพื่อดูการ์ดที่ได้รับคืน`, 'system');
      }

      this.addCombatLog(`✅ ถอดการ์ด ${cardName} ออกจาก ${targetItem.item_name} แล้ว!`, 'system');

      this._renderInventory();
      this._updateDetailBox();

      // BRIDGE: Also update the character's canonical equippedCards
      if (this.character && this.character.unequipCard) {
        const slot = targetItem.stats.slot || targetItem.stats.equippedSlot;
        if (slot && this.character.equippedCards[slot] === getCard(cardName)?.id) {
          this.character.unequipCard(slot);
        }
      }

      this.updateStats(this.character.stats);

      // Persist card socket state + inventory stats to Supabase
      if (this.characterId && this.character?.saveStatsToDatabase) {
        try { await this.character.saveStatsToDatabase(); }
        catch (e) { console.warn('[GameUI] Card removal persistence save failed:', e?.message || e); }
      }
    } catch (err) {
      console.error('Removal failed:', err);
      this.addCombatLog('❌ เกิดข้อผิดพลาดในการถอดการ์ด', 'system');
    }
  }

  // Direct card-selection popup triggered from the "＋" button on an empty socket
  // slot in the inventory detail box. Lists all cards in the player's inventory
  // and sockets the selected card immediately into the target slot.
  _openCardSocketDirectPicker(itemName, socketIndex) {
    const targetItem = this.inventory.find(i => i.item_name === itemName);
    if (!targetItem || !targetItem.stats) return;
    if (!targetItem.stats.cards) targetItem.stats.cards = [];
    if (targetItem.stats.cards.length >= 1) {
      this.addCombatLog('❌ อุปกรณ์นี้มีช่องการ์ดเต็มแล้ว (สูงสุด 1 ใบ)', 'system');
      return;
    }

    // All cards available in the player's inventory
    const availableCards = (this.inventory || []).filter(
      i => i.item_type === 'card' && i.quantity >= 1 &&
        !targetItem.stats.cards.includes(i.item_name)
    );

    let html = `<div style="padding:12px;color:white">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:800;color:var(--secondary);font-size:14px">🃏 เลือกการ์ดใส่ ${targetItem.emoji} ${itemName}</div>
        <div id="csp-close" style="cursor:pointer;color:#9fb0e0;font-size:18px;line-height:1;padding:2px 6px">✕</div>
      </div>
      <div style="font-size:11px;color:#8b97ba;margin-bottom:8px">การ์ดทั้งหมดในกระเป๋าของคุณ — คลิกเพื่อใส่ (${targetItem.stats.cards.length}/1 ช่องใช้แล้ว)</div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto">`;

    if (availableCards.length === 0) {
      html += `<div style="color:#8b97ba;text-align:center;padding:16px 4px;font-size:13px">ยังไม่มีการ์ดในกระเป๋า</div>`;
    } else {
      availableCards.forEach(cardItem => {
        const it = ITEMS[cardItem.item_name] || {};
        const catalogCard = getCard(cardItem.item_name);
        const rar = it.rarity || catalogCard?.rarity || 'common';
        const col = RARITY_COLOR[rar] || '#b8c0cc';
        const cardEmoji = it.emoji || catalogCard?.displayName?.charAt(0) || '🃏';

        // Build stat bonus summary
        const bonuses = [];
        if (it.card) {
          if (it.card.atkBonus) bonuses.push(`ATK+${it.card.atkBonus}`);
          if (it.card.defBonus) bonuses.push(`DEF+${it.card.defBonus}`);
          if (it.card.hpBonus) bonuses.push(`HP+${it.card.hpBonus}`);
          if (it.card.spBonus) bonuses.push(`SP+${it.card.spBonus}`);
        }
        const bonusStr = bonuses.length ? bonuses.join(' · ') : (it.desc || catalogCard?.abilityName || '');

        html += `<div class="csp-card-row" data-card-name="${cardItem.item_name}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;border-left:3px solid ${col};background:rgba(255,255,255,0.04);transition:background .12s" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:5px;background:rgba(255,255,255,0.08);border:1px solid ${col};font-size:15px">${cardEmoji}</span>
          <div style="flex:1;line-height:1.3">
            <div style="font-size:13px"><b style="color:${col}">${cardItem.item_name}</b> <span style="font-size:10px;color:#8b97ba;margin-left:4px">(${rar})</span></div>
            <div style="font-size:11px;color:var(--text-dim)">${bonusStr}</div>
          </div>
          <span style="font-size:11px;color:#8b97ba">x${cardItem.quantity}</span>
        </div>`;
      });
    }

    html += `</div></div>`;

    const modal = document.createElement('div');
    modal.className = 'modal-popup card-socket-direct-picker';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;max-width:92vw;background:#1a1a2e;border:1px solid #4060c0;border-radius:10px;z-index:100000;box-shadow:0 0 24px rgba(0,0,0,.6);overflow:hidden';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    // Close on outside click
    const closeHandler = (e) => {
      if (!modal.contains(e.target)) {
        modal.remove();
        document.removeEventListener('mousedown', closeHandler);
        document.removeEventListener('touchstart', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', closeHandler);
      document.addEventListener('touchstart', closeHandler);
    }, 10);

    // Close button
    const closeBtn = modal.querySelector('#csp-close');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      modal.remove();
      document.removeEventListener('mousedown', closeHandler);
      document.removeEventListener('touchstart', closeHandler);
    });

    // Card row clicks
    modal.querySelectorAll('.csp-card-row').forEach(row => {
      row.addEventListener('click', async () => {
        const cardName = row.getAttribute('data-card-name');
        const cardItem = availableCards.find(i => i.item_name === cardName);
        if (cardItem && targetItem) {
          modal.remove();
          document.removeEventListener('mousedown', closeHandler);
          document.removeEventListener('touchstart', closeHandler);
          await this._socketCardToItem(targetItem, cardItem);
        }
      });
    });
  }

  _doWarp(targetMap) {
    console.log('[GameUI] _doWarp called with', targetMap);
    if (!window.sceneManager || !window.character) return;
    if (targetMap === SKYRAIL_MAP_ID && !getSkyrailStatus().isOpen) {
      this.addCombatLog('🚉 Skyrail Bazaar เปิดทุกวันเวลา 18:00–23:59 น. (เวลาไทย)', 'warning');
      this._renderWarpMap();
      return;
    }
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

