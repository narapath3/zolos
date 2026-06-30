// Monster Manager — Monster spawning, AI, and management
import * as THREE from 'three';
import { MONSTERS, pickRandomMonster } from './GameData.js';

const MAX_MONSTERS = 12;
const SPAWN_RANGE = 12;
const RESPAWN_TIME = 3;

// Seeded PRNG (mulberry32) — ensures all clients spawn monsters at the same positions
function createSeededRng(seed) {
    let s = seed | 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Daily seed — same UTC date = same monster layout for all players
function getDailySeed() {
    const d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

class Monster {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type;
        this.data = MONSTERS[type];
        this.hp = this.data.hp;
        this.maxHp = this.data.hp;
        this.alive = true;
        this.respawnTimer = 0;
        this.animTimer = Math.random() * Math.PI * 2;
        this.wanderTarget = null;
        this.wanderTimer = 0;
        this.hitFlash = 0;

        this._createModel(position);
    }

    _createModel(position) {
        this.mesh = new THREE.Group();

        // Main body (slime-like shape)
        const bodyGeo = new THREE.SphereGeometry(this.data.size * 0.5, 8, 6);
        const bodyMat = new THREE.MeshLambertMaterial({ color: this.data.color });
        this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.bodyMesh.position.y = this.data.size * 0.4;
        this.bodyMesh.castShadow = true;
        this.mesh.add(this.bodyMesh);

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeWhiteGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const eyeL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        eyeL.position.set(-0.12, this.data.size * 0.5, this.data.size * 0.35);
        this.mesh.add(eyeL);
        const pupilL = new THREE.Mesh(eyeGeo, eyeMat);
        pupilL.position.set(0, 0, 0.06);
        eyeL.add(pupilL);

        const eyeR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        eyeR.position.set(0.12, this.data.size * 0.5, this.data.size * 0.35);
        this.mesh.add(eyeR);
        const pupilR = new THREE.Mesh(eyeGeo, eyeMat);
        pupilR.position.set(0, 0, 0.06);
        eyeR.add(pupilR);

        // HP bar above monster
        const hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x400000 })
        );
        hpBarBg.position.y = this.data.size + 0.3;
        hpBarBg.rotation.x = 0; // Will be billboarded
        this.mesh.add(hpBarBg);

        this.hpBarFill = new THREE.Mesh(
            new THREE.PlaneGeometry(0.78, 0.06),
            new THREE.MeshBasicMaterial({ color: 0xff2020 })
        );
        this.hpBarFill.position.y = this.data.size + 0.3;
        this.hpBarFill.position.z = 0.001;
        this.mesh.add(this.hpBarFill);

        // Name label as sprite
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(this.data.name, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const nameSprite = new THREE.Sprite(spriteMat);
        nameSprite.scale.set(1.5, 0.4, 1);
        nameSprite.position.y = this.data.size + 0.6;
        this.mesh.add(nameSprite);

        // Shadow
        const shadowGeo = new THREE.CircleGeometry(this.data.size * 0.5, 12);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        this.mesh.add(shadow);

        this.mesh.position.copy(position);
        this.scene.add(this.mesh);
    }

    takeDamage(amount) {
        const actualDmg = Math.max(1, amount - Math.floor(this.data.def * 0.3));
        this.hp = Math.max(0, this.hp - actualDmg);
        this.hitFlash = 0.15;

        // Update HP bar
        const ratio = this.hp / this.maxHp;
        this.hpBarFill.scale.x = Math.max(0.01, ratio);

        if (this.hp <= 0) {
            this.alive = false;
            this.mesh.visible = false;
        }

        return actualDmg;
    }

    getPosition() {
        return this.mesh.position.clone();
    }

    distanceTo(pos) {
        return this.mesh.position.distanceTo(pos);
    }

    update(dt, camera) {
        if (!this.alive) return;

        this.animTimer += dt;
        this.hitFlash = Math.max(0, this.hitFlash - dt);

        // Bounce animation
        const bounce = Math.abs(Math.sin(this.animTimer * 2.5)) * 0.1;
        this.bodyMesh.position.y = this.data.size * 0.4 + bounce;
        this.bodyMesh.scale.y = 1 + bounce * 0.5;
        this.bodyMesh.scale.x = 1 - bounce * 0.15;
        this.bodyMesh.scale.z = 1 - bounce * 0.15;

        // Hit flash
        if (this.hitFlash > 0) {
            this.bodyMesh.material.emissive.setHex(0xff4040);
            this.bodyMesh.material.emissiveIntensity = this.hitFlash * 5;
        } else {
            this.bodyMesh.material.emissive.setHex(0x000000);
            this.bodyMesh.material.emissiveIntensity = 0;
        }

        // Wander AI
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 2 + Math.random() * 4;
            const angle = Math.random() * Math.PI * 2;
            const dist = 1 + Math.random() * 2;
            this.wanderTarget = new THREE.Vector3(
                this.mesh.position.x + Math.cos(angle) * dist,
                0,
                this.mesh.position.z + Math.sin(angle) * dist
            );

            // Keep in bounds
            this.wanderTarget.x = THREE.MathUtils.clamp(this.wanderTarget.x, -SPAWN_RANGE, SPAWN_RANGE);
            this.wanderTarget.z = THREE.MathUtils.clamp(this.wanderTarget.z, -SPAWN_RANGE, SPAWN_RANGE);
        }

        if (this.wanderTarget) {
            const dx = this.wanderTarget.x - this.mesh.position.x;
            const dz = this.wanderTarget.z - this.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.2) {
                const speed = this.data.speed * dt;
                this.mesh.position.x += (dx / dist) * speed;
                this.mesh.position.z += (dz / dist) * speed;
                this.mesh.rotation.y = Math.atan2(dx, dz);
            }
        }

        // Billboard HP bar to camera
        if (camera) {
            this.hpBarFill.lookAt(camera.position);
            this.hpBarFill.parent.children.forEach(child => {
                if (child.geometry && child.geometry.type === 'PlaneGeometry') {
                    child.lookAt(camera.position);
                }
            });
        }
    }

    reset(position) {
        this.hp = this.maxHp;
        this.alive = true;
        this.mesh.visible = true;
        this.mesh.position.copy(position);
        this.hpBarFill.scale.x = 1;
        this.hitFlash = 0;
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

export class MonsterManager {
    constructor(scene) {
        this.scene = scene;
        this.monsters = [];
        this.deadQueue = []; // { monster, timer }
    }

    spawnInitial(playerLevel) {
        const rng = createSeededRng(getDailySeed());
        const count = Math.min(MAX_MONSTERS, 6 + Math.floor(playerLevel / 2));
        for (let i = 0; i < count; i++) {
            this._spawnOneSeeded(playerLevel, rng);
        }
    }

    _spawnOneSeeded(playerLevel, rng) {
        // Use seeded rng for deterministic type and position
        const types = Object.keys(MONSTERS);
        const type = types[Math.floor(rng() * types.length)];
        const angle = rng() * Math.PI * 2;
        const dist = 4 + rng() * (SPAWN_RANGE - 4);
        const pos = new THREE.Vector3(
            Math.cos(angle) * dist,
            0,
            Math.sin(angle) * dist
        );

        const monster = new Monster(this.scene, type, pos);
        this.monsters.push(monster);
        return monster;
    }

    _spawnOne(playerLevel) {
        const type = pickRandomMonster(playerLevel);
        const angle = Math.random() * Math.PI * 2;
        const dist = 4 + Math.random() * (SPAWN_RANGE - 4);
        const pos = new THREE.Vector3(
            Math.cos(angle) * dist,
            0,
            Math.sin(angle) * dist
        );

        const monster = new Monster(this.scene, type, pos);
        this.monsters.push(monster);
        return monster;
    }

    update(dt, camera, playerLevel) {
        // Update alive monsters
        for (const m of this.monsters) {
            m.update(dt, camera);
        }

        // Handle respawns
        for (let i = this.deadQueue.length - 1; i >= 0; i--) {
            this.deadQueue[i].timer -= dt;
            if (this.deadQueue[i].timer <= 0) {
                const entry = this.deadQueue.splice(i, 1)[0];
                // Respawn with new type
                const type = pickRandomMonster(playerLevel);
                const angle = Math.random() * Math.PI * 2;
                const dist = 4 + Math.random() * (SPAWN_RANGE - 4);
                const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

                entry.monster.type = type;
                entry.monster.data = MONSTERS[type];
                entry.monster.maxHp = MONSTERS[type].hp;
                entry.monster.reset(pos);
            }
        }

        // Ensure monster count
        const aliveCount = this.monsters.filter(m => m.alive).length + this.deadQueue.length;
        const targetCount = Math.min(MAX_MONSTERS, 6 + Math.floor(playerLevel / 2));
        while (aliveCount + this.monsters.length < targetCount && this.monsters.length < MAX_MONSTERS) {
            this._spawnOne(playerLevel);
        }
    }

    // Queue a monster for respawn
    queueRespawn(monster) {
        this.deadQueue.push({
            monster,
            timer: RESPAWN_TIME + Math.random() * 2
        });
    }

    // Find nearest alive monster to a position
    findNearest(position, maxRange = 20) {
        let nearest = null;
        let nearestDist = maxRange;

        for (const m of this.monsters) {
            if (!m.alive) continue;
            const d = m.distanceTo(position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = m;
            }
        }

        return nearest;
    }

    // Get all alive monsters
    getAlive() {
        return this.monsters.filter(m => m.alive);
    }
}
