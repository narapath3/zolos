// Particle System — Damage numbers, hit effects, death bursts
import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.deathEffects = [];
        this.hitEffects = [];
        this.shockwaves = [];
        this.splashEffects = [];
        this.splashCooldown = 0;
    }

    // ============ Water Splash Effect ============
    spawnWaterSplash(position) {
        // Rate limit splashes
        if (this.splashCooldown > 0) return;
        this.splashCooldown = 0.15; // max ~6 splashes/sec

        const dropCount = 8;
        const colors = [0x6ec6ff, 0xaae0ff, 0xffffff, 0x4aa8d8];

        for (let i = 0; i < dropCount; i++) {
            const size = 0.03 + Math.random() * 0.04;
            const geo = new THREE.SphereGeometry(size, 4, 4);
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
        const sparkCount = isCritical ? 24 : 12;
        const colors = isCritical
            ? [0xff4040, 0xff8020, 0xffff40, 0xffaa00]
            : [0xffdd44, 0xffaa00, 0xff8800, 0xffffff];

        for (let i = 0; i < sparkCount; i++) {
            const geo = new THREE.SphereGeometry(isCritical ? 0.07 : 0.05, 4, 4);
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
                Math.sin(upAngle) * speed * 0.8 + 1,
                Math.sin(angle) * Math.cos(upAngle) * speed
            );

            this.scene.add(mesh);
            this.hitEffects.push({ mesh, velocity, life: isCritical ? 0.6 : 0.4 });
        }

        // Bright flash point light at hit position
        const flashLight = new THREE.PointLight(
            isCritical ? 0xff4040 : 0xffdd44,
            isCritical ? 4 : 2,
            8
        );
        flashLight.position.copy(position);
        flashLight.position.y += 1;
        this.scene.add(flashLight);
        this.hitEffects.push({
            mesh: flashLight,
            velocity: new THREE.Vector3(0, 0, 0),
            life: 0.15,
            isLight: true,
            initialIntensity: flashLight.intensity,
        });

        // Shockwave ring for critical
        if (isCritical) {
            this._spawnShockwave(position);
            this._spawnCriticalFlash();
        }
    }

    // ============ Shockwave Ring ============
    _spawnShockwave(position) {
        const geo = new THREE.RingGeometry(0.1, 0.3, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff6040,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(position);
        ring.position.y += 0.5;
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);
        this.shockwaves.push({ mesh: ring, life: 0.5, maxLife: 0.5 });
    }

    // ============ Critical Screen Flash ============
    _spawnCriticalFlash() {
        const flash = document.createElement('div');
        flash.className = 'critical-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }

    // Death burst effect (3D particles) — enhanced
    spawnDeathEffect(position, color) {
        const count = 25;
        const colors = [color, 0xffffff, 0xffdd44];

        for (let i = 0; i < count; i++) {
            const size = 0.05 + Math.random() * 0.08;
            const geo = new THREE.SphereGeometry(size, 4, 4);
            const c = colors[Math.floor(Math.random() * colors.length)];
            const mat = new THREE.MeshBasicMaterial({
                color: c,
                transparent: true,
                opacity: 1
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.y += 0.5;

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                Math.random() * 5 + 2,
                (Math.random() - 0.5) * 6
            );

            this.scene.add(mesh);
            this.deathEffects.push({ mesh, velocity, life: 1.2 });
        }

        // Death flash light
        const flashLight = new THREE.PointLight(color, 3, 10);
        flashLight.position.copy(position);
        flashLight.position.y += 1;
        this.scene.add(flashLight);
        this.hitEffects.push({
            mesh: flashLight,
            velocity: new THREE.Vector3(0, 0, 0),
            life: 0.3,
            isLight: true,
            initialIntensity: 3,
        });
    }

    // Level-up screen effect
    showLevelUpEffect(level) {
        const overlay = document.createElement('div');
        overlay.className = 'levelup-overlay';
        overlay.innerHTML = `<div class="levelup-text">⚔️ LEVEL UP! Lv.${level} ⚔️</div>`;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), 2000);
    }

    update(dt) {
        // Splash cooldown
        if (this.splashCooldown > 0) this.splashCooldown -= dt;

        // Update death particles
        for (let i = this.deathEffects.length - 1; i >= 0; i--) {
            const p = this.deathEffects[i];
            p.life -= dt * 1.5;
            p.velocity.y -= 9.8 * dt;
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.material.opacity = Math.max(0, p.life);
            p.mesh.scale.setScalar(Math.max(0.01, p.life));

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.deathEffects.splice(i, 1);
            }
        }

        // Update hit sparks & flash lights
        for (let i = this.hitEffects.length - 1; i >= 0; i--) {
            const p = this.hitEffects[i];
            p.life -= dt;

            if (p.isLight) {
                p.mesh.intensity = p.initialIntensity * Math.max(0, p.life / 0.15);
            } else {
                p.velocity.y -= 12 * dt;
                p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
                p.mesh.material.opacity = Math.max(0, p.life * 2);
                p.mesh.scale.setScalar(Math.max(0.01, p.life));
            }

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                if (!p.isLight) {
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                }
                this.hitEffects.splice(i, 1);
            }
        }

        // Update shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const s = this.shockwaves[i];
            s.life -= dt;
            const progress = 1 - (s.life / s.maxLife);
            const scale = 1 + progress * 8;
            s.mesh.scale.setScalar(scale);
            s.mesh.material.opacity = Math.max(0, 0.8 * (1 - progress));

            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                s.mesh.geometry.dispose();
                s.mesh.material.dispose();
                this.shockwaves.splice(i, 1);
            }
        }

        // Update water splash droplets
        for (let i = this.splashEffects.length - 1; i >= 0; i--) {
            const p = this.splashEffects[i];
            p.life -= dt;
            p.velocity.y -= 9.8 * dt; // gravity
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.material.opacity = Math.max(0, p.life * 1.4);
            p.mesh.scale.setScalar(Math.max(0.01, p.life * 0.8));

            if (p.life <= 0 || p.mesh.position.y < -0.5) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.splashEffects.splice(i, 1);
            }
        }
    }
}
