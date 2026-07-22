// Particle System — Damage numbers, hit effects, death bursts
// OPTIMIZED: Adaptive particle count, simplified geometry for low-end devices
import * as THREE from 'three';

// ============ Performance Detection ============
class ParticlePerformanceMonitor {
    constructor() {
        this.quality = 'high'; // 'high', 'medium', 'low'
        this.isLowEndDevice = this.detectLowEndDevice();
    }

    detectLowEndDevice() {
        // Detect low-end devices
        const cores = navigator.hardwareConcurrency || 1;
        const memory = navigator.deviceMemory || 4;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        return isMobile && (cores <= 2 || memory <= 2);
    }

    setQuality(quality) {
        this.quality = quality;
    }

    getParticleCount() {
        switch (this.quality) {
            case 'low': return 0.5; // 50% of normal
            case 'medium': return 0.75; // 75% of normal
            default: return 1.0; // 100% normal
        }
    }

    getGeometrySegments() {
        switch (this.quality) {
            case 'low': return 3; // Simplified: 3x3 segments
            case 'medium': return 4; // Medium: 4x4 segments
            default: return 5; // High: 5x5 segments
        }
    }
}

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        // Settings → "ปิดเอฟเฟกต์ภาพ": skips the particle bursts (hit/crit/
        // explosion/heal) for low-end devices. Damage numbers and the
        // click-to-move indicator stay on — they're information, not decoration.
        this.effectsEnabled = true;
        this.particles = [];
        this.deathEffects = [];
        this.hitEffects = [];
        this.shockwaves = [];
        this.splashEffects = [];
        this.projectiles = [];
        this.slashes = [];
        this.splashCooldown = 0;

        // Performance monitoring
        this.perfMonitor = new ParticlePerformanceMonitor();

        // --- FPS-protection for low-spec devices ---
        // Real per-frame FPS estimate (EMA), independent of
        // AdaptiveRendererSystem's coarse 2s interval sampler. When the frame
        // rate sags or the scene is saturated with live effect meshes, new
        // decorative spawns are skipped so effect spam never turns into a
        // stutter. Deliberate skill effects get more headroom than the
        // high-frequency incidental sparks that fire on every single hit.
        this._fps = 60;
        this._effectBudget = this.perfMonitor.isLowEndDevice
            ? { incidental: 18, total: 30, fpsFloor: 24 }
            : { incidental: 55, total: 90, fpsFloor: 16 };

        // Setup procedural textures
        this.textures = this._initProceduralTextures();
    }

    // Total live decorative meshes currently animating in the scene.
    _liveEffects() {
        return this.shockwaves.length + this.hitEffects.length +
            this.deathEffects.length + this.slashes.length +
            this.splashEffects.length;
    }

    // True → skip spawning this effect to protect the frame rate.
    // `essential` marks deliberate skill effects, which are rarer and more
    // meaningful than the incidental hit sparks fired on every attack.
    _throttleEffect(essential = false) {
        const b = this._effectBudget;
        if (this._fps < b.fpsFloor) {
            if (!essential) return true;
            if (this._fps < b.fpsFloor - 8) return true;
        }
        const live = this._liveEffects();
        return live >= (essential ? b.total : b.incidental);
    }

    _initProceduralTextures() {
        const textures = {};

        // 1. Glow Spark (radial gradient)
        const c1 = document.createElement('canvas');
        c1.width = c1.height = 32;
        const ctx1 = c1.getContext('2d');
        const grad1 = ctx1.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad1.addColorStop(0, 'rgba(255,255,255,1)');
        grad1.addColorStop(0.3, 'rgba(255,255,255,0.8)');
        grad1.addColorStop(1, 'rgba(255,255,255,0)');
        ctx1.fillStyle = grad1;
        ctx1.fillRect(0, 0, 32, 32);
        textures.glowSpark = new THREE.CanvasTexture(c1);

        // 2. Magic Circle (geometric runes)
        const c2 = document.createElement('canvas');
        c2.width = c2.height = 256;
        const ctx2 = c2.getContext('2d');
        ctx2.strokeStyle = 'white';
        ctx2.lineWidth = 4;
        ctx2.shadowColor = 'white';
        ctx2.shadowBlur = 10;

        // Outer rings
        ctx2.beginPath(); ctx2.arc(128, 128, 110, 0, Math.PI * 2); ctx2.stroke();
        ctx2.beginPath(); ctx2.arc(128, 128, 95, 0, Math.PI * 2); ctx2.stroke();

        // Inner triangle / star
        ctx2.lineWidth = 2;
        ctx2.beginPath();
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2 / 3) - Math.PI / 2;
            const x = 128 + Math.cos(angle) * 90;
            const y = 128 + Math.sin(angle) * 90;
            if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
        }
        ctx2.closePath(); ctx2.stroke();

        // Inner circles
        ctx2.beginPath(); ctx2.arc(128, 128, 30, 0, Math.PI * 2); ctx2.stroke();
        textures.magicCircle = new THREE.CanvasTexture(c2);

        // 3. Melee Slash Blade (curved blade swoosh)
        const c3 = document.createElement('canvas');
        c3.width = 120; c3.height = 120;
        const ctx3 = c3.getContext('2d');
        const grad3 = ctx3.createRadialGradient(60, 60, 20, 60, 60, 50);
        grad3.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        grad3.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
        grad3.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx3.fillStyle = grad3;
        ctx3.beginPath();
        ctx3.arc(60, 60, 45, -Math.PI / 6, Math.PI / 6);
        ctx3.lineWidth = 12;
        ctx3.strokeStyle = grad3;
        ctx3.stroke();
        textures.slashBlade = new THREE.CanvasTexture(c3);

        return textures;
    }

    _createGlowMaterial(colorVal, textureType, size = 0.5) {
        return new THREE.PointsMaterial({
            size: size,
            color: colorVal,
            map: this.textures[textureType] || this.textures.glowSpark,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
    }

    // ============ Water Splash Effect ============
    spawnWaterSplash(position) {
        // Rate limit splashes
        if (this.splashCooldown > 0) return;
        this.splashCooldown = 0.15; // max ~6 splashes/sec

        // Adaptive particle count
        let dropCount = 8;
        const particleScale = this.perfMonitor.getParticleCount();
        dropCount = Math.floor(dropCount * particleScale);

        const colors = [0x6ec6ff, 0xaae0ff, 0xffffff, 0x4aa8d8];
        const segments = this.perfMonitor.getGeometrySegments();

        for (let i = 0; i < dropCount; i++) {
            const size = 0.03 + Math.random() * 0.04;
            const geo = new THREE.SphereGeometry(size, segments, segments);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.85,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.y += 0.05;

            // Spray outward and up
            const angle = (Math.PI * 2 * i) / dropCount + Math.random() * 0.4;
            const speed = 1.5 + Math.random() * 2;
            const velocity = new THREE.Vector3(
                Math.cos(angle) * speed * 0.6,
                2.5 + Math.random() * 2,
                Math.sin(angle) * speed * 0.6
            );
            this.scene.add(mesh);
            this.splashEffects.push({ mesh, velocity, life: 0.6 + Math.random() * 0.2 });
        }

        // Ripple ring on water surface
        const rippleGeo = new THREE.RingGeometry(0.05, 0.15, 16);
        const rippleMat = new THREE.MeshBasicMaterial({
            color: 0xaaddff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        });
        const ripple = new THREE.Mesh(rippleGeo, rippleMat);
        ripple.position.copy(position);
        ripple.position.y = 0.02;
        ripple.rotation.x = -Math.PI / 2;
        this.scene.add(ripple);
        this.shockwaves.push({ mesh: ripple, life: 0.5, maxLife: 0.5 });
    }

    // Spawn floating damage number (using DOM overlay)
    spawnDamageNumber(screenX, screenY, text, type = 'player-dmg') {
        const el = document.createElement('div');
        el.className = `damage-number ${type}`;
        el.textContent = text;
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    // ============ Hit Spark Effect ============
    spawnHitEffect(position, isCritical = false) {
        if (!this.effectsEnabled || this._throttleEffect(false)) return;
        // Adaptive spark count
        let sparkCount = isCritical ? 24 : 12;
        const particleScale = this.perfMonitor.getParticleCount();
        sparkCount = Math.floor(sparkCount * particleScale);

        const colors = isCritical
            ? [0xff4040, 0xff8020, 0xffff40, 0xffaa00]
            : [0xffdd44, 0xffaa00, 0xff8800, 0xffffff];

        const segments = this.perfMonitor.getGeometrySegments();

        for (let i = 0; i < sparkCount; i++) {
            const geo = new THREE.SphereGeometry(isCritical ? 0.07 : 0.05, segments, segments);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.y += 0.8;

            // Radial burst velocity
            const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.3;
            const upAngle = Math.random() * Math.PI * 0.5;
            const speed = (isCritical ? 5 : 3) + Math.random() * 3;
            const velocity = new THREE.Vector3(
                Math.cos(angle) * Math.cos(upAngle) * speed,
                Math.sin(upAngle) * speed,
                Math.sin(angle) * Math.cos(upAngle) * speed
            );
            this.scene.add(mesh);
            this.hitEffects.push({
                mesh,
                velocity,
                life: 0.5 + Math.random() * 0.3,
                gravity: 9.8,
            });
        }
    }

    // ============ Death Burst ============
    spawnDeathBurst(position) {
        if (!this.effectsEnabled || this._throttleEffect(false)) return;
        // Adaptive burst count
        let burstCount = 20;
        const particleScale = this.perfMonitor.getParticleCount();
        burstCount = Math.floor(burstCount * particleScale);

        const colors = [0xff6b6b, 0xffaa00, 0xff4444, 0xdd0000];
        const segments = this.perfMonitor.getGeometrySegments();

        for (let i = 0; i < burstCount; i++) {
            const size = 0.05 + Math.random() * 0.08;
            const geo = new THREE.SphereGeometry(size, segments, segments);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.y += 1;

            const angle = (Math.PI * 2 * i) / burstCount;
            const upAngle = Math.random() * Math.PI * 0.4 + Math.PI * 0.2;
            const speed = 4 + Math.random() * 4;
            const velocity = new THREE.Vector3(
                Math.cos(angle) * Math.cos(upAngle) * speed,
                Math.sin(upAngle) * speed,
                Math.sin(angle) * Math.cos(upAngle) * speed
            );
            this.scene.add(mesh);
            this.deathEffects.push({
                mesh,
                velocity,
                life: 1.0 + Math.random() * 0.5,
                gravity: 9.8,
            });
        }
    }

    // ============ Spectacular RO-Style Effects ============

    // Iconic RO Level Up: Glowing ring expands while green sparkles rise in a pillar
    spawnLevelUpEffect(position) {
        if (!this.effectsEnabled) return;

        // 1. Multiple expanding rings (The "Halo")
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const mesh = new THREE.Mesh(
                    new THREE.RingGeometry(0.5, 0.7, 32),
                    new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
                );
                mesh.position.set(position.x, position.y + 0.1, position.z);
                mesh.rotation.x = -Math.PI / 2;
                this.scene.add(mesh);
                this.shockwaves.push({ mesh, life: 0.8, maxLife: 0.8, type: 'level-ring' });
            }, i * 200);
        }

        // 2. Rising Sparkle Pillar
        const sparkCount = 40;
        const seg = this.perfMonitor.getGeometrySegments();
        for (let i = 0; i < sparkCount; i++) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, seg, seg),
                new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 1.0 })
            );
            const angle = Math.random() * Math.PI * 2;
            const radius = 0.4 + Math.random() * 0.4;
            mesh.position.set(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 0.5,
                position.z + Math.sin(angle) * radius
            );
            const velocity = new THREE.Vector3(0, 3 + Math.random() * 3, 0);
            this.scene.add(mesh);
            this.hitEffects.push({
                mesh,
                velocity,
                life: 1.2 + Math.random() * 0.6,
                gravity: -1.0, // Rising gravity
            });
        }

        // 3. Central light pillar
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 1.2, 6, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        );
        pillar.position.set(position.x, position.y + 3, position.z);
        this.scene.add(pillar);
        this.shockwaves.push({ mesh: pillar, life: 1.0, maxLife: 1.0, type: 'pillar' });
    }

    // Spectacular Warp Effect: Blue light pillar + swirling particles
    spawnWarpEffect(position) {
        if (!this.effectsEnabled) return;

        // 1. Blue Pillar
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(1.0, 1.0, 8, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        pillar.position.set(position.x, position.y + 4, position.z);
        this.scene.add(pillar);
        this.shockwaves.push({ mesh: pillar, life: 0.8, maxLife: 0.8, type: 'pillar' });

        // 2. Swirling Particles
        const count = 30;
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 1.0 })
            );
            const angle = Math.random() * Math.PI * 2;
            const radius = 1.2;
            mesh.position.set(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 2,
                position.z + Math.sin(angle) * radius
            );
            // Spiral upward velocity
            const velocity = new THREE.Vector3(
                -Math.sin(angle) * 2,
                4 + Math.random() * 4,
                Math.cos(angle) * 2
            );
            this.scene.add(mesh);
            this.hitEffects.push({
                mesh,
                velocity,
                life: 0.8,
                gravity: -2.0,
            });
        }
    }

    // Enhanced Critical Hit: Screen shake + big red flash + radial sparks
    spawnEnhancedCritical(position) {
        if (!this.effectsEnabled) return;

        // 1. Big Flash Ring
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.1, 2.5, 32),
            new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        );
        ring.position.copy(position);
        ring.position.y += 0.8;
        if (this.camera) ring.lookAt(this.camera.position);
        this.scene.add(ring);
        this.shockwaves.push({ mesh: ring, life: 0.3, maxLife: 0.3, type: 'flash' });

        // 2. High-speed radial sparks
        this.spawnHitEffect(position, true);
    }

    // ============ Compatibility Methods ============
    createHitBurst(position) {
        this.spawnHitEffect(position, false);
    }

    createCriticalBurst(position) {
        this.spawnEnhancedCritical(position);
    }

    createExplosion(position, color) {
        if (!this.effectsEnabled) return;
        // Simple explosion using hit effect logic with custom color
        let sparkCount = 30;
        const particleScale = this.perfMonitor.getParticleCount();
        sparkCount = Math.floor(sparkCount * particleScale);

        let colorVal;
        if (typeof color === 'string') {
            colorVal = parseInt(color.replace('#', '0x'));
        } else if (typeof color === 'number') {
            colorVal = color;
        } else {
            colorVal = 0xff6600;
        }
        const segments = this.perfMonitor.getGeometrySegments();

        for (let i = 0; i < sparkCount; i++) {
            const geo = new THREE.SphereGeometry(0.12, segments, segments);
            const mat = new THREE.MeshBasicMaterial({
                color: colorVal,
                transparent: true,
                opacity: 1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.y += 0.5;

            const angle = Math.random() * Math.PI * 2;
            const upAngle = Math.random() * Math.PI;
            const speed = 4 + Math.random() * 6;
            const velocity = new THREE.Vector3(
                Math.cos(angle) * Math.sin(upAngle) * speed,
                Math.cos(upAngle) * speed,
                Math.sin(angle) * Math.sin(upAngle) * speed
            );
            this.scene.add(mesh);
            this.hitEffects.push({
                mesh,
                velocity,
                life: 0.8 + Math.random() * 0.4,
                gravity: 4.0,
            });
        }
    }

    createHealEffect(position) {
        if (!this.effectsEnabled) return;
        // Green sparkles rising up
        let sparkCount = 15;
        const particleScale = this.perfMonitor.getParticleCount();
        sparkCount = Math.floor(sparkCount * particleScale);

        const segments = this.perfMonitor.getGeometrySegments();

        for (let i = 0; i < sparkCount; i++) {
            const geo = new THREE.SphereGeometry(0.06, segments, segments);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x44ff44,
                transparent: true,
                opacity: 0.8,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.x += (Math.random() - 0.5) * 0.6;
            mesh.position.z += (Math.random() - 0.5) * 0.6;
            mesh.position.y += Math.random() * 0.5;

            const velocity = new THREE.Vector3(0, 1.5 + Math.random() * 1.5, 0);
            this.scene.add(mesh);
            this.hitEffects.push({
                mesh,
                velocity,
                life: 1.0 + Math.random() * 0.5,
                gravity: -0.5, // Float up
            });
        }
    }

    // ============ Skill FX primitives ============
    // Small composable pieces that reuse the existing hitEffects / shockwaves
    // update pools, so per-skill effects can be built dramatically but cheaply.
    _fxBurst(pos, color, count, speed, opts = {}) {
        if (!this.effectsEnabled) return;
        const n = Math.max(1, Math.floor(count * this.perfMonitor.getParticleCount()));
        const seg = this.perfMonitor.getGeometrySegments();
        const size = opts.size || 0.12;
        const yOff = opts.yOff != null ? opts.yOff : 0.5;
        for (let i = 0; i < n; i++) {
            let mesh;
            if (opts.useGlow) {
                const geo = new THREE.PlaneGeometry(size * 2, size * 2);
                const mat = new THREE.MeshBasicMaterial({
                    color,
                    map: this.textures.glowSpark,
                    transparent: true,
                    opacity: 1,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                mesh = new THREE.Mesh(geo, mat);
                if (this.camera) mesh.lookAt(this.camera.position);
            } else {
                mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(size, seg, seg),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
            }
            mesh.position.set(pos.x, pos.y + yOff, pos.z);
            const a = Math.random() * Math.PI * 2, up = Math.random() * Math.PI;
            const s = speed * (0.4 + Math.random() * 0.8);
            this.scene.add(mesh);
            this.hitEffects.push({
                mesh,
                velocity: new THREE.Vector3(Math.cos(a) * Math.sin(up) * s, Math.cos(up) * s + (opts.rise || 0), Math.sin(a) * Math.sin(up) * s),
                life: opts.life || 0.9,
                gravity: opts.gravity != null ? opts.gravity : 4,
            });
        }
    }

    _fxRing(pos, color, maxLife = 0.6, y = 0.06, r0 = 0.2, r1 = 0.6) {
        if (!this.effectsEnabled) return;
        const mesh = new THREE.Mesh(
            new THREE.RingGeometry(r0, r1, 32),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        mesh.position.set(pos.x, pos.y + y, pos.z);
        mesh.rotation.x = -Math.PI / 2;
        this.scene.add(mesh);
        this.shockwaves.push({ mesh, life: maxLife, maxLife, type: 'ripple' });
    }

    _fxPillar(pos, color, maxLife = 0.7, h = 3, r = 0.7) {
        if (!this.effectsEnabled) return;
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.35, r, h, 16, 1, true),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
        mesh.position.set(pos.x, pos.y + h / 2, pos.z);
        this.scene.add(mesh);
        this.shockwaves.push({ mesh, life: maxLife, maxLife, type: 'column' });
    }

    // A protective bubble that flashes and fades (no scaling) — for shield buffs.
    _fxDome(pos, color, r = 0.95, opacity = 0.28, maxLife = 0.6) {
        if (!this.effectsEnabled) return;
        const seg = Math.max(8, this.perfMonitor.getGeometrySegments() * 2);
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(r, seg, seg),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }));
        mesh.position.set(pos.x, pos.y + 1.0, pos.z);
        this.scene.add(mesh);
        this.shockwaves.push({ mesh, life: maxLife, maxLife, type: 'dot' });
    }

    // Projectiles / shards raining straight down onto an area.
    _fxRain(pos, color, count, radius = 3) {
        if (!this.effectsEnabled) return;
        const n = Math.max(1, Math.floor(count * this.perfMonitor.getParticleCount()));
        for (let i = 0; i < n; i++) {
            const mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
            const a = Math.random() * Math.PI * 2, rr = Math.random() * radius;
            mesh.position.set(pos.x + Math.cos(a) * rr, pos.y + 4 + Math.random() * 2.5, pos.z + Math.sin(a) * rr);
            this.scene.add(mesh);
            this.hitEffects.push({ mesh, velocity: new THREE.Vector3(0, -(9 + Math.random() * 5), 0), life: 0.7 + Math.random() * 0.3, gravity: -6 });
        }
    }

    // ============ Per-skill spectacular effect ============
    // Dispatched by skill id so each of the 12 skills has its own signature.
    spawnSkillEffect(skillId, origin, targetPos) {
        if (!this.effectsEnabled || !origin || this._throttleEffect(true)) return;
        const at = targetPos || origin;
        switch (skillId) {
            // --- Novice / shared ---
            case 'bash': {
                // Crescent blade trail
                const trailGeo = new THREE.RingGeometry(0.3, 1.0, 18, 1, 0, Math.PI * 0.9);
                const trailMat = new THREE.MeshBasicMaterial({
                    color: 0xffaa40,
                    map: this.textures.slashBlade,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(trailGeo, trailMat);
                mesh.position.copy(at);
                mesh.position.y += 0.8;
                mesh.rotation.y = Math.random() * Math.PI * 2;
                mesh.rotation.x = (Math.random() - 0.5) * 0.4;
                this.scene.add(mesh);
                this.slashes.push({ mesh, life: 0.25, maxLife: 0.25 });

                // Additive sparks
                this._fxBurst(at, 0xff7a30, 25, 7, { life: 0.7, size: 0.15, useGlow: true });
                break;
            }
            case 'heal': {
                // Ground magic circle
                const cGeo = new THREE.PlaneGeometry(1.6, 1.6);
                const cMat = new THREE.MeshBasicMaterial({
                    color: 0x40ff60,
                    map: this.textures.magicCircle,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const circle = new THREE.Mesh(cGeo, cMat);
                circle.position.copy(origin);
                circle.position.y = 0.05;
                circle.rotation.x = -Math.PI / 2;
                this.scene.add(circle);
                this.shockwaves.push({ mesh: circle, life: 1.2, maxLife: 1.2, type: 'magic-ring' });

                // Swirling particles
                const count = Math.floor(30 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const progress = i / count;
                    const angle = progress * Math.PI * 8;
                    const r = 0.6;
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.08, 4, 4),
                        new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    p.position.set(
                        origin.x + Math.cos(angle) * r,
                        origin.y + 0.1 + progress * 2.0,
                        origin.z + Math.sin(angle) * r
                    );
                    this.scene.add(p);
                    this.hitEffects.push({
                        mesh: p,
                        velocity: new THREE.Vector3(-Math.sin(angle) * 0.5, 1.4, Math.cos(angle) * 0.5),
                        life: 1.2,
                        gravity: -0.4
                    });
                }

                // Rising pillar
                this._fxPillar(origin, 0x66ff88, 1.0, 3.0, 0.8);
                break;
            }
            case 'magnumBreak': {
                // Expanding fire magic circle
                const cGeo = new THREE.PlaneGeometry(2.5, 2.5);
                const cMat = new THREE.MeshBasicMaterial({
                    color: 0xff5010,
                    map: this.textures.magicCircle,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const circle = new THREE.Mesh(cGeo, cMat);
                circle.position.copy(origin);
                circle.position.y = 0.05;
                circle.rotation.x = -Math.PI / 2;
                this.scene.add(circle);
                this.shockwaves.push({ mesh: circle, life: 1.5, maxLife: 1.5, type: 'magic-ring-expand' });

                // Massive radial spark explosion
                this._fxBurst(origin, 0xff3b00, 50, 11, { rise: 3, life: 1.0, size: 0.22, useGlow: true });
                this._fxRing(origin, 0xffaa00, 0.8, 0.06, 0.5, 6.0);
                this._fxPillar(origin, 0xff3a00, 1.2, 4.0, 1.5);
                break;
            }
            // --- Swordsman ---
            case 'endure': {
                // Custom wireframe shield dome
                const domeGeo = new THREE.SphereGeometry(1.0, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
                const domeMat = new THREE.MeshBasicMaterial({
                    color: 0x80c0ff,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.45,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                const dome = new THREE.Mesh(domeGeo, domeMat);
                dome.position.copy(origin);
                dome.position.y += 0.1;
                this.scene.add(dome);
                this.shockwaves.push({ mesh: dome, life: 1.5, maxLife: 1.5, type: 'endure-dome' });

                // Ring and sparkles
                this._fxRing(origin, 0xb0e0ff, 1.0, 0.06, 0.5, 1.8);
                this._fxBurst(origin, 0xd0f0ff, 20, 4, { rise: 2, gravity: -0.6, life: 1.2, size: 0.12, useGlow: true });
                break;
            }
            // --- Mage ---
            case 'fireBolt': {
                // Explosive burst using glowing plane sparks
                this._fxBurst(at, 0xff4f00, 45, 9, { life: 1.0, rise: 2, size: 0.25, useGlow: true });
                this._fxRing(at, 0xffaa00, 0.8, 0.06, 0.4, 2.5);
                this._fxPillar(at, 0xff5511, 1.0, 3.5, 0.8);
                break;
            }
            case 'frostNova': {
                // Ground frost circle
                this._fxRing(origin, 0x4aa0ff, 1.0, 0.05, 0.5, 5.0);
                this._fxRing(origin, 0xaaddff, 0.8, 0.05, 0.3, 3.5);

                // Exploding crystal shards
                const count = Math.floor(25 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const size = 0.08 + Math.random() * 0.12;
                    const geo = new THREE.OctahedronGeometry(size); // diamond geometry
                    const mat = new THREE.MeshBasicMaterial({
                        color: 0x88ccff,
                        transparent: true,
                        opacity: 0.9,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.copy(origin);
                    mesh.position.y += 0.5;

                    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
                    const speed = 4 + Math.random() * 5;
                    const velocity = new THREE.Vector3(Math.cos(angle) * speed, 0.5, Math.sin(angle) * speed);
                    this.scene.add(mesh);
                    this.hitEffects.push({ mesh, velocity, life: 0.9, gravity: 0.5 });
                }
                break;
            }
            case 'energyCoat': {
                // Purple force shield
                const geom = new THREE.SphereGeometry(1.0, 16, 16);
                const mate = new THREE.MeshBasicMaterial({
                    color: 0xa040ff,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.35,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide
                });
                const dome = new THREE.Mesh(geom, mate);
                dome.position.copy(origin);
                dome.position.y += 1.0;
                this.scene.add(dome);
                this.shockwaves.push({ mesh: dome, life: 1.5, maxLife: 1.5, type: 'endure-dome' });

                // Orbiting sparks
                const count = Math.floor(18 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.08, 4, 4),
                        new THREE.MeshBasicMaterial({ color: 0xd066ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    const angle = Math.random() * Math.PI * 2;
                    p.position.set(origin.x + Math.cos(angle) * 1.0, origin.y + 1.0 + (Math.random() - 0.5) * 0.8, origin.z + Math.sin(angle) * 1.0);
                    this.scene.add(p);
                    this.hitEffects.push({
                        mesh: p,
                        velocity: new THREE.Vector3(-Math.sin(angle) * 1.5, 0, Math.cos(angle) * 1.5),
                        life: 1.2,
                        gravity: 0
                    });
                }
                break;
            }
            // --- Archer ---
            case 'doubleStrafe': {
                this._fxBurst(at, 0xbfff40, 20, 8, { life: 0.6, size: 0.16, useGlow: true });
                this._fxBurst(at, 0xe0ff70, 20, 9, { life: 0.6, yOff: 0.9, size: 0.14, useGlow: true });
                this._fxRing(at, 0x88ff30, 0.5, 0.4, 0.2, 1.2);
                break;
            }
            case 'arrowShower': {
                // Highlighting target circle on ground
                this._fxRing(origin, 0x76ff60, 1.5, 0.05, 0.3, 5.0);

                // Rain arrows vertical cylinders
                const count = Math.floor(40 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const arrow = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4),
                        new THREE.MeshBasicMaterial({ color: 0xaaff50, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    const aAngle = Math.random() * Math.PI * 2;
                    const rDist = Math.random() * 4.5;
                    arrow.position.set(origin.x + Math.cos(aAngle) * rDist, origin.y + 6.0 + Math.random() * 3.5, origin.z + Math.sin(aAngle) * rDist);
                    arrow.rotation.x = Math.PI; // point down
                    this.scene.add(arrow);
                    this.hitEffects.push({
                        mesh: arrow,
                        velocity: new THREE.Vector3(0, -(12 + Math.random() * 6), 0),
                        life: 0.8,
                        gravity: -4
                    });
                }
                break;
            }
            case 'concentration': {
                // Converging ring at character
                this._fxRing(origin, 0xffd24a, 0.8, 0.05, 2.0, 0.4);

                // Imploding/converging sparks
                const count = Math.floor(25 * this.perfMonitor.getParticleCount());
                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = 2.2;
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.08, 4, 4),
                        new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
                    );
                    p.position.set(origin.x + Math.cos(angle) * r, origin.y + 0.1 + Math.random() * 1.8, origin.z + Math.sin(angle) * r);
                    this.scene.add(p);

                    // Directing velocity towards character center
                    this.hitEffects.push({
                        mesh: p,
                        velocity: new THREE.Vector3(-Math.cos(angle) * 2.2, 0.2, -Math.sin(angle) * 2.2),
                        life: 1.0,
                        gravity: 0
                    });
                }

                this._fxPillar(origin, 0xffd24a, 1.0, 3.2, 0.8);
                break;
            }
            // --- Priest ---
            case 'holyLight': {
                // Sacred sky light strike
                const rayGeo = new THREE.CylinderGeometry(0.1, 0.6, 15, 8, 1, true);
                const rayMat = new THREE.MeshBasicMaterial({
                    color: 0xfffca0,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const ray = new THREE.Mesh(rayGeo, rayMat);
                ray.position.copy(at);
                ray.position.y += 7.5;
                this.scene.add(ray);
                this.shockwaves.push({ mesh: ray, life: 0.6, maxLife: 0.6, type: 'pillar' });

                // Holy ground flash
                this._fxRing(at, 0xfff0aa, 0.6, 0.05, 0.4, 3.0);
                this._fxBurst(at, 0xffffff, 30, 6, { rise: 2, gravity: 0.5, life: 0.9, size: 0.15, useGlow: true });
                break;
            }
            case 'blessing': {
                // Glowing golden cross
                const group = new THREE.Group();
                const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffdf60, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
                const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffdf60, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
                hBar.position.y = 0.2;
                group.add(vBar); group.add(hBar);
                group.position.copy(origin);
                group.position.y += 1.0;
                this.scene.add(group);
                this.hitEffects.push({ mesh: group, velocity: new THREE.Vector3(0, 1.2, 0), gravity: -0.2, life: 1.4, maxLife: 1.4 });

                // Holy halos
                this._fxRing(origin, 0xffea70, 0.9, 0.05, 0.3, 1.6);
                this._fxPillar(origin, 0xfff590, 1.2, 4.0, 1.0);
                break;
            }
            default:
                this._fxBurst(at, 0xffffff, 20, 6, { life: 0.7 });
        }
    }

    createClickIndicator(position, color = 0xffffff) {
        // Step 11: Three layered effects for click-to-move indicator

        // Effect 1 — Expanding Ripple
        const rippleGeo = new THREE.RingGeometry(0.02, 0.08, 16);
        const rippleMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });
        const ripple = new THREE.Mesh(rippleGeo, rippleMat);
        ripple.position.copy(position);
        ripple.position.y = 0.05;
        ripple.rotation.x = -Math.PI / 2;
        this.scene.add(ripple);
        this.shockwaves.push({
            mesh: ripple,
            life: 0.4,
            maxLife: 0.4,
            type: 'ripple'
        });

        // Effect 2 — Glowing Column (CylinderGeometry used as an open-ended cone)
        const columnGeo = new THREE.CylinderGeometry(0.01, 0.15, 0.4, 8, 1, true);
        const columnMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const column = new THREE.Mesh(columnGeo, columnMat);
        column.position.copy(position);
        column.position.y = 0.25;
        this.scene.add(column);
        this.shockwaves.push({
            mesh: column,
            life: 0.6,
            maxLife: 0.6,
            type: 'column'
        });

        // Effect 3 — Central Dot
        const dotGeo = new THREE.CircleGeometry(0.05, 8);
        const dotMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(position);
        dot.position.y = 0.06;
        dot.rotation.x = -Math.PI / 2;
        this.scene.add(dot);
        this.shockwaves.push({
            mesh: dot,
            life: 0.8,
            maxLife: 0.8,
            type: 'dot'
        });
    }

    // ============ Projectile System ============
    spawnArrow(startPos, targetMonster, onHit) {
        // Create arrow mesh
        const arrowGroup = new THREE.Group();

        // Arrow shaft
        const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5);
        const shaftMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.rotation.x = Math.PI / 2;
        arrowGroup.add(shaft);

        // Arrow head
        const headGeo = new THREE.ConeGeometry(0.04, 0.12, 5);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.z = 0.3;
        head.rotation.x = Math.PI / 2;
        arrowGroup.add(head);

        // Fletching (feathers)
        const featherGeo = new THREE.PlaneGeometry(0.1, 0.15);
        const featherMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });

        const f1 = new THREE.Mesh(featherGeo, featherMat);
        f1.position.z = -0.25;
        f1.position.y = 0.05;
        arrowGroup.add(f1);

        const f2 = f1.clone();
        f2.rotation.z = Math.PI / 2;
        f2.position.y = 0;
        f2.position.x = 0.05;
        arrowGroup.add(f2);

        arrowGroup.position.copy(startPos);
        arrowGroup.position.y += 1.0; // Shoot from chest height
        this.scene.add(arrowGroup);

        this.projectiles.push({
            mesh: arrowGroup,
            target: targetMonster,
            speed: 25,
            onHit: onHit,
            life: 2.0 // Max life in seconds
        });
    }

    // ============ Lightning Bolt (Mage) ============
    spawnLightningBolt(startPos, targetMonster, onHit) {
        const targetPos = targetMonster.getPosition();
        const distance = startPos.distanceTo(targetPos);

        // A vertical beam that strikes from the sky onto the target
        const group = new THREE.Group();

        // Main core beam
        const coreGeo = new THREE.CylinderGeometry(0.05, 0.15, 12, 6);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        group.add(core);

        // Outer glow
        const glowGeo = new THREE.CylinderGeometry(0.2, 0.4, 12, 6);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        group.add(glow);

        // Position at target, but strike from above
        group.position.copy(targetPos);
        group.position.y += 6; // Half height of 12
        this.scene.add(group);

        // Strike flash at impact point
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.8 })
        );
        flash.position.copy(targetPos);
        flash.position.y += 0.5;
        this.scene.add(flash);

        // Add to hit effects for automatic fade and removal
        this.hitEffects.push({ mesh: group, velocity: new THREE.Vector3(0, 0, 0), gravity: 0, life: 0.15, maxLife: 0.15 });
        this.hitEffects.push({ mesh: flash, velocity: new THREE.Vector3(0, 0, 0), gravity: 0, life: 0.2, maxLife: 0.2 });

        // Ground ripple
        const rippleGeo = new THREE.RingGeometry(0.1, 1.2, 16);
        const rippleMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ripple = new THREE.Mesh(rippleGeo, rippleMat);
        ripple.rotation.x = -Math.PI / 2;
        ripple.position.copy(targetPos);
        ripple.position.y = 0.05;
        this.scene.add(ripple);
        this.shockwaves.push({ mesh: ripple, type: 'ripple', life: 0.4, maxLife: 0.4 });

        // Resolve damage immediately
        if (onHit) onHit();
    }

    // ============ Shadow Slash (Thief) ============
    spawnShadowSlash(startPos, targetMonster, onHit) {
        const targetPos = targetMonster.getPosition();

        // A fast purple shadow arc at the target's position
        const arcGeo = new THREE.TorusGeometry(0.8, 0.05, 8, 24, Math.PI * 0.8);
        const arcMat = new THREE.MeshBasicMaterial({ color: 0x8800ff, transparent: true, opacity: 0.9 });
        const arc = new THREE.Mesh(arcGeo, arcMat);

        arc.position.copy(targetPos);
        arc.position.y += 0.8;
        arc.rotation.y = Math.random() * Math.PI * 2;
        arc.rotation.x = Math.random() * Math.PI * 0.5;
        this.scene.add(arc);

        // Shadow particles
        this._fxBurst(targetPos, 0x440088, 12, 4, { life: 0.4, yOff: 0.8 });

        // Add to hit effects for automatic fade and removal
        this.hitEffects.push({ mesh: arc, velocity: new THREE.Vector3(0, 0, 0), gravity: 0, life: 0.2, maxLife: 0.2 });

        if (onHit) onHit();
    }

    // ============ Holy Orb (Acolyte) ============
    spawnHolyOrb(startPos, targetMonster, onHit) {
        const group = new THREE.Group();

        // Golden orb
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffaa })
        );
        group.add(orb);

        // Holy glow
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.4 })
        );
        group.add(glow);

        group.position.copy(startPos);
        group.position.y += 1.2;
        this.scene.add(group);

        this.projectiles.push({
            mesh: group,
            target: targetMonster,
            speed: 18,
            onHit: () => {
                this._fxBurst(targetMonster.getPosition(), 0xffff88, 15, 5, { life: 0.5, yOff: 0.8 });
                this._fxRing(targetMonster.getPosition(), 0xfff0a0, 0.4, 0.06, 0.1, 0.8);
                if (onHit) onHit();
            },
            life: 2.0
        });
    }

    // ============ Bullet Projectile (Gun) ============
    spawnBullet(startPos, targetMonster, onHit) {
        const group = new THREE.Group();

        // Glowing slug
        const slug = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xfff2a0 })
        );
        group.add(slug);

        // Soft glow halo
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.4, depthWrite: false })
        );
        group.add(halo);

        // Short tracer tail
        const tracer = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.005, 0.5, 5),
            new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.7, depthWrite: false })
        );
        tracer.rotation.x = Math.PI / 2;
        tracer.position.z = -0.28;
        group.add(tracer);

        group.position.copy(startPos);
        group.position.y += 1.0; // muzzle at chest height
        this.scene.add(group);

        // Muzzle flash at the barrel
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, depthWrite: false })
        );
        flash.position.copy(group.position);
        this.scene.add(flash);
        this.hitEffects.push({ mesh: flash, velocity: new THREE.Vector3(0, 0, 0), gravity: 0, life: 0.12 });

        this.projectiles.push({
            mesh: group,
            target: targetMonster,
            speed: 55, // bullets are much faster than arrows
            onHit: onHit,
            life: 1.5
        });
    }

    // ============ Sword Slash Arc (Melee) ============
    spawnSlash(position, isCritical = false) {
        if (!this.effectsEnabled || this._throttleEffect(false)) return;
        // Crescent arc that flashes across the target and fades quickly
        const inner = isCritical ? 0.45 : 0.35;
        const outer = isCritical ? 1.15 : 0.9;
        const geo = new THREE.RingGeometry(inner, outer, 20, 1, 0, Math.PI * 0.85);
        const mat = new THREE.MeshBasicMaterial({
            color: isCritical ? 0xffe060 : 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const slash = new THREE.Mesh(geo, mat);
        slash.position.copy(position);
        slash.position.y += 0.9;
        // Random diagonal orientation for variety
        const tilt = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 4) + (Math.random() - 0.5) * 0.5;
        // Billboard toward the camera, then apply the diagonal tilt
        if (this.camera) slash.lookAt(this.camera.position);
        slash.rotateZ(tilt);
        this.scene.add(slash);
        this.slashes.push({
            mesh: slash,
            life: 0.2,
            maxLife: 0.2,
        });
    }

    // ============ Update ============
    update(deltaTime) {
        // Per-frame FPS estimate (EMA) that drives effect throttling. Guard
        // against huge dt from a backgrounded tab so one hitch doesn't nuke
        // effects; sustained low FPS is caught within ~1s.
        if (deltaTime > 0 && deltaTime < 0.5) {
            this._fps += (1 / deltaTime - this._fps) * 0.08;
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= deltaTime;

            if (p.life <= 0 || !p.target || !p.target.alive) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }

            const targetPos = p.target.getPosition();
            targetPos.y += 0.8; // Aim for center of monster

            const direction = new THREE.Vector3().subVectors(targetPos, p.mesh.position).normalize();
            const distance = p.mesh.position.distanceTo(targetPos);
            const moveStep = p.speed * deltaTime;

            if (distance <= moveStep) {
                // Hit!
                if (p.onHit) p.onHit();
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            } else {
                p.mesh.position.add(direction.multiplyScalar(moveStep));
                p.mesh.lookAt(targetPos);
            }
        }

        // Update splash effects
        for (let i = this.splashEffects.length - 1; i >= 0; i--) {
            const effect = this.splashEffects[i];
            // Avoid velocity.clone() allocation every frame
            effect.mesh.position.x += effect.velocity.x * deltaTime;
            effect.mesh.position.y += effect.velocity.y * deltaTime;
            effect.mesh.position.z += effect.velocity.z * deltaTime;
            effect.velocity.y -= 9.8 * deltaTime;
            effect.life -= deltaTime;
            effect.mesh.material.opacity = Math.max(0, effect.life / (0.6 + 0.2));

            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                this.splashEffects.splice(i, 1);
            }
        }

        // Update shockwaves (and layered click indicators)
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const wave = this.shockwaves[i];
            const progress = 1 - wave.life / wave.maxLife;

            if (wave.type === 'ripple') {
                wave.mesh.scale.set(1 + progress * 3, 1, 1 + progress * 3);
                wave.mesh.material.opacity = 0.8 * (1 - progress);
            } else if (wave.type === 'column') {
                wave.mesh.scale.set(1 + progress * 0.5, 1, 1 + progress * 0.5);
                wave.mesh.material.opacity = 0.5 * (1 - progress);
            } else if (wave.type === 'dot') {
                wave.mesh.material.opacity = 1.0 * (1 - progress);
            } else if (wave.type === 'level-ring') {
                wave.mesh.scale.set(1 + progress * 4, 1 + progress * 4, 1);
                wave.mesh.material.opacity = 0.8 * (1 - progress);
            } else if (wave.type === 'pillar') {
                wave.mesh.scale.set(1 - progress * 0.5, 1, 1 - progress * 0.5);
                wave.mesh.material.opacity = 0.4 * (1 - progress);
            } else if (wave.type === 'flash') {
                wave.mesh.scale.set(0.1 + progress * 2, 0.1 + progress * 2, 1);
                wave.mesh.material.opacity = 0.6 * (1 - progress);
            } else if (wave.type === 'endure-dome') {
                // Bubble remains same size, rotates and fades out
                wave.mesh.rotation.y += deltaTime * 2.0;
                wave.mesh.material.opacity = 0.45 * (1 - progress);
            } else if (wave.type === 'magic-ring') {
                // Rotates the plane circle
                wave.mesh.rotation.z += deltaTime * 1.5;
                wave.mesh.material.opacity = 0.9 * (1 - progress);
            } else if (wave.type === 'magic-ring-expand') {
                // Rotates and scales up
                wave.mesh.rotation.z -= deltaTime * 1.0;
                wave.mesh.scale.set(1 + progress * 2, 1 + progress * 2, 1);
                wave.mesh.material.opacity = 0.9 * (1 - progress);
            } else {
                // Generic shockwave behavior
                wave.mesh.scale.set(1 + progress * 2, 1, 1 + progress * 2);
                wave.mesh.material.opacity = 0.6 * (1 - progress);
            }

            wave.life -= deltaTime;

            if (wave.life <= 0) {
                this.scene.remove(wave.mesh);
                this.shockwaves.splice(i, 1);
            }
        }

        // Update hit effects
        for (let i = this.hitEffects.length - 1; i >= 0; i--) {
            const effect = this.hitEffects[i];
            effect.velocity.y -= effect.gravity * deltaTime;
            // Avoid velocity.clone() allocation every frame
            effect.mesh.position.x += effect.velocity.x * deltaTime;
            effect.mesh.position.y += effect.velocity.y * deltaTime;
            effect.mesh.position.z += effect.velocity.z * deltaTime;
            effect.life -= deltaTime;

            // Fix: Group objects don't have a direct material property
            if (effect.mesh.material) {
                effect.mesh.material.opacity = Math.max(0, effect.life / (effect.maxLife || 0.8));
            } else {
                // If it's a group, traverse and update children's opacity
                effect.mesh.traverse(child => {
                    if (child.material) {
                        child.material.opacity = Math.max(0, effect.life / (effect.maxLife || 0.8));
                    }
                });
            }

            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                this.hitEffects.splice(i, 1);
            }
        }

        // Update death effects
        for (let i = this.deathEffects.length - 1; i >= 0; i--) {
            const effect = this.deathEffects[i];
            effect.velocity.y -= effect.gravity * deltaTime;
            // Avoid velocity.clone() allocation every frame
            effect.mesh.position.x += effect.velocity.x * deltaTime;
            effect.mesh.position.y += effect.velocity.y * deltaTime;
            effect.mesh.position.z += effect.velocity.z * deltaTime;
            effect.life -= deltaTime;

            if (effect.mesh.material) {
                effect.mesh.material.opacity = Math.max(0, effect.life / (effect.maxLife || 1.5));
            } else {
                effect.mesh.traverse(child => {
                    if (child.material) {
                        child.material.opacity = Math.max(0, effect.life / (effect.maxLife || 1.5));
                    }
                });
            }

            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                this.deathEffects.splice(i, 1);
            }
        }

        // Update sword slashes (quick expand + fade, billboarded to camera)
        for (let i = this.slashes.length - 1; i >= 0; i--) {
            const s = this.slashes[i];
            s.life -= deltaTime;
            const progress = 1 - s.life / s.maxLife;
            const scale = 0.7 + progress * 0.8;
            s.mesh.scale.set(scale, scale, scale);
            s.mesh.material.opacity = Math.max(0, 0.9 * (1 - progress));
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                this.slashes.splice(i, 1);
            }
        }

        // Update splash cooldown
        if (this.splashCooldown > 0) {
            this.splashCooldown -= deltaTime;
        }
    }

    // ============ Performance Control ============
    setQuality(quality) {
        this.perfMonitor.setQuality(quality);
    }

    getQuality() {
        return this.perfMonitor.quality;
    }

    isLowEndDevice() {
        return this.perfMonitor.isLowEndDevice;
    }
}
