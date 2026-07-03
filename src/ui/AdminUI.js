import { supabase, isOfflineMode, localDb } from '../network/SupabaseClient.js';

export class AdminUI {
    constructor() {
        this.container = null;
        this.isOpen = false;
        this.users = [];
        this.items = [];
        this.isAdmin = false;
        this.currentTab = 'users';
        
        this._createUI();
    }

    async checkAdmin(userId) {
        if (isOfflineMode || userId.startsWith('guest_') || userId.startsWith('local_')) {
            // For offline/guest, check if we manually set admin in localStorage
            this.isAdmin = localStorage.getItem('zolos_admin_mode') === 'true';
            return this.isAdmin;
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', userId)
                .single();
            
            if (error) {
                console.warn('[Admin] Failed to check admin status:', error.message);
                this.isAdmin = false;
            } else {
                this.isAdmin = data?.is_admin || false;
            }
        } catch (e) {
            this.isAdmin = false;
        }

        if (this.isAdmin) {
            const btn = document.getElementById('btn-admin');
            if (btn) btn.style.display = 'flex';
        }
        
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
    }

    async refreshData() {
        if (this.currentTab === 'users') {
            await this.loadUsers();
        } else {
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
                    total_kills: char.total_kills || 0
                };
            });
            return;
        }

        const { data, error } = await supabase
            .from('characters')
            .select('id, name, level, gold, total_kills, user_id, profiles(username)');
        
        if (error) {
            console.error('[Admin] Load users error:', error);
            return;
        }
        this.users = data.map(d => ({
            id: d.id,
            username: d.profiles?.username || d.name,
            level: d.level,
            gold: d.gold,
            total_kills: d.total_kills
        }));
    }

    async loadItems() {
        // We'll use GameData.js items mostly, but this could list items from inventory
        // For now, let's just use it as a placeholder for global item management
    }

    async updatePlayer(charId, updates) {
        if (isOfflineMode) {
            const char = localDb.get(`char_${charId}`);
            if (char) {
                localDb.set(`char_${charId}`, { ...char, ...updates });
                this.refreshData();
            }
            return;
        }

        const { error } = await supabase
            .from('characters')
            .update(updates)
            .eq('id', charId);
        
        if (error) alert('Error updating player: ' + error.message);
        else this.refreshData();
    }

    async giveItem(charId, itemName, qty) {
        // Implementation for giving item
        // This will call saveInventoryItem from GameSync or similar logic
        alert(`Gave ${qty}x ${itemName} to player ${charId}`);
    }

    _createUI() {
        this.container = document.createElement('div');
        this.container.id = 'admin-panel';
        this.container.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 800px; height: 600px; background: rgba(20, 20, 30, 0.95);
            border: 2px solid #555; border-radius: 10px; color: white;
            display: none; flex-direction: column; z-index: 10000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 0 20px rgba(0,0,0,0.8);
        `;

        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; background: #333; border-bottom: 1px solid #555; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = '<h2 style="margin:0; color: #ffcc00;">🛡️ Admin Dashboard</h2>';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.style.cssText = 'background: none; border: none; color: white; font-size: 20px; cursor: pointer;';
        closeBtn.onclick = () => this.toggle();
        header.appendChild(closeBtn);

        const tabs = document.createElement('div');
        tabs.style.cssText = 'display: flex; background: #222; padding: 5px 10px;';
        
        const userTab = this._createTabBtn('Players', 'users');
        const itemTab = this._createTabBtn('Global Config', 'items');
        tabs.appendChild(userTab);
        tabs.appendChild(itemTab);

        this.content = document.createElement('div');
        this.content.style.cssText = 'flex: 1; overflow-y: auto; padding: 20px;';

        this.container.appendChild(header);
        this.container.appendChild(tabs);
        this.container.appendChild(this.content);
        document.body.appendChild(this.container);
    }

    _createTabBtn(text, tabId) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = 'padding: 10px 20px; background: none; border: none; color: #aaa; cursor: pointer; border-bottom: 2px solid transparent;';
        if (this.currentTab === tabId) {
            btn.style.color = '#ffcc00';
            btn.style.borderBottomColor = '#ffcc00';
        }
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
            if (b.innerText === 'Players' || b.innerText === 'Global Config') {
                const isActive = (b.innerText === 'Players' && this.currentTab === 'users') || 
                               (b.innerText === 'Global Config' && this.currentTab === 'items');
                b.style.color = isActive ? '#ffcc00' : '#aaa';
                b.style.borderBottomColor = isActive ? '#ffcc00' : 'transparent';
            }
        });
    }

    _renderContent() {
        this.content.innerHTML = '';
        if (this.currentTab === 'users') {
            this._renderUserList();
        } else {
            this.content.innerHTML = '<div style="text-align:center; padding: 50px; color: #888;">Global configuration coming soon...</div>';
        }
    }

    _renderUserList() {
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; text-align: left;';
        table.innerHTML = `
            <thead>
                <tr style="border-bottom: 1px solid #555; color: #888;">
                    <th style="padding: 10px;">Player</th>
                    <th style="padding: 10px;">Level</th>
                    <th style="padding: 10px;">Gold</th>
                    <th style="padding: 10px;">Kills</th>
                    <th style="padding: 10px;">Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        this.users.forEach(user => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #333';
            tr.innerHTML = `
                <td style="padding: 10px;">${user.username}</td>
                <td style="padding: 10px;">${user.level}</td>
                <td style="padding: 10px;">${user.gold.toLocaleString()}</td>
                <td style="padding: 10px;">${user.total_kills}</td>
                <td style="padding: 10px;">
                    <button class="edit-btn" style="background: #444; border: 1px solid #666; color: white; padding: 5px 10px; cursor: pointer; border-radius: 3px;">Edit</button>
                    <button class="give-btn" style="background: #2a4; border: 1px solid #3b5; color: white; padding: 5px 10px; cursor: pointer; border-radius: 3px; margin-left: 5px;">Give</button>
                </td>
            `;
            
            tr.querySelector('.edit-btn').onclick = () => {
                const newLevel = prompt(`Set new Level for ${user.username}:`, user.level);
                if (newLevel !== null) this.updatePlayer(user.id, { level: parseInt(newLevel) });
            };

            tr.querySelector('.give-btn').onclick = () => {
                const itemName = prompt(`Item name to give to ${user.username}:`, 'Sword');
                const qty = prompt(`Quantity:`, '1');
                if (itemName && qty) this.giveItem(user.id, itemName, parseInt(qty));
            };

            tbody.appendChild(tr);
        });

        this.content.appendChild(table);
    }
}
