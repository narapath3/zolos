import { getExpRequired, ITEMS, MONSTERS, PAYON_MONSTERS, WATER_MONSTERS, getAllMonsters, SHOP_ITEMS } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem, updateInventoryItemStats, fetchMarketListings, listMarketItem, buyMarketItem, cancelMarketListing, fetchMarketPriceStats } from '../network/GameSync.js';

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

    this._setupPanels();
    this._setupROInventoryEvents();
    this._setupShopEvents();
    this._setupMarketEvents();
    this._setupWiki();
    this._setupFriendSystem();
    this._setupChat();
    this._setupMinimap();
    this._setupProfileEditor();
    this._setupLeaderboardTabs();
    this._setupOnlineTabs();
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
      nameEl.classList.add(`rarity-${item.rarity}`);
    }

    document.getElementById('detail-type').textContent = item.item_type.toUpperCase();
    document.getElementById('detail-desc').textContent = item.desc;

    // Show stats if any
    const statsEl = document.getElementById('detail-stats');
    statsEl.innerHTML = '';
    if (item.stats && Object.keys(item.stats).length > 0) {
      Object.entries(item.stats).forEach(([k, v]) => {
        if (k === 'equipped') return;
        const s = document.createElement('div');
        s.textContent = `${k.toUpperCase()}: ${v > 0 ? '+' : ''}${v}`;
        statsEl.appendChild(s);
      });
    }

    // Droppers
    const dropEl = document.getElementById('detail-droppers');
    const droppers = this._getItemDroppers(item.item_name);
    if (droppers.length > 0) {
      dropEl.innerHTML = '<strong>Dropped by:</strong> ' + droppers.map(d => `${d.emoji} ${d.name} (${d.chance}%)`).join(', ');
    } else {
      dropEl.innerHTML = '';
    }

    // Action button text
    const useBtn = document.getElementById('btn-use-item');
    if (['weapon', 'fishing_rod', 'armor', 'shield'].includes(item.item_type)) {
      useBtn.textContent = item.stats && item.stats.equipped ? 'Unequip' : 'Equip';
    } else if (item.item_type === 'consumable') {
      useBtn.textContent = 'Use Item';
    } else {
      useBtn.textContent = 'Etc Item';
    }
  }

  async _useSelectedItem() {
    if (!this.selectedItemName || !this.character) return;

    const item = this.inventory.find(i => i.item_name === this.selectedItemName);
    if (!item) return;

    if (item.item_type === 'consumable') {
      // Heal
      if (item.healHp) {
        this.character.stats.hp = Math.min(this.character.stats.max_hp, this.character.stats.hp + item.healHp);
        this.logCombat(`Used ${item.item_name}, restored ${item.healHp} HP!`, 'info');
      }
      if (item.restoreSp) {
        this.character.stats.sp = Math.min(this.character.stats.max_sp, this.character.stats.sp + item.restoreSp);
        this.logCombat(`Used ${item.item_name}, restored ${item.restoreSp} SP!`, 'info');
      }

      // Consume
      item.quantity--;
      if (this.characterId) {
        saveInventoryItem(this.characterId, item.item_name, item.item_type, -1).catch(() => { });
      }

      if (item.quantity <= 0) {
        this.inventory = this.inventory.filter(i => i.item_name !== item.item_name);
        this.selectedItemName = null;
      }
    } else if (['weapon', 'fishing_rod', 'armor', 'shield'].includes(item.item_type)) {
      // Toggle Equip
      const isEquipping = !(item.stats && item.stats.equipped);

      // If equipping weapon, unequip others of same type
      if (isEquipping) {
        this.inventory.forEach(i => {
          if (i.item_type === item.item_type && i.stats) i.stats.equipped = false;
        });
      }

      if (!item.stats) item.stats = {};
      item.stats.equipped = isEquipping;

      // Update character state
      if (item.item_type === 'weapon' || item.item_type === 'fishing_rod') {
        this.character.equipWeapon(isEquipping ? item.item_name : null);
      } else if (item.item_type === 'armor') {
        this.character.equippedArmor = isEquipping ? item.item_name : null;
      } else if (item.item_type === 'shield') {
        this.character.equippedShield = isEquipping ? item.item_name : null;
      }

      // Sync to DB
      if (this.characterId) {
        updateInventoryItemStats(this.characterId, item.item_name, item.stats).catch(() => { });
      }
    }

    this._renderInventory();
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
  }

  // ============ Combat Log ============
  logCombat(msg, type = 'normal') {
    const p = document.createElement('div');
    p.className = `log-msg log-${type}`;
    p.textContent = `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;

    this.combatLogEl.prepend(p);

    while (this.combatLogEl.children.length > this.maxLogMessages) {
      this.combatLogEl.removeChild(this.combatLogEl.lastChild);
    }
  }

  // ============ Shop ============
  _setupShopEvents() {
    const tabs = document.querySelectorAll('.shop-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentShopTab = tab.getAttribute('data-tab');
        this._renderShop();
      });
    });

    document.getElementById('btn-buy-shop').addEventListener('click', () => {
      this._buyShopItem();
    });
  }

  _renderShop() {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';

    let filtered = SHOP_ITEMS;
    if (this.currentShopTab !== 'all') {
      filtered = SHOP_ITEMS.filter(i => i.type === this.currentShopTab);
    }

    filtered.forEach(item => {
      const slot = document.createElement('div');
      slot.className = 'shop-item';
      if (this.selectedShopItem?.name === item.name) slot.classList.add('selected');

      slot.innerHTML = `
        <div class="shop-item-icon">${item.emoji}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price">${item.price.toLocaleString()} z</div>
      `;

      slot.addEventListener('click', () => {
        document.querySelectorAll('.shop-item').forEach(s => s.classList.remove('selected'));
        slot.classList.add('selected');
        this.selectedShopItem = item;
        this._updateShopDetail();
      });

      grid.appendChild(slot);
    });
  }

  _updateShopDetail() {
    const detail = document.getElementById('shop-detail');
    if (!this.selectedShopItem) {
      detail.innerHTML = '<div class="shop-placeholder">Select an item to buy</div>';
      return;
    }

    const item = this.selectedShopItem;
    detail.innerHTML = `
      <div class="shop-detail-header">
        <span class="shop-detail-icon">${item.emoji}</span>
        <div class="shop-detail-title">
          <div class="shop-detail-name">${item.name}</div>
          <div class="shop-detail-type">${item.type.toUpperCase()}</div>
        </div>
      </div>
      <div class="shop-detail-desc">${item.desc || 'No description available.'}</div>
      <div class="shop-detail-price">Price: <strong>${item.price.toLocaleString()} z</strong></div>
    `;
  }

  async _buyShopItem() {
    if (!this.selectedShopItem || !this.character) return;
    const item = this.selectedShopItem;

    if (this.character.stats.gold < item.price) {
      this.logCombat("Not enough gold!", "error");
      return;
    }

    this.character.stats.gold -= item.price;
    this.addItem(item);
    this.logCombat(`Purchased ${item.name} for ${item.price}z`, "info");
    this.updateHUD(this.character.stats);
    this.updateStats(this.character.stats);
  }

  // ============ Wiki ============
  _setupWiki() {
    const searchInput = document.getElementById('wiki-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._renderWiki(e.target.value);
      });
    }
  }

  _renderWiki(filter = '') {
    const container = document.getElementById('wiki-content');
    container.innerHTML = '';

    const allMons = getAllMonsters();
    const filtered = Object.values(allMons).filter(m =>
      m.name.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(m => {
      const card = document.createElement('div');
      card.className = 'wiki-card';
      card.innerHTML = `
        <div class="wiki-card-header">
          <span class="wiki-card-icon">${m.emoji}</span>
          <strong>${m.name}</strong> (Lv.${m.level})
        </div>
        <div class="wiki-card-stats">HP: ${m.hp} | ATK: ${m.atk} | EXP: ${m.exp}</div>
        <div class="wiki-card-loot">
          Loot: ${m.loot.map(l => `${l.name} (${l.chance}%)`).join(', ')}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // ============ Leaderboard ============
  _setupLeaderboardTabs() {
    const tabs = document.querySelectorAll('.rank-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.leaderboardCategory = tab.getAttribute('data-cat');
        this._refreshLeaderboard();
      });
    });
  }

  async _refreshLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="rank-loading">Fetching rankings...</div>';

    try {
      const data = await fetchLeaderboard(this.leaderboardCategory);
      list.innerHTML = '';

      if (!data || data.length === 0) {
        list.innerHTML = '<div class="rank-empty">No players found</div>';
        return;
      }

      data.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'rank-item';
        if (index < 3) item.classList.add(`top-${index + 1}`);

        const displayName = player.profiles?.username || player.name || 'Novice';
        const displayVal = this.leaderboardCategory === 'gold'
          ? player.gold.toLocaleString() + ' z'
          : 'Lv.' + player.level;

        item.innerHTML = `
          <div class="rank-pos">${index + 1}</div>
          <div class="rank-name">${displayName}</div>
          <div class="rank-val">${displayVal}</div>
        `;
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = '<div class="rank-error">Failed to load leaderboard</div>';
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

  _renderOnlinePlayers() {
    // This would typically use real-time data from Supabase
    const list = document.getElementById('online-players-list');
    list.innerHTML = '<div class="rank-loading">Loading players...</div>';
    // Simulated for now
    setTimeout(() => {
      list.innerHTML = '<div class="rank-empty">Feature coming soon</div>';
    }, 500);
  }

  // ============ Friend System ============
  _setupFriendSystem() { }

  // ============ Chat ============
  _setupChat() { }

  // ============ Minimap ============
  _setupMinimap() { }

  // ============ Profile Editor ============
  _setupProfileEditor() { }

  // ============ P2P Marketplace ============
  _setupMarketEvents() {
    const tabs = document.querySelectorAll('.market-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.marketTab = tab.getAttribute('data-tab');
        this._renderMarket();
      });
    });

    document.getElementById('btn-market-refresh').addEventListener('click', () => this._renderMarket());
  }

  async _renderMarket() {
    const container = document.getElementById('market-content');
    container.innerHTML = '<div class="rank-loading">Loading marketplace...</div>';

    if (this.marketTab === 'buy') {
      try {
        const listings = await fetchMarketListings();
        container.innerHTML = '';
        if (!listings || listings.length === 0) {
          container.innerHTML = '<div class="rank-empty">No items for sale</div>';
          return;
        }

        listings.forEach(item => {
          const card = document.createElement('div');
          card.className = 'market-card';
          card.innerHTML = `
            <div class="market-card-icon">${ITEMS[item.item_name]?.emoji || '📦'}</div>
            <div class="market-card-info">
              <div class="market-card-name">${item.item_name}</div>
              <div class="market-card-seller">Seller: ${item.profiles?.username || 'Unknown'}</div>
              <div class="market-card-price">${item.price.toLocaleString()} z</div>
            </div>
            <button class="market-buy-btn" data-id="${item.id}">Buy</button>
          `;
          container.appendChild(card);
        });

        container.querySelectorAll('.market-buy-btn').forEach(btn => {
          btn.addEventListener('click', (e) => this._buyMarketItem(e.target.getAttribute('data-id')));
        });
      } catch (e) {
        container.innerHTML = '<div class="rank-error">Failed to load market</div>';
      }
    } else {
      // Sell tab logic
      this._renderMarketSell(container);
    }
  }

  _renderMarketSell(container) {
    container.innerHTML = '<div class="market-sell-container"><h3>Sell Items</h3><p>Select an item from your inventory to list it.</p></div>';
  }

  async _buyMarketItem(listingId) {
    if (!this.character) return;
    // Logic to buy item
    this.logCombat("Buying market item...", "info");
  }
}
