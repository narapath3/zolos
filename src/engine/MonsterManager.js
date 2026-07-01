// Monster Manager — Monster spawning, AI, and management
import * as THREE from 'three';
import { MONSTERS, pickRandomMonster, getSpawnTable, getAllMonsters, pickRandomWaterMonster } from './GameData.js';

const MAX_MONSTERS = 12;
const MAX_WATER_MONSTERS = 4;
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
        this.isMoving = false; // Flag to track movement for water splashing
        this.isWaterMonster = !!this.data.waterOnly;

        this._createModel(position);
    }

    _createModel(position) {
        this.mesh = new THREE.Group();

        // Main body (slime-like shape)
        const bodyGeo = new THREE.SphereGeometry(this.data.size * 0.5, 8, 6);
        const bodyMat = new THREE.MeshLambertMaterial({
            color: this.data.color,
            transparent: this.type === 'ghostring',
            opacity: this.type === 'ghostring' ? 0.6 : 1.0
        });
        this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.bodyMesh.position.y = this.data.size * 0.4;
        this.bodyMesh.castShadow = true;
        this.mesh.add(this.bodyMesh);

        // Feature decorations
        if (this.type === 'lunatic') {
            // rabbit ears
            const earGeo = new THREE.BoxGeometry(0.06, 0.25, 0.04);
            const earMat = new THREE.MeshLambertMaterial({ color: 0xffe0f0 });
            const earL = new THREE.Mesh(earGeo, earMat);
            earL.position.set(-0.1, this.data.size * 0.5, 0);
            earL.rotation.z = 0.2;
            this.bodyMesh.add(earL);

            const earR = new THREE.Mesh(earGeo, earMat);
            earR.position.set(0.1, this.data.size * 0.5, 0);
            earR.rotation.z = -0.2;
            this.bodyMesh.add(earR);
        } else if (this.type === 'willow') {
            // wooden branches/horns
            const branchGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
            const branchMat = new THREE.MeshLambertMaterial({ color: 0x5a3713 });
            const branch = new THREE.Mesh(branchGeo, branchMat);
            branch.position.set(0, this.data.size * 0.55, 0);
            this.bodyMesh.add(branch);
        } else if (this.type === 'deviruchi') {
            // devil horns
            const hornGeo = new THREE.ConeGeometry(0.06, 0.2, 4);
            const hornMat = new THREE.MeshLambertMaterial({ color: 0x220022 });
            const hornL = new THREE.Mesh(hornGeo, hornMat);
            hornL.position.set(-0.12, this.data.size * 0.45, 0);
            hornL.rotation.z = 0.3;
            this.bodyMesh.add(hornL);

            const hornR = new THREE.Mesh(hornGeo, hornMat);
            hornR.position.set(0.12, this.data.size * 0.45, 0);
            hornR.rotation.z = -0.3;
            this.bodyMesh.add(hornR);
        } else if (this.type === 'crab') {
            // crab claws
            const clawGeo = new THREE.BoxGeometry(0.16, 0.1, 0.12);
            const clawMat = new THREE.MeshLambertMaterial({ color: 0xff4040 });

            const clawL = new THREE.Mesh(clawGeo, clawMat);
            clawL.position.set(-0.25, 0, 0.2);
            this.bodyMesh.add(clawL);

            const clawR = new THREE.Mesh(clawGeo, clawMat);
            clawR.position.set(0.25, 0, 0.2);
            this.bodyMesh.add(clawR);
        } else if (this.type === 'fish' || this.type === 'shrimp') {
            // back fin tail
            const finGeo = new THREE.ConeGeometry(0.1, 0.28, 4);
            const finMat = new THREE.MeshLambertMaterial({ color: this.data.color });
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.set(0, 0, -this.data.size * 0.45);
            fin.rotation.x = Math.PI / 2;
            this.bodyMesh.add(fin);
        } else if (this.type === 'marina') {
            // tentacles
            const tentacleGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.25, 4);
            const tentacleMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            for (let i = -1; i <= 1; i++) {
                const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
                tentacle.position.set(i * 0.15, -this.data.size * 0.35, 0);
                this.bodyMesh.add(tentacle);
            }
        }

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
            new THREE.MeshBasicMaterial({ color: this.isWaterMonster ? 0x2080ff : 0xff2020 })
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
        ctx.fillStyle = this.isWaterMonster ? '#80c0ff' : '#ffffff';
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
        // Water monsters sink slightly
        if (this.isWaterMonster) {
            this.mesh.position.y = -0.3;
        }
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

    update(dt, camera, sceneManager) {
        if (!this.alive) return;

        this.animTimer += dt;
        this.hitFlash = Math.max(0, this.hitFlash - dt);

        // Bounce animation
        const bounce = Math.abs(Math.sin(this.animTimer * 2.5)) * 0.1;
        if (this.isWaterMonster) {
            this.bodyMesh.position.y = this.data.size * 0.4 + bounce;
            this.mesh.position.y = -0.3 + Math.sin(this.animTimer * 1.5) * 0.05;
        } else {
            this.bodyMesh.position.y = this.data.size * 0.4 + bounce;
        }
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
            const newX = this.mesh.position.x + Math.cos(angle) * dist;
            const newZ = this.mesh.position.z + Math.sin(angle) * dist;

            // Land monsters must not wander into water; water monsters must stay in water
            if (sceneManager) {
                const testPos = new THREE.Vector3(newX, 0, newZ);
                const targetEnv = sceneManager.getEnvironmentAt(testPos);
                const requiredEnv = this.data.environment || 'ground';

                if (targetEnv === requiredEnv) {
                    this.wanderTarget = testPos;
                } else if (requiredEnv === 'water') {
                    // Pick new target toward river center
                    const riverZ = Math.sin(this.mesh.position.x * 0.08) * 10 - 2;
                    this.wanderTarget = new THREE.Vector3(
                        this.mesh.position.x + (Math.random() - 0.5) * 2,
                        0,
                        riverZ + (Math.random() - 0.5) * 4
                    );
                } else {
                    // For cave, mountain, ground: stay put or pick target again (skip wander cycle)
                    this.wanderTarget = null;
                }
            } else {
                this.wanderTarget = new THREE.Vector3(newX, 0, newZ);
            }

            // Keep in bounds
            if (this.wanderTarget) {
                this.wanderTarget.x = THREE.MathUtils.clamp(this.wanderTarget.x, -SPAWN_RANGE, SPAWN_RANGE);
                this.wanderTarget.z = THREE.MathUtils.clamp(this.wanderTarget.z, -SPAWN_RANGE, SPAWN_RANGE);
            }
        }

        if (this.wanderTarget) {
            const dx = this.wanderTarget.x - this.mesh.position.x;
            const dz = this.wanderTarget.z - this.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.2) {
                const speed = this.data.speed * dt;
                const nextX = this.mesh.position.x + (dx / dist) * speed;
                const nextZ = this.mesh.position.z + (dz / dist) * speed;

                // Final check: prevent monster from stepping out of its required environment
                if (sceneManager) {
                    const nextPos = new THREE.Vector3(nextX, 0, nextZ);
                    const nextEnv = sceneManager.getEnvironmentAt(nextPos);
                    const requiredEnv = this.data.environment || 'ground';
                    if (nextEnv !== requiredEnv) {
                        this.wanderTarget = null;
                        this.isMoving = false;
                        return;
                    }
                }

                this.mesh.position.x = nextX;
                this.mesh.position.z = nextZ;
                this.mesh.rotation.y = Math.atan2(dx, dz);
                this.isMoving = true;
            } else {
                this.isMoving = false;
            }
        } else {
            this.isMoving = false;
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
        if (this.isWaterMonster) {
            this.mesh.position.y = -0.3;
        }
        this.hpBarFill.scale.x = 1;
        this.hitFlash = 0;
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

export class MonsterManager {
    constructor(scene, sceneManager) {
        this.scene = scene;
        this.sceneManager = sceneManager;
        this.monsters = [];
        this.waterMonsters = [];
        this.deadQueue = []; // { monster, timer, isWater }
        this.mapId = 'prontera';
    }

    _getRandomPositionForMonster(type, rng) {
        const useRng = rng || Math.random;
        const allMonsters = getAllMonsters();
        const monsterData = allMonsters[type];
        const environment = monsterData ? monsterData.environment : 'ground';

        if (environment === 'water') {
            const rx = -20 + useRng() * 40;
            const riverZ = Math.sin(rx * 0.08) * 10 - 2;
            const rz = riverZ + (useRng() - 0.5) * 4;
            return new THREE.Vector3(rx, 0, rz);
        }

        let pos = new THREE.Vector3(0, 0, 0);

        for (let attempt = 0; attempt < 50; attempt++) {
            const angle = useRng() * Math.PI * 2;
            const dist = 4 + useRng() * (SPAWN_RANGE - 4);
            pos.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

            if (this.sceneManager) {
                const posEnv = this.sceneManager.getEnvironmentAt(pos);
                if (posEnv === environment) {
                    return pos;
                }
            } else {
                const distToRiver = Math.abs(pos.z - (Math.sin(pos.x * 0.08) * 10 - 2));
                const inWater = distToRiver < 5.5;
                if (!inWater) return pos;
            }
        }

        // Relax constraints if no exact match found
        for (let attempt = 0; attempt < 20; attempt++) {
            const angle = useRng() * Math.PI * 2;
            const dist = 4 + useRng() * (SPAWN_RANGE - 4);
            pos.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
            if (this.sceneManager) {
                if (!this.sceneManager.isInWater(pos)) return pos;
            } else {
                return pos;
            }
        }
        return pos;
    }

    spawnInitial(playerLevel) {
        const rng = createSeededRng(getDailySeed());
        const count = Math.min(MAX_MONSTERS, 6 + Math.floor(playerLevel / 2));

        // Spawn seeded land monsters using map-specific database
        const spawnTable = getSpawnTable(playerLevel, this.mapId);

        for (let i = 0; i < count; i++) {
            if (spawnTable.length === 0) continue;
            const entry = spawnTable[Math.floor(rng() * spawnTable.length)];
            const pos = this._getRandomPositionForMonster(entry.type, rng);

            const monster = new Monster(this.scene, entry.type, pos);
            this.monsters.push(monster);
        }

        // Spawn water monsters (both maps since both have river and config.waterColor)
        this._spawnWaterMonsters(playerLevel, rng);
    }

    _spawnWaterMonsters(playerLevel, rng) {
        const useRng = rng || Math.random;
        for (let i = 0; i < MAX_WATER_MONSTERS; i++) {
            const type = pickRandomWaterMonster(playerLevel);
            const pos = this._getRandomPositionForMonster(type, useRng);

            const monster = new Monster(this.scene, type, pos);
            this.waterMonsters.push(monster);
        }
    }

    _spawnOne(playerLevel) {
        const type = pickRandomMonster(playerLevel, this.mapId);
        const pos = this._getRandomPositionForMonster(type, Math.random);

        const monster = new Monster(this.scene, type, pos);
        this.monsters.push(monster);
        return monster;
    }

    _spawnOneWater(playerLevel) {
        const type = pickRandomWaterMonster(playerLevel);
        const pos = this._getRandomPositionForMonster(type, Math.random);

        const monster = new Monster(this.scene, type, pos);
        this.waterMonsters.push(monster);
        return monster;
    }

    update(dt, camera, playerLevel) {
        // Update alive land monsters
        for (const m of this.monsters) {
            m.update(dt, camera, this.sceneManager);
        }

        // Update alive water monsters
        for (const m of this.waterMonsters) {
            m.update(dt, camera, this.sceneManager);
        }

        // Handle respawns
        for (let i = this.deadQueue.length - 1; i >= 0; i--) {
            this.deadQueue[i].timer -= dt;
            if (this.deadQueue[i].timer <= 0) {
                const entry = this.deadQueue.splice(i, 1)[0];

                if (entry.isWater) {
                    // Respawn as water monster
                    const type = pickRandomWaterMonster(playerLevel);
                    const pos = this._getRandomPositionForMonster(type, Math.random);

                    entry.monster.type = type;
                    const allMonsters = getAllMonsters();
                    const monsterData = allMonsters[type];
                    if (monsterData) {
                        entry.monster.data = monsterData;
                        entry.monster.maxHp = monsterData.hp;
                        entry.monster.isWaterMonster = true;
                        if (entry.monster.bodyMesh && entry.monster.bodyMesh.material) {
                            entry.monster.bodyMesh.material.color.setHex(monsterData.color);
                        }
                        entry.monster.reset(pos);
                    }
                } else {
                    // Respawn as land monster
                    const type = pickRandomMonster(playerLevel, this.mapId);
                    const pos = this._getRandomPositionForMonster(type, Math.random);

                    entry.monster.type = type;
                    const allMonsters = getAllMonsters();
                    const monsterData = allMonsters[type];
                    if (monsterData) {
                        entry.monster.data = monsterData;
                        entry.monster.maxHp = monsterData.hp;
                        entry.monster.isWaterMonster = false;
                        if (entry.monster.bodyMesh && entry.monster.bodyMesh.material) {
                            entry.monster.bodyMesh.material.color.setHex(monsterData.color);
                        }
                        entry.monster.reset(pos);
                    }
                }
            }
        }

        // Ensure monster count
        const aliveCount = this.monsters.filter(m => m.alive).length + this.deadQueue.filter(d => !d.isWater).length;
        const targetCount = Math.min(MAX_MONSTERS, 6 + Math.floor(playerLevel / 2));
        while (aliveCount + this.monsters.length < targetCount && this.monsters.length < MAX_MONSTERS) {
            this._spawnOne(playerLevel);
        }
    }

    // Queue a monster for respawn
    queueRespawn(monster) {
        const isWater = monster.isWaterMonster;
        this.deadQueue.push({
            monster,
            timer: RESPAWN_TIME + Math.random() * 2,
            isWater
        });
    }

    // Find nearest alive monster to a position (searches both land and water)
    findNearest(position, maxRange = 20) {
        let nearest = null;
        let nearestDist = maxRange;

        const allMonsters = [...this.monsters, ...this.waterMonsters];
        for (const m of allMonsters) {
            if (!m.alive) continue;
            const d = m.distanceTo(position);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = m;
            }
        }

        return nearest;
    }

    // Get all alive monsters (land + water)
    getAlive() {
        return [...this.monsters, ...this.waterMonsters].filter(m => m.alive);
    }
}
