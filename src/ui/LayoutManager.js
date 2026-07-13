export class LayoutManager {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.isEditing = false;
    this.elements = [
      { id: 'hud-top-left', name: 'Player Info' },
      { id: 'hud-bottom', name: 'Bottom Menu' },
      { id: 'skill-bar', name: 'Skill Bar' },
      { id: 'auto-farm-container', name: 'Auto/Fish' },
      { id: 'kill-counter', name: 'Kill Counter' },
      { id: 'minimap-container', name: 'Minimap' },
      { id: 'combat-log', name: 'Combat Log' },
      { id: 'joystick-container', name: 'Joystick' },
      { id: 'mobile-actions', name: 'Action Buttons' }
    ];
    this.savedLayout = this._loadLayout();
    this._applyLayout();
  }

  toggleEditMode() {
    this.isEditing = !this.isEditing;
    if (this.isEditing) {
      this._enableDragging();
      this.gameUI.addCombatLog('🛠️ Layout Edit Mode: ON (Drag elements to move)', 'system');
    } else {
      this._disableDragging();
      this._saveLayout();
      this.gameUI.addCombatLog('✅ Layout saved successfully!', 'system');
    }
    return this.isEditing;
  }

  resetLayout() {
    this.savedLayout = {};
    localStorage.removeItem('zolos_ui_layout');
    window.location.reload();
  }

  _enableDragging() {
    this.elements.forEach(elInfo => {
      const el = document.getElementById(elInfo.id);
      if (!el) return;

      el.style.pointerEvents = 'auto';
      el.style.cursor = 'move';
      el.classList.add('layout-editing');
      
      // Add visual indicator
      let label = el.querySelector('.layout-label');
      if (!label) {
        label = document.createElement('div');
        label.className = 'layout-label';
        label.textContent = elInfo.name;
        label.style.cssText = 'position:absolute;top:-20px;left:0;background:var(--primary);color:#000;font-size:10px;padding:2px 5px;border-radius:3px;white-space:nowrap;z-index:10000;pointer-events:none;';
        el.appendChild(label);
      }
      label.style.display = 'block';

      el.onmousedown = (e) => this._onDragStart(e, el);
      el.ontouchstart = (e) => this._onDragStart(e, el, true);
    });
  }

  _disableDragging() {
    this.elements.forEach(elInfo => {
      const el = document.getElementById(elInfo.id);
      if (!el) return;

      el.style.cursor = '';
      el.classList.remove('layout-editing');
      const label = el.querySelector('.layout-label');
      if (label) label.style.display = 'none';

      el.onmousedown = null;
      el.ontouchstart = null;
    });
  }

  _onDragStart(e, el, isTouch = false) {
    if (!this.isEditing) return;
    e.preventDefault();
    
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const rect = el.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;

    const onMove = (moveEvent) => {
      const moveX = isTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = isTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      // Calculate new position as percentage to maintain responsiveness
      const xPct = (moveX - offsetX) / window.innerWidth * 100;
      const yPct = (moveY - offsetY) / window.innerHeight * 100;

      el.style.left = `${xPct}%`;
      el.style.top = `${yPct}%`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
      
      this.savedLayout[el.id] = { left: `${xPct}%`, top: `${yPct}%` };
    };

    const onEnd = () => {
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd);
    };

    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd);
  }

  _saveLayout() {
    localStorage.setItem('zolos_ui_layout', JSON.stringify(this.savedLayout));
    // Also sync to database if character is logged in
    if (this.gameUI.character && this.gameUI.character.gameSettings) {
      this.gameUI.character.gameSettings.ui_layout = this.savedLayout;
      this.gameUI.character.saveStatsToDatabase();
    }
  }

  _loadLayout() {
    const local = localStorage.getItem('zolos_ui_layout');
    if (local) return JSON.parse(local);
    
    if (this.gameUI.character && this.gameUI.character.gameSettings?.ui_layout) {
      return this.gameUI.character.gameSettings.ui_layout;
    }
    
    return {};
  }

  _applyLayout() {
    Object.keys(this.savedLayout).forEach(id => {
      const el = document.getElementById(id);
      const pos = this.savedLayout[id];
      if (el && pos) {
        el.style.left = pos.left;
        el.style.top = pos.top;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        el.style.position = 'fixed';
      }
    });
  }
}
