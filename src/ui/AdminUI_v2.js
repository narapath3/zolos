import { supabase, isOfflineMode, localDb } from '../network/SupabaseClient.js';
import { saveInventoryItem, saveCharacter } from '../network/GameSync.js';

// Diagnostic function to identify delete issues
async function runDeleteDiagnostic(supabase, charId) {
    console.log('\n========== DELETE DIAGNOSTIC START ==========');
    console.log('Character ID:', charId);
    
    try {
        // Test 1: Check if we can read the character
        console.log('\n[Test 1] Checking if character exists...');
        const { data: charData, error: readError } = await supabase
            .from('characters')
            .select('id, name')
            .eq('id', charId)
            .single();
        
        if (readError) {
            console.error('❌ Cannot read character:', readError);
            return { success: false, reason: 'Cannot read character', error: readError };
        }
        console.log('✅ Character exists:', charData);
        
        // Test 2: Try to delete with verbose error
        console.log('\n[Test 2] Attempting to delete character...');
        const { error: deleteError, data: deleteData, status } = await supabase
            .from('characters')
            .delete()
            .eq('id', charId)
            .select();
        
        console.log('Delete response:', { status, deleteError, deleteData });
        
        if (deleteError) {
            console.error('❌ Delete failed with error:');
            console.error('  Code:', deleteError.code);
            console.error('  Message:', deleteError.message);
            console.error('  Details:', deleteError.details);
            console.error('  Hint:', deleteError.hint);
            
            if (deleteError.code === '42501') {
                return { 
                    success: false, 
                    reason: 'RLS Policy Violation', 
                    error: deleteError,
                    suggestion: 'Check Supabase RLS policies - anon user may not have DELETE permission'
                };
            }
            return { success: false, reason: 'Delete error', error: deleteError };
        }
        
        // Test 3: Verify deletion
        console.log('\n[Test 3] Verifying character was deleted...');
        const { data: verifyData, error: verifyError } = await supabase
            .from('characters')
            .select('id')
            .eq('id', charId);
        
        if (verifyError) {
            console.error('❌ Verification query failed:', verifyError);
            return { success: false, reason: 'Verification failed', error: verifyError };
        }
        
        if (verifyData && verifyData.length === 0) {
            console.log('✅ Character successfully deleted!');
            return { success: true, reason: 'Character deleted successfully' };
        } else {
            console.warn('⚠️ Character still exists after delete:', verifyData);
            return { success: false, reason: 'Character still exists after delete', data: verifyData };
        }
        
    } catch (err) {
        console.error('❌ Exception during diagnostic:', err);
        return { success: false, reason: 'Exception', error: err };
    } finally {
        console.log('========== DELETE DIAGNOSTIC END ==========\n');
    }
}

export class AdminUI {
    constructor() {
        this.container = null;
        this.isOpen = false;
        this.users = [];
        this.items = [];
        this.isAdmin = false;
        this.currentTab = 'users';
        this.selectedUser = null;
        
        this._createUI();
    }

    async checkAdmin(userId) {
        if (isOfflineMode || userId.startsWith('guest_') || userId.startsWith('local_')) {
            this.isAdmin = localStorage.getItem('zolos_admin_mode') === 'true';
            return this.isAdmin;
        }
        // For real users, check if they have admin role
        if (!supabase) return false;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();
            this.isAdmin = profile?.role === 'admin';
            return this.isAdmin;
        } catch (e) {
            console.warn('[Admin] Could not verify admin status:', e);
            return false;
        }
    }

    async toggle() {
        if (!this.isOpen) {
            await this.loadUsers();
        }
        this.isOpen = !this.isOpen;
        this.container.style.display = this.isOpen ? 'flex' : 'none';
    }

    async loadUsers() {
        try {
            if (isOfflineMode || !supabase) {
                this.users = [];
                return;
            }
            const { data, error } = await supabase
                .from('characters')
                .select('id, name, level, gold, total_kills, play_time, created_at');
            if (error) throw error;
            this.users = data || [];
        } catch (e) {
            console.error('[Admin] Error loading users:', e);
            this.users = [];
        }
    }

    async loadItems() {
        try {
            if (isOfflineMode || !supabase) {
                this.items = [];
                return;
            }
            const { data, error } = await supabase
                .from('items')
                .select('*');
            if (error) throw error;
            this.items = data || [];
        } catch (e) {
            console.error('[Admin] Error loading items:', e);
            this.items = [];
        }
    }

    async deletePlayer(charId, charName) {
        if (!confirm(`Are you sure you want to delete ${charName}? This cannot be undone.`)) {
            return;
        }

        if (!supabase) {
            alert('Supabase not available');
            return;
        }

        try {
            console.log('[Admin] Starting delete process for character:', charId);
            
            // Run diagnostic first to identify issues
            const diagnostic = await runDeleteDiagnostic(supabase, charId);
            
            if (!diagnostic.success) {
                console.error('[Admin] Diagnostic failed:', diagnostic);
                if (diagnostic.suggestion) {
                    alert('❌ ' + diagnostic.reason + '\n\n' + diagnostic.suggestion);
                } else {
                    alert('❌ ' + diagnostic.reason + '\n\nError: ' + (diagnostic.error?.message || 'Unknown error'));
                }
                return;
            }
            
            console.log('[Admin] Diagnostic passed, deletion successful');
            alert('✅ Player deleted successfully');
            
            // Refresh the list
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.loadUsers();
            this._renderContent();
            
        } catch (e) {
            console.error('[Admin] Exception during delete:', e);
            alert('Exception deleting player: ' + e.message);
        }
    }

    _createUI() {
        this.container = document.createElement('div');
        this.container.id = 'admin-panel';
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
        header.style.cssText = 'padding: 15px; background: linear-gradient(90deg, #333 0%, #444 100%); border-bottom: 2px solid #ffd700; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = '<h2 style="margin:0; color: #ffd700; font-size: 20px;">🛡️ Admin Dashboard</h2>';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.style.cssText = 'background: none; border: none; color: #ffd700; font-size: 24px; cursor: pointer; font-weight: bold;';
        closeBtn.onclick = () => this.toggle();
        header.appendChild(closeBtn);
        this.container.appendChild(header);

        const tabs = document.createElement('div');
        tabs.style.cssText = 'display: flex; border-bottom: 2px solid #ffd700; background: #222;';
        
        const userTab = document.createElement('button');
        userTab.innerText = '👥 Players';
        userTab.style.cssText = 'flex: 1; padding: 10px; background: none; border: none; color: #ffd700; cursor: pointer; font-size: 14px; border-bottom: 3px solid #ffd700;';
        userTab.onclick = () => {
            this.currentTab = 'users';
            this._renderContent();
        };
        tabs.appendChild(userTab);

        const itemTab = document.createElement('button');
        itemTab.innerText = '📦 Items';
        itemTab.style.cssText = 'flex: 1; padding: 10px; background: none; border: none; color: #888; cursor: pointer; font-size: 14px;';
        itemTab.onclick = () => {
            this.currentTab = 'items';
            this._renderContent();
        };
        tabs.appendChild(itemTab);
        this.container.appendChild(tabs);

        const content = document.createElement('div');
        content.id = 'admin-content';
        content.style.cssText = 'flex: 1; overflow-y: auto; padding: 15px;';
        this.container.appendChild(content);

        document.body.appendChild(this.container);
    }

    _renderContent() {
        const content = document.getElementById('admin-content');
        if (!content) return;

        if (this.currentTab === 'users') {
            this._renderUserList(content);
        } else {
            this._renderItemList(content);
        }
    }

    _renderUserList(container) {
        let html = '<table style="width:100%; border-collapse: collapse; color: #fff;">';
        html += '<thead><tr style="background: #333; border-bottom: 2px solid #ffd700;">';
        html += '<th style="padding: 8px; text-align: left;">Player Name</th>';
        html += '<th style="padding: 8px; text-align: center;">Level</th>';
        html += '<th style="padding: 8px; text-align: center;">Gold</th>';
        html += '<th style="padding: 8px; text-align: center;">Kills</th>';
        html += '<th style="padding: 8px; text-align: center;">Play Time</th>';
        html += '<th style="padding: 8px; text-align: center;">Actions</th>';
        html += '</tr></thead><tbody>';

        this.users.forEach(user => {
            const playTime = this._formatPlayTime(user.play_time || 0);
            html += `<tr style="border-bottom: 1px solid #444; hover: background: #333;">`;
            html += `<td style="padding: 8px;">${user.name}</td>`;
            html += `<td style="padding: 8px; text-align: center;">Lv.${user.level}</td>`;
            html += `<td style="padding: 8px; text-align: center;">${(user.gold || 0).toLocaleString()}</td>`;
            html += `<td style="padding: 8px; text-align: center;">${user.total_kills || 0}</td>`;
            html += `<td style="padding: 8px; text-align: center;">${playTime}</td>`;
            html += `<td style="padding: 8px; text-align: center;">`;
            html += `<button onclick="window.adminUI.deletePlayer('${user.id}', '${user.name}')" style="background: #d32f2f; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin: 2px;">Delete</button>`;
            html += `</td></tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    _renderItemList(container) {
        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">';
        
        this.items.forEach(item => {
            html += `<div style="background: #333; padding: 10px; border-radius: 5px; border: 1px solid #555;">`;
            html += `<h4 style="margin: 0 0 5px 0; color: #ffd700;">${item.name}</h4>`;
            html += `<p style="margin: 3px 0; font-size: 12px; color: #aaa;">Type: ${item.type}</p>`;
            html += `<p style="margin: 3px 0; font-size: 12px; color: #aaa;">Price: ${item.price}</p>`;
            html += `</div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    _formatPlayTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
}
