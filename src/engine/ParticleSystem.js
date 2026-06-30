// Particle System — Damage numbers, effects
import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.deathEffects = [];
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

    // Death burst effect (3D particles)
    spawnDeathEffect(position, color) {
        const count = 15;
        const particles = [];

        for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(0.08, 4, 4);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 1
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(position);
            mesh.position.y += 0.5;

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 4 + 2,
                (Math.random() - 0.5) * 4
            );

            this.scene.add(mesh);
            particles.push({ mesh, velocity, life: 1 });
        }

        this.deathEffects.push(...particles);
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
        // Update 3D particles
        for (let i = this.deathEffects.length - 1; i >= 0; i--) {
            const p = this.deathEffects[i];
            p.life -= dt * 1.5;
            p.velocity.y -= 9.8 * dt;
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.material.opacity = Math.max(0, p.life);
            p.mesh.scale.setScalar(p.life);

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.deathEffects.splice(i, 1);
            }
        }
    }
}
