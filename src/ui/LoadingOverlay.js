/**
 * ZOLOS — Spectacular Intro Loading Overlay Component
 * Dark Fantasy Glassmorphism with Procedural Ambient Canvas, Dynamic Progress & Game Tips
 */

export class LoadingOverlay {
    constructor() {
        this.overlayEl = null;
        this.progressBarEl = null;
        this.progressTextEl = null;
        this.progressPercentEl = null;
        this.tipTextEl = null;
        this.tipIconEl = null;
        this.canvas = null;
        this.ctx = null;

        this._progress = 0;
        this._targetProgress = 0;
        this._animationFrame = null;
        this._particles = [];
        this._tipsIndex = 0;
        this._tipInterval = null;
        this._isVisible = false;
        this._audioCtx = null;

        this.tips = [
            { icon: '⚔️', text: 'สกิล Bash มีโอกาสทำให้เป้าหมายติด Stun และสร้างความเสียหายรุนแรง' },
            { icon: '⛏️', text: 'ขุดแร่จากโหนดแร่ในแผนที่ นำวัตถุดิบไปให้พ่อค้าคราฟต์อาวุธระดับตำนาน' },
            { icon: '🐾', text: 'สัตว์เลี้ยงของคุณจะเลเวลอัพเมื่อพาออกรบร่วมกัน พร้อมรับออร่าโบนัสเพิ่มพลัง' },
            { icon: '⚖️', text: 'ตลาดผู้เล่น (P2P) ช่วยให้คุณนำไอเทมดรอปหายากมาตั้งขายแลก Zeny ได้ตลอดเวลา' },
            { icon: '👹', text: 'เข้าร่วมศึกบอสโลก ร่วมมือกับผู้เล่นทั้งเซิร์ฟเวอร์เพื่อล่า Dragon Heart' },
            { icon: '⚡', text: 'ระบบ AUTO Farm จะค้นหาและโจมตีมอนสเตอร์ใกล้เคียงให้อัตโนมัติอย่างชาญฉลาด' },
            { icon: '🎨', text: 'ปรับแต่งสีผม เสื้อผ้า และอุปกรณ์สวมใส่ของตัวละครได้ฟรีที่เมนู Settings' },
            { icon: '🃏', text: 'สะสมการ์ดมอนสเตอร์จากดรอป ยัดใส่ช่องอุปกรณ์เพื่อปลดล็อกพลังธาตุลับ' },
            { icon: '🌀', text: 'ใช้ระบบวาร์ปในเมืองเพื่อเดินทางไปยัง Prontera, Geffen หรือ PVP Arena ได้ทันที' }
        ];

        this.loadingSteps = [
            { threshold: 15, text: '⚡ Initializing 3D Graphics Engine & WebGL Render Pipelines...' },
            { threshold: 35, text: '🔮 Compiling Shader Programs & Atmospheric Magic Effects...' },
            { threshold: 55, text: '🌐 Connecting to ZOLOS Realm Gateway & Realtime Sync...' },
            { threshold: 75, text: '🐉 Spawning World Monsters, NPC Merchants & Entities...' },
            { threshold: 90, text: '🎒 Loading Character Progress, Inventory & Stats...' },
            { threshold: 100, text: '✨ World Sync Complete! Entering the Realm of ZOLOS...' }
        ];

        this._initDOM();
        this._initCanvas();
    }

    _initDOM() {
        let existing = document.getElementById('intro-loading-overlay');
        if (existing) {
            this.overlayEl = existing;
        } else {
            this.overlayEl = document.createElement('div');
            this.overlayEl.id = 'intro-loading-overlay';
            this.overlayEl.className = 'intro-loading-overlay';
            this.overlayEl.innerHTML = `
                <div class="loading-vignette"></div>
                <canvas id="loading-ambient-canvas" class="loading-ambient-canvas"></canvas>
                
                <!-- Rotating Rune Matrices Background -->
                <div class="loading-rune-matrix matrix-outer"></div>
                <div class="loading-rune-matrix matrix-inner"></div>

                <div class="loading-content">
                    <!-- Emblem Crest -->
                    <div class="loading-crest-wrap">
                        <div class="crest-glow-ring"></div>
                        <div class="crest-particle-aura"></div>
                        <img src="/src/assets/zolos_icon.png" alt="ZOLOS Emblem" class="loading-crest-img" />
                    </div>

                    <!-- Title & Tagline -->
                    <h1 class="loading-title">ZOLOS</h1>
                    <div class="loading-subtitle">REALM OF ADVENTURERS</div>

                    <!-- Main Progress Container -->
                    <div class="loading-bar-wrapper">
                        <div class="loading-bar-track">
                            <div id="loading-bar-fill" class="loading-bar-fill" style="width: 0%;">
                                <div class="bar-spark-head"></div>
                                <div class="bar-liquid-wave"></div>
                            </div>
                        </div>
                        <div class="loading-info-row">
                            <span id="loading-status-txt" class="loading-status-txt">Preparing game world...</span>
                            <span id="loading-percent-txt" class="loading-percent-txt">0%</span>
                        </div>
                    </div>

                    <!-- Game Tips Box -->
                    <div class="loading-tip-card">
                        <div class="tip-header">
                            <span class="tip-badge">💡 GAME TIP</span>
                        </div>
                        <div class="tip-body">
                            <span id="loading-tip-icon" class="tip-icon">⚔️</span>
                            <span id="loading-tip-text" class="tip-text">เตรียมพร้อมสำหรับการผจญภัยในโลก ZOLOS...</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(this.overlayEl);
        }

        this.progressBarEl = this.overlayEl.querySelector('#loading-bar-fill');
        this.progressTextEl = this.overlayEl.querySelector('#loading-status-txt');
        this.progressPercentEl = this.overlayEl.querySelector('#loading-percent-txt');
        this.tipIconEl = this.overlayEl.querySelector('#loading-tip-icon');
        this.tipTextEl = this.overlayEl.querySelector('#loading-tip-text');
    }

    _initCanvas() {
        this.canvas = this.overlayEl.querySelector('#loading-ambient-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this._resizeCanvas();
        window.addEventListener('resize', () => this._resizeCanvas());

        // Spawn ambient particles (gold embers, blue mana sparks, purple dust)
        this._particles = [];
        const count = Math.min(80, Math.floor((window.innerWidth * window.innerHeight) / 12000));
        for (let i = 0; i < count; i++) {
            this._particles.push(this._createParticle());
        }
    }

    _resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    _createParticle() {
        const types = [
            { color: 'rgba(240, 192, 64, ', sizeMin: 1.5, sizeMax: 4, speedMin: 0.3, speedMax: 1.2 },  // Gold ember
            { color: 'rgba(96, 160, 255, ', sizeMin: 1.0, sizeMax: 3, speedMin: 0.2, speedMax: 0.9 },  // Mana blue
            { color: 'rgba(180, 90, 255, ', sizeMin: 1.2, sizeMax: 3.5, speedMin: 0.4, speedMax: 1.0 }, // Arcane purple
        ];
        const t = types[Math.floor(Math.random() * types.length)];
        return {
            x: Math.random() * (this.canvas ? this.canvas.width : window.innerWidth),
            y: Math.random() * (this.canvas ? this.canvas.height : window.innerHeight),
            size: t.sizeMin + Math.random() * (t.sizeMax - t.sizeMin),
            speedY: t.speedMin + Math.random() * (t.speedMax - t.speedMin),
            speedX: (Math.random() - 0.5) * 0.5,
            opacity: 0.1 + Math.random() * 0.7,
            maxOpacity: 0.4 + Math.random() * 0.5,
            pulseSpeed: 0.01 + Math.random() * 0.02,
            pulseDir: Math.random() > 0.5 ? 1 : -1,
            colorPrefix: t.color
        };
    }

    _renderParticles() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const p of this._particles) {
            p.y -= p.speedY;
            p.x += p.speedX;
            p.opacity += p.pulseSpeed * p.pulseDir;
            if (p.opacity >= p.maxOpacity) {
                p.opacity = p.maxOpacity;
                p.pulseDir = -1;
            } else if (p.opacity <= 0.1) {
                p.opacity = 0.1;
                p.pulseDir = 1;
            }

            if (p.y < -10 || p.x < -10 || p.x > this.canvas.width + 10) {
                p.y = this.canvas.height + 10;
                p.x = Math.random() * this.canvas.width;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = `${p.colorPrefix}${p.opacity})`;
            this.ctx.shadowBlur = p.size > 2.5 ? 8 : 0;
            this.ctx.shadowColor = `${p.colorPrefix}0.8)`;
            this.ctx.fill();
        }
    }

    _playProgressChime(pitch = 440) {
        try {
            if (!this._audioCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this._audioCtx = new AudioCtx();
            }
            if (!this._audioCtx) return;

            if (this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }

            const osc = this._audioCtx.createOscillator();
            const gain = this._audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, this._audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(pitch * 1.5, this._audioCtx.currentTime + 0.15);

            gain.gain.setValueAtTime(0.05, this._audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this._audioCtx.currentTime + 0.2);

            osc.connect(gain);
            gain.connect(this._audioCtx.destination);

            osc.start();
            osc.stop(this._audioCtx.currentTime + 0.2);
        } catch (e) {
            // Audio context blocked or unsupported
        }
    }

    _updateTips() {
        if (!this.tipTextEl || !this.tipIconEl) return;
        const currentTip = this.tips[this._tipsIndex];

        // Fade out
        this.tipTextEl.style.opacity = '0';
        this.tipIconEl.style.transform = 'scale(0.5)';
        this.tipIconEl.style.opacity = '0';

        setTimeout(() => {
            this.tipIconEl.textContent = currentTip.icon;
            this.tipTextEl.textContent = currentTip.text;
            this.tipTextEl.style.opacity = '1';
            this.tipIconEl.style.transform = 'scale(1)';
            this.tipIconEl.style.opacity = '1';
        }, 300);

        this._tipsIndex = (this._tipsIndex + 1) % this.tips.length;
    }

    show() {
        this._isVisible = true;
        this.overlayEl.style.display = 'flex';
        this.overlayEl.classList.remove('fade-out-warp');
        this.overlayEl.classList.add('active');
        this.setProgress(0, 'Initializing world...');
        this._updateTips();

        if (!this._tipInterval) {
            this._tipInterval = setInterval(() => this._updateTips(), 3500);
        }

        const loop = () => {
            if (!this._isVisible) return;
            // Smoothly interpolate progress toward target
            if (this._progress < this._targetProgress) {
                const diff = this._targetProgress - this._progress;
                this._progress += Math.max(0.4, diff * 0.12);
                if (this._progress > this._targetProgress) this._progress = this._targetProgress;
                this._renderProgressUI();
            }

            this._renderParticles();
            this._animationFrame = requestAnimationFrame(loop);
        };
        loop();
    }

    setProgress(percent, customStatus = null) {
        this._targetProgress = Math.min(100, Math.max(0, percent));
        if (customStatus && this.progressTextEl) {
            this.progressTextEl.textContent = customStatus;
        } else {
            // Match current threshold
            for (let i = this.loadingSteps.length - 1; i >= 0; i--) {
                if (this._targetProgress >= this.loadingSteps[i].threshold) {
                    if (this.progressTextEl) {
                        this.progressTextEl.textContent = this.loadingSteps[i].text;
                    }
                    break;
                }
            }
        }
    }

    _renderProgressUI() {
        const val = Math.floor(this._progress);
        if (this.progressBarEl) this.progressBarEl.style.width = `${val}%`;
        if (this.progressPercentEl) this.progressPercentEl.textContent = `${val}%`;
    }

    async completeAndHide() {
        this.setProgress(100, '✨ World Sync Complete! Entering ZOLOS...');
        this._playProgressChime(587.33); // D5 chime

        // Short pause at 100% to let user see completion
        await new Promise(r => setTimeout(r, 600));

        this._isVisible = false;
        if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
        if (this._tipInterval) {
            clearInterval(this._tipInterval);
            this._tipInterval = null;
        }

        // Trigger spectacular portal transition warp animation
        this.overlayEl.classList.add('fade-out-warp');

        setTimeout(() => {
            this.overlayEl.style.display = 'none';
            this.overlayEl.classList.remove('active', 'fade-out-warp');
        }, 900);
    }
}

// Global singleton
export const loadingOverlay = new LoadingOverlay();
