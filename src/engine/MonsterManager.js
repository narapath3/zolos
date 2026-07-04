// Monster Manager — Monster spawning, AI, and management
import * as THREE from 'three';
import { MONSTERS, pickRandomMonster, getSpawnTable, getAllMonsters, pickRandomWaterMonster } from './GameData.js';

const MAX_MONSTERS = 12;
const MAX_WATER_MONSTERS = 4;
const SPAWN_RANGE = 12;
const RESPAWN_TIME = 3;
const DETECTION_RANGE = 5; // Distance to start chasing
const CHASE_SPEED_MULTIPLIER = 1.2; // Monsters run faster when chasing

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
        const allMonsters = getAllMonsters();
        this.data = allMonsters[type];
        this.hp = this.data.hp;
        this.maxHp = this.data.hp;
        this.alive = true;
        this.respawnTimer = 0;
        this.animTimer = Math.random() * Math.PI * 2;
        this.wanderTarget = null;
        this.wanderTimer = 0;
        this.hitFlash = 0;
        this.isMoving = false; 
        this.isWaterMonster = !!this.data.waterOnly;
        
        // AI State Machine
        this.state = 'WANDER'; // WANDER, CHASE, IDLE
        this.spawnPoint = position.clone();
        this.chaseTarget = null;

        this._createModel(position);
    }

    _createModel(position) {
        this.mesh = new THREE.Group();
        const size = this.data.size;
        const color = this.data.color;

        const createMat = (colorHex, roughness = 0.5, metalness = 0.1, transparent = false, opacity = 1.0) => {
            return new THREE.MeshStandardMaterial({
                color: colorHex,
                roughness: roughness,
                metalness: metalness,
                transparent: transparent,
                opacity: opacity,
                flatShading: false
            });
        };

        this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 24, 18), createMat(
            color,
            this.type === 'ghostring' ? 0.2 : 0.5,
            this.type === 'ghostring' ? 0.4 : 0.1,
            this.type === 'ghostring',
            this.type === 'ghostring' ? 0.55 : 1.0
        ));
        this.bodyMesh.position.y = size * 0.4;
        this.bodyMesh.castShadow = true;
        this.bodyMesh.receiveShadow = true;
        this.mesh.add(this.bodyMesh);

        // Add eyes
        const eyeGeo = new THREE.SphereGeometry(0.05 * size, 8, 8);
        const eyeMat = createMat(0x000000);
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.15 * size, 0.15 * size, 0.35 * size);
        this.bodyMesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.15 * size, 0.15 * size, 0.35 * size);
        this.bodyMesh.add(eyeR);

        this.mesh.position.copy(position);
        this.scene.add(this.mesh);
    }

    update(dt, playerPos, sceneManager) {
        if (!this.alive) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) this.respawn();
            return;
        }

        // Hit flash effect
        if (this.hitFlash > 0) {
            this.hitFlash -= dt * 5;
            const flashIntensity = Math.max(0, this.hitFlash);
            const flashColor = 0xff4040;
            this.bodyMesh.material.emissive.setHex(flashColor);
            this.bodyMesh.material.emissiveIntensity = flashIntensity;
        }

        // AI Logic
        const distToPlayer = playerPos ? this.mesh.position.distanceTo(playerPos) : Infinity;

        // State Transitions
        if (distToPlayer < DETECTION_RANGE) {
            this.state = 'CHASE';
            this.chaseTarget = playerPos;
        } else if (this.state === 'CHASE' && distToPlayer > DETECTION_RANGE * 1.5) {
            this.state = 'WANDER';
            this.chaseTarget = null;
            this.wanderTimer = 0; // Force pick new wander target
        }

        if (this.state === 'CHASE') {
            this._handleChase(dt, playerPos, sceneManager);
        } else {
            this._handleWander(dt, sceneManager);
        }

        // Animation
        this.animTimer += dt * 5;
        const bounce = Math.abs(Math.sin(this.animTimer)) * 0.1 * this.data.size;
        this.bodyMesh.position.y = (this.data.size * 0.4) + bounce;
        
        if (this.isMoving) {
            const targetPos = this.state === 'CHASE' ? playerPos : this.wanderTarget;
            if (targetPos) {
                this.mesh.rotation.y = Math.atan2(
                    targetPos.x - this.mesh.position.x,
                    targetPos.z - this.mesh.position.z
                );
            }
        }
    }

    _handleChase(dt, playerPos, sceneManager) {
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
            const speed = this.data.speed * CHASE_SPEED_MULTIPLIER * dt;
            this.mesh.position.x += (dx / dist) * speed;
            this.mesh.position.z += (dz / dist) * speed;
            this.isMoving = true;
        } else {
            this.isMoving = false;
        }
    }

    _handleWander(dt, sceneManager) {
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
            
            // Keep within spawn range
            this.wanderTarget.x = THREE.MathUtils.clamp(this.wanderTarget.x, this.spawnPoint.x - 5, this.spawnPoint.x + 5);
            this.wanderTarget.z = THREE.MathUtils.clamp(this.wanderTarget.z, this.spawnPoint.z - 5, this.spawnPoint.z + 5);
        }

        if (this.wanderTarget) {
            const dx = this.wanderTarget.x - this.mesh.position.x;
            const dz = this.wanderTarget.z - this.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 0.2) {
                const speed = this.data.speed * dt;
                this.mesh.position.x += (dx / dist) * speed;
                this.mesh.position.z += (dz / dist) * speed;
                this.isMoving = true;
            } else {
                this.isMoving = false;
            }
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.hitFlash = 1.0;
        if (this.hp <= 0) this.die();
    }

    die() {
        this.alive = false;
        this.mesh.visible = false;
        this.respawnTimer = RESPAWN_TIME;
    }

    respawn() {
        this.alive = true;
        this.hp = this.maxHp;
        this.mesh.visible = true;
        this.mesh.position.copy(this.spawnPoint);
        this.state = 'WANDER';
    }
}

export class MonsterManager {
    constructor(scene, sceneManager) {
        this.scene = scene;
        this.sceneManager = sceneManager;
        this.monsters = [];
        this.spawnMonsters();
    }

    spawnMonsters() {
        const rng = createSeededRng(getDailySeed());
        for (let i = 0; i < MAX_MONSTERS; i++) {
            const type = pickRandomMonster(rng());
            const pos = new THREE.Vector3(
                (rng() - 0.5) * SPAWN_RANGE * 2,
                0,
                (rng() - 0.5) * SPAWN_RANGE * 2
            );
            this.monsters.push(new Monster(this.scene, type, pos));
        }
    }

    update(dt, playerPos) {
        this.monsters.forEach(m => m.update(dt, playerPos, this.sceneManager));
    }
}
