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
        this.particles = [];
        this.deathEffects = [];
        this.hitEffects = [];
        this.shockwaves = [];
        this.splashEffects = [];
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

    // ============ Update ============
    update(deltaTime) {
        // Update splash effects
        for (let i = this.splashEffects.length - 1; i >= 0; i--) {
            const effect = this.splashEffects[i];
            effect.mesh.position.add(effect.velocity.clone().multiplyScalar(deltaTime));
            effect.velocity.y -= 9.8 * deltaTime;
            effect.life -= deltaTime;
            effect.mesh.material.opacity = Math.max(0, effect.life / (0.6 + 0.2));

            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                this.splashEffects.splice(i, 1);
            }
        }

        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const wave = this.shockwaves[i];
            const progress = 1 - wave.life / wave.maxLife;
            wave.mesh.scale.set(1 + progress * 2, 1, 1 + progress * 2);
            wave.mesh.material.opacity = 0.6 * (1 - progress);
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
            effect.mesh.position.add(effect.velocity.clone().multiplyScalar(deltaTime));
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
            effect.mesh.position.add(effect.velocity.clone().multiplyScalar(deltaTime));
            effect.life -= deltaTime;
            effect.mesh.material.opacity = Math.max(0, effect.life / 1.5);

            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                this.deathEffects.splice(i, 1);
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
