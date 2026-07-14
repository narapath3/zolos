// Character Manager — Player character 3D model, animations, and state
import * as THREE from 'three';
import { getExpRequired, getStatGains, SKILLS, ITEMS } from './GameData.js';
import { getDeterministicGuestName, isPlaceholderName } from '../network/SupabaseClient.js';

export class CharacterManager {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.weaponMesh = null;
        this.nameSprite = null;
        this.bodyColor = 0x4060c0; // Default blue, overridden by setBodyColor()
        this.hairColor = 0xc04040;
        this.pantsColor = 0x3a3a5a;
        this.equippedHat = 'None';
        this.equippedGlasses = 'None';
        this.hatMesh = null;
        this.glassesMesh = null;

        // State
        this.state = 'idle'; // idle, walking, attacking, fishing, swimming
        this.rodLiftTimer = 0; // fishing rod yank animation countdown
        this.gender = 'male'; // 'male' | 'female' — female gets long hair
        this.animTimer = 0;
        this.attackTimer = 0;
        this.attackCooldown = 1.0; // seconds between attacks
        this.target = null;
        this.moveSpeed = 5.5;

        // Base Y position to support animation offsets without losing ground level
        this.baseY = 1.2;

        // Skill cooldown state
        this.cooldowns = {
            bash: 0,
            heal: 0,
            magnumBreak: 0
        };

        // Stats (will be loaded from DB)
        this.stats = {
            name: 'Guest',
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

        this.equippedWeapon = null;
        this.equippedArmor = null;
        this.equippedShield = null;

        // Game settings (persisted to DB)
        this.gameSettings = {
            sound_enabled: true,
            graphics_quality: 'auto',
            fps_enabled: true,
        };

        // Custom property getters for base stats + equipment bonuses
        this.stats._baseAtk = 10;
        this.stats._baseMaxSp = 50;
        this.stats._baseMaxHp = 100;
        this.stats._baseDef = 5;

        Object.defineProperty(this.stats, 'atk', {
            get: () => {
                const bonus = this.getWeaponAtkBonus(this.equippedWeapon);
                const base = isNaN(this.stats._baseAtk) ? 10 : this.stats._baseAtk;
                return base + bonus;
            },
            set: (val) => {
                this.stats._baseAtk = isNaN(val) ? 10 : val;
            },
            configurable: true,
            enumerable: true
        });

        Object.defineProperty(this.stats, 'max_sp', {
            get: () => {
                const bonus = this.getWeaponSpBonus(this.equippedWeapon) + this.getArmorSpBonus(this.equippedArmor);
                const base = isNaN(this.stats._baseMaxSp) ? 50 : this.stats._baseMaxSp;
                return base + bonus;
            },
            set: (val) => {
                this.stats._baseMaxSp = isNaN(val) ? 50 : val;
            },
            configurable: true,
            enumerable: true
        });

        Object.defineProperty(this.stats, 'max_hp', {
            get: () => {
                const bonus = this.getArmorHpBonus(this.equippedArmor);
                const base = isNaN(this.stats._baseMaxHp) ? 100 : this.stats._baseMaxHp;
                return base + bonus;
            },
            set: (val) => {
                this.stats._baseMaxHp = isNaN(val) ? 100 : val;
            },
            configurable: true,
            enumerable: true
        });

        Object.defineProperty(this.stats, 'def', {
            get: () => {
                const bonus = this.getArmorDefBonus(this.equippedArmor) + this.getShieldDefBonus(this.equippedShield);
                const base = isNaN(this.stats._baseDef) ? 5 : this.stats._baseDef;
                return base + bonus;
            },
            set: (val) => {
                this.stats._baseDef = isNaN(val) ? 5 : val;
            },
            configurable: true,
            enumerable: true
        });

        this.characterId = null;

        this._createModel();
    }

    getWeaponAtkBonus(weaponName) {
        if (!weaponName || !ITEMS[weaponName]) return 0;
        return ITEMS[weaponName].atkBonus || 0;
    }

    getWeaponSpBonus(weaponName) {
        if (!weaponName || !ITEMS[weaponName]) return 0;
        return ITEMS[weaponName].spBonus || 0;
    }

    getArmorSpBonus(armorName) {
        if (!armorName || !ITEMS[armorName]) return 0;
        return ITEMS[armorName].spBonus || 0;
    }

    getArmorHpBonus(armorName) {
        if (!armorName || !ITEMS[armorName]) return 0;
        return ITEMS[armorName].hpBonus || 0;
    }

    getArmorDefBonus(armorName) {
        if (!armorName || !ITEMS[armorName]) return 0;
        return ITEMS[armorName].defBonus || 0;
    }

    getShieldDefBonus(shieldName) {
        if (!shieldName || !ITEMS[shieldName]) return 0;
        return ITEMS[shieldName].defBonus || 0;
    }

    getAttackRange() {
        if (this.isRanged()) return 10.0;
        const weapon = this.equippedWeapon;
        if (weapon === 'Gun') return 7.0;
        return 1.8; // Default range
    }

    isRanged() {
        const weapon = this.equippedWeapon;
        return weapon === 'Bow' || weapon === 'Crossbow' || weapon === 'Great Bow';
    }

    getAttackCooldown() {
        const weapon = this.equippedWeapon;
        if (weapon === 'Sword') return 0.9;
        if (weapon === 'Bow') return 1.2;
        if (weapon === 'Crossbow') return 1.5;
        if (weapon === 'Great Bow') return 1.8;
        if (weapon === 'Gun') return 0.6;
        if (weapon === 'Fishing Rod') return 1.2;
        return 1.0; // Default cooldown
    }

    equipWeapon(itemName) {
        this.equippedWeapon = itemName;
        this.updateWeaponVisuals(itemName);
    }

    updateWeaponVisuals(itemName) {
        // 1b. Clean scene graph: ensure old weapon mesh is fully removed
        if (this.weaponMesh) {
            this.rightArm.remove(this.weaponMesh);
            this.weaponMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.weaponMesh = null;
        }

        if (!itemName) {
            // Unequipped: no weapon mesh (fists)
            return;
        }

        if (itemName === 'Sword') {
            const group = new THREE.Group();

            const bladeGeo = new THREE.BoxGeometry(0.08, 1.0, 0.04);
            const bladeMat = new THREE.MeshLambertMaterial({ color: 0xc0c0d0 });
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.position.set(0, 0.3, 0);
            blade.castShadow = true;
            group.add(blade);

            const guardGeo = new THREE.BoxGeometry(0.24, 0.06, 0.1);
            const guardMat = new THREE.MeshLambertMaterial({ color: 0xffd040 });
            const guard = new THREE.Mesh(guardGeo, guardMat);
            guard.position.set(0, -0.2, 0);
            guard.castShadow = true;
            group.add(guard);

            const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6);
            const handleMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(0, -0.35, 0);
            handle.castShadow = true;
            group.add(handle);

            group.position.set(0, -0.2, 0.15);
            group.rotation.x = 0;

            this.weaponMesh = group;
            this.rightArm.add(this.weaponMesh);
        } else if (itemName === 'Bow') {
            const group = new THREE.Group();

            const riserGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
            const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
            const riser = new THREE.Mesh(riserGeo, woodMat);
            riser.castShadow = true;
            group.add(riser);

            const limbGeo = new THREE.BoxGeometry(0.04, 0.4, 0.04);
            const limbUpper = new THREE.Mesh(limbGeo, woodMat);
            limbUpper.position.set(0, 0.32, -0.08);
            limbUpper.rotation.x = -0.4;
            limbUpper.castShadow = true;
            group.add(limbUpper);

            const limbLower = new THREE.Mesh(limbGeo, woodMat);
            limbLower.position.set(0, -0.32, -0.08);
            limbLower.rotation.x = 0.4;
            limbLower.castShadow = true;
            group.add(limbLower);

            const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.96, 4);
            const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
            const bowString = new THREE.Mesh(stringGeo, stringMat);
            bowString.position.set(0, 0, -0.2);
            group.add(bowString);

            group.position.set(0, -0.1, 0.15);
            group.rotation.x = Math.PI / 2;

            this.weaponMesh = group;
            this.rightArm.add(this.weaponMesh);
        } else if (itemName === 'Gun') {
            const group = new THREE.Group();

            const barrelGeo = new THREE.BoxGeometry(0.08, 0.45, 0.08);
            const metalMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
            const barrel = new THREE.Mesh(barrelGeo, metalMat);
            barrel.position.set(0, 0.1, 0.05);
            barrel.rotation.x = Math.PI / 2;
            barrel.castShadow = true;
            group.add(barrel);

            const gripGeo = new THREE.BoxGeometry(0.07, 0.22, 0.07);
            const gripMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
            const grip = new THREE.Mesh(gripGeo, gripMat);
            grip.position.set(0, -0.1, 0);
            grip.rotation.x = 0.2;
            grip.castShadow = true;
            group.add(grip);

            group.position.set(0, -0.2, 0.15);

            this.weaponMesh = group;
            this.rightArm.add(this.weaponMesh);
        } else if (itemName === 'Fishing Rod') {
            const group = new THREE.Group();

            const shaftGeo = new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6);
            const rodMat = new THREE.MeshLambertMaterial({ color: 0xd9b38c });
            const shaft = new THREE.Mesh(shaftGeo, rodMat);
            shaft.position.set(0, 0.4, 0.3);
            shaft.rotation.x = -Math.PI / 4;
            shaft.castShadow = true;
            group.add(shaft);

            const lineGeo = new THREE.CylinderGeometry(0.005, 0.005, 1.2, 4);
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
            const line = new THREE.Mesh(lineGeo, lineMat);
            const tipY = 0.4 + 0.7 * Math.cos(-Math.PI / 4);
            const tipZ = 0.3 + 0.7 * Math.sin(-Math.PI / 4);
            line.position.set(0, tipY - 0.6, tipZ);
            group.add(line);
            // Hidden while actively fishing — the dynamic bezier line to the
            // bobber replaces it (two lines at once looks wrong).
            this.rodDanglingLine = line;

            // Invisible marker at the rod tip so the dynamic fishing line can
            // start exactly where the rod ends, following every arm movement.
            const tipMarker = new THREE.Object3D();
            tipMarker.position.set(0, tipY, tipZ);
            group.add(tipMarker);
            this.rodTipMarker = tipMarker;

            group.position.set(0, -0.2, 0.15);

            this.weaponMesh = group;
            this.rightArm.add(this.weaponMesh);
        }
    }

    // World position of the fishing rod's tip (falls back to hand height)
    getRodTipPosition(target = new THREE.Vector3()) {
        if (this.rodTipMarker && this.rodTipMarker.parent) {
            return this.rodTipMarker.getWorldPosition(target);
        }
        target.copy(this.mesh.position);
        target.y += 1.4;
        return target;
    }

    // Current yank progress 0..1 (drives line tension & bobber hoist)
    getRodYankProgress() {
        return this._rodSnapValue || 0;
    }

    setRodLineVisible(visible) {
        if (this.rodDanglingLine) this.rodDanglingLine.visible = visible;
    }

    _createModel() {
        this.mesh = new THREE.Group();

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

        // Hair
        const hairGeo = new THREE.BoxGeometry(0.55, 0.3, 0.55);
        const hairMat = new THREE.MeshLambertMaterial({ color: this.hairColor });
        this.hair = new THREE.Mesh(hairGeo, hairMat);
        this.hair.position.y = 1.95;
        this.mesh.add(this.hair);

        // Gender-specific hair (female = long hair down the back)
        this._applyGenderHair();

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
        const armMat = new THREE.MeshLambertMaterial({ color: this.bodyColor });

        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.45, 1.0, 0);
        this.leftArm.castShadow = true;
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.45, 1.0, 0);
        this.rightArm.castShadow = true;
        this.mesh.add(this.rightArm);

        // Build starting weapon visuals (defaults to Sword until loaded from DB)
        this.updateWeaponVisuals('Sword');

        // Legs
        const legGeo = new THREE.BoxGeometry(0.22, 0.5, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: this.pantsColor });

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

        // Safe spawn point: Prontera field (0, 1.2, 10)
        this.mesh.position.set(0, 1.2, 10);
        this.scene.add(this.mesh);

        this.updateNameTag();
    }

    // Set body & arm color dynamically (for username-based consistent coloring)
    setBodyColor(color) {
        let colorVal = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
        // Guard: never let NaN/undefined poison the color (it would persist as 0 = black)
        if (!Number.isFinite(colorVal)) colorVal = this.bodyColor ?? 0x4060c0;
        const oldColor = this.bodyColor;
        this.bodyColor = colorVal;
        if (!this.mesh) return;
        // Body is child 0, arms are children with matching material
        this.mesh.children.forEach(child => {
            if (child.material && child.material.color) {
                // Body (index 0) and arms share the old body color
                const hex = child.material.color.getHex();
                if (hex === 0x4060c0 || hex === oldColor) {
                    child.material.color.setHex(colorVal);
                }
            }
        });
    }

    // Set gender and rebuild the gender-specific hair.
    // Female characters get long hair: a back panel flowing down to the
    // shoulders plus two side strands framing the face.
    setGender(gender) {
        this.gender = gender === 'female' ? 'female' : 'male';
        this._applyGenderHair();
    }

    _applyGenderHair() {
        if (!this.mesh) return;

        // Remove previous long-hair meshes
        if (this.longHair) {
            this.mesh.remove(this.longHair);
            this.longHair.traverse(child => {
                if (child.geometry) child.geometry.dispose();
            });
            this.longHair = null;
        }

        if (this.gender !== 'female' || !this.hair) return;

        // Share the base hair material so setHairColor() recolors everything
        const mat = this.hair.material;
        const group = new THREE.Group();

        // Back panel flowing down to shoulder level
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.14), mat);
        back.position.set(0, 1.5, -0.3);
        group.add(back);

        // Side strands framing the face
        for (const side of [-1, 1]) {
            const strand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.16), mat);
            strand.position.set(side * 0.3, 1.62, -0.12);
            group.add(strand);
        }

        this.longHair = group;
        this.mesh.add(group);
    }

    setHairColor(color) {
        let colorVal = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
        if (!Number.isFinite(colorVal)) colorVal = this.hairColor ?? 0xc04040;
        this.hairColor = colorVal;
        if (this.hair && this.hair.material) {
            this.hair.material.color.setHex(colorVal);
        }
    }

    setPantsColor(color) {
        let colorVal = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
        if (!Number.isFinite(colorVal)) colorVal = this.pantsColor ?? 0x3a3a5a;
        this.pantsColor = colorVal;
        if (this.leftLeg && this.leftLeg.material) {
            this.leftLeg.material.color.setHex(colorVal);
        }
        if (this.rightLeg && this.rightLeg.material) {
            this.rightLeg.material.color.setHex(colorVal);
        }
    }

    setHat(hatName) {
        this.equippedHat = hatName || 'None';
        // 1b. Clean scene graph: ensure old hat mesh is fully removed
        if (this.hatMesh) {
            this.mesh.remove(this.hatMesh);
            this.hatMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.hatMesh = null;
        }

        if (this.equippedHat === 'None' || this.equippedHat === 'none') return;

        const hatGroup = new THREE.Group();

        if (this.equippedHat === 'Wizard Hat') {
            const wizardMat = new THREE.MeshLambertMaterial({ color: 0x332266 });
            const coneGeo = new THREE.ConeGeometry(0.4, 0.7, 8);
            const cone = new THREE.Mesh(coneGeo, wizardMat);
            cone.position.y = 2.2;
            hatGroup.add(cone);

            const brimGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.05, 8);
            const brim = new THREE.Mesh(brimGeo, wizardMat);
            brim.position.y = 1.9;
            hatGroup.add(brim);
        } else if (this.equippedHat === 'Cap') {
            const capMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
            const capGeo = new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.y = 1.95;
            hatGroup.add(cap);

            const visorGeo = new THREE.BoxGeometry(0.4, 0.05, 0.3);
            const visor = new THREE.Mesh(visorGeo, capMat);
            visor.position.set(0, 1.95, 0.25);
            hatGroup.add(visor);
        } else if (this.equippedHat === 'Crown') {
            const crownMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
            const crownGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.25, 8, 1, true);
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.y = 2.05;
            hatGroup.add(crown);

            // Points
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const pointGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
                const point = new THREE.Mesh(pointGeo, crownMat);
                point.position.set(Math.cos(angle) * 0.32, 2.2, Math.sin(angle) * 0.32);
                hatGroup.add(point);
            }
        } else if (this.equippedHat === 'Cat Ears') {
            const earMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const innerMat = new THREE.MeshLambertMaterial({ color: 0xffaaaa });

            for (let i = -1; i <= 1; i += 2) {
                const earGeo = new THREE.ConeGeometry(0.12, 0.25, 4);
                const ear = new THREE.Mesh(earGeo, earMat);
                ear.position.set(i * 0.2, 2.05, 0);
                ear.rotation.z = -i * 0.3;
                hatGroup.add(ear);

                const innerGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
                const inner = new THREE.Mesh(innerGeo, innerMat);
                inner.position.set(i * 0.2, 2.05, 0.05);
                inner.rotation.z = -i * 0.3;
                hatGroup.add(inner);
            }
        } else if (this.equippedHat === 'Straw Hat') {
            const strawMat = new THREE.MeshLambertMaterial({ color: 0xe3c16f });
            const capGeo = new THREE.CylinderGeometry(0.3, 0.32, 0.2, 8);
            const cap = new THREE.Mesh(capGeo, strawMat);
            cap.position.y = 2.0;
            hatGroup.add(cap);

            const brimGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12);
            const brim = new THREE.Mesh(brimGeo, strawMat);
            brim.position.y = 1.9;
            hatGroup.add(brim);

            const bandMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
            const bandGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.06, 8);
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.y = 1.95;
            hatGroup.add(band);
        } else if (this.equippedHat === 'Cowboy Hat') {
            const leatherMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
            const capGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8);
            const cap = new THREE.Mesh(capGeo, leatherMat);
            cap.position.y = 2.05;
            hatGroup.add(cap);

            const brimGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.05, 12);
            const brim = new THREE.Mesh(brimGeo, leatherMat);
            brim.position.y = 1.9;
            brim.rotation.z = 0.1;
            hatGroup.add(brim);
        }

        this.hatMesh = hatGroup;
        this.mesh.add(this.hatMesh);
    }

    setGlasses(glassesName) {
        this.equippedGlasses = glassesName || 'None';
        // 1b. Clean scene graph: ensure old glasses mesh is fully removed
        if (this.glassesMesh) {
            this.mesh.remove(this.glassesMesh);
            this.glassesMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.glassesMesh = null;
        }

        if (this.equippedGlasses === 'None' || this.equippedGlasses === 'none') return;

        const glassesGroup = new THREE.Group();
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const lensMat = new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, shininess: 100 });

        if (this.equippedGlasses === 'Sunglasses') {
            const darkLensMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
            for (let i = -1; i <= 1; i += 2) {
                const lensGeo = new THREE.BoxGeometry(0.18, 0.15, 0.05);
                const lens = new THREE.Mesh(lensGeo, darkLensMat);
                lens.position.set(i * 0.12, 1.72, 0.26);
                glassesGroup.add(lens);
            }
            const bridgeGeo = new THREE.BoxGeometry(0.1, 0.04, 0.05);
            const bridge = new THREE.Mesh(bridgeGeo, frameMat);
            bridge.position.set(0, 1.75, 0.26);
            glassesGroup.add(bridge);
        } else if (this.equippedGlasses === 'Reading Glasses') {
            for (let i = -1; i <= 1; i += 2) {
                const lensGeo = new THREE.CircleGeometry(0.1, 12);
                const lens = new THREE.Mesh(lensGeo, lensMat);
                lens.position.set(i * 0.12, 1.72, 0.26);
                glassesGroup.add(lens);

                const frameGeo = new THREE.TorusGeometry(0.1, 0.02, 8, 16);
                const frame = new THREE.Mesh(frameGeo, frameMat);
                frame.position.set(i * 0.12, 1.72, 0.26);
                glassesGroup.add(frame);
            }
            const bridgeGeo = new THREE.BoxGeometry(0.08, 0.02, 0.05);
            const bridge = new THREE.Mesh(bridgeGeo, frameMat);
            bridge.position.set(0, 1.72, 0.26);
            glassesGroup.add(bridge);
        } else if (this.equippedGlasses === 'Monocle') {
            const lensGeo = new THREE.CircleGeometry(0.1, 12);
            const lens = new THREE.Mesh(lensGeo, lensMat);
            lens.position.set(0.12, 1.72, 0.26);
            glassesGroup.add(lens);

            const frameGeo = new THREE.TorusGeometry(0.1, 0.02, 8, 16);
            const frame = new THREE.Mesh(frameGeo, frameMat);
            frame.position.set(0.12, 1.72, 0.26);
            glassesGroup.add(frame);

            const chainGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.4, 4);
            const chain = new THREE.Mesh(chainGeo, frameMat);
            chain.position.set(0.22, 1.55, 0.26);
            chain.rotation.z = 0.2;
            glassesGroup.add(chain);
        } else if (this.equippedGlasses === 'Classic Glasses') {
            for (let i = -1; i <= 1; i += 2) {
                const frameGeo = new THREE.BoxGeometry(0.2, 0.15, 0.05);
                const frame = new THREE.Mesh(frameGeo, frameMat);
                frame.position.set(i * 0.12, 1.72, 0.26);
                glassesGroup.add(frame);

                const lensGeo = new THREE.BoxGeometry(0.16, 0.11, 0.05);
                const lens = new THREE.Mesh(lensGeo, lensMat);
                lens.position.set(i * 0.12, 1.72, 0.27);
                glassesGroup.add(lens);
            }
            const bridgeGeo = new THREE.BoxGeometry(0.08, 0.04, 0.05);
            const bridge = new THREE.Mesh(bridgeGeo, frameMat);
            bridge.position.set(0, 1.72, 0.26);
            glassesGroup.add(bridge);
        }

        this.glassesMesh = glassesGroup;
        this.mesh.add(this.glassesMesh);
    }

    updateNameTag() {
        if (this.nameSprite) {
            this.mesh.remove(this.nameSprite);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Shadow/Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 16, 256, 32);

        // Text
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';

        ctx.fillText(`${this.stats.name} Lv.${this.stats.level}`, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.nameSprite = new THREE.Sprite(spriteMat);
        this.nameSprite.position.y = 2.7;
        this.nameSprite.scale.set(2, 0.5, 1);
        this.mesh.add(this.nameSprite);
    }

    showChatBubble(text) {
        if (!text) return;

        // Remove old bubble if exists
        if (this.chatBubble) {
            this.mesh.remove(this.chatBubble);
            if (this.chatBubbleTimeout) clearTimeout(this.chatBubbleTimeout);
        }

        // Measure text for dynamic sizing
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = 'bold 32px Arial';

        const words = text.split(' ');
        let line = '';
        const lines = [];
        const maxWidth = 400;
        let maxLineWidth = 0;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = tempCtx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                lines.push(line.trim());
                maxLineWidth = Math.max(maxLineWidth, tempCtx.measureText(line.trim()).width);
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line.trim());
        maxLineWidth = Math.max(maxLineWidth, tempCtx.measureText(line.trim()).width);

        // High-res canvas for sharpness
        const canvas = document.createElement('canvas');
        const padding = 20;
        const pointerHeight = 15;
        const lineHeight = 38;

        const bubbleWidth = maxLineWidth + padding * 2;
        const bubbleHeight = lines.length * lineHeight + padding;

        // Ensure minimum size and scale for sharpness
        const scaleFactor = 2;
        canvas.width = (bubbleWidth + 10) * scaleFactor;
        canvas.height = (bubbleHeight + pointerHeight + 10) * scaleFactor;

        const ctx = canvas.getContext('2d');
        ctx.scale(scaleFactor, scaleFactor);

        const x = 5;
        const y = 5;
        const radius = 12;

        // Draw bubble background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + bubbleWidth - radius, y);
        ctx.quadraticCurveTo(x + bubbleWidth, y, x + bubbleWidth, y + radius);
        ctx.lineTo(x + bubbleWidth, y + bubbleHeight - radius);
        ctx.quadraticCurveTo(x + bubbleWidth, y + bubbleHeight, x + bubbleWidth - radius, y + bubbleHeight);

        // Pointer in the middle
        const px = x + bubbleWidth / 2;
        ctx.lineTo(px + 10, y + bubbleHeight);
        ctx.lineTo(px, y + bubbleHeight + pointerHeight);
        ctx.lineTo(px - 10, y + bubbleHeight);

        ctx.lineTo(x + radius, y + bubbleHeight);
        ctx.quadraticCurveTo(x, y + bubbleHeight, x, y + bubbleHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        lines.forEach((l, i) => {
            ctx.fillText(l, x + bubbleWidth / 2, y + padding + i * lineHeight + lineHeight / 2 - 4);
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.chatBubble = new THREE.Sprite(spriteMat);

        // Position and scale relative to world units
        const worldScale = 0.008;
        this.chatBubble.scale.set(canvas.width * worldScale / scaleFactor, canvas.height * worldScale / scaleFactor, 1);
        this.chatBubble.position.y = 2.8 + (this.chatBubble.scale.y / 2);

        this.mesh.add(this.chatBubble);

        // Auto-remove after 5 seconds
        this.chatBubbleTimeout = setTimeout(() => {
            if (this.chatBubble) {
                this.mesh.remove(this.chatBubble);
                this.chatBubble = null;
            }
        }, 5000);
    }

    // Move to a target position
    moveToward(targetPoint, dt) {
        if (!this.mesh) return;

        const dir = new THREE.Vector3().subVectors(targetPoint, this.mesh.position);
        dir.y = 0; // Keep horizontal movement

        if (dir.length() > 0.1) {
            dir.normalize();
            this.mesh.position.add(dir.multiplyScalar(this.moveSpeed * dt));

            // Rotate to face movement direction
            const targetRotation = Math.atan2(dir.x, dir.z);
            this.mesh.rotation.y = targetRotation;

            // Set walking state
            this.state = this.moveSpeed > 5 ? 'running' : 'walking';
            return true;
        } else {
            this.state = 'idle';
            return false;
        }
    }

    // Manual movement (keyboard)
    manualMove(dirX, dirZ, dt) {
        if (!this.mesh) return;

        if (dirX !== 0 || dirZ !== 0) {
            const moveVec = new THREE.Vector3(dirX, 0, dirZ).normalize();
            this.mesh.position.add(moveVec.multiplyScalar(this.moveSpeed * dt));

            const targetRotation = Math.atan2(dirX, dirZ);
            this.mesh.rotation.y = targetRotation;

            this.state = this.moveSpeed > 5 ? 'running' : 'walking';
            return true;
        } else {
            this.state = 'idle';
            return false;
        }
    }

    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3();
    }

    // Gain experience
    addExp(amount) {
        const expGain = Number(amount) || 0;
        this.stats.exp += expGain;
        let leveledUp = false;

        while (this.stats.exp >= getExpRequired(this.stats.level)) {
            this.stats.exp -= getExpRequired(this.stats.level);
            this.stats.level++;
            leveledUp = true;

            // Apply stat gains to base values.
            // NOTE: getStatGains() returns { max_hp, max_sp, atk, def } — read those
            // exact keys. A previous version read gains.hp / gains.sp (undefined),
            // so base HP/SP never grew on level up.
            const gains = getStatGains(this.stats.level);
            this.stats._baseMaxHp = (Number(this.stats._baseMaxHp) || 100) + (Number(gains.max_hp) || 0);
            this.stats._baseMaxSp = (Number(this.stats._baseMaxSp) || 50) + (Number(gains.max_sp) || 0);
            this.stats._baseAtk = (Number(this.stats._baseAtk) || 10) + (Number(gains.atk) || 0);
            this.stats._baseDef = (Number(this.stats._baseDef) || 5) + (Number(gains.def) || 0);

            // Fully restore current HP/SP on level up
            this.stats.hp = this.stats.max_hp;
            this.stats.sp = this.stats.max_sp;
        }

        if (leveledUp) {
            this.updateNameTag();
        }

        return leveledUp;
    }

    // Take damage
    takeDamage(amount) {
        const dmgAmount = Number(amount) || 0;
        const currentDef = Number(this.stats.def) || 0;

        const actualDmg = Math.max(1, dmgAmount - Math.floor(currentDef * 0.3));

        // Step 4: Ensure hp is a number before subtracting
        const currentHp = Number(this.stats.hp);
        if (isNaN(currentHp)) {
            this.stats.hp = Number(this.stats.max_hp) || 100;
        }

        this.stats.hp = Math.max(0, (Number(this.stats.hp) || 0) - actualDmg);
        return actualDmg;
    }

    // Heal
    heal(amount) {
        // 1c. NaN HP/SP Guards
        const healAmt = Number(amount) || 0;
        const maxHp = Number(this.stats.max_hp) || 100;
        const currentHp = Number(this.stats.hp) || 0;
        this.stats.hp = Math.min(maxHp, currentHp + healAmt);
    }

    // Restore SP
    restoreSp(amount) {
        // 1c. NaN HP/SP Guards
        const restoreAmt = Number(amount) || 0;
        const maxSp = Number(this.stats.max_sp) || 50;
        const currentSp = Number(this.stats.sp) || 0;
        this.stats.sp = Math.min(maxSp, currentSp + restoreAmt);
    }

    // Is alive
    isAlive() {
        return this.stats.hp > 0;
    }

    // Respawn
    respawn() {
        // Step 8: Set hp/sp to 20% on respawn, ensure no NaN
        const maxHp = Number(this.stats.max_hp || 100);
        const maxSp = Number(this.stats.max_sp || 50);

        this.stats.hp = Math.floor(maxHp * 0.2);
        this.stats.sp = Math.floor(maxSp * 0.2);

        this.baseY = 1.2;
        this.mesh.position.set(0, 1.2, 10);
        this.state = 'idle';
        this.target = null;

        // Step 8: Flag for CombatSystem to check for auto-resume
        this.justRespawned = true;
    }

    // Get save data
    getSaveData() {
        return {
            characterId: this.characterId,
            userId: this.userId,
            updates: {
                id: this.characterId, // Include ID in updates for fallback identification
                name: this.stats.name,
                level: this.stats.level,
                exp: this.stats.exp,
                hp: this.stats.hp,
                // Persist BASE max_hp (without equipment bonus) — the getter adds
                // the armor bonus back on load, so saving the computed value would
                // inflate max_hp by the armor bonus every save/load cycle.
                max_hp: this.stats._baseMaxHp !== undefined ? this.stats._baseMaxHp : this.stats.max_hp,
                sp: this.stats.sp,
                max_sp: this.stats._baseMaxSp !== undefined ? this.stats._baseMaxSp : this.stats.max_sp,
                atk: this.stats._baseAtk !== undefined ? this.stats._baseAtk : this.stats.atk,
                // Persist BASE def (without armor/shield bonus) — same inflation
                // reason as max_hp above.
                def: this.stats._baseDef !== undefined ? this.stats._baseDef : this.stats.def,
                gold: this.stats.gold,
                total_kills: this.stats.total_kills,
                play_time: this.stats.play_time,
                // Game settings
                sound_enabled: this.gameSettings.sound_enabled,
                graphics_quality: this.gameSettings.graphics_quality,
                fps_enabled: this.gameSettings.fps_enabled,
                // Persistence fix: Include appearance fields
                gender: this.gender,
                weapon: this.equippedWeapon,
                hat: this.equippedHat,
                glasses: this.equippedGlasses,
                // DB columns body_color/hair_color/pants_color are INTEGER — persist
                // the raw numeric color (e.g. 0x4060c0). Saving a hex string here made
                // the whole UPDATE fail (invalid integer), so nothing persisted.
                body_color: (this.bodyColor | 0),
                hair_color: (this.hairColor | 0),
                pants_color: (this.pantsColor | 0)
            }
        };
    }

    // Update animation
    update(dt) {
        this.animTimer += dt;
        this.attackTimer += dt;

        // Natural regeneration is now handled by CombatSystem.js to avoid double regen issues

        // Count down skill cooldowns
        for (const skillId in this.cooldowns) {
            if (this.cooldowns[skillId] > 0) {
                this.cooldowns[skillId] = Math.max(0, this.cooldowns[skillId] - dt);
            }
        }

        // Idle bobbing
        if (this.state === 'idle') {
            this.mesh.position.y = this.baseY + Math.sin(this.animTimer * 2) * 0.05;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 1.5) * 0.1;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 1.5 + Math.PI) * 0.1;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
        }

        // Walking animation
        if (this.state === 'walking') {
            this.mesh.position.y = this.baseY + Math.abs(Math.sin(this.animTimer * 8)) * 0.08;
            this.leftLeg.rotation.x = Math.sin(this.animTimer * 8) * 0.5;
            this.rightLeg.rotation.x = Math.sin(this.animTimer * 8 + Math.PI) * 0.5;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 8 + Math.PI) * 0.3;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 8) * 0.3;
        }

        // Running animation (faster legs, more bounce)
        if (this.state === 'running') {
            this.mesh.position.y = this.baseY + Math.abs(Math.sin(this.animTimer * 14)) * 0.12;
            this.leftLeg.rotation.x = Math.sin(this.animTimer * 14) * 0.8;
            this.rightLeg.rotation.x = Math.sin(this.animTimer * 14 + Math.PI) * 0.8;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 14 + Math.PI) * 0.5;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 14) * 0.5;
        }

        // Swimming animation (sink lower, breaststroke arms, kicking legs)
        if (this.state === 'swimming') {
            this.mesh.position.y = this.baseY - 1.8 + Math.sin(this.animTimer * 3) * 0.08;
            this.leftArm.rotation.x = Math.sin(this.animTimer * 4) * 0.8;
            this.rightArm.rotation.x = Math.sin(this.animTimer * 4 + Math.PI) * 0.8;
            this.leftArm.rotation.z = Math.sin(this.animTimer * 4) * 0.3;
            this.rightArm.rotation.z = -Math.sin(this.animTimer * 4) * 0.3;
            this.leftLeg.rotation.x = Math.sin(this.animTimer * 5) * 0.4;
            this.rightLeg.rotation.x = Math.sin(this.animTimer * 5 + Math.PI) * 0.4;
        }

        // Fishing pose: hold the rod out over the water, gentle idle bob.
        // rodLiftTimer drives the "yank" — a fast snap of the rod arm upward
        // with a small body recoil, easing back down (triggered on bite/catch).
        if (this.state === 'fishing') {
            this.mesh.position.y = this.baseY + Math.sin(this.animTimer * 1.5) * 0.03;
            this.leftArm.rotation.x = -0.15;
            this.leftArm.rotation.z = 0;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;

            const holdPose = -1.0; // rod arm extended forward
            if (this.rodLiftTimer > 0) {
                const dur = this._rodLiftDuration || 0.7;
                const t = 1 - (this.rodLiftTimer / dur); // 0 → 1
                // Yank curve: snap up fast (20%), HOLD at the top (35%),
                // then ease back down (45%) — the hold makes it clearly readable.
                let snap;
                if (t < 0.2) snap = Math.sin((t / 0.2) * Math.PI / 2);
                else if (t < 0.55) snap = 1;
                else snap = Math.cos(((t - 0.55) / 0.45) * Math.PI / 2);
                const strength = this._rodLiftStrength || 1;
                // Raise the rod arm overhead (about -2.4 rad at full strength)
                this.rightArm.rotation.x = holdPose - snap * 1.4 * strength;
                this.rightArm.rotation.z = -snap * 0.3 * strength;
                // Body recoil: hop up with the yank
                this.mesh.position.y += snap * 0.18 * strength;
                // Expose progress so the fishing line & bobber can follow
                this._rodSnapValue = snap * strength;
            } else {
                this.rightArm.rotation.x = holdPose + Math.sin(this.animTimer * 1.5) * 0.04;
                this.rightArm.rotation.z = 0;
                this._rodSnapValue = 0;
            }
        }

        // Count down the rod-lift yank (runs even if state changes mid-yank)
        if (this.rodLiftTimer > 0) {
            this.rodLiftTimer = Math.max(0, this.rodLiftTimer - dt);
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

        // Removed old HP regen in favor of Step 7 logic above

        // Play time tracker
        this.stats.play_time += dt;
    }

    // Trigger the fishing-rod yank animation.
    // strength 1 = full catch yank; smaller values give a subtle twitch (bite).
    triggerRodLift(strength = 1, duration = 0.7) {
        this._rodLiftStrength = strength;
        this._rodLiftDuration = duration;
        this.rodLiftTimer = duration;
        console.log(`[Zolos] 🎣 Rod ${strength >= 1 ? 'YANK' : 'twitch'} (${duration}s)`);
    }

    // ============ Skill System Action ============
    useSkill(skillId, currentTarget, monsterManager, gameUI, soundManager, particleSystem, effectCallback) {
        if (!this.isAlive()) return false;

        const skill = SKILLS[skillId];
        if (!skill) return false;

        // Check SP
        if (this.stats.sp < skill.spCost) {
            if (gameUI) gameUI.addCombatLog('❌ พลังเวทมนตร์ (SP) ไม่เพียงพอ!', 'system');
            return false;
        }

        // Check Cooldown
        if (this.cooldowns[skillId] > 0) {
            if (gameUI) gameUI.addCombatLog(`❌ สกิล ${skill.name} ยังติด Cooldown (${this.cooldowns[skillId].toFixed(1)}s)`, 'system');
            return false;
        }

        // Set state for animation swing
        this.state = 'attacking';
        this.animTimer = 0;

        // Deduct SP and set cooldown
        this.stats.sp -= skill.spCost;
        this.cooldowns[skillId] = skill.cooldown;

        // Sound effect
        if (soundManager) {
            soundManager.playSkillSound(skillId);
        }

        // Execute action
        if (skillId === 'bash') {
            if (!currentTarget) {
                if (gameUI) gameUI.addCombatLog('❌ ต้องการเป้าหมายในการใช้ Bash!', 'system');
                // Refund
                this.stats.sp += skill.spCost;
                this.cooldowns[skillId] = 0;
                return false;
            }

            // Deal 1.5x damage
            const dmgBase = this.stats.atk * skill.damageMultiplier;
            const finalDmg = Math.max(1, Math.floor(dmgBase * (0.9 + Math.random() * 0.2)));
            const actualDmg = currentTarget.takeDamage(finalDmg);

            if (gameUI) {
                gameUI.addCombatLog(`⚔️ ใช้ [Bash] โจมตี ${currentTarget.name}! สร้างความเสียหาย ${actualDmg}`, 'atk');
            }

            // Spawn skill burst particles
            if (particleSystem) {
                if (particleSystem.createCriticalBurst) {
                    particleSystem.createCriticalBurst(currentTarget.mesh.position);
                } else if (particleSystem.createHitBurst) {
                    particleSystem.createHitBurst(currentTarget.mesh.position);
                }
            }

            if (effectCallback) effectCallback('bash', currentTarget, actualDmg);

        } else if (skillId === 'heal') {
            // Heal calculation
            const healVal = this.stats.level * skill.healBase + Math.floor(this.stats.atk * 0.5);
            this.heal(healVal);

            if (gameUI) {
                gameUI.addCombatLog(`✨ ใช้ [Heal] ฟื้นฟู HP +${healVal}!`, 'heal');
            }

            // Particles
            if (particleSystem && particleSystem.createHealEffect) {
                particleSystem.createHealEffect(this.mesh.position);
            }

            if (effectCallback) effectCallback('heal', this, healVal);

        } else if (skillId === 'magnumBreak') {
            // AOE Damage
            const dmgBase = this.stats.atk * skill.damageMultiplier;
            const radius = skill.radius;

            if (gameUI) {
                gameUI.addCombatLog(`🔥 ใช้ [Magnum Break] ระเบิดพลังรอบตัว!`, 'atk');
            }

            // Particles
            if (particleSystem && particleSystem.createExplosion) {
                particleSystem.createExplosion(this.mesh.position, 0xff6600);
            }

            // Hit all nearby monsters
            let hits = 0;
            if (monsterManager && monsterManager.monsters) {
                monsterManager.monsters.forEach(m => {
                    if (m.alive && m.mesh.position.distanceTo(this.mesh.position) <= radius) {
                        const finalDmg = Math.max(1, Math.floor(dmgBase * (0.8 + Math.random() * 0.4)));
                        const actualDmg = m.takeDamage(finalDmg);
                        hits++;
                        if (effectCallback) effectCallback('magnumBreak', m, actualDmg);
                    }
                });
            }

            if (hits === 0 && gameUI) {
                gameUI.addCombatLog('...แต่ไม่มีศัตรูอยู่ในระยะ', 'system');
            }
        }

        return true;
    }

    loadStats(data) {
        if (!data) return;
        this.characterId = data.id;
        this.userId = data.user_id || null;

        let name = data.name;
        if (!name || isPlaceholderName(name)) {
            name = getDeterministicGuestName(data.user_id || data.id || this.characterId);
        }
        this.stats.name = name;

        // Step 4: Robust numeric field loading with isNaN() guards and Number() casts
        this.stats.level = isNaN(Number(data.level)) ? 1 : Number(data.level);
        this.stats.exp = isNaN(Number(data.exp)) ? 0 : Number(data.exp);
        this.stats.hp = isNaN(Number(data.hp)) ? 100 : Number(data.hp);
        this.stats.max_hp = isNaN(Number(data.max_hp)) ? 100 : Number(data.max_hp);
        this.stats.sp = isNaN(Number(data.sp)) ? 50 : Number(data.sp);
        this.stats.max_sp = isNaN(Number(data.max_sp)) ? 50 : Number(data.max_sp);
        this.stats.atk = isNaN(Number(data.atk)) ? 10 : Number(data.atk);
        this.stats.def = isNaN(Number(data.def)) ? 5 : Number(data.def);
        this.stats.gold = isNaN(Number(data.gold)) ? 0 : Number(data.gold);
        this.stats.total_kills = isNaN(Number(data.total_kills)) ? 0 : Number(data.total_kills);
        this.stats.play_time = isNaN(Number(data.play_time)) ? 0 : Number(data.play_time);

        // Load appearance if available
        if (data.gender) this.setGender(data.gender);
        if (data.body_color) this.setBodyColor(data.body_color);
        if (data.hair_color) this.setHairColor(data.hair_color);
        if (data.pants_color) this.setPantsColor(data.pants_color);
        if (data.hat) this.setHat(data.hat);
        if (data.glasses) this.setGlasses(data.glasses);
        if (data.weapon) this.equipWeapon(data.weapon);

        // Load game settings — check DB data first, then fallback to localStorage
        let localSettings = {};
        try {
            const settingsKey = `zolos_settings_${this.characterId}`;
            localSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
        } catch (e) { /* localStorage unavailable */ }

        if (data.sound_enabled !== undefined && data.sound_enabled !== null) {
            this.gameSettings.sound_enabled = !!data.sound_enabled;
        } else if (localSettings.sound_enabled !== undefined) {
            this.gameSettings.sound_enabled = !!localSettings.sound_enabled;
        }
        if (data.graphics_quality) {
            this.gameSettings.graphics_quality = data.graphics_quality;
        } else if (localSettings.graphics_quality) {
            this.gameSettings.graphics_quality = localSettings.graphics_quality;
        }
        if (data.fps_enabled !== undefined && data.fps_enabled !== null) {
            this.gameSettings.fps_enabled = !!data.fps_enabled;
        } else if (localSettings.fps_enabled !== undefined) {
            this.gameSettings.fps_enabled = !!localSettings.fps_enabled;
        }

        // Ensure starting position is safe
        this.baseY = 1.2;
        this.mesh.position.set(0, 1.2, 10);

        this.updateNameTag();
    }

    getAppearance() {
        return {
            gender: this.gender,
            bodyColor: this.bodyColor,
            hairColor: this.hairColor,
            pantsColor: this.pantsColor,
            hat: this.equippedHat,
            glasses: this.equippedGlasses,
            weapon: this.equippedWeapon
        };
    }

    applyAppearance(app) {
        if (!app) return;
        if (app.gender !== undefined && app.gender !== this.gender) this.setGender(app.gender);
        if (app.bodyColor !== undefined) this.setBodyColor(app.bodyColor);
        if (app.hairColor !== undefined) this.setHairColor(app.hairColor);
        if (app.pantsColor !== undefined) this.setPantsColor(app.pantsColor);
        if (app.hat !== undefined) this.setHat(app.hat);
        if (app.glasses !== undefined) this.setGlasses(app.glasses);
        if (app.weapon !== undefined) this.equipWeapon(app.weapon);
    }

    async saveStatsToDatabase() {
        if (!this.characterId) return;
        const { updates } = this.getSaveData();
        const { saveCharacter, saveCharacterByUserId } = await import('../network/GameSync.js');
        if (this.userId && !this.userId.startsWith('guest_') && !this.userId.startsWith('local_')) {
            await saveCharacterByUserId(this.userId, updates);
        } else {
            await saveCharacter(this.characterId, updates);
        }
    }
}
