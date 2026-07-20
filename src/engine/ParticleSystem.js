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
        if (!this.effectsEnabled) return;
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
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(size, seg, seg),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
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
        if (!this.effectsEnabled || !origin) return;
        const at = targetPos || origin;
        switch (skillId) {
            // --- Novice / shared ---
            case 'bash':
                this._fxBurst(at, 0xff7a30, 22, 6, { life: 0.6 });
                this._fxRing(at, 0xffb060, 0.4, 0.06, 0.2, 0.9);
                break;
            case 'heal':
                this._fxBurst(origin, 0x66ff88, 22, 2, { rise: 3, gravity: -1, life: 1.1, size: 0.08 });
                this._fxRing(origin, 0x8effa0, 0.7, 0.06, 0.2, 1.1);
                this._fxPillar(origin, 0x66ff88, 0.7, 2.6, 0.7);
                break;
            case 'magnumBreak':
                this._fxBurst(origin, 0xff4010, 40, 9, { rise: 2, life: 0.9 });
                this._fxRing(origin, 0xff6020, 0.7, 0.06, 0.4, 5.5);
                this._fxPillar(origin, 0xff5020, 0.6, 3.6, 1.3);
                break;
            // --- Swordsman ---
            case 'endure':
                this._fxDome(origin, 0xbcd0ff, 0.95, 0.3, 0.7);
                this._fxRing(origin, 0xcfe0ff, 0.7, 0.06, 0.3, 1.3);
                this._fxBurst(origin, 0xdfe8ff, 14, 3, { rise: 2, gravity: -1, life: 0.9, size: 0.08 });
                break;
            // --- Mage ---
            case 'fireBolt':
                this._fxBurst(at, 0xff6020, 30, 7, { life: 0.8, rise: 1 });
                this._fxRing(at, 0xffa040, 0.5, 0.5, 0.2, 1.2);
                this._fxPillar(at, 0xff7020, 0.5, 2.2, 0.5);
                break;
            case 'frostNova':
                this._fxBurst(origin, 0x9fe8ff, 36, 8, { rise: 1, life: 0.9, size: 0.14 });
                this._fxRing(origin, 0x66d0ff, 0.8, 0.06, 0.4, 6);
                this._fxRing(origin, 0xffffff, 0.6, 0.06, 0.3, 4);
                break;
            case 'energyCoat':
                this._fxDome(origin, 0xa070ff, 0.95, 0.3, 0.7);
                this._fxBurst(origin, 0xb890ff, 20, 3, { rise: 2.5, gravity: -1.2, life: 1.1, size: 0.09 });
                this._fxRing(origin, 0x9060ff, 0.7, 0.06, 0.3, 1.3);
                break;
            // --- Archer ---
            case 'doubleStrafe':
                this._fxBurst(at, 0x9dff70, 16, 6, { life: 0.5 });
                this._fxBurst(at, 0xd8ffb0, 16, 7, { life: 0.5, yOff: 0.8 });
                this._fxRing(at, 0xa0ff60, 0.4, 0.5, 0.2, 0.8);
                break;
            case 'arrowShower':
                this._fxRain(origin, 0xc8ff90, 40, 5.5);
                this._fxRing(origin, 0xa0ff60, 0.8, 0.06, 0.4, 5.5);
                break;
            case 'concentration':
                this._fxRing(origin, 0xffd24a, 0.8, 0.06, 1.6, 0.2); // ring converging inward look
                this._fxBurst(origin, 0xffe27a, 22, 3, { rise: 2.5, gravity: -1.2, life: 1.0, size: 0.09 });
                this._fxPillar(origin, 0xffd24a, 0.7, 2.8, 0.7);
                break;
            // --- Priest ---
            case 'holyLight':
                this._fxPillar(at, 0xfff2a0, 0.8, 4.5, 1.0);
                this._fxBurst(at, 0xffffc0, 30, 6, { rise: 2, gravity: 1, life: 0.9, size: 0.1 });
                this._fxRing(at, 0xfff0a0, 0.6, 0.06, 0.3, 1.6);
                break;
            case 'blessing':
                this._fxBurst(origin, 0xfff0a0, 26, 3, { rise: 3, gravity: -1.2, life: 1.2, size: 0.09 });
                this._fxRing(origin, 0xffe98a, 0.8, 0.06, 0.3, 1.4);
                this._fxPillar(origin, 0xfff2b0, 0.7, 3.2, 0.7);
                break;
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
            effect.mesh.material.opacity = Math.max(0, effect.life / 0.8);

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
            effect.mesh.material.opacity = Math.max(0, effect.life / 1.5);

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
