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

        // 4. Initialize Monster Jellies (Cute, colorful, wiggling, and jumping!)
        this.monsters = [
            {
                name: 'Poring',
                xPct: 0.18,
                baseRadius: 21,
                color: 'rgba(255, 110, 150, ', // Vivid RO Pink prefix
                colorDark: 'rgba(220, 50, 100, ',
                colorLight: 'rgba(255, 220, 230, ',
                jumpSpeed: 2.8,
                jumpHeight: 50,
                offset: 0,
                wiggleSpeed: 8,
                state: 'alive', // 'alive', 'dead', 'respawning'
                yShift: 0,
                vy: 0,
                deathTime: 0
            },
            {
                name: 'Poporing',
                xPct: 0.76,
                baseRadius: 23,
                color: 'rgba(110, 224, 75, ', // Bright RO Poporing Green
                colorDark: 'rgba(65, 150, 35, ',
                colorLight: 'rgba(215, 255, 200, ',
                jumpSpeed: 2.2,
                jumpHeight: 40,
                offset: Math.PI / 2, // Desynchronized jump
                wiggleSpeed: 6,
                state: 'alive',
                yShift: 0,
                vy: 0,
                deathTime: 0
            },
            {
                name: 'Marin',
                xPct: 0.85,
                baseRadius: 19,
                color: 'rgba(80, 195, 220, ', // RO Marin Sky Blue
                colorDark: 'rgba(35, 135, 160, ',
                colorLight: 'rgba(210, 250, 255, ',
                jumpSpeed: 3.2,
                jumpHeight: 60,
                offset: Math.PI, // Desynchronized jump
                wiggleSpeed: 10,
                state: 'alive',
                yShift: 0,
                vy: 0,
                deathTime: 0
            }
        ];

        // 5. Initialize Running Hero (Adventurer)
        this.hero = {
            x: -60,
            baseSpeed: 1.8,
            speed: 1.8,
            dir: 1, // 1 = right, -1 = left
            action: 'run', // 'run' or 'attack'
            attackTime: 0,
            attackCooldown: 0,
            targetMonster: null,
            bobSpeed: 12,
            legSwingSpeed: 12
        };

        // 6. Combat / Explosion Particles
        this.combatParticles = [];
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

        // ---- 5. Render Monster Jellies ----
        if (this.monsters) {
            for (const monster of this.monsters) {
                this._drawMonster(ctx, monster, w, h, px, py);
            }
        }

        // ---- 6. Render Running Hero ----
        if (this.hero) {
            this._drawHero(ctx, this.hero, w, h, px, py);
        }

        // ---- 7. Update & Render Combat Particles ----
        if (this.combatParticles && this.combatParticles.length > 0) {
            ctx.save();
            for (let i = this.combatParticles.length - 1; i >= 0; i--) {
                const p = this.combatParticles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.alpha -= p.decay;

                if (p.alpha <= 0) {
                    this.combatParticles.splice(i, 1);
                    continue;
                }

                ctx.fillStyle = p.color + p.alpha + ')';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    _drawMonster(ctx, m, w, h, px, py) {
        const cx = w * m.xPct + px * 1.3;
        const groundY = h - 60 + py * 1.3;

        if (m.state === 'dead') {
            if (this.time - m.deathTime > 4.0) {
                m.state = 'respawning';
                m.yShift = -200;
                m.vy = 0;
            }
            return;
        }

        if (m.state === 'respawning') {
            m.yShift += m.vy;
            m.vy += 0.4;
            if (m.yShift >= 0) {
                m.yShift = 0;
                m.state = 'alive';
                m.offset = this.time * -m.jumpSpeed;
            }
        }

        // Animate bounce
        const timeVal = this.time * m.jumpSpeed + m.offset;
        const sinVal = Math.sin(timeVal);
        let bounceY = 0;
        let scaleX = 1;
        let scaleY = 1;

        if (sinVal > 0) {
            bounceY = sinVal * m.jumpHeight;
            const velocity = Math.cos(timeVal);
            scaleX = 1 - velocity * 0.12;
            scaleY = 1 + velocity * 0.12;
        } else {
            const squish = Math.abs(sinVal);
            scaleX = 1 + squish * 0.22;
            scaleY = 1 - squish * 0.22;
        }

        const charY = groundY - bounceY + (m.yShift || 0);

        // 1. Draw shadow on ground
        ctx.save();
        const heightFromGround = bounceY - (m.yShift || 0);
        const shadowOpacity = Math.max(0.0, Math.min(0.4, 0.4 - (heightFromGround / m.jumpHeight) * 0.3));
        const shadowRadiusX = m.baseRadius * scaleX * Math.max(0.4, 1 - (heightFromGround / m.jumpHeight) * 0.4);
        const shadowRadiusY = m.baseRadius * 0.25 * scaleY * Math.max(0.4, 1 - (heightFromGround / m.jumpHeight) * 0.4);

        ctx.fillStyle = 'rgba(0, 0, 0, ' + shadowOpacity + ')';
        ctx.beginPath();
        ctx.ellipse(cx, groundY, Math.max(0, shadowRadiusX), Math.max(0, shadowRadiusY), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Draw Body
        ctx.save();
        ctx.translate(cx, charY);
        ctx.scale(scaleX * (1 + Math.sin(this.time * m.wiggleSpeed) * 0.03), scaleY);

        const grad = ctx.createRadialGradient(-m.baseRadius * 0.3, -m.baseRadius * 0.3, m.baseRadius * 0.1, 0, 0, m.baseRadius);
        grad.addColorStop(0, m.colorLight + '0.9)');
        grad.addColorStop(0.3, m.color + '1)');
        grad.addColorStop(1, m.colorDark + '1)');

        ctx.fillStyle = grad;
        ctx.beginPath();

        const r = m.baseRadius;
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 1.1, -r * 0.8, r * 1.25, r * 0.1);
        ctx.quadraticCurveTo(r * 1.2, r * 1.0, 0, r * 0.95);
        ctx.quadraticCurveTo(-r * 1.2, r * 1.0, -r * 1.25, r * 0.1);
        ctx.quadraticCurveTo(-r * 1.1, -r * 0.8, 0, -r);
        ctx.closePath();

        ctx.shadowColor = m.color + '1)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Gloss highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.4, -r * 0.4, r * 0.3, r * 0.15, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // 3. Eyes
        const eyeOffset = Math.sin(this.time * 2) * 1.5;
        ctx.fillStyle = '#220810';
        ctx.beginPath();
        ctx.arc(-r * 0.35 + eyeOffset, -r * 0.05, r * 0.12, 0, Math.PI * 2);
        ctx.arc(r * 0.35 + eyeOffset, -r * 0.05, r * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Eye highlights
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-r * 0.38 + eyeOffset, -r * 0.08, r * 0.04, 0, Math.PI * 2);
        ctx.arc(r * 0.32 + eyeOffset, -r * 0.08, r * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // 4. Cute Mouth
        ctx.strokeStyle = '#220810';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (bounceY > m.jumpHeight * 0.5) {
            ctx.arc(eyeOffset, r * 0.1, r * 0.1, 0, Math.PI);
        } else {
            ctx.moveTo(-r * 0.1 + eyeOffset, r * 0.15);
            ctx.quadraticCurveTo(eyeOffset, r * 0.22, r * 0.1 + eyeOffset, r * 0.15);
        }
        ctx.stroke();

        ctx.restore();
    }

    _drawHero(ctx, hero, w, h, px, py) {
        const groundY = h - 60 + py * 1.4;

        // Cooldown tick
        if (hero.attackCooldown > 0) {
            hero.attackCooldown--;
        }

        // Logic check: state update
        if (hero.action === 'run') {
            hero.x += hero.speed * hero.dir;

            // Wrap boundaries
            const boundaryPadding = 80;
            if (hero.dir === 1 && hero.x > w + boundaryPadding) {
                hero.dir = -1;
                hero.x = w + boundaryPadding;
                hero.speed = 1.5 + Math.random() * 1.0;
            } else if (hero.dir === -1 && hero.x < -boundaryPadding) {
                hero.dir = 1;
                hero.x = -boundaryPadding;
                hero.speed = 1.5 + Math.random() * 1.0;
            }

            // Check for combat trigger
            if (hero.attackCooldown <= 0 && this.monsters) {
                for (const m of this.monsters) {
                    if (m.state === 'alive') {
                        const mX = w * m.xPct + px * 1.3;
                        const dist = Math.abs(hero.x - mX);
                        const isHeading = (hero.dir === 1 && mX > hero.x) || (hero.dir === -1 && mX < hero.x);

                        if (dist < 48 && isHeading) {
                            hero.action = 'attack';
                            hero.targetMonster = m;
                            hero.attackTime = 0;
                            hero.speed = 0;
                            break;
                        }
                    }
                }
            }
        } else if (hero.action === 'attack') {
            hero.attackTime += 0.05;

            const targetM = hero.targetMonster;
            const mX = w * targetM.xPct + px * 1.3;
            hero.dir = (mX > hero.x) ? 1 : -1;

            if (hero.attackTime >= 0.5 && targetM.state === 'alive') {
                targetM.state = 'dead';
                targetM.deathTime = this.time;

                const sinVal = Math.sin(this.time * targetM.jumpSpeed + targetM.offset);
                const mBounceY = sinVal > 0 ? sinVal * targetM.jumpHeight : 0;
                const mY = groundY - mBounceY;
                this._spawnMonsterExplosion(targetM, mX, mY);
            }

            if (hero.attackTime >= 1.0) {
                hero.action = 'run';
                hero.speed = hero.baseSpeed;
                hero.targetMonster = null;
                hero.attackCooldown = 60; // cooldown in frames
            }
        }

        const cx = hero.x + px * 1.4;
        const cycle = hero.action === 'attack' ? 0 : this.time * hero.legSwingSpeed;
        const bob = hero.action === 'attack' ? 0 : Math.abs(Math.sin(cycle)) * 4;
        const charY = groundY - 14 - bob;

        // 1. Shadow
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, groundY, 16, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Body & Cape & Face
        ctx.save();
        ctx.translate(cx, charY);
        ctx.scale(hero.dir, 1);

        const cSkin = '#ffdbac';
        const cHair = '#f5c324'; // Bright gold
        const cArmor = '#4169e1'; // Royal blue
        const cCape = '#c82333'; // Crimson red
        const cSilver = '#e9ecef';
        const cGold = '#ffd700';

        // Cape (behind body)
        ctx.fillStyle = cCape;
        ctx.beginPath();
        ctx.moveTo(-6, -18);
        const capeWiggle = hero.action === 'attack' ? Math.sin(this.time * 20) * 8 : Math.sin(this.time * 10) * 4;
        ctx.bezierCurveTo(-14, -14, -20 - capeWiggle, -6, -20 - capeWiggle, 4);
        ctx.lineTo(-8, 6);
        ctx.closePath();
        ctx.fill();

        // Legs/Stepping feet
        const leftAngle = Math.sin(cycle);
        const rightAngle = Math.cos(cycle);

        ctx.strokeStyle = '#220810';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        // Left leg
        ctx.save();
        ctx.translate(-3, 8);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(leftAngle * 6, 8);
        ctx.stroke();

        ctx.fillStyle = '#553311';
        ctx.beginPath();
        ctx.arc(leftAngle * 6 + (leftAngle > 0 ? 1 : -1), 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Right leg
        ctx.save();
        ctx.translate(3, 8);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(rightAngle * 6, 8);
        ctx.stroke();

        ctx.fillStyle = '#553311';
        ctx.beginPath();
        ctx.arc(rightAngle * 6 + (rightAngle > 0 ? 1 : -1), 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Armor Body
        ctx.fillStyle = cArmor;
        ctx.strokeStyle = '#12254e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-7, -19);
        ctx.lineTo(7, -19);
        ctx.lineTo(7, -1);
        ctx.lineTo(-7, -1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Gold breastplate circle
        ctx.fillStyle = cGold;
        ctx.beginPath();
        ctx.arc(0, -13, 3, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = cSkin;
        ctx.strokeStyle = '#220810';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -25, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hair
        ctx.fillStyle = cHair;
        ctx.beginPath();
        ctx.moveTo(-10, -27);
        ctx.quadraticCurveTo(-2, -35, 8, -28);
        ctx.quadraticCurveTo(8, -23, 6, -22);
        ctx.quadraticCurveTo(2, -24, 0, -21);
        ctx.quadraticCurveTo(-6, -23, -10, -27);
        ctx.closePath();
        ctx.fill();

        // Messy spikes bangs
        ctx.beginPath();
        ctx.moveTo(-9, -26);
        ctx.lineTo(-4, -20);
        ctx.lineTo(-2, -24);
        ctx.lineTo(2, -20);
        ctx.lineTo(4, -24);
        ctx.lineTo(9, -27);
        ctx.closePath();
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#220810';
        ctx.beginPath();
        ctx.arc(3, -25, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Sword & Arm
        let swordAngle = Math.PI / 4 + Math.sin(cycle) * 0.1;
        if (hero.action === 'attack') {
            swordAngle = -Math.PI / 3 + hero.attackTime * (Math.PI * 1.15);
        }

        ctx.save();
        ctx.translate(2, -12);
        ctx.rotate(hero.action === 'attack' ? -Math.PI / 8 : 0);

        ctx.save();
        ctx.translate(6, 2);
        ctx.rotate(swordAngle);

        // Blade
        ctx.strokeStyle = cSilver;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -18);
        ctx.stroke();

        // Blade shine
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, -17);
        ctx.stroke();

        // Guard
        ctx.strokeStyle = cGold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();

        // Hilt
        ctx.strokeStyle = '#6c757d';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 4);
        ctx.stroke();

        // Sword glow
        const glowRadius = 8 + Math.sin(this.time * 20) * 4;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = glowRadius;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(0, -19);
        ctx.stroke();
        ctx.restore();

        // Arm
        ctx.strokeStyle = '#12254e';
        ctx.fillStyle = cArmor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Beautiful Attack swipes trail
        if (hero.action === 'attack') {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 255, 255, ' + (1 - hero.attackTime) * 0.8 + ')';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 12;

            ctx.beginPath();
            ctx.arc(6, -12, 28, -Math.PI / 2 + hero.attackTime * Math.PI, Math.PI / 4 + hero.attackTime * Math.PI, false);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    _spawnMonsterExplosion(m, cx, cy) {
        const pCount = 18 + Math.floor(Math.random() * 8);
        for (let i = 0; i < pCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5.0;

            let selectColor = m.color;
            const rand = Math.random();
            if (rand < 0.3) {
                selectColor = m.colorLight;
            } else if (rand < 0.6) {
                selectColor = m.colorDark;
            }

            this.combatParticles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.5,
                radius: 2 + Math.random() * 4.0,
                color: selectColor,
                alpha: 1.0,
                decay: 0.02 + Math.random() * 0.015,
                gravity: 0.18
            });
        }
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
