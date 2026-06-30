// Game UI — HUD, panels, combat log, and all in-game UI
import { getExpRequired } from '../engine/GameData.js';
import { fetchLeaderboard, loadInventory, saveInventoryItem } from '../network/GameSync.js';

export class GameUI {
    constructor() {
        this.gameScreen = document.getElementById('game-screen');
        this.combatLogEl = document.getElementById('combat-log-messages');
        this.maxLogMessages = 20;
        this.inventory = [];
        this.characterId = null;

        this._setupPanels();
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
        document.getElementById('btn-leaderboard').addEventListener('click', () => {
            this._togglePanel('leaderboard-panel');
            this._refreshLeaderboard();
        });
        document.getElementById('btn-players-list').addEventListener('click', () => this._togglePanel('players-panel'));

        // Close buttons
        document.querySelectorAll('.panel-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const panelId = btn.getAttribute('data-close');
                document.getElementById(panelId).style.display = 'none';
            });
        });
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
        body.innerHTML = `
      <div class="stat-row"><span class="stat-label">Name</span><span class="stat-value">${stats.name}</span></div>
      <div class="stat-row"><span class="stat-label">Level</span><span class="stat-value">${stats.level}</span></div>
      <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${Math.floor(stats.hp)} / ${stats.max_hp}</span></div>
      <div class="stat-row"><span class="stat-label">SP</span><span class="stat-value">${Math.floor(stats.sp)} / ${stats.max_sp}</span></div>
      <div class="stat-row"><span class="stat-label">ATK</span><span class="stat-value">${stats.atk}</span></div>
      <div class="stat-row"><span class="stat-label">DEF</span><span class="stat-value">${stats.def}</span></div>
      <div class="stat-row"><span class="stat-label">EXP</span><span class="stat-value">${stats.exp} / ${getExpRequired(stats.level)}</span></div>
      <div class="stat-row"><span class="stat-label">Gold</span><span class="stat-value">💰 ${stats.gold.toLocaleString()}</span></div>
      <div class="stat-row"><span class="stat-label">Total Kills</span><span class="stat-value">💀 ${stats.total_kills.toLocaleString()}</span></div>
      <div class="stat-row"><span class="stat-label">Play Time</span><span class="stat-value">${this._formatTime(stats.play_time)}</span></div>
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
    async loadInventoryFromDB(characterId) {
        this.characterId = characterId;
        try {
            this.inventory = await loadInventory(characterId);
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
            this.inventory.push({
                item_name: item.name,
                item_type: item.type,
                quantity: 1,
                emoji: item.emoji,
            });
        }

        // Save to DB (fire and forget)
        if (this.characterId) {
            saveInventoryItem(this.characterId, item.name, item.type, 1).catch(() => { });
        }

        this._renderInventory();
    }

    _renderInventory() {
        const grid = document.getElementById('inventory-grid');
        grid.innerHTML = '';

        // Fill inventory slots
        const totalSlots = 25;
        for (let i = 0; i < totalSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';

            if (i < this.inventory.length) {
                const item = this.inventory[i];
                slot.innerHTML = `
          <span>${item.emoji || '📦'}</span>
          <span class="inv-name">${item.item_name}</span>
          <span class="inv-qty">${item.quantity}</span>
        `;
                slot.title = `${item.item_name} (${item.item_type}) x${item.quantity}`;
            }

            grid.appendChild(slot);
        }
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
    updateOnlinePlayers(players) {
        // Update auth screen count
        const authCount = document.getElementById('online-players-auth');
        if (authCount) authCount.textContent = players.length;

        // Update panel
        const body = document.getElementById('players-body');
        if (players.length === 0) {
            body.innerHTML = '<div style="text-align:center;color:var(--text-dim)">No players online</div>';
            return;
        }

        body.innerHTML = players.map(p => `
      <div class="player-row">
        <span class="online-dot"></span>
        <span>${p.username}</span>
        <span style="color:var(--text-dim);margin-left:auto">Lv.${p.level}</span>
      </div>
    `).join('');
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

    // ============ Auto Farm Button ============
    setupAutoFarmButton(callback) {
        const btn = document.getElementById('btn-auto-farm');
        btn.addEventListener('click', () => {
            const isActive = callback();
            btn.classList.toggle('active', isActive);
        });
    }

    setAutoFarmState(active) {
        document.getElementById('btn-auto-farm').classList.toggle('active', active);
    }
}
