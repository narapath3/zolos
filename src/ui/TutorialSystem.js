// ============ ZOLOS TUTORIAL SYSTEM ============
// Guides new players through essential mechanics with interactive steps.
// Tutorial completion is persisted server-side (characters.tutorial_completed)
// so returning users never see the tutorial again, even across devices.

export class TutorialSystem {
  constructor(gameUI, character, sceneManager) {
    this.gameUI = gameUI;
    this.character = character;
    this.sceneManager = sceneManager;
    this.currentStep = 0;
    this.isActive = false;
    this.tutorialCompleted = false;  // Server-side flag from DB
    this.stepHandlers = {};
    this.stepOverlay = null;
    this.stepTooltip = null;
    this.stepBackdrop = null;
  }

  // Load tutorial state from the database (characters.tutorial_completed)
  async loadTutorialState(characterData) {
    try {
      // If charData already has tutorial_completed (loaded from DB), use it directly
      if (characterData && characterData.tutorial_completed !== undefined && characterData.tutorial_completed !== null) {
        this.tutorialCompleted = !!characterData.tutorial_completed;
      } else {
        this.tutorialCompleted = false;
      }
      return this.tutorialCompleted;
    } catch (e) {
      console.error('[Tutorial] Failed to load state:', e);
      this.tutorialCompleted = false;
      return this.tutorialCompleted;
    }
  }

  // Save tutorial completion to database
  async saveTutorialCompleted() {
    this.tutorialCompleted = true;

    try {
      // Import supabase client
      const { supabase, isOfflineMode } = await import('../network/SupabaseClient.js');

      if (isOfflineMode || !supabase) {
        // Fallback to localStorage for offline mode
        console.warn('[Tutorial] Offline mode: saving tutorial_completed to localStorage');
        try {
          const key = `zolos_tutorial_completed_${this.character?.userId || 'guest'}`;
          localStorage.setItem(key, 'true');
        } catch (e) { /* localStorage unavailable */ }
        return;
      }

      // Update the character row in Supabase
      const userId = this.character?.userId;
      const characterId = this.character?.characterId;

      if (userId && !userId.startsWith('guest_') && !userId.startsWith('local_')) {
        // Save by user_id
        const { error } = await supabase
          .from('characters')
          .update({ tutorial_completed: true, updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        if (error) {
          console.error('[Tutorial] Failed to save tutorial_completed by user_id:', error.message);
          // Fallback to localStorage
          try {
            const key = `zolos_tutorial_completed_${userId}`;
            localStorage.setItem(key, 'true');
          } catch (e) { /* localStorage unavailable */ }
        } else {
          console.log('[Tutorial] ✅ tutorial_completed saved to database for user:', userId);
        }
      } else if (characterId) {
        // Save by character_id (guest / local)
        const { error } = await supabase
          .from('characters')
          .update({ tutorial_completed: true, updated_at: new Date().toISOString() })
          .eq('id', characterId);

        if (error) {
          console.error('[Tutorial] Failed to save tutorial_completed by character_id:', error.message);
          try {
            const key = `zolos_tutorial_completed_${characterId}`;
            localStorage.setItem(key, 'true');
          } catch (e) { /* localStorage unavailable */ }
        } else {
          console.log('[Tutorial] ✅ tutorial_completed saved to database for character:', characterId);
        }
      } else {
        // Fallback to localStorage
        try {
          const key = `zolos_tutorial_completed_guest`;
          localStorage.setItem(key, 'true');
        } catch (e) { /* localStorage unavailable */ }
      }
    } catch (e) {
      console.error('[Tutorial] Failed to save tutorial_completed:', e);
      // Last resort fallback
      try {
        const key = `zolos_tutorial_completed_${this.character?.userId || 'guest'}`;
        localStorage.setItem(key, 'true');
      } catch (e2) { /* localStorage unavailable */ }
    }
  }

  // Check if tutorial should auto-start
  // Returns false if already completed on the server (returning user)
  shouldAutoStart() {
    return !this.tutorialCompleted;
  }

  // Initialize tutorial flow
  initTutorialFlow() {
    this.isActive = true;
    this.currentStep = 0;
    this._injectTutorialStyles();
    // Add panels-open class so mobile controls are hidden beneath the tutorial
    document.body.classList.add('panels-open');
    this._showStep(this.currentStep);
  }

  // Define all tutorial steps
  _getSteps() {
    return [
      {
        id: 'welcome',
        title: '⚔️ ยินดีต้อนรับสู่ ZOLOS',
        description: 'เกมไอเดิล RPG ออนไลน์ที่คุณสามารถเล่นได้ตลอดเวลา แม้ว่าจะออฟไลน์ก็ยังได้ EXP!',
        targetElement: null,
        action: 'click-next',
        reward: { gold: 100, items: [] },
      },
      {
        id: 'movement',
        title: '🚶 ขั้นตอนแรก: เดินเล่น',
        description: 'ใช้ WASD หรือ Arrow Keys เพื่อเดินสำรวจแมพ ลองเดินไปที่ต้นไม้หรือหินใกล้ๆ สิ',
        targetElement: null,
        action: 'walk-distance',
        distance: 15,
        reward: { gold: 200, items: [] },
      },
      {
        id: 'first-monster',
        title: '⚔️ ตีมอนสเตอร์ตัวแรก',
        description: 'คลิกที่ Poring (สัตว์เจลลี่สีเขียว) เพื่อเลือกเป้าหมาย แล้วกดปุ่ม "Auto Farm" หรือกดปุ่มสกิลเพื่อโจมตี',
        targetElement: null,
        action: 'defeat-monster',
        monsterName: 'Poring',
        count: 1,
        reward: { gold: 300, items: [{ name: 'Jellopy', qty: 3 }] },
      },
      {
        id: 'inventory',
        title: '🎒 ดูกระเป๋าของคุณ',
        description: 'กดปุ่ม "Inventory" (ไอคอนกระเป๋า) เพื่อดูไอเทมที่ได้รับจากการตีมอนสเตอร์',
        targetElement: 'btn-inventory',
        action: 'open-panel',
        panelId: 'inventory-panel',
        reward: { gold: 150, items: [] },
      },
      {
        id: 'equipment',
        title: '⚙️ ติดตั้งอาวุธ',
        description: 'ในกระเป๋า ให้ลากไอเทมอาวุธมาวางในช่อง Equipment เพื่อให้ตัวละครเก่งขึ้น',
        targetElement: null,
        action: 'equip-item',
        itemType: 'weapon',
        reward: { gold: 250, items: [{ name: 'Novice Cutter', qty: 1 }] },
      },
      {
        id: 'skills',
        title: '✨ ดูสกิลของคุณ',
        description: 'กดปุ่ม "Skills" (K) เพื่อดูสกิลที่คุณมี และเลือกสกิลที่ชอบให้เป็น Hotkey (1, 2, 3)',
        targetElement: 'btn-skills',
        action: 'open-panel',
        panelId: 'skills-panel',
        reward: { gold: 200, items: [] },
      },
      {
        id: 'auto-farm',
        title: '🤖 เปิด Auto Farm',
        description: 'กดปุ่ม "Auto Farm" เพื่อให้ตัวละครตีมอนสเตอร์โดยอัตโนมัติ แม้ว่าคุณจะออฟไลน์ก็ยังได้ EXP!',
        targetElement: 'btn-auto-farm',
        action: 'enable-autofarm',
        reward: { gold: 500, items: [{ name: 'Red Herb', qty: 2 }] },
      },
      {
        id: 'daily-reward',
        title: '🎁 รับรางวัลรายวัน',
        description: 'กดปุ่ม "Daily Reward" เพื่อรับรางวัลเข้าเกมทุกวัน ยิ่งเข้าเกมต่อเนื่องยิ่งได้รางวัลใหญ่!',
        targetElement: 'btn-daily-reward',
        action: 'open-panel',
        panelId: 'daily-modal',
        reward: { gold: 300, items: [] },
      },
      {
        id: 'marketplace',
        title: '🏪 ตลาดซื้อขาย',
        description: 'ในเมือง Prontera มีตลาดที่คุณสามารถซื้อขายไอเทมกับผู้เล่นอื่นได้ ลองเข้าไปดูสิ',
        targetElement: 'btn-marketplace',
        action: 'open-panel',
        panelId: 'marketplace-panel',
        reward: { gold: 400, items: [] },
      },
      {
        id: 'completion',
        title: '🎉 ยินดีด้วย!',
        description: 'คุณได้เรียนรู้พื้นฐานของ ZOLOS แล้ว! ตอนนี้คุณพร้อมที่จะเริ่มการผจญภัยอันยิ่งใหญ่ของคุณแล้ว',
        targetElement: null,
        action: 'complete',
        reward: { gold: 1000, items: [{ name: 'Dragon Heart', qty: 1 }] },
      },
    ];
  }

  // Show a specific tutorial step
  _showStep(stepIndex) {
    const steps = this._getSteps();
    if (stepIndex >= steps.length) {
      this._completeTutorial();
      return;
    }

    const step = steps[stepIndex];
    this.currentStep = stepIndex;

    // Render the semi-transparent backdrop (captures stray clicks, keeps tooltip on top)
    this._renderBackdrop();

    // Create or update overlay and tooltip
    this._renderStepTooltip(step);

    // Register action handler for this step
    this._registerStepHandler(step);

    // Log progress
    console.log(`[Tutorial] Step ${stepIndex + 1}/${steps.length}: ${step.id}`);
  }

  // Render a semi-transparent backdrop so the tooltip floats above a dimmed game screen
  _renderBackdrop() {
    if (!this.stepBackdrop) {
      this.stepBackdrop = document.createElement('div');
      this.stepBackdrop.id = 'tutorial-backdrop';
      document.body.appendChild(this.stepBackdrop);
    }
  }

  // Render step tooltip UI
  _renderStepTooltip(step) {
    // Remove old tooltip
    if (this.stepTooltip) this.stepTooltip.remove();

    // Create new tooltip
    this.stepTooltip = document.createElement('div');
    this.stepTooltip.id = 'tutorial-tooltip';
    this.stepTooltip.className = 'tutorial-tooltip';
    this.stepTooltip.innerHTML = `
      <div class="tutorial-content">
        <div class="tutorial-header">
          <span class="tutorial-title">${step.title}</span>
          <button class="tutorial-close" id="tutorial-skip">✕</button>
        </div>
        <div class="tutorial-body">
          <p>${step.description}</p>
        </div>
        <div class="tutorial-footer">
          <span class="tutorial-progress">${this.currentStep + 1}/${this._getSteps().length}</span>
          <div class="tutorial-buttons">
            <button id="tutorial-prev" class="tutorial-btn-secondary" ${this.currentStep === 0 ? 'disabled' : ''}>← ย้อนกลับ</button>
            <button id="tutorial-next" class="tutorial-btn-primary">ถัดไป →</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.stepTooltip);

    // Attach button listeners
    const skipBtn = document.getElementById('tutorial-skip');
    const nextBtn = document.getElementById('tutorial-next');
    const prevBtn = document.getElementById('tutorial-prev');

    if (skipBtn) skipBtn.onclick = (e) => { e.stopPropagation(); this._skipTutorial(); };
    if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); this._advanceStep(); };
    if (prevBtn && this.currentStep > 0) {
      prevBtn.onclick = (e) => { e.stopPropagation(); this._previousStep(); };
    }

    // Highlight target element if specified
    if (step.targetElement) {
      this._highlightElement(step.targetElement);
    }
  }

  // Register action handler for current step
  _registerStepHandler(step) {
    const steps = this._getSteps();
    const nextStep = () => {
      this.currentStep + 1 >= steps.length
        ? this._completeTutorial()
        : this._showStep(this.currentStep + 1);
    };

    switch (step.action) {
      case 'click-next':
        // Just wait for next button click (already handled above)
        break;

      case 'walk-distance':
        // Track player movement
        if (this.character && this.character.getPosition) {
          const startPos = this.character.getPosition().clone();
          const checkWalk = setInterval(() => {
            const currentPos = this.character.getPosition();
            const distance = startPos.distanceTo(currentPos);
            if (distance >= step.distance) {
              clearInterval(checkWalk);
              this.gameUI?.addCombatLog('✅ ดีเลย! คุณเดินได้ดี', 'system');
              this._grantReward(step.reward);
              nextStep();
            }
          }, 500);
        }
        break;

      case 'defeat-monster':
        // Track monster kills
        const monsterCheckHandler = (monsterName) => {
          if (monsterName === step.monsterName) {
            this.gameUI?.addCombatLog(`✅ ดีเลย! คุณชนะ ${step.monsterName}!`, 'system');
            this._grantReward(step.reward);
            nextStep();
          }
        };
        window._tutorialMonsterKillHandler = monsterCheckHandler;
        break;

      case 'open-panel':
        // Track panel opening
        const panelCheckHandler = (panelId) => {
          if (panelId === step.panelId) {
            this.gameUI?.addCombatLog(`✅ เยี่ยม! คุณเปิด ${step.panelId} ได้สำเร็จ`, 'system');
            this._grantReward(step.reward);
            nextStep();
          }
        };
        window._tutorialPanelHandler = panelCheckHandler;
        break;

      case 'equip-item':
        // Track equipment
        const equipCheckHandler = (itemType) => {
          if (itemType === step.itemType) {
            this.gameUI?.addCombatLog(`✅ ยอดเยี่ยม! คุณติดตั้ง ${step.itemType} ได้แล้ว`, 'system');
            this._grantReward(step.reward);
            nextStep();
          }
        };
        window._tutorialEquipHandler = equipCheckHandler;
        break;

      case 'enable-autofarm':
        // Track auto farm toggle
        const autoFarmCheckHandler = (isActive) => {
          if (isActive) {
            this.gameUI?.addCombatLog(`✅ ยอดเยี่ยม! Auto Farm เปิดแล้ว`, 'system');
            this._grantReward(step.reward);
            nextStep();
          }
        };
        window._tutorialAutoFarmHandler = autoFarmCheckHandler;
        break;

      case 'complete':
        // Tutorial complete — mark as completed
        this._grantReward(step.reward);
        this._completeTutorial();
        break;
    }
  }

  // Highlight a UI element
  _highlightElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Create highlight overlay
    if (this.stepOverlay) this.stepOverlay.remove();
    this.stepOverlay = document.createElement('div');
    this.stepOverlay.className = 'tutorial-highlight';
    document.body.appendChild(this.stepOverlay);

    const rect = element.getBoundingClientRect();
    this.stepOverlay.style.cssText = `
      position: fixed;
      top: ${rect.top - 8}px;
      left: ${rect.left - 8}px;
      width: ${rect.width + 16}px;
      height: ${rect.height + 16}px;
      border: 3px solid #ffcf4a;
      border-radius: 8px;
      box-shadow: 0 0 20px rgba(255, 207, 74, 0.6), inset 0 0 20px rgba(255, 207, 74, 0.2);
      pointer-events: none;
      z-index: 20000;
      animation: tutorialPulse 1.5s ease-in-out infinite;
    `;
  }

  // Grant reward for completing a step
  _grantReward(reward) {
    if (!this.character) return;

    // Add gold
    if (reward.gold) {
      this.character.stats.gold = (this.character.stats.gold || 0) + reward.gold;
      this.gameUI?.addCombatLog(`💰 +${reward.gold} Gold`, 'gold');
    }

    // Add items
    if (reward.items && reward.items.length > 0) {
      reward.items.forEach(it => {
        this.gameUI?.addItem({ name: it.name, qty: it.qty });
      });
    }

    this.gameUI?.updateHUD(this.character.stats);
  }

  // Advance to next step
  _advanceStep() {
    this._showStep(this.currentStep + 1);
  }

  // Go back to previous step
  _previousStep() {
    if (this.currentStep > 0) {
      this._showStep(this.currentStep - 1);
    }
  }

  // Skip tutorial
  _skipTutorial() {
    if (confirm('คุณต้องการข้ามบทเรียนหรือไม่? คุณสามารถกลับมาเรียนได้ในเมนู')) {
      this._completeTutorial();
    }
  }

  // Complete tutorial — save to server so it never shows again
  _completeTutorial() {
    // Save completion status to database (server-side persistent)
    this.saveTutorialCompleted();

    if (this.stepTooltip) this.stepTooltip.remove();
    if (this.stepOverlay) this.stepOverlay.remove();
    if (this.stepBackdrop) { this.stepBackdrop.remove(); this.stepBackdrop = null; }

    this.isActive = false;
    // Restore mobile controls via the standard visibility system
    this.gameUI?.updateMobileControlsVisibility?.();
    this.gameUI?.addCombatLog('🎉 ยินดีด้วย! คุณจบบทเรียนแล้ว! ตอนนี้คุณพร้อมที่จะเริ่มการผจญภัยของคุณ', 'levelup');
  }

  // Allow returning tutorial from menu (resets completed flag locally)
  async restartTutorial() {
    this.tutorialCompleted = false;
    this.initTutorialFlow();
  }

  // Inject tutorial styles
  _injectTutorialStyles() {
    if (document.getElementById('tutorial-styles')) return;

    const style = document.createElement('style');
    style.id = 'tutorial-styles';
    style.textContent = `
      #tutorial-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
        z-index: 19999;
        pointer-events: none;
      }

      #tutorial-tooltip {
        position: fixed;
        bottom: 120px; /* Moved up to avoid blocking main bottom controls */
        right: 20px;
        width: min(380px, 90vw);
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        border: 2px solid #ffcf4a;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 207, 74, 0.4);
        z-index: 20000; /* Above mobile controls (1500) and game panels (300) */
        animation: tutorialSlideIn 0.4s ease-out;
        pointer-events: auto; /* Ensure it's clickable */
      }

      @keyframes tutorialSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .tutorial-content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .tutorial-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .tutorial-title {
        font-size: 16px;
        font-weight: 900;
        color: #ffcf4a;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
      }

      .tutorial-close {
        background: rgba(231, 76, 60, 0.2);
        border: 1px solid rgba(231, 76, 60, 0.5);
        color: #ff7675;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        z-index: 20001;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }
      
      .tutorial-close:hover {
        background: rgba(231, 76, 60, 0.4);
        border-color: #ff7675;
        transform: rotate(90deg);
      }

      .tutorial-body {
        color: #d0d0d0;
        font-size: 13px;
        line-height: 1.5;
      }

      .tutorial-body p {
        margin: 0;
      }

      .tutorial-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 207, 74, 0.2);
      }

      .tutorial-progress {
        font-size: 11px;
        color: #9aa5c0;
        font-weight: 700;
      }

      .tutorial-buttons {
        display: flex;
        gap: 8px;
      }

      .tutorial-btn-primary,
      .tutorial-btn-secondary {
        padding: 10px 18px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        -webkit-tap-highlight-color: transparent;
        min-height: 38px;
        touch-action: manipulation;
      }

      .tutorial-btn-primary {
        background: linear-gradient(135deg, #ffcf4a, #ff7a2e);
        color: #3a2000;
      }

      .tutorial-btn-primary:hover:not(:disabled) {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(255, 207, 74, 0.4);
      }

      .tutorial-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #d0d0d0;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .tutorial-btn-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.15);
      }

      .tutorial-btn-primary:disabled,
      .tutorial-btn-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .tutorial-highlight {
        animation: tutorialPulse 1.5s ease-in-out infinite;
      }

      @keyframes tutorialPulse {
        0%, 100% {
          box-shadow: 0 0 20px rgba(255, 207, 74, 0.6), inset 0 0 20px rgba(255, 207, 74, 0.2);
        }
        50% {
          box-shadow: 0 0 30px rgba(255, 207, 74, 0.9), inset 0 0 30px rgba(255, 207, 74, 0.3);
        }
      }

      @media (max-width: 768px) {
        #tutorial-tooltip {
          bottom: 160px; /* Even higher on mobile to clear mobile controls */
          right: 10px;
          left: 10px;
          width: auto;
        }

        #tutorial-backdrop {
          z-index: 19999;
        }
      }
    `;

    document.head.appendChild(style);
  }
}
