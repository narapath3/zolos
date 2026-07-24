/**
 * LoginCanvasBg.js
 * High-performance procedural HTML5 Canvas background renderer for Zolos RO Login Gateway.
 * Features:
 * - Dynamic Yggdrasil gold magic embers & floating mana particles
 * - Dual rotating concentric Rune Magic Circles (Prontera / Geffen spell arrays) with glow pulsation
 * - Volumetric sweeping light beams (God Rays)
 * - Parallax camera movement reacting to cursor position with smooth damping
 * - Floating fog/mist atmospheric particles
 */

export class LoginCanvasBg {
    constructor(canvasId = 'auth-bg-canvas') {
        this.isReady = false;
        this.isRunning = false;
        this.animationFrameId = null;
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) return;
        this.isReady = true;

        // Mouse Parallax coordinates
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetMouseX = 0;
        this.targetMouseY = 0;

        // Time tracking
        this.time = 0;

        // Particles arrays
        this.embers = [];
        this.manaDust = [];
        this.lightRays = [];

        this._bindEvents();
        this._initScene();
    }

    _bindEvents() {
        this._onResize = this._onResize.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);

        window.addEventListener('resize', this._onResize);
        window.addEventListener('mousemove', this._onMouseMove);
    }

    _onMouseMove(e) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        // Normalize mouse pos from -1 to 1
        this.targetMouseX = (e.clientX - cx) / cx;
        this.targetMouseY = (e.clientY - cy) / cy;
    }

    _onResize() {
        if (!this.canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    _initScene() {
        this._onResize();

        // 1. Initialize Golden Yggdrasil Embers
        const emberCount = Math.floor(Math.min(this.width, 1400) / 18);
        this.embers = [];
        for (let i = 0; i < emberCount; i++) {
            this.embers.push(this._createEmber(true));
        }

        // 2. Initialize Blue/Cyan Mana Dust
        const manaCount = Math.floor(Math.min(this.width, 1400) / 25);
        this.manaDust = [];
        for (let i = 0; i < manaCount; i++) {
            this.manaDust.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: 1 + Math.random() * 2.5,
                speedY: -(0.2 + Math.random() * 0.5),
                speedX: (Math.random() - 0.5) * 0.4,
                alpha: Math.random(),
                pulseSpeed: 0.02 + Math.random() * 0.03,
                color: Math.random() > 0.4 ? 'rgba(96, 180, 255, ' : 'rgba(160, 120, 255, '
            });
        }

        // 3. Initialize Volumetric Light Rays (God Rays)
        this.lightRays = [
            { angle: -0.15, width: 140, alpha: 0.12, speed: 0.0008, offset: 0 },
            { angle: 0.05, width: 220, alpha: 0.18, speed: -0.0006, offset: 2 },
            { angle: 0.25, width: 160, alpha: 0.1, speed: 0.001, offset: 4 }
        ];
    }

    _createEmber(randomY = false) {
        return {
            x: Math.random() * this.width,
            y: randomY ? Math.random() * this.height : this.height + 20,
            size: 1.5 + Math.random() * 4.5,
            speedY: -(0.6 + Math.random() * 1.4),
            speedX: (Math.random() - 0.5) * 0.8,
            wobbleSpeed: 0.01 + Math.random() * 0.03,
            wobbleAmp: 0.5 + Math.random() * 1.5,
            alpha: 0.2 + Math.random() * 0.8,
            maxAlpha: 0.6 + Math.random() * 0.4,
            fadeSpeed: 0.005 + Math.random() * 0.01,
            color: Math.random() > 0.3 ? '240, 192, 64' : '255, 220, 120' // RO Gold
        };
    }

    start() {
        if (!this.isReady || this.isRunning) return;
        this.isRunning = true;
        this.loop = this.loop.bind(this);
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    loop() {
        if (!this.isRunning) return;

        this.time += 0.016;

        // Smooth Mouse Parallax Damping (Lerp)
        this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
        this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

        this._render();

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    _render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        const px = this.mouseX * 30; // Parallax X offset
        const py = this.mouseY * 20; // Parallax Y offset

        // ---- 1. Render God Rays (Background Layer) ----
        ctx.save();
        ctx.translate(w / 2 + px * 0.5, py * 0.5);
        for (const ray of this.lightRays) {
            ray.angle += ray.speed;
            const currentAngle = ray.angle + Math.sin(this.time * 0.5 + ray.offset) * 0.05;

            const grad = ctx.createLinearGradient(0, -100, Math.sin(currentAngle) * h, h);
            grad.addColorStop(0, 'rgba(255, 230, 150, ' + (ray.alpha * 1.5) + ')');
            grad.addColorStop(0.4, 'rgba(240, 180, 60, ' + ray.alpha + ')');
            grad.addColorStop(1, 'rgba(240, 180, 60, 0)');

            ctx.save();
            ctx.rotate(currentAngle);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-ray.width / 2, -100);
            ctx.lineTo(ray.width / 2, -100);
            ctx.lineTo(ray.width * 2, h * 1.5);
            ctx.lineTo(-ray.width * 2, h * 1.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();

        // ---- 2. Render Concentric Rotating Rune Circles (Prontera Magic Array) ----
        this._renderRuneCircles(ctx, w / 2 + px * 0.8, h / 2 + py * 0.8);

        // ---- 3. Render Blue Mana Dust ----
        ctx.save();
        for (const mana of this.manaDust) {
            mana.y += mana.speedY;
            mana.x += mana.speedX + Math.sin(this.time + mana.y * 0.01) * 0.2;
            mana.alpha += Math.sin(this.time * 5 + mana.x) * mana.pulseSpeed * 0.5;

            if (mana.y < -20) {
                mana.y = h + 20;
                mana.x = Math.random() * w;
            }

            const currentAlpha = Math.max(0.1, Math.min(0.8, mana.alpha));
            ctx.fillStyle = mana.color + currentAlpha + ')';
            ctx.beginPath();
            ctx.arc(mana.x + px * 1.2, mana.y + py * 1.2, mana.radius, 0, Math.PI * 2);
            ctx.fill();

            // Subtle glow around larger mana dust
            if (mana.radius > 1.8) {
                ctx.shadowColor = 'rgba(96, 180, 255, 0.6)';
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
        ctx.restore();

        // ---- 4. Render Golden Yggdrasil Embers ----
        ctx.save();
        for (const ember of this.embers) {
            ember.y += ember.speedY;
            ember.x += ember.speedX + Math.sin(this.time * 2 + ember.y * 0.02) * ember.wobbleAmp;

            if (ember.y < -20) {
                Object.assign(ember, this._createEmber(false));
            }

            ctx.fillStyle = `rgba(${ember.color}, ${ember.alpha})`;
            ctx.shadowColor = `rgba(${ember.color}, 0.8)`;
            ctx.shadowBlur = ember.size * 2.5;

            ctx.beginPath();
            ctx.arc(ember.x + px * 1.6, ember.y + py * 1.6, ember.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _renderRuneCircles(ctx, cx, cy) {
        ctx.save();
        ctx.translate(cx, cy);

        const scaleFactor = Math.min(this.width, this.height) / 900;
        const radius = 280 * Math.max(0.65, scaleFactor);

        const rot1 = this.time * 0.08;
        const rot2 = -this.time * 0.05;
        const pulse = 0.85 + Math.sin(this.time * 1.5) * 0.15;

        // Outer Ring (Gold)
        ctx.save();
        ctx.rotate(rot1);
        ctx.strokeStyle = `rgba(240, 192, 64, ${0.18 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([16, 24, 8, 24]);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Outer Star Polygon (Hexagram / Transcendent Star)
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(240, 192, 64, ${0.08 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Inner Ring (Sapphire / Mana Cyan)
        ctx.save();
        ctx.rotate(rot2);
        ctx.strokeStyle = `rgba(96, 180, 255, ${0.2 * pulse})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([8, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();

        // Inner Rune Ornaments (Small glowing dots on points)
        ctx.fillStyle = `rgba(240, 192, 64, ${0.4 * pulse})`;
        for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            const rx = Math.cos(a) * (radius * 0.72);
            const ry = Math.sin(a) * (radius * 0.72);
            ctx.beginPath();
            ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.restore();
    }

    destroy() {
        this.stop();
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('mousemove', this._onMouseMove);
    }
}
