// Character Manager — Player character 3D model, animations, and state
import * as THREE from 'three';
import { getExpRequired, getStatGains } from './GameData.js';

export class CharacterManager {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.weaponMesh = null;
        this.nameSprite = null;

        // State
        this.state = 'idle'; // idle, walking, attacking
        this.animTimer = 0;
        this.attackTimer = 0;
        this.attackCooldown = 1.0; // seconds between attacks
        this.target = null;
        this.moveSpeed = 4;

        // Stats (will be loaded from DB)
        this.stats = {
            name: 'Novice',
            level: 1,
            exp: 0,
            hp: 100,
            max_hp: 100,
            sp: 50,
            max_sp: 50,
            atk: 10,
            def: 5,
            gold: 0,
            total_kills: 0,
            play_time: 0,
        };

        this.characterId = null;

        this._createModel();
    }

    _createModel() {
        this.mesh = new THREE.Group();

        // Body
        const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4060c0 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.0;
        body.castShadow = true;
        this.mesh.add(body);

        // Head
        const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        head.castShadow = true;
        this.mesh.add(head);

        // Hair
        const hairGeo = new THREE.BoxGeometry(0.55, 0.3, 0.55);
        const hairMat = new THREE.MeshLambertMaterial({ color: 0xc04040 });
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 1.95;
        this.mesh.add(hair);

        // Eyes
        const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.12, 1.72, 0.26);
        this.mesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.12, 1.72, 0.26);
        this.mesh.add(eyeR);

        // Arms
        const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
        const armMat = new THREE.MeshLambertMaterial({ color: 0x4060c0 });

        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.45, 1.0, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.45, 1.0, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Weapon (sword)
        const swordGeo = new THREE.BoxGeometry(0.08, 1.0, 0.04);
        const swordMat = new THREE.MeshLambertMaterial({ color: 0xc0c0d0 });
        this.weaponMesh = new THREE.Mesh(swordGeo, swordMat);
        this.weaponMesh.position.set(0, -0.3, 0.15);
        this.rightArm.add(this.weaponMesh);

        // Sword guard
        const guardGeo = new THREE.BoxGeometry(0.2, 0.06, 0.1);
        const guardMat = new THREE.MeshLambertMaterial({ color: 0xffd040 });
        const guard = new THREE.Mesh(guardGeo, guardMat);
        guard.position.y = 0.2;
        this.weaponMesh.add(guard);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.22, 0.5, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a5a });

        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-0.15, 0.35, 0);
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set(0.15, 0.35, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

        // Shadow disc
        const shadowGeo = new THREE.CircleGeometry(0.5, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        this.mesh.add(shadow);

        this.mesh.position.set(0, 0, 0);
        this.scene.add(this.mesh);

        this.updateNameTag();
    }

    updateNameTag() {
        if (this.nameSprite) {
            this.mesh.remove(this.nameSprite);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 20px "Press Start 2P", monospace';
        ctx.fillStyle = '#80e0ff'; // Light-blue player color
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';

        const labelText = `${this.stats.name || 'Novice'} Lv.${this.stats.level}`;
        ctx.strokeText(labelText, 128, 40);
        ctx.fillText(labelText, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.nameSprite = new THREE.Sprite(spriteMat);
        this.nameSprite.scale.set(1.8, 0.45, 1);
        this.nameSprite.position.y = 2.4; // above head
        this.mesh.add(this.nameSprite);
    }

    loadStats(dbData) {
        this.characterId = dbData.id;
        this.stats.name = dbData.name || 'Novice';
        this.stats.level = dbData.level || 1;
        this.stats.exp = dbData.exp || 0;
        this.stats.hp = dbData.hp || 100;
        this.stats.max_hp = dbData.max_hp || 100;
        this.stats.sp = dbData.sp || 50;
        this.stats.max_sp = dbData.max_sp || 50;
        this.stats.atk = dbData.atk || 10;
        this.stats.def = dbData.def || 5;
        this.stats.gold = dbData.gold || 0;
        this.stats.total_kills = dbData.total_kills || 0;
        this.stats.play_time = dbData.play_time || 0;

        this.updateNameTag();
    }

    getPosition() {
        return this.mesh.position.clone();
    }

    // Add EXP and check level-up
    addExp(amount) {
        this.stats.exp += amount;
        const required = getExpRequired(this.stats.level);
        let leveledUp = false;

        while (this.stats.exp >= required) {
            this.stats.exp -= getExpRequired(this.stats.level);
            this.stats.level++;
            const gains = getStatGains(this.stats.level);
            this.stats.max_hp += gains.max_hp;
            this.stats.max_sp += gains.max_sp;
            this.stats.atk += gains.atk;
            this.stats.def += gains.def;
            this.stats.hp = this.stats.max_hp; // Full heal on level up
            this.stats.sp = this.stats.max_sp;
            leveledUp = true;
        }

        if (leveledUp) {
            this.updateNameTag();
        }

        return leveledUp;
    }

    // Take damage
    takeDamage(amount) {
        const actualDmg = Math.max(1, amount - Math.floor(this.stats.def * 0.3));
        this.stats.hp = Math.max(0, this.stats.hp - actualDmg);
        return actualDmg;
    }

    // Heal
    heal(amount) {
        this.stats.hp = Math.min(this.stats.max_hp, this.stats.hp + amount);
    }

    // Restore SP
    restoreSp(amount) {
        this.stats.sp = Math.min(this.stats.max_sp, this.stats.sp + amount);
    }

    // Is alive
    isAlive() {
        return this.stats.hp > 0;
    }

    // Respawn
    respawn() {
        this.stats.hp = this.stats.max_hp;
        this.stats.sp = this.stats.max_sp;
        this.mesh.position.set(0, 0, 0);
        this.state = 'idle';
        this.target = null;
    }

    // Get save data
    getSaveData() {
        return {
            characterId: this.characterId,
            updates: {
                level: this.stats.level,
                exp: this.stats.exp,
                hp: this.stats.hp,
                max_hp: this.stats.max_hp,
                sp: this.stats.sp,
                max_sp: this.stats.max_sp,
                atk: this.stats.atk,
                def: this.stats.def,
                gold: this.stats.gold,
                total_kills: this.stats.total_kills,
                play_time: this.stats.play_time,
            }
        };
    }

    // Update animation
    update(dt) {
        this.animTimer += dt;
        this.attackTimer += dt;

        // Idle bobbing
        if (this.state === 'idle') {
            this.mesh.position.y = Math.sin(this.animTimer * 2) * 0.05;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 1.5) * 0.1;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 1.5 + Math.PI) * 0.1;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
        }

        // Walking animation
        if (this.state === 'walking') {
            this.mesh.position.y = Math.abs(Math.sin(this.animTimer * 8)) * 0.08;
            this.leftLeg.rotation.x = Math.sin(this.animTimer * 8) * 0.5;
            this.rightLeg.rotation.x = Math.sin(this.animTimer * 8 + Math.PI) * 0.5;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 8 + Math.PI) * 0.3;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 8) * 0.3;
        }

        // Running animation (faster legs, more bounce)
        if (this.state === 'running') {
            this.mesh.position.y = Math.abs(Math.sin(this.animTimer * 14)) * 0.12;
            this.leftLeg.rotation.x = Math.sin(this.animTimer * 14) * 0.8;
            this.rightLeg.rotation.x = Math.sin(this.animTimer * 14 + Math.PI) * 0.8;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 14 + Math.PI) * 0.5;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 14) * 0.5;
        }

        // Attack animation
        if (this.state === 'attacking') {
            const t = (this.animTimer % 0.5) / 0.5;
            if (t < 0.3) {
                this.rightArm.rotation.x = -t * 5;
                this.rightArm.rotation.z = -t * 2;
            } else if (t < 0.6) {
                this.rightArm.rotation.x = -1.5 + (t - 0.3) * 8;
                this.rightArm.rotation.z = -0.6 + (t - 0.3) * 3;
            } else {
                this.rightArm.rotation.x = 0.9 - (t - 0.6) * 2.25;
                this.rightArm.rotation.z = 0.3 - (t - 0.6) * 0.75;
            }
        }

        // HP regen
        if (this.isAlive() && this.stats.hp < this.stats.max_hp) {
            this.stats.hp = Math.min(this.stats.max_hp, this.stats.hp + dt * 1.5);
        }

        // Play time tracker
        this.stats.play_time += dt;
    }

    // Move toward a position
    moveToward(targetPos, dt) {
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.1) {
            this.state = 'walking';
            const speed = this.moveSpeed * dt;
            this.mesh.position.x += (dx / dist) * speed;
            this.mesh.position.z += (dz / dist) * speed;

            // Face the direction
            this.mesh.rotation.y = Math.atan2(dx, dz);
            return false;
        }
        return true;
    }

    // Manual WASD movement
    manualMove(direction, isRunning, dt) {
        const speed = this.moveSpeed * (isRunning ? 2.2 : 1.0) * dt;
        this.mesh.position.x += direction.x * speed;
        this.mesh.position.z += direction.z * speed;

        // Clamp to map bounds
        this.mesh.position.x = Math.max(-28, Math.min(28, this.mesh.position.x));
        this.mesh.position.z = Math.max(-28, Math.min(28, this.mesh.position.z));

        // Face the direction of movement
        this.mesh.rotation.y = Math.atan2(direction.x, direction.z);

        // Set state
        this.state = isRunning ? 'running' : 'walking';
    }
}

export class RemotePlayer {
    constructor(scene, userId, username, level, initialPos, bodyColor = 0x40c060) {
        this.scene = scene;
        this.userId = userId;
        this.username = username;
        this.level = level;
        this.bodyColor = bodyColor;

        this.state = 'idle';
        this.animTimer = Math.random() * Math.PI;

        this.mesh = new THREE.Group();
        this._createModel();

        if (initialPos) {
            this.mesh.position.set(initialPos.x, initialPos.y, initialPos.z);
        }

        this.scene.add(this.mesh);
    }

    _createModel() {
        // Body
        const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
        const bodyMat = new THREE.MeshLambertMaterial({ color: this.bodyColor });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.0;
        body.castShadow = true;
        this.mesh.add(body);

        // Head
        const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        head.castShadow = true;
        this.mesh.add(head);

        // Hair (random colors for other players)
        const hairGeo = new THREE.BoxGeometry(0.55, 0.3, 0.55);
        const hairColor = [0x503020, 0xc0b050, 0xc04040, 0x4080c5, 0x8a40c5][Math.floor(Math.random() * 5)];
        const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 1.95;
        this.mesh.add(hair);

        // Eyes
        const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x990000 }); // Evil red eyes for remote players, or black
        const eyeBlackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeBlackMat);
        eyeL.position.set(-0.12, 1.72, 0.26);
        this.mesh.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, eyeBlackMat);
        eyeR.position.set(0.12, 1.72, 0.26);
        this.mesh.add(eyeR);

        // Arms
        const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
        const armMat = new THREE.MeshLambertMaterial({ color: this.bodyColor });

        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.45, 1.0, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.45, 1.0, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Weapon (sword)
        const swordGeo = new THREE.BoxGeometry(0.08, 1.0, 0.04);
        const swordMat = new THREE.MeshLambertMaterial({ color: 0xc0c0d0 });
        this.weaponMesh = new THREE.Mesh(swordGeo, swordMat);
        this.weaponMesh.position.set(0, -0.3, 0.15);
        this.rightArm.add(this.weaponMesh);

        // Sword guard
        const guardGeo = new THREE.BoxGeometry(0.2, 0.06, 0.1);
        const guardMat = new THREE.MeshLambertMaterial({ color: 0xffd040 });
        const guard = new THREE.Mesh(guardGeo, guardMat);
        guard.position.y = 0.2;
        this.weaponMesh.add(guard);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.22, 0.5, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a5a });

        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-0.15, 0.35, 0);
        this.leftLeg.castShadow = true;
        this.mesh.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set(0.15, 0.35, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.rightLeg);

        // Shadow disc
        const shadowGeo = new THREE.CircleGeometry(0.5, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        this.mesh.add(shadow);

        this.updateNameTag();
    }

    updateNameTag() {
        if (this.nameSprite) {
            this.mesh.remove(this.nameSprite);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 20px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff'; // White color for other players
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';

        const labelText = `${this.username} Lv.${this.level}`;
        ctx.strokeText(labelText, 128, 40);
        ctx.fillText(labelText, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.nameSprite = new THREE.Sprite(spriteMat);
        this.nameSprite.scale.set(1.8, 0.45, 1);
        this.nameSprite.position.y = 2.4; // above head
        this.mesh.add(this.nameSprite);
    }

    updateData(data) {
        if (data.level && data.level !== this.level) {
            this.level = data.level;
            this.updateNameTag();
        }
        if (data.username && data.username !== this.username) {
            this.username = data.username;
            this.updateNameTag();
        }

        if (data.x !== undefined && data.z !== undefined) {
            this.targetX = data.x;
            this.targetZ = data.z;
        }

        if (data.rY !== undefined) {
            this.targetRotationY = data.rY;
        }

        if (data.state !== undefined) {
            this.state = data.state;
        }
    }

    update(dt) {
        this.animTimer += dt;

        // Smoothly interpolate position
        if (this.targetX !== undefined && this.targetZ !== undefined) {
            this.mesh.position.x += (this.targetX - this.mesh.position.x) * 0.15;
            this.mesh.position.z += (this.targetZ - this.mesh.position.z) * 0.15;
        }

        // Smoothly interpolate rotation
        if (this.targetRotationY !== undefined) {
            let diff = this.targetRotationY - this.mesh.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.mesh.rotation.y += diff * 0.15;
        }

        // Idle animation
        if (this.state === 'idle') {
            this.mesh.position.y = Math.sin(this.animTimer * 2) * 0.05;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 1.5) * 0.1;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 1.5 + Math.PI) * 0.1;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
        }

        // Walking animation
        if (this.state === 'walking') {
            this.mesh.position.y = Math.abs(Math.sin(this.animTimer * 8)) * 0.08;
            this.leftLeg.rotation.x = Math.sin(this.animTimer * 8) * 0.5;
            this.rightLeg.rotation.x = Math.sin(this.animTimer * 8 + Math.PI) * 0.5;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 8 + Math.PI) * 0.3;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 8) * 0.3;
        }

        // Attack animation
        if (this.state === 'attacking') {
            const t = (this.animTimer % 0.5) / 0.5;
            if (t < 0.3) {
                this.rightArm.rotation.x = -t * 5;
                this.rightArm.rotation.z = -t * 2;
            } else if (t < 0.6) {
                this.rightArm.rotation.x = -1.5 + (t - 0.3) * 8;
                this.rightArm.rotation.z = -0.6 + (t - 0.3) * 3;
            } else {
                this.rightArm.rotation.x = 0.9 - (t - 0.6) * 2.25;
                this.rightArm.rotation.z = 0.3 - (t - 0.6) * 0.75;
            }
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}
