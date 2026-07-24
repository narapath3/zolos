import { supabase, isOfflineMode, localDb } from '../network/SupabaseClient.js';
import { saveInventoryItem, saveCharacter } from '../network/GameSync.js';
import '../styles/admin.css';

export class AdminUI {
    constructor() {
        this.container = null;
        this.isOpen = false;
        this.users = [];
        this.items = [];
        this.isAdmin = false;
        this.currentTab = 'users';
        this.selectedUser = null;

        // Track current logged-in user details for diagnostics
        this.currentUserId = null;
        this.isDbAdmin = false;
        this.currentUsername = 'Unknown';

        this._createUI();
    }

    async checkAdmin(userId) {
        this.currentUserId = userId;
        this.isDbAdmin = false;
        this.currentUsername = 'Unknown';

        // Admin status is decided ONLY by profiles.is_admin in the database.
        // There is deliberately no localStorage / client override — that was a
        // backdoor (anyone could set a flag in the console to reveal the panel).
        // Note: even a revealed panel is now powerless — the server verifies
        // is_admin on announcements and RLS gates every admin DB write.
        this.isAdmin = false;
        if (!isOfflineMode && userId && !userId.startsWith('guest_') && !userId.startsWith('local_')) {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username, is_admin')
                    .eq('id', userId)
                    .single();
                if (!error && data) {
                    this.currentUsername = data.username || 'Unknown';
                    this.isDbAdmin = data.is_admin === true;
                    this.isAdmin = this.isDbAdmin;
                }
            } catch (e) {
                this.isAdmin = false;
            }
        } else {
            this.currentUsername = (userId && userId.startsWith('guest_')) ? 'Guest' : 'Local/Offline';
        }

        const btn = document.getElementById('btn-admin');
        if (btn) btn.style.display = this.isAdmin ? 'flex' : 'none';

        this._updateStatusText();

        return this.isAdmin;
    }

    toggle() {
        if (!this.isAdmin) {
            console.warn('[Admin] Access Denied: You are not an administrator.');
            return;
        }

        this.isOpen = !this.isOpen;
        this.container.style.display = this.isOpen ? 'flex' : 'none';

        if (this.isOpen) {
            this.refreshData();
        }

        if (window.gameUI) {
            window.gameUI.updateMobileControlsVisibility();
        }
    }

    close() {
        this.isOpen = false;
        if (this.container) this.container.style.display = 'none';
        if (window.gameUI) {
            window.gameUI.updateMobileControlsVisibility();
        }
    }

    async refreshData() {
        if (this.currentTab === 'users') {
            await this.loadUsers();
        } else if (this.currentTab === 'items') {
            await this.loadItems();
        }
        this._renderContent();
    }

    async loadUsers() {
        if (isOfflineMode) {
            const users = localDb.get('users') || {};
            this.users = Object.keys(users).map(username => {
                const char = localDb.get(`char_${users[username].userId}`) || {};
                return {
                    id: users[username].userId,
                    username: username,
                    level: char.level || 1,
                    gold: char.gold || 0,
                    total_kills: char.total_kills || 0,
                    play_time: char.play_time || 0
                };
            });
            return;
        }

        try {
            const { fetchLeaderboard } = await import('../network/GameSync.js');
            const data = await fetchLeaderboard('level');

            if (!data || data.length === 0) {
                console.warn('[Admin] No players found from leaderboard');
                this.users = [];
                return;
            }

            this.users = data.map(d => ({
                id: d.id || d.user_id || 'unknown_' + Math.random().toString(36).substring(7),
                username: d.profiles?.username || d.name || 'Unknown',
                level: d.level || 1,
                gold: d.gold || 0,
                total_kills: d.total_kills || 0,
                play_time: d.play_time || 0
            }));
        } catch (e) {
            console.error('[Admin] Load users exception:', e);
            this.users = [];
        }
    }

    async loadItems() {
        try {
            const { ITEMS } = await import('../engine/GameData.js');

            this.items = Object.entries(ITEMS).map(([name, data]) => ({
                name: name,
                emoji: data.emoji || '📦',
                type: data.type || 'material',
                rarity: data.rarity || 'common',
                price: data.price || 0,
                desc: data.desc || 'No description',
                healHp: data.healHp || 0,
                restoreSp: data.restoreSp || 0,
                atkBonus: data.atkBonus || 0,
                defBonus: data.defBonus || 0,
                hpBonus: data.hpBonus || 0
            }));
        } catch (e) {
            console.error('[Admin] Load items exception:', e);
            this.items = [];
        }
    }

    async updatePlayer(charId, updates) {
        if (isOfflineMode || charId.startsWith('guest_') || charId.startsWith('local_')) {
            const char = localDb.get(`char_${charId}`);
            if (char) {
                localDb.set(`char_${charId}`, { ...char, ...updates });
                this.refreshData();
            }
            return;
        }

        try {
            // Use RPC function (SECURITY DEFINER) to bypass RLS
            const { data, error } = await supabase.rpc('admin_update_character', {
                target_char_id: charId,
                updates: updates
            });

            if (error) {
                console.error('[Admin] RPC error:', error);
                alert('❌ Error updating player: ' + error.message);
            } else if (data && data.success === false) {
                alert('❌ ' + (data.error || 'Update failed'));
            } else if (data && data.success === true) {
                alert('✅ Player updated successfully');
                this.refreshData();
            } else {
                alert('❌ Unexpected response from server');
            }
        } catch (e) {
            alert('❌ Exception updating player: ' + e.message);
        }
    }

    async giveItem(charId, itemName, qty) {
        if (isOfflineMode) {
            const inv = localDb.get(`inventory_${charId}`) || [];
            const existing = inv.find(i => i.item_name === itemName);
            if (existing) {
                existing.quantity += qty;
            } else {
                inv.push({
                    id: 'inv_' + Math.random().toString(36).substring(2, 10),
                    character_id: charId,
                    item_name: itemName,
                    item_type: 'material',
                    quantity: qty,
                    stats: {}
                });
            }
            localDb.set(`inventory_${charId}`, inv);
            alert(`✅ Gave ${qty}x ${itemName} to player`);
            this.refreshData();
            return;
        }

        try {
            await saveInventoryItem(charId, itemName, 'material', qty);
            alert(`✅ Gave ${qty}x ${itemName} to player`);
            this.refreshData();
        } catch (e) {
            alert('Error giving item: ' + e.message);
        }
    }

    async resetPlayer(charId) {
        if (!confirm('Are you sure you want to reset this player? This action cannot be undone.')) {
            return;
        }

        const resetData = {
            level: 1,
            exp: 0,
            hp: 100,
            max_hp: 100,
            sp: 50,
            max_sp: 50,
            atk: 10,
            def: 5,
            gold: 0,
            total_kills: 0,
            play_time: 0
        };

        await this.updatePlayer(charId, resetData);
        alert('✅ Player reset to level 1');
    }

    async deletePlayer(charId) {
        if (!confirm('Are you sure you want to DELETE this player? This action cannot be undone.')) {
            return;
        }

        if (isOfflineMode || charId.startsWith('guest_') || charId.startsWith('local_')) {
            // Find and delete from local storage
            const users = localDb.get('users') || {};
            for (const username in users) {
                if (users[username].userId === charId) {
                    delete users[username];
                    localDb.set('users', users);
                    break;
                }
            }
            localDb.set(`char_${charId}`, null);
            localDb.set(`inventory_${charId}`, null);
            alert('✅ Player deleted');
            this.refreshData();
            return;
        }

        try {
            console.log('[Admin] Starting RPC delete for character:', charId);

            // Use RPC function (SECURITY DEFINER) to bypass RLS
            // The function handles deleting market_history, marketplace, inventory, and characters
            const { data, error } = await supabase.rpc('admin_delete_character', {
                target_char_id: charId
            });

            if (error) {
                console.error('[Admin] RPC error:', error);
                alert('❌ Error: ' + error.message + '\n\nถ้ายังไม่ได้รัน SQL ใน Supabase Dashboard กรุณารัน SQL สร้าง function ก่อน');
            } else if (data && data.success === false) {
                console.error('[Admin] Delete failed:', data.error);
                alert('❌ ' + (data.error || 'Delete failed'));
            } else if (data && data.success === true) {
                console.log('[Admin] Player deleted successfully:', data.deleted);
                this.users = this.users.filter(u => u.id !== charId);
                this._renderContent();
                alert('✅ Player deleted successfully');
            } else {
                alert('❌ Unexpected response from server');
            }
        } catch (e) {
            console.error('[Admin] Exception during delete:', e);
            alert('❌ Exception: ' + e.message);
        }
    }

    _createUI() {
        this.container = document.createElement('div');
        this.container.id = 'admin-panel';
        this.container.className = 'admin-panel';
        this.container.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 900px; max-height: 700px; background: rgba(20, 20, 30, 0.98);
            border: 2px solid #ffd700; border-radius: 10px; color: white;
            display: none; flex-direction: column; z-index: 10000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.className = 'admin-header';
        header.style.cssText = 'padding: 15px; background: linear-gradient(90deg, #333 0%, #444 100%); border-bottom: 2px solid #ffd700; display: flex; justify-content: space-between; align-items: center;';

        const titleContainer = document.createElement('div');
        titleContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
        titleContainer.innerHTML = '<h2 style="margin:0; color: #ffd700; font-size: 20px;">🛡️ Admin Dashboard</h2>';

        const statusText = document.createElement('span');
        statusText.id = 'admin-status-text';
        statusText.style.cssText = 'font-size: 12px; color: #bbb;';
        titleContainer.appendChild(statusText);

        header.appendChild(titleContainer);

        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.style.cssText = 'background: none; border: none; color: #ffd700; font-size: 24px; cursor: pointer; font-weight: bold;';
        closeBtn.onclick = () => this.toggle();
        header.appendChild(closeBtn);

        const tabs = document.createElement('div');
        tabs.className = 'admin-tabs';
        tabs.style.cssText = 'display: flex; background: #222; padding: 5px 10px; border-bottom: 1px solid #444;';

        const userTab = this._createTabBtn('👥 Players', 'users');
        const itemTab = this._createTabBtn('📦 Items', 'items');
        const announcementTab = this._createTabBtn('📢 Announcements', 'announcements');
        tabs.appendChild(userTab);
        tabs.appendChild(itemTab);
        tabs.appendChild(announcementTab);

        this.content = document.createElement('div');
        this.content.className = 'admin-content';
        this.content.style.cssText = 'flex: 1; overflow-y: auto; padding: 20px; background: rgba(10, 10, 20, 0.5);';

        this.container.appendChild(header);
        this.container.appendChild(tabs);
        this.container.appendChild(this.content);
        document.body.appendChild(this.container);

        this._updateStatusText();
    }

    _updateStatusText() {
        const statusEl = document.getElementById('admin-status-text');
        if (statusEl) {
            const adminType = this.isDbAdmin ? '<span style="color:#4aef4a;font-weight:bold;">Database Admin</span>' : '<span style="color:#e06060;font-weight:bold;">Local Override (Offline/Non-DB Admin)</span>';
            statusEl.innerHTML = `Logged in as: <strong style="color: #ffd700;">${this.currentUsername}</strong> (${adminType})`;
        }
    }

    _createTabBtn(text, tabId) {
        const btn = document.createElement('button');
        btn.className = 'admin-tab';
        btn.innerText = text;
        btn.style.cssText = 'padding: 10px 20px; background: none; border: none; color: #aaa; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.3s;';
        if (this.currentTab === tabId) {
            btn.style.color = '#ffd700';
            btn.style.borderBottomColor = '#ffd700';
        }
        btn.onmouseover = () => btn.style.color = '#ffed4e';
        btn.onmouseout = () => {
            if (this.currentTab !== tabId) btn.style.color = '#aaa';
        };
        btn.onclick = () => {
            this.currentTab = tabId;
            this._updateTabs();
            this.refreshData();
        };
        return btn;
    }

    _updateTabs() {
        const btns = this.container.querySelectorAll('button');
        btns.forEach(b => {
            if (b.innerText.includes('Players') || b.innerText.includes('Items') || b.innerText.includes('Announcements')) {
                const isActive = (b.innerText.includes('Players') && this.currentTab === 'users') ||
                    (b.innerText.includes('Items') && this.currentTab === 'items') ||
                    (b.innerText.includes('Announcements') && this.currentTab === 'announcements');
                b.style.color = isActive ? '#ffd700' : '#aaa';
                b.style.borderBottomColor = isActive ? '#ffd700' : 'transparent';
            }
        });
    }

    _renderContent() {
        this.content.innerHTML = '';
        if (this.currentTab === 'users') {
            this._renderUserList();
        } else if (this.currentTab === 'items') {
            this._renderItemList();
        } else if (this.currentTab === 'announcements') {
            this._renderAnnouncementPanel();
        }
    }

    async _renderAnnouncementPanel() {
        const { adminAnnouncementPanel } = await import('../ui/AdminAnnouncementPanel.js');
        this.content.innerHTML = '';
        adminAnnouncementPanel.init(this.content);
        adminAnnouncementPanel.show();
    }

    _renderUserList() {
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;';
        table.innerHTML = `
            <thead>
                <tr style="border-bottom: 2px solid #ffd700; color: #ffd700; background: rgba(255, 215, 0, 0.1);">
                    <th style="padding: 12px;">Player Name</th>
                    <th style="padding: 12px;">Level</th>
                    <th style="padding: 12px;">Gold</th>
                    <th style="padding: 12px;">Kills</th>
                    <th style="padding: 12px;">Play Time</th>
                    <th style="padding: 12px;">Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        this.users.forEach((user, idx) => {
            const tr = document.createElement('tr');
            tr.style.cssText = `border-bottom: 1px solid #333; background: ${idx % 2 === 0 ? 'rgba(255, 215, 0, 0.02)' : 'transparent'}; transition: background 0.2s;`;
            tr.onmouseover = () => tr.style.background = 'rgba(255, 215, 0, 0.1)';
            tr.onmouseout = () => tr.style.background = idx % 2 === 0 ? 'rgba(255, 215, 0, 0.02)' : 'transparent';

            const playTimeHours = Math.floor((user.play_time || 0) / 3600);
            const playTimeMins = Math.floor(((user.play_time || 0) % 3600) / 60);
            const playTimeStr = playTimeHours > 0 ? `${playTimeHours}h ${playTimeMins}m` : `${playTimeMins}m`;

            tr.innerHTML = `
                <td style="padding: 12px; font-weight: 500;">${user.username}</td>
                <td style="padding: 12px;">Lv.${user.level}</td>
                <td style="padding: 12px;">${(user.gold || 0).toLocaleString()}</td>
                <td style="padding: 12px;">${(user.total_kills || 0).toLocaleString()}</td>
                <td style="padding: 12px;">${playTimeStr}</td>
                <td style="padding: 12px;">
                    <button class="edit-btn" style="background: #4a7c9e; border: 1px solid #6a9cbe; color: white; padding: 6px 10px; cursor: pointer; border-radius: 3px; margin-right: 5px; font-size: 11px;">Edit</button>
                    <button class="give-btn" style="background: #2a8a4a; border: 1px solid #3aaa5a; color: white; padding: 6px 10px; cursor: pointer; border-radius: 3px; margin-right: 5px; font-size: 11px;">Give</button>
                    <button class="reset-btn" style="background: #8a5a2a; border: 1px solid #aa7a3a; color: white; padding: 6px 10px; cursor: pointer; border-radius: 3px; margin-right: 5px; font-size: 11px;">Reset</button>
                    <button class="delete-btn" style="background: #8a2a2a; border: 1px solid #aa3a3a; color: white; padding: 6px 10px; cursor: pointer; border-radius: 3px; font-size: 11px;">Delete</button>
                </td>
            `;

            tr.querySelector('.edit-btn').onclick = () => {
                this.openEditModal(user);
            };

            tr.querySelector('.give-btn').onclick = () => {
                const itemName = prompt(`Item name to give to ${user.username}:`, 'Sword');
                if (itemName) {
                    const qty = prompt(`Quantity:`, '1');
                    if (qty) this.giveItem(user.id, itemName, parseInt(qty));
                }
            };

            tr.querySelector('.reset-btn').onclick = () => {
                this.resetPlayer(user.id);
            };

            tr.querySelector('.delete-btn').onclick = () => {
                this.deletePlayer(user.id);
            };

            tbody.appendChild(tr);
        });

        this.content.appendChild(table);

        if (this.users.length === 0) {
            this.content.innerHTML = '<div style="text-align:center; padding: 50px; color: #888;">No players found</div>';
        }
    }

    _renderItemList() {
        const searchDiv = document.createElement('div');
        searchDiv.style.cssText = 'margin-bottom: 15px; display: flex; gap: 10px;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search items by name...';
        searchInput.style.cssText = 'flex: 1; padding: 8px 12px; background: rgba(255, 215, 0, 0.1); border: 1px solid #ffd700; color: white; border-radius: 4px;';

        const rarityFilter = document.createElement('select');
        rarityFilter.style.cssText = 'padding: 8px 12px; background: rgba(255, 215, 0, 0.1); border: 1px solid #ffd700; color: white; border-radius: 4px;';
        rarityFilter.innerHTML = '<option value="">All Rarities</option><option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option><option value="mythic">Mythic</option>';

        searchDiv.appendChild(searchInput);
        searchDiv.appendChild(rarityFilter);
        this.content.appendChild(searchDiv);

        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;';
        table.innerHTML = `
            <thead>
                <tr style="border-bottom: 2px solid #ffd700; color: #ffd700; background: rgba(255, 215, 0, 0.1);">
                    <th style="padding: 10px; width: 5%;">Icon</th>
                    <th style="padding: 10px; width: 20%;">Name</th>
                    <th style="padding: 10px; width: 12%;">Type</th>
                    <th style="padding: 10px; width: 12%;">Rarity</th>
                    <th style="padding: 10px; width: 10%;">Price</th>
                    <th style="padding: 10px; width: 41%;">Description</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');

        const renderItems = () => {
            tbody.innerHTML = '';
            const searchTerm = searchInput.value.toLowerCase();
            const rarityTerm = rarityFilter.value;

            const filtered = this.items.filter(item => {
                const matchSearch = item.name.toLowerCase().includes(searchTerm);
                const matchRarity = !rarityTerm || item.rarity === rarityTerm;
                return matchSearch && matchRarity;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color: #888;">No items found</td></tr>';
                return;
            }

            filtered.forEach((item, idx) => {
                const tr = document.createElement('tr');
                tr.style.cssText = `border-bottom: 1px solid #333; background: ${idx % 2 === 0 ? 'rgba(255, 215, 0, 0.02)' : 'transparent'}; transition: background 0.2s;`;
                tr.onmouseover = () => tr.style.background = 'rgba(255, 215, 0, 0.1)';
                tr.onmouseout = () => tr.style.background = idx % 2 === 0 ? 'rgba(255, 215, 0, 0.02)' : 'transparent';

                const rarityColor = {
                    'common': '#aaa',
                    'rare': '#4a9eff',
                    'epic': '#a335ee',
                    'legendary': '#ff8000',
                    'mythic': '#e6cc80'
                }[item.rarity] || '#aaa';

                tr.innerHTML = `
                    <td style="padding: 10px; font-size: 16px;">${item.emoji}</td>
                    <td style="padding: 10px; font-weight: 500;">${item.name}</td>
                    <td style="padding: 10px;">${item.type}</td>
                    <td style="padding: 10px; color: ${rarityColor}; font-weight: bold;">${item.rarity}</td>
                    <td style="padding: 10px;">${item.price}</td>
                    <td style="padding: 10px; font-size: 11px; color: #bbb;">${item.desc.substring(0, 50)}...</td>
                `;
                tbody.appendChild(tr);
            });
        };

        searchInput.addEventListener('input', renderItems);
        rarityFilter.addEventListener('change', renderItems);

        this.content.appendChild(table);
        renderItems();
    }

    openEditModal(user) {
        this.selectedUser = user;
        this._createEditModal();
    }

    _createEditModal() {
        if (!this.selectedUser) return;

        // Remove existing modal if any
        const existingModal = document.getElementById('admin-edit-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'admin-edit-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center;
            z-index: 10001; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: rgba(20, 20, 30, 0.98); border: 2px solid #ffd700; border-radius: 10px;
            padding: 30px; width: 90%; max-width: 500px; color: white;
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
        `;

        const title = document.createElement('h2');
        title.innerText = `Edit Player: ${this.selectedUser.username}`;
        title.style.cssText = 'margin: 0 0 20px 0; color: #ffd700; font-size: 18px;';
        content.appendChild(title);

        const fields = [
            { label: 'Level', key: 'level', type: 'number', min: 1, max: 999 },
            { label: 'Gold', key: 'gold', type: 'number', min: 0 },
            { label: 'Total Kills', key: 'total_kills', type: 'number', min: 0 },
            { label: 'Play Time (seconds)', key: 'play_time', type: 'number', min: 0 }
        ];

        const formData = {};
        fields.forEach(field => {
            const group = document.createElement('div');
            group.style.cssText = 'margin-bottom: 15px;';

            const label = document.createElement('label');
            label.innerText = field.label + ':';
            label.style.cssText = 'display: block; margin-bottom: 5px; color: #ffd700; font-weight: bold;';
            group.appendChild(label);

            const input = document.createElement('input');
            input.type = field.type;
            input.value = this.selectedUser[field.key] || 0;
            if (field.min !== undefined) input.min = field.min;
            if (field.max !== undefined) input.max = field.max;
            input.style.cssText = `
                width: 100%; padding: 10px; background: rgba(255, 215, 0, 0.1);
                border: 1px solid #ffd700; color: white; border-radius: 4px;
                box-sizing: border-box; font-size: 14px;
            `;
            input.addEventListener('change', (e) => {
                formData[field.key] = field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
            });
            group.appendChild(input);
            content.appendChild(group);

            // Initialize formData
            formData[field.key] = this.selectedUser[field.key] || 0;
        });

        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 25px;';

        const saveBtn = document.createElement('button');
        saveBtn.innerText = 'Save Changes';
        saveBtn.style.cssText = `
            flex: 1; padding: 12px; background: #2a8a4a; border: 1px solid #3aaa5a;
            color: white; border-radius: 4px; cursor: pointer; font-weight: bold;
            transition: background 0.2s;
        `;
        saveBtn.onmouseover = () => saveBtn.style.background = '#3aaa5a';
        saveBtn.onmouseout = () => saveBtn.style.background = '#2a8a4a';
        saveBtn.onclick = async () => {
            await this.updatePlayer(this.selectedUser.id, formData);
            modal.remove();
            await this.refreshData();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.style.cssText = `
            flex: 1; padding: 12px; background: #8a5a2a; border: 1px solid #aa7a3a;
            color: white; border-radius: 4px; cursor: pointer; font-weight: bold;
            transition: background 0.2s;
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.background = '#aa7a3a';
        cancelBtn.onmouseout = () => cancelBtn.style.background = '#8a5a2a';
        cancelBtn.onclick = () => modal.remove();

        buttonGroup.appendChild(saveBtn);
        buttonGroup.appendChild(cancelBtn);
        content.appendChild(buttonGroup);

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close modal when clicking outside
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }
}
