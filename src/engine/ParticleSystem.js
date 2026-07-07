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
        this.projectiles = [];
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

    // ============ Compatibility Methods ============
    createHitBurst(position) {
        this.spawnHitEffect(position, false);
    }

    createCriticalBurst(position) {
        this.spawnHitEffect(position, true);
    }

    createExplosion(position, color) {
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
