// Character Manager — Player character 3D model, animations, and state
import * as THREE from 'three';
import { getExpRequired, getStatGains, SKILLS, ITEMS, JOBS, getJobSkills, getJobMods, getRefineMult, getMonsterCombatMeta, getJobTierInfo } from './GameData.js';
import { buildPet } from './PetModels.js';
import { getDeterministicGuestName, isPlaceholderName } from '../network/SupabaseClient.js';
import { getCard } from '../cards/CardCatalog.js';
import { normalizeCardState } from '../cards/CardProgression.js';
import { getEquipmentVisualSpec } from './EquipmentVisualSpecs.js';
import {
    aggregateCardEffects, applyIncomingCardEffects, applyOnKillCardEffects,
    resolveOutgoingCardEffects,
} from '../cards/CardEffects.js';

// Walkable half-extent. The ground is a 70x70 plane centred at the origin
// (see SceneManager._createGround), so keep the player just inside the ±35 edge
// so they can't walk off the map into the void.
const WORLD_HALF = 34;
function clampToWorld(pos) {
    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
}

function splitGraphemes(text) {
    const value = String(text ?? '');
    if (typeof Intl?.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(value), part => part.segment);
    }
    return Array.from(value);
}

export function wrapCanvasText(ctx, text, maxWidth) {
    const glyphs = splitGraphemes(text);
    if (!glyphs.length) return [''];

    const lines = [];
    let line = '';
    for (const glyph of glyphs) {
        const candidate = line + glyph;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = glyph;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines;
}

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
        this.equippedPet = null;   // companion pet model key (see PetModels)
        this.equippedPetUid = null; // which owned pet instance is summoned
        this.petName = null;       // the summoned pet's custom name (others see it)
        this.petLevel = 1;         // pet grows as its owner fights; drives its aura tier
        this.petXp = 0;
        this.hatMesh = null;
        this.glassesMesh = null;
        this.petMesh = null;
        this.petParts = null;      // { wings:[], aura:{ring,sparkles,glow}, body } for animation
        this.petLevelFlash = 0;    // >0 while a level-up pop plays
        this.title = null; // achievement title over the name (e.g. 'master_angler')

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
            // Job/class id (swordsman | mage | archer | priest). null = Novice,
            // i.e. hasn't picked a path yet — see JOBS in GameData.
            job: null,
            gold: 0,
            zol: 0, // in-game ZOL currency (from converting Celestial Ore)
            total_kills: 0,
            play_time: 0,
        };

        this.equippedWeapon = null;
        this.equippedShield = null;

        // Multi-slot armor: one item per body-part slot, all contributing stats.
        // (head/body/garment/ring/wrist/pants/feet/accessory — see GameData.)
        this.equippedGear = { head: null, body: null, garment: null, ring: null, wrist: null, pants: null, feet: null, accessory: null };
        // Refine level (+N) of the item worn in each slot — scales its bonuses.
        this.equipRefine = { weapon: 0, shield: 0, head: 0, body: 0, garment: 0, ring: 0, wrist: 0, pants: 0, feet: 0, accessory: 0 };
        // Card socketed into each slot (canonical card id or null). Cards add stat
        // bonuses + special effects (crit/damage%/lifesteal) via getCardTotal().
        this.equippedCards = { weapon: null, shield: null, hat: null, glasses: null, head: null, body: null, garment: null, ring: null, wrist: null, pants: null, feet: null, accessory: null };
        this.cardState = {};
        // Back-compat alias: legacy code reads/writes a single `equippedArmor`.
        // Map it onto the body slot so old saves + call-sites keep working.
        Object.defineProperty(this, 'equippedArmor', {
            get: () => this.equippedGear.body,
            set: (v) => { this.equippedGear.body = v || null; },
            configurable: true,
            enumerable: false,
        });

        // Game settings (persisted to DB)
        this.gameSettings = {
            sound_enabled: true,
            graphics_quality: 'auto',
            fps_enabled: true,
        };

        // Temporary skill buffs, e.g. { atk: { pct: 0.4, remaining: 12 } }.
        // Applied as a multiplier inside the atk/def getters below. The setters
        // (and getSaveData) only ever touch _baseAtk/_baseDef, so a buff can
        // never leak into the saved character.
        this.activeBuffs = { atk: null, def: null };

        // Custom property getters for base stats + equipment bonuses
        this.stats._baseAtk = 10;
        this.stats._baseMaxSp = 50;
        this.stats._baseMaxHp = 100;
        this.stats._baseDef = 5;

        Object.defineProperty(this.stats, 'atk', {
            get: () => {
                const bonus = this.getWeaponAtkBonus(this.equippedWeapon) + this.getCardTotal('atkBonus') + this._gearTotal('atkBonus');
                const base = isNaN(this.stats._baseAtk) ? 10 : this.stats._baseAtk;
                return Math.floor((base + bonus) * this._jobMod('atk') * (1 + this.getBuffPct('atk')));
            },
            set: (val) => {
                this.stats._baseAtk = isNaN(val) ? 10 : val;
            },
            configurable: true,
            enumerable: true
        });

        Object.defineProperty(this.stats, 'max_sp', {
            get: () => {
                const bonus = this.getWeaponSpBonus(this.equippedWeapon) + this.getArmorSpBonus(this.equippedArmor) + this.getCardTotal('spBonus');
                const base = isNaN(this.stats._baseMaxSp) ? 50 : this.stats._baseMaxSp;
                return Math.floor(base * this._jobMod('sp')) + bonus;
            },
            set: (val) => {
                this.stats._baseMaxSp = isNaN(val) ? 50 : val;
            },
            configurable: true,
            enumerable: true
        });

        Object.defineProperty(this.stats, 'max_hp', {
            get: () => {
                const bonus = this.getArmorHpBonus(this.equippedArmor) + this.getCardTotal('hpBonus');
                const base = isNaN(this.stats._baseMaxHp) ? 100 : this.stats._baseMaxHp;
                return Math.floor(base * this._jobMod('hp')) + bonus;
            },
            set: (val) => {
                this.stats._baseMaxHp = isNaN(val) ? 100 : val;
            },
            configurable: true,
            enumerable: true
        });

        Object.defineProperty(this.stats, 'def', {
            get: () => {
                const bonus = this.getArmorDefBonus(this.equippedArmor) + this.getShieldDefBonus(this.equippedShield) + this.getCardTotal('defBonus');
                const base = isNaN(this.stats._baseDef) ? 5 : this.stats._baseDef;
                return Math.floor((base + bonus) * this._jobMod('def') * (1 + this.getBuffPct('def')));
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
        return Math.round((ITEMS[weaponName].atkBonus || 0) * getRefineMult(this.equipRefine.weapon));
    }

    getWeaponSpBonus(weaponName) {
        if (!weaponName || !ITEMS[weaponName]) return 0;
        return Math.round((ITEMS[weaponName].spBonus || 0) * getRefineMult(this.equipRefine.weapon));
    }

    // Sum a bonus field (defBonus/hpBonus/spBonus) across every equipped gear
    // piece — the whole paper-doll contributes, each scaled by its refine level.
    // Sum a bonus field (atkBonus/defBonus/hpBonus/spBonus) across every equipped gear
    // piece — the whole paper-doll contributes, each scaled by its refine level.
    _gearTotal(field) {
        let sum = 0;
        const inv = window.gameInventory || [];

        // 1. Base equipment bonuses
        for (const slot of Object.keys(this.equippedGear)) {
            const name = this.equippedGear[slot];
            if (name && ITEMS[name]) {
                sum += Math.round((ITEMS[name][field] || 0) * getRefineMult(this.equipRefine[slot] || 0));

                // 2. Legacy/New card bonuses stored on the item itself
                const item = inv.find(i => i.item_name === name && i.stats && i.stats.equipped && i.stats.slot === slot);
                if (item && item.stats && item.stats.cards) {
                    item.stats.cards.forEach(cardName => {
                        const cardData = ITEMS[cardName];
                        if (cardData) sum += cardData[field] || 0;
                    });
                }
            }
        }

        // 3. Weapon-specific bonuses (since it's not in equippedGear)
        if (this.equippedWeapon && ITEMS[this.equippedWeapon]) {
            // Weapon cards
            const weaponItem = inv.find(i => i.item_name === this.equippedWeapon && i.stats && i.stats.equipped);
            if (weaponItem && weaponItem.stats && weaponItem.stats.cards) {
                weaponItem.stats.cards.forEach(cardName => {
                    const cardData = ITEMS[cardName];
                    if (cardData) sum += cardData[field] || 0;
                });
            }
        }

        // 4. Shield-specific bonuses (since it's not in equippedGear)
        if (this.equippedShield && ITEMS[this.equippedShield]) {
            // Shield cards
            const shieldItem = inv.find(i => i.item_name === this.equippedShield && i.stats && i.stats.equipped);
            if (shieldItem && shieldItem.stats && shieldItem.stats.cards) {
                shieldItem.stats.cards.forEach(cardName => {
                    const cardData = ITEMS[cardName];
                    if (cardData) sum += cardData[field] || 0;
                });
            }
        }

        return sum;
    }

    // These now sum the whole gear set. The (ignored) argument is kept so any
    // legacy caller passing `equippedArmor` still works.
    getArmorSpBonus() {
        return this._gearTotal('spBonus');
    }

    getArmorHpBonus() {
        return this._gearTotal('hpBonus');
    }

    getArmorDefBonus() {
        return this._gearTotal('defBonus');
    }

    getShieldDefBonus(shieldName) {
        if (!shieldName || !ITEMS[shieldName]) return 0;
        return Math.round((ITEMS[shieldName].defBonus || 0) * getRefineMult(this.equipRefine.shield));
    }

    // ===== Cards =====
    // Cards resolve from catalog data, canonical socket IDs, and star state in
    // one place so stat and combat paths use identical scaled effects.
    getCardEffects() {
        return aggregateCardEffects({
            equippedCards: this.equippedCards,
            cardState: this.cardState,
        });
    }

    getCardTotal(field) {
        const effects = this.getCardEffects();
        if (Object.hasOwn(effects.stats, field)) return effects.stats[field];
        if (field === 'dmgPct') return effects.damagePct;
        return Number(effects[field]) || 0;
    }

    // Combat hooks (used by CombatSystem._resolveDamage).
    getCritChanceBonus() { return this.getCardEffects().critBonus; }
    getDamagePct() { return this.getCardEffects().damagePct; }
    getLifestealPct() { return this.getCardEffects().lifestealPct; }

    // Socket / remove a card in a slot. Returns true on success.
    equipCard(slotId, idOrName) {
        if (!(slotId in this.equippedCards)) return false;
        if (!idOrName) {
            this.equippedCards[slotId] = null;
            return true;
        }
        const card = getCard(idOrName);
        if (!card) return false;
        for (const [slot, cardId] of Object.entries(this.equippedCards)) {
            if (slot !== slotId && cardId === card.id) return false;
        }
        this.equippedCards[slotId] = card.id;
        return true;
    }
    unequipCard(slotId) {
        if (!(slotId in this.equippedCards)) return false;
        this.equippedCards[slotId] = null;
        return true;
    }

    getAttackRange() {
        if (this.isRanged()) return 10.0;
        const weapon = this.equippedWeapon;
        if (weapon === 'Gun') return 7.0;
        // Mage is now a ranged class
        if (this.stats.job === 'mage') return 9.0;
        return 1.8; // Default range
    }

    isRanged() {
        const weapon = this.equippedWeapon;
        const isWeaponRanged = weapon === 'Bow' || weapon === 'Crossbow' || weapon === 'Great Bow' || weapon === 'Rudra Bow' || weapon === 'Stormcaller Bow';
        // Mage is now a ranged class
        return isWeaponRanged || (this.stats.job === 'mage');
    }

    // Attack visual class: 'melee' (sword slash), 'bow' (arrow), 'gun' (bullet), 'magic' (lightning), 'thief' (shadow slash), 'acolyte' (holy orb)
    getWeaponClass() {
        const w = this.equippedWeapon;
        if (this.stats.job === 'mage') return 'magic';
        if (this.stats.job === 'thief') return 'thief';
        if (this.stats.job === 'acolyte') return 'acolyte';
        if (w === 'Gun') return 'gun';
        if (w === 'Bow' || w === 'Crossbow' || w === 'Great Bow' || w === 'Rudra Bow' || w === 'Stormcaller Bow') return 'bow';
        return 'melee';
    }

    // Finer weapon class used only to pick an attack SOUND (sword/bow/gun/
    // blunt/staff/unarmed). Kept separate from getWeaponClass() — which drives
    // attack VISUALS as melee/bow/gun — so tuning sounds never changes visuals.
    getWeaponSoundClass() {
        const w = this.equippedWeapon;
        if (this.stats.job === 'mage') return 'lightning';
        if (this.stats.job === 'thief') return 'shadowslash';
        if (this.stats.job === 'acolyte') return 'holyorb';
        if (!w || w === 'None') return 'unarmed';
        if (w === 'Gun') return 'gun';
        if (w === 'Bow' || w === 'Crossbow' || w === 'Great Bow' || w === 'Rudra Bow' || w === 'Stormcaller Bow') return 'bow';
        if (w === 'Heavy Warhammer') return 'blunt';
        if (w === 'Mage Staff' || w === 'Holy Rod') return 'staff';
        return 'sword';
    }

    // Signature effect id for forged weapons ('fire'|'frost'|'storm'|'soul'|'nova'), else null
    getForgeEffect() {
        const w = this.equippedWeapon;
        return (w && ITEMS[w] && ITEMS[w].forgeEffect) || null;
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
        this._updateDivineAura();
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
        } else if (itemName === 'Mage Staff') {
            const group = new THREE.Group();
            const shaft = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.045, 1.1, 6),
                new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
            shaft.position.set(0, 0.15, 0);
            shaft.castShadow = true;
            group.add(shaft);
            const orb = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 12, 12),
                new THREE.MeshBasicMaterial({ color: 0x66ccff }));
            orb.position.set(0, 0.78, 0);
            group.add(orb);
            const orbGlow = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 12, 12),
                new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.3 }));
            orbGlow.position.copy(orb.position);
            group.add(orbGlow);
            group.position.set(0, -0.1, 0.12);
            this.weaponMesh = group;
            this.rightArm.add(this.weaponMesh);
        } else if (itemName === 'Holy Rod') {
            const group = new THREE.Group();
            const shaft = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.04, 1.0, 6),
                new THREE.MeshLambertMaterial({ color: 0xd9b84a }));
            shaft.position.set(0, 0.1, 0);
            shaft.castShadow = true;
            group.add(shaft);
            const goldMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), goldMat);
            crossV.position.set(0, 0.72, 0);
            group.add(crossV);
            const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), goldMat);
            crossH.position.set(0, 0.72, 0);
            group.add(crossH);
            const holyGlow = new THREE.Mesh(
                new THREE.SphereGeometry(0.18, 12, 12),
                new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.35 }));
            holyGlow.position.set(0, 0.72, 0);
            group.add(holyGlow);
            group.position.set(0, -0.1, 0.12);
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
        } else {
            // Any other catalog weapon → distinctive parametric model so the
            // hero visibly holds exactly what was bought/equipped, with a glow
            // aura for the rare/legendary/mythic pieces.
            const mesh = this._buildGenericWeapon(itemName);
            if (mesh) {
                this.weaponMesh = mesh;
                this.rightArm.add(this.weaponMesh);
            }
        }
    }

    // ===== Parametric weapon models (covers every weapon in the catalog) =====
    // Each entry picks a builder + colors; legendary/mythic get an emissive
    // glow so they read as "special" in the hero's hand.
    _buildGenericWeapon(itemName) {
        const SPECS = {
            'Novice Cutter': { kind: 'dagger', blade: 0xb8bcc8, guard: 0x8a6a3a, len: 0.6 },
            'Silver Dagger': { kind: 'dagger', blade: 0xe6e8f2, guard: 0xc0c0c8, len: 0.66, glow: 0x99aaff, glowI: 0.35 },
            'Katana': { kind: 'katana', blade: 0xe2e6ec, guard: 0x2a2a2a, len: 1.15 },
            'Heavy Warhammer': { kind: 'hammer', head: 0x70727a, handle: 0x5a3a1a },
            'Mage Staff': { kind: 'staff', shaft: 0x7a4a24, gem: 0x46c8ff, glow: 0x46c8ff, glowI: 0.7 },
            'Crossbow': { kind: 'crossbow', wood: 0x6a4a2a, metal: 0x9098a0 },
            'Great Bow': { kind: 'bow', wood: 0x5a3a1a, scale: 1.25 },
            'Excalibur': { kind: 'greatsword', blade: 0xfff2c0, guard: 0xffd23a, len: 1.3, gem: 0x66ccff, glow: 0xffcc33, glowI: 0.95 },
            'Rudra Bow': { kind: 'bow', wood: 0xd8bc6a, scale: 1.3, glow: 0x86ff9a, glowI: 0.85 },
            'Ragnarok Blade': { kind: 'greatsword', blade: 0xff6274, guard: 0x40001c, len: 1.5, gem: 0xff2aa8, glow: 0xff2440, glowI: 1.15 },
            // ---- Forged weapons (Weapon Smith crafts) ----
            'Ember Fang': { kind: 'greatsword', blade: 0xff8a3a, guard: 0x6a2a10, len: 1.25, gem: 0xff3300, glow: 0xff5a1a, glowI: 1.05 },
            'Frost Cleaver': { kind: 'axe', blade: 0xd0f4ff, handle: 0x2a3f55, glow: 0x66ddff, glowI: 1.05 },
            'Stormcaller Bow': { kind: 'bow', wood: 0x9fbfff, scale: 1.3, glow: 0x88bbff, glowI: 1.05 },
            'Soulreaper': { kind: 'scythe', blade: 0x8f3bd1, handle: 0x29173d, glow: 0xaa66ff, glowI: 1.1 },
            'Godslayer': { kind: 'greatsword', blade: 0xfff4c0, guard: 0xffcf3a, len: 1.55, gem: 0x66ffff, glow: 0xffe066, glowI: 1.3 },
            'Solaris Edge': { kind: 'greatsword', blade: 0xfff9dc, guard: 0xffc933, len: 1.55, gem: 0x43eaff, glow: 0x72ecff, glowI: 1.35 },
            'Chronos Bow': { kind: 'bow', wood: 0xffdf72, scale: 1.4, glow: 0x55eaff, glowI: 1.3 },
            'Genesis Staff': { kind: 'staff', shaft: 0xffd86b, gem: 0x3de8ff, glow: 0x63f4ff, glowI: 1.4 },
            'Seraph Rod': { kind: 'staff', shaft: 0xfff5d8, gem: 0x79eeff, glow: 0xffdf75, glowI: 1.35 },
        };
        let spec = SPECS[itemName];
        if (!spec) {
            // Heuristic fallback so ANY weapon (incl. future drops) still shows something
            const it = ITEMS[itemName];
            if (it && it.type !== 'weapon' && it.type !== 'fishing_rod') return null;
            const n = itemName.toLowerCase();
            if (n.includes('bow')) spec = { kind: 'bow', wood: 0x6a4a2a };
            else if (n.includes('gun') || n.includes('pistol') || n.includes('rifle')) spec = { kind: 'gun' };
            else if (n.includes('staff') || n.includes('wand')) spec = { kind: 'staff', shaft: 0x7a4a24, gem: 0x46c8ff, glow: 0x46c8ff, glowI: 0.6 };
            else if (n.includes('hammer') || n.includes('mace')) spec = { kind: 'hammer', head: 0x70727a, handle: 0x5a3a1a };
            else if (n.includes('dagger') || n.includes('cutter') || n.includes('knife')) spec = { kind: 'dagger', blade: 0xc8ccd6, guard: 0x8a6a3a, len: 0.6 };
            else spec = { kind: 'sword', blade: 0xc0c0d0, guard: 0xffd040, len: 1.0 };
        }
        switch (spec.kind) {
            case 'dagger': return this._wpBlade({ ...spec, len: spec.len || 0.6, width: 0.07 });
            case 'greatsword': return this._wpBlade({ ...spec, width: 0.15 });
            case 'katana': return this._wpKatana(spec);
            case 'hammer': return this._wpHammer(spec);
            case 'staff': return this._wpStaff(spec);
            case 'bow': return this._wpBow(spec);
            case 'crossbow': return this._wpCrossbow(spec);
            case 'gun': return this._wpGun(spec);
            case 'axe': return this._wpAxe(spec);
            case 'scythe': return this._wpScythe(spec);
            case 'sword':
            default: return this._wpBlade({ ...spec, width: spec.width || 0.09 });
        }
    }

    _wpBlade({ blade = 0xc0c0d0, guard = 0xffd040, len = 1.0, width = 0.09, glow, glowI = 0, gem }) {
        const group = new THREE.Group();
        const bladeMat = new THREE.MeshLambertMaterial({ color: blade });
        if (glow) { bladeMat.emissive = new THREE.Color(glow); bladeMat.emissiveIntensity = glowI; }
        const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.04), bladeMat);
        bladeMesh.position.set(0, -0.2 + len / 2, 0);
        bladeMesh.castShadow = true;
        group.add(bladeMesh);
        // Pointed tip
        const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.7, 0.18, 4), bladeMat);
        tip.position.set(0, -0.2 + len + 0.06, 0);
        tip.rotation.y = Math.PI / 4;
        group.add(tip);
        // Cross-guard
        const guardMesh = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.06, 0.1), new THREE.MeshLambertMaterial({ color: guard }));
        guardMesh.position.set(0, -0.2, 0);
        group.add(guardMesh);
        // Handle
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a1a }));
        handle.position.set(0, -0.35, 0);
        group.add(handle);
        if (gem) {
            const gemMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshLambertMaterial({ color: gem, emissive: new THREE.Color(gem), emissiveIntensity: 0.8 }));
            gemMesh.position.set(0, -0.2, 0.08);
            group.add(gemMesh);
        }
        if (glow) group.add(this._wpAura(glow, new THREE.BoxGeometry(width * 2.4, len * 1.05, 0.12), bladeMesh.position));
        group.position.set(0, -0.2, 0.15);
        return group;
    }

    _wpKatana({ blade = 0xe2e6ec, guard = 0x2a2a2a, len = 1.15, glow, glowI = 0 }) {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: blade });
        if (glow) { mat.emissive = new THREE.Color(glow); mat.emissiveIntensity = glowI; }
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.03), mat);
        b.position.set(0, -0.2 + len / 2, 0);
        b.rotation.z = 0.1; // hint of curve
        b.castShadow = true;
        group.add(b);
        const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10), new THREE.MeshLambertMaterial({ color: guard }));
        tsuba.position.set(0, -0.2, 0); tsuba.rotation.x = Math.PI / 2;
        group.add(tsuba);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6), new THREE.MeshLambertMaterial({ color: 0x202028 }));
        handle.position.set(0, -0.37, 0);
        group.add(handle);
        group.position.set(0, -0.2, 0.15);
        return group;
    }

    _wpHammer({ head = 0x70727a, handle = 0x5a3a1a, glow, glowI = 0 }) {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.0, 6), new THREE.MeshLambertMaterial({ color: handle }));
        shaft.position.set(0, 0.15, 0); shaft.castShadow = true;
        group.add(shaft);
        const headMat = new THREE.MeshLambertMaterial({ color: head });
        if (glow) { headMat.emissive = new THREE.Color(glow); headMat.emissiveIntensity = glowI; }
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), headMat);
        block.position.set(0, 0.62, 0); block.castShadow = true;
        group.add(block);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.36), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
        band.position.set(0, 0.62, 0);
        group.add(band);
        group.position.set(0, -0.2, 0.15);
        return group;
    }

    _wpAxe({ blade = 0xc8d2dc, handle = 0x5a3a1a, glow, glowI = 0 }) {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.05, 7), new THREE.MeshLambertMaterial({ color: handle }));
        shaft.position.set(0, 0.2, 0); shaft.castShadow = true; group.add(shaft);
        const bladeMat = new THREE.MeshLambertMaterial({ color: blade });
        if (glow) { bladeMat.emissive = new THREE.Color(glow); bladeMat.emissiveIntensity = glowI; }
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 0.4, 3), bladeMat);
        head.position.set(0.16, 0.68, 0); head.rotation.z = Math.PI / 2; head.castShadow = true; group.add(head);
        if (glow) group.add(this._wpAura(glow, new THREE.SphereGeometry(0.34, 10, 10), new THREE.Vector3(0.14, 0.68, 0)));
        group.position.set(0, -0.2, 0.15);
        return group;
    }

    _wpScythe({ blade = 0x8f3bd1, handle = 0x29173d, glow, glowI = 0 }) {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 7), new THREE.MeshLambertMaterial({ color: handle }));
        shaft.position.set(0, 0.3, 0); shaft.castShadow = true; group.add(shaft);
        const bladeMat = new THREE.MeshLambertMaterial({ color: blade });
        if (glow) { bladeMat.emissive = new THREE.Color(glow); bladeMat.emissiveIntensity = glowI; }
        const bladeMesh = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 6, 18, Math.PI * 0.76), bladeMat);
        bladeMesh.position.set(0.22, 0.92, 0); bladeMesh.rotation.z = -0.45; bladeMesh.castShadow = true; group.add(bladeMesh);
        if (glow) group.add(this._wpAura(glow, new THREE.SphereGeometry(0.38, 10, 10), new THREE.Vector3(0.22, 0.92, 0)));
        group.position.set(0, -0.25, 0.15);
        return group;
    }

    _wpStaff({ shaft = 0x7a4a24, gem = 0x46c8ff, glow = 0x46c8ff, glowI = 0.6 }) {
        const group = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 6), new THREE.MeshLambertMaterial({ color: shaft }));
        rod.position.set(0, 0.25, 0); rod.castShadow = true;
        group.add(rod);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshLambertMaterial({ color: gem, emissive: new THREE.Color(glow), emissiveIntensity: glowI }));
        orb.position.set(0, 0.95, 0);
        group.add(orb);
        const holder = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 10), new THREE.MeshLambertMaterial({ color: 0xd0a040 }));
        holder.position.set(0, 0.88, 0); holder.rotation.x = Math.PI / 2;
        group.add(holder);
        group.add(this._wpAura(glow, new THREE.SphereGeometry(0.2, 10, 10), new THREE.Vector3(0, 0.95, 0)));
        group.position.set(0, -0.2, 0.15);
        return group;
    }

    _wpBow({ wood = 0x8b5a2b, scale = 1.0, glow, glowI = 0 }) {
        const group = new THREE.Group();
        const woodMat = new THREE.MeshLambertMaterial({ color: wood });
        if (glow) { woodMat.emissive = new THREE.Color(glow); woodMat.emissiveIntensity = glowI; }
        group.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), woodMat));
        const limbGeo = new THREE.BoxGeometry(0.04, 0.42, 0.04);
        const up = new THREE.Mesh(limbGeo, woodMat); up.position.set(0, 0.33, -0.08); up.rotation.x = -0.45; up.castShadow = true; group.add(up);
        const lo = new THREE.Mesh(limbGeo, woodMat); lo.position.set(0, -0.33, -0.08); lo.rotation.x = 0.45; lo.castShadow = true; group.add(lo);
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        str.position.set(0, 0, -0.2); group.add(str);
        if (glow) group.add(this._wpAura(glow, new THREE.BoxGeometry(0.16, 1.0, 0.16), new THREE.Vector3(0, 0, -0.05)));
        group.scale.setScalar(scale);
        group.position.set(0, -0.1, 0.15);
        group.rotation.x = Math.PI / 2;
        return group;
    }

    _wpCrossbow({ wood = 0x6a4a2a, metal = 0x9098a0 }) {
        const group = new THREE.Group();
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), new THREE.MeshLambertMaterial({ color: wood }));
        stock.castShadow = true; group.add(stock);
        const limb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), new THREE.MeshLambertMaterial({ color: metal }));
        limb.position.set(0, 0.22, 0.02); limb.castShadow = true; group.add(limb);
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        str.position.set(0, 0.22, -0.02); str.rotation.z = Math.PI / 2; group.add(str);
        group.position.set(0, -0.1, 0.15);
        group.rotation.x = Math.PI / 2;
        return group;
    }

    _wpGun() {
        const group = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
        barrel.position.set(0, 0.1, 0.05); barrel.rotation.x = Math.PI / 2; barrel.castShadow = true; group.add(barrel);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
        grip.position.set(0, -0.1, 0); grip.rotation.x = 0.2; grip.castShadow = true; group.add(grip);
        group.position.set(0, -0.2, 0.15);
        return group;
    }

    // Cheap additive glow shell (no extra light) for special weapons.
    _wpAura(color, geometry, position) {
        const aura = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        aura.position.copy(position);
        return aura;
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
        const bodyGeo = new THREE.CapsuleGeometry(0.29, 0.30, 7, 14);
        const bodyMat = new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.72, metalness: 0.02 });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 1.0;
        this.body.scale.z = 0.72;
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Head
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xffc9a5, roughness: 0.82, metalness: 0 });
        const headGeo = new THREE.SphereGeometry(0.5, 22, 16);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = 1.7;
        head.scale.set(0.68, 0.64, 0.60);
        head.castShadow = true;
        this.mesh.add(head);

        for (const side of [-1, 1]) {
            const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skinMat);
            ear.position.set(side * 0.335, 1.69, 0);
            ear.scale.set(0.65, 1, 0.55);
            this.mesh.add(ear);
        }

        // Hair
        const hairGeo = new THREE.SphereGeometry(0.5, 18, 12);
        const hairMat = new THREE.MeshStandardMaterial({ color: this.hairColor, roughness: 0.74, metalness: 0 });
        this.hair = new THREE.Mesh(hairGeo, hairMat);
        this.hair.position.set(0, 1.94, -0.035);
        this.hair.scale.set(0.72, 0.29, 0.63);
        this.mesh.add(this.hair);

        this.hairTufts = this._buildChibiHairSilhouette(hairMat);
        this.mesh.add(this.hairTufts);

        // Gender-specific hair (female = long hair down the back)
        this._applyGenderHair();

        // ---- Face: eyes (white + pupil), eyebrows, nose, mouth, cheeks ----
        const faceMesh = (geo, matColor, x, y, z, basic = true) => {
            const m = new THREE.Mesh(geo, basic
                ? new THREE.MeshBasicMaterial({ color: matColor })
                : new THREE.MeshLambertMaterial({ color: matColor }));
            m.position.set(x, y, z);
            this.mesh.add(m);
            return m;
        };
        const scleraGeo = new THREE.SphereGeometry(0.075, 12, 9);
        const pupilGeo = new THREE.SphereGeometry(0.043, 10, 8);
        [-0.13, 0.13].forEach(x => {
            const white = faceMesh(scleraGeo, 0xffffff, x, 1.73, 0.298);
            white.scale.set(0.92, 1.18, 0.28);
            const pupil = faceMesh(pupilGeo, 0x182342, x + (x < 0 ? 0.008 : -0.008), 1.724, 0.322);
            pupil.scale.set(0.84, 1.16, 0.25);
            const shine = faceMesh(new THREE.SphereGeometry(0.012, 7, 6), 0xffffff, x - 0.014, 1.744, 0.336);
            shine.scale.z = 0.25;
        });
        // Eyebrows (match hair) — kept as refs so they recolor with the hair.
        const browGeo = new THREE.CapsuleGeometry(0.012, 0.09, 3, 6);
        this.brows = [-0.13, 0.13].map(x => {
            const brow = faceMesh(browGeo, this.hairColor, x, 1.835, 0.302, false);
            brow.rotation.z = Math.PI / 2 + (x < 0 ? -0.08 : 0.08);
            return brow;
        });
        // Nose — a small skin-tone wedge that sticks out.
        const nose = faceMesh(new THREE.SphereGeometry(0.035, 9, 7), 0xecaa88, 0, 1.655, 0.322, false);
        nose.scale.set(0.7, 0.8, 0.55);
        // Mouth.
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8a4038 }));
        mouth.position.set(0, 1.585, 0.327);
        mouth.rotation.z = Math.PI;
        this.mesh.add(mouth);
        // Rosy cheeks for a friendly look.
        const cheekGeo = new THREE.SphereGeometry(0.05, 9, 7);
        [-0.21, 0.21].forEach(x => { const c = faceMesh(cheekGeo, 0xff8fa1, x, 1.635, 0.301); c.scale.set(1.15, 0.58, 0.18); c.material.transparent = true; c.material.opacity = 0.62; });

        // Arms
        const armGeo = new THREE.CapsuleGeometry(0.105, 0.36, 5, 10);
        const armMat = new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.72 });

        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.43, 1.0, 0);
        this.leftArm.castShadow = true;
        const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 11, 8), skinMat);
        leftHand.position.y = -0.31;
        leftHand.scale.y = 0.85;
        this.leftArm.add(leftHand);
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.43, 1.0, 0);
        this.rightArm.castShadow = true;
        const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 11, 8), skinMat);
        rightHand.position.y = -0.31;
        rightHand.scale.y = 0.85;
        this.rightArm.add(rightHand);
        this.mesh.add(this.rightArm);

        // Build starting weapon visuals (defaults to Sword until loaded from DB)
        this.updateWeaponVisuals('Sword');

        // Legs
        const legGeo = new THREE.CapsuleGeometry(0.12, 0.28, 5, 10);
        const legMat = new THREE.MeshStandardMaterial({ color: this.pantsColor, roughness: 0.8 });

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

        // Glowing aura ring at the feet (a slowly-spinning magic circle).
        this._createAuraRing();

        // Safe spawn point: Prontera field (0, 1.2, 10)
        this.mesh.position.set(0, 1.2, 10);
        this.scene.add(this.mesh);

        this._applyJobAppearance();
        this.updateNameTag();
    }

    // Aura colour by class (falls back to a cyan-white for Novice).
    _auraColor() {
        const job = this.stats && this.stats.job;
        return { swordsman: 0xff5a5a, mage: 0xb060ff, archer: 0x66e07a, priest: 0xffe27a }[job] || 0x7fd0ff;
    }

    // A lightweight persistent aura: two concentric glowing rings + a few
    // radiating spokes, laid flat at the feet. Animated by rotation only (no
    // per-frame spawning), so it's cheap even with many players on screen.
    _createAuraRing() {
        if (this.auraRing) { this.mesh.remove(this.auraRing); this.auraRing = null; }
        const col = this._auraColor();
        const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const grp = new THREE.Group();
        // Soft radiant floor pool (kept low-opacity so overdraw stays cheap).
        const pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), glow(col, 0.16));
        pool.userData.noSpin = true;
        grp.add(pool);
        grp.add(new THREE.Mesh(new THREE.RingGeometry(0.72, 0.9, 40), glow(col, 0.7)));    // outer ring
        const whiteRing = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.52, 32), glow(0xffffff, 0.5)); // inner ring
        whiteRing.userData.keepWhite = true;
        grp.add(whiteRing);
        const spokeGeo = new THREE.PlaneGeometry(0.07, 0.26);
        const spokeMat = glow(col, 0.5);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const spoke = new THREE.Mesh(spokeGeo, spokeMat);
            spoke.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
            spoke.rotation.z = a;
            grp.add(spoke);
        }
        grp.rotation.x = -Math.PI / 2;
        grp.position.y = 0.05;
        this.mesh.add(grp);
        this.auraRing = grp;
    }

    // Recolour the aura (called when the class changes).
    refreshAura() {
        if (!this.auraRing) return;
        const col = this._auraColor();
        this.auraRing.children.forEach((m) => {
            if (m.material && !m.userData.keepWhite) m.material.color.setHex(col);
        });
    }

    // Adds class-specific silhouette pieces (pauldrons, robe, hat, quiver, halo)
    // over the player's chosen colors so each job is instantly recognisable —
    // for yourself and for everyone else (job is synced via getAppearance()).
    _applyJobAppearance() {
        if (!this.mesh) return;
        if (this._jobDecor) {
            for (const m of this._jobDecor) {
                this.mesh.remove(m);
                m.traverse?.(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) Array.isArray(c.material) ? c.material.forEach(x => x.dispose()) : c.material.dispose();
                });
            }
        }
        this._jobDecor = [];
        const job = this.stats && this.stats.job;
        this.refreshAura(); // aura colour tracks the class
        if (!job) return;

        const add = (obj) => { this.mesh.add(obj); this._jobDecor.push(obj); };
        const lambert = (color) => new THREE.MeshLambertMaterial({ color });
        const glow = (color, opacity = 0.5) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity });

        if (job === 'swordsman') {
            const steel = lambert(0x9aa4b2);
            [-0.37, 0.37].forEach(x => {
                const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.36), steel);
                p.position.set(x, 1.3, 0);
                p.castShadow = true;
                add(p);
            });
            const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.05), lambert(0x8a1a2a));
            cape.position.set(0, 0.95, -0.24);
            add(cape);
        } else if (job === 'mage') {
            const purple = lambert(0x5b3a9a);
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), purple);
            brim.position.set(0, 2.12, 0);
            add(brim);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 12), purple);
            cone.position.set(0, 2.42, 0);
            cone.castShadow = true;
            add(cone);
            const star = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), glow(0x9fd8ff, 0.9));
            star.position.set(0, 2.72, 0);
            add(star);
            const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.56, 0.95, 10), lambert(0x4030a0));
            robe.position.set(0, 0.5, 0);
            robe.castShadow = true;
            add(robe);
        } else if (job === 'archer') {
            const hood = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.62), lambert(0x2f5a2f));
            hood.position.set(0, 1.98, -0.02);
            hood.castShadow = true;
            add(hood);
            const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), lambert(0x6a4a2a));
            quiver.position.set(0.16, 1.15, -0.26);
            quiver.rotation.z = 0.35;
            quiver.castShadow = true;
            add(quiver);
            const tipMat = glow(0xe8e0c0, 1);
            [-0.05, 0, 0.05].forEach((dx, i) => {
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), tipMat);
                tip.position.set(0.16 + dx, 1.45 + i * 0.02, -0.28);
                add(tip);
            });
        } else if (job === 'priest') {
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 20), glow(0xffe98a, 0.95));
            halo.position.set(0, 2.28, 0);
            halo.rotation.x = Math.PI / 2;
            add(halo);
            const collar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.5), lambert(0xf2efe2));
            collar.position.set(0, 1.32, 0);
            add(collar);
            const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.54, 0.95, 10), lambert(0xece4d0));
            robe.position.set(0, 0.5, 0);
            robe.castShadow = true;
            add(robe);
        }
    }

    // Set body & arm color dynamically (for username-based consistent coloring)
    setBodyColor(color) {
        let colorVal = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
        // Guard: never let NaN/undefined poison the color (it would persist as 0 = black)
        if (!Number.isFinite(colorVal)) colorVal = 0x4060c0;
        this.bodyColor = colorVal;
        for (const mesh of [this.body, this.leftArm, this.rightArm]) {
            mesh?.material?.color?.setHex(colorVal);
        }
    }

    // Set gender and rebuild the gender-specific hair.
    // Female characters get long hair: a back panel flowing down to the
    // shoulders plus two side strands framing the face.
    setGender(gender) {
        this.gender = gender === 'female' ? 'female' : 'male';
        this._applyGenderHair();
    }

    // Self-contained fishing line + bobber, attached to this character's mesh
    // (local space, so it follows the player's position/facing and is cleaned
    // up with the mesh). Used to show OTHER players' fishing lines — the local
    // player uses the richer SceneManager fishing line. `active` = show it.
    syncFishingLine(active) {
        if (!active) {
            if (this._fishLineGroup) {
                this.mesh.remove(this._fishLineGroup);
                this._fishLineGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); });
                this._fishLineGroup = null;
            }
            return;
        }

        const waterY = 0.05;
        // Start near the hands/rod tip; cast forward (+Z is the facing dir since
        // rotation.y is set via atan2(dx,dz)); bobber sits on the water surface.
        const startLocal = new THREE.Vector3(0, 1.75, 0.45);
        const bobLocalY = waterY - (this.mesh.position.y || 1.2);
        const bobLocal = new THREE.Vector3(0, bobLocalY, 2.8);

        if (!this._fishLineGroup) {
            const g = new THREE.Group();
            this._fishLineMesh = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 })
            );
            g.add(this._fishLineMesh);
            this._fishBobber = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 8, 6),
                new THREE.MeshLambertMaterial({ color: 0xff4020 })
            );
            g.add(this._fishBobber);
            this.mesh.add(g);
            this._fishLineGroup = g;
        }

        // Bobber gentle bob on the surface
        const t = this.animTimer || 0;
        this._fishBobber.position.set(bobLocal.x, bobLocal.y + Math.sin(t * 2.5) * 0.05, bobLocal.z);

        // Slack line curve from rod tip to bobber
        const mid = new THREE.Vector3(
            (startLocal.x + bobLocal.x) / 2,
            startLocal.y + 0.3,
            (startLocal.z + bobLocal.z) / 2
        );
        const curve = new THREE.QuadraticBezierCurve3(startLocal, mid, this._fishBobber.position);
        this._fishLineMesh.geometry.setFromPoints(curve.getPoints(16));
    }

    _buildChibiHairSilhouette(mat) {
        const group = new THREE.Group();
        group.name = 'chibi-hair-silhouette';
        const highlightColor = mat.color.clone().offsetHSL(0, -0.04, 0.12);
        this.hairHighlightMaterial = new THREE.MeshStandardMaterial({ color: highlightColor, roughness: 0.62, metalness: 0 });
        const smoothLock = ({ x, y, z, sx, sy, sz, rz = 0, rx = 0, material = mat }) => {
            const lock = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), material);
            lock.position.set(x, y, z);
            lock.scale.set(sx, sy, sz);
            lock.rotation.set(rx, 0, rz);
            lock.castShadow = true;
            group.add(lock);
            return lock;
        };

        // Overlapping teardrop bangs form a continuous soft hairline. Their
        // lower edges stop above the eyes, so expressions stay readable.
        [
            { x: -0.255, y: 1.835, z: 0.275, sx: 0.105, sy: 0.18, sz: 0.075, rz: -0.34 },
            { x: -0.135, y: 1.855, z: 0.294, sx: 0.125, sy: 0.22, sz: 0.078, rz: -0.17 },
            { x: 0.000, y: 1.862, z: 0.302, sx: 0.135, sy: 0.215, sz: 0.08, rz: 0.04 },
            { x: 0.140, y: 1.852, z: 0.292, sx: 0.12, sy: 0.205, sz: 0.078, rz: 0.19 },
            { x: 0.255, y: 1.832, z: 0.273, sx: 0.10, sy: 0.17, sz: 0.073, rz: 0.35 },
        ].forEach(smoothLock);

        // Crown volumes and side locks create an attractive silhouette from
        // every camera angle instead of looking like flat hair painted on top.
        smoothLock({ x: -0.20, y: 2.045, z: -0.035, sx: 0.17, sy: 0.115, sz: 0.16, rz: -0.34 });
        smoothLock({ x: 0.00, y: 2.075, z: -0.055, sx: 0.18, sy: 0.12, sz: 0.17, rz: 0.03 });
        smoothLock({ x: 0.20, y: 2.045, z: -0.035, sx: 0.17, sy: 0.115, sz: 0.16, rz: 0.34 });
        smoothLock({ x: -0.315, y: 1.775, z: 0.065, sx: 0.085, sy: 0.205, sz: 0.105, rz: -0.13 });
        smoothLock({ x: 0.315, y: 1.775, z: 0.065, sx: 0.085, sy: 0.205, sz: 0.105, rz: 0.13 });
        smoothLock({ x: -0.10, y: 2.075, z: 0.105, sx: 0.075, sy: 0.035, sz: 0.055, rz: -0.20, material: this.hairHighlightMaterial });
        smoothLock({ x: 0.055, y: 2.085, z: 0.11, sx: 0.055, sy: 0.028, sz: 0.05, rz: 0.10, material: this.hairHighlightMaterial });
        return group;
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

        const longLock = (x, y, z, sx, sy, rz = 0) => {
            const lock = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat);
            lock.position.set(x, y, z);
            lock.scale.set(sx, sy, 0.10);
            lock.rotation.z = rz;
            lock.castShadow = true;
            group.add(lock);
        };

        // Layered back locks taper visually through overlap and move as one
        // lightweight group with the existing character animation.
        longLock(0, 1.53, -0.29, 0.23, 0.50);
        longLock(-0.19, 1.57, -0.275, 0.16, 0.43, -0.12);
        longLock(0.19, 1.57, -0.275, 0.16, 0.43, 0.12);

        // Side strands framing the face
        for (const side of [-1, 1]) {
            longLock(side * 0.305, 1.64, 0.105, 0.085, 0.30, side * 0.10);
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
        if (this.hairHighlightMaterial) {
            this.hairHighlightMaterial.color.setHex(colorVal).offsetHSL(0, -0.04, 0.12);
        }
        if (this.brows) this.brows.forEach(b => b.material && b.material.color.setHex(colorVal));
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

        if (this.equippedHat === 'None' || this.equippedHat === 'none') { this._updateDivineAura(); return; }

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
        } else if (this.equippedHat === 'Crown' || this.equippedHat === 'Crown of the First Light') {
            const divine = this.equippedHat === 'Crown of the First Light';
            const crownMat = new THREE.MeshLambertMaterial({ color: divine ? 0xfff0a3 : 0xffd700, emissive: divine ? 0x2acbe0 : 0x000000, emissiveIntensity: divine ? 0.55 : 0 });
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
        this._updateDivineAura();
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

        if (this.equippedGlasses === 'None' || this.equippedGlasses === 'none') { this._updateDivineAura(); return; }

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
        } else if (this.equippedGlasses === 'Monocle' || this.equippedGlasses === 'Oracle Lens') {
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
        this._updateDivineAura();
    }

    // Companion pet that trots beside the hero. The model is a child of the
    // character mesh (so it moves + rotates with the hero for free — works for
    // remote players too), positioned to the hero's right and animated with a
    // gentle hop in update(). Cheap: one small static voxel group, no particles.
    setPet(petKey, level = 1, xp = 0, name = null) {
        const key = (petKey && petKey !== 'None') ? petKey : null;
        this.equippedPet = key;
        this.petName = key ? (name || null) : null;
        if (!key) this.equippedPetUid = null;
        this.petLevel = Math.max(1, Math.floor(level) || 1);
        this.petXp = Math.max(0, xp || 0);
        if (this.petScaler) {
            this.mesh.remove(this.petScaler);
            this.petScaler.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) Array.isArray(c.material) ? c.material.forEach(m => m.dispose()) : c.material.dispose();
            });
            this.petScaler = null;
            this.petMesh = null;
            this.petParts = null;
        }
        if (!key) return;
        const pet = buildPet(key);
        if (!pet) return;
        // A size wrapper holds position + a big base scale, so the per-frame
        // squash/bounce that update() writes to the pet never fights the size.
        const scaler = new THREE.Group();
        scaler.position.set(1.05, 0, -0.2);        // beside + slightly behind the hero
        scaler.scale.setScalar(pet.userData.scale || 1.45); // bigger, more prominent
        this.mesh.add(scaler);
        scaler.add(pet);
        pet.rotation.y = -0.35;                     // face roughly where the hero looks
        this.petScaler = scaler;
        this.petMesh = pet;

        // Collect animatable rig parts once (legs/arms/ears/tail/wings/eyes) so
        // update() can drive a real walk cycle, tail wag and blink without any
        // per-frame traversal. Then build the level-scaled aura.
        const parts = { legs: [], arms: [], ears: [], tails: [], wings: [], eyes: [], aura: null, baseY: pet.userData.float ? 0.35 : 0 };
        pet.traverse(c => {
            const r = c.userData && c.userData.role;
            if (r === 'leg') parts.legs.push(c);
            else if (r === 'arm') parts.arms.push(c);
            else if (r === 'ear') parts.ears.push(c);
            else if (r === 'tail') parts.tails.push(c);
            else if (r === 'wing') parts.wings.push(c);
            else if (r === 'eye') parts.eyes.push(c);
        });
        this.petParts = parts;
        this._petBlink = { t: -1, next: 1.5 + Math.random() * 2.5 }; // blink scheduler
        this._buildPetAura(this.petLevel);
    }

    // XP a pet needs to reach `level+1`. Gentle curve so early levels come
    // quickly (visible reward) and later ones stretch out.
    getPetXpRequired(level) {
        return Math.floor(60 * Math.pow(level, 1.5));
    }

    // Grant pet XP (called on the owner's kills). Returns true if it levelled up.
    addPetXp(amount) {
        if (!this.equippedPet || !(amount > 0)) return false;
        this.petXp += amount;
        let leveled = false;
        // Cap at 40 so the aura tiers have a sensible ceiling.
        while (this.petLevel < 40 && this.petXp >= this.getPetXpRequired(this.petLevel)) {
            this.petXp -= this.getPetXpRequired(this.petLevel);
            this.petLevel++;
            leveled = true;
        }
        if (leveled) {
            this._buildPetAura(this.petLevel);
            this.petLevelFlash = 1.0; // triggers the pop in update()
        }
        return leveled;
    }

    // Aura tier from level: the visual "power band" a pet is in.
    _petTier(level) {
        if (level >= 30) return 4;
        if (level >= 20) return 3;
        if (level >= 10) return 2;
        if (level >= 5) return 1;
        return 0;
    }

    // Signature aura colour per pet species.
    _petAuraColor() {
        const MAP = {
            poring: 0xff6fae, chick: 0xffd54a, kitten: 0x9fd0ff,
            puppy: 0xffb060, owl: 0xc9a0ff, baby_dragon: 0x5affc0,
            sunfox: 0xffa13d, moss_turtle: 0x78d070, cloudling: 0x8edfff,
            moon_hare: 0xb7c8ff, bloom_fairy: 0xff79c0, ember_phoenix: 0xff6b32,
        };
        return MAP[this.equippedPet] || 0x8fd0ff;
    }

    // Build the level-scaled aura as children of the pet mesh. Deliberately
    // cheap and animation-only (spin/orbit, no per-frame particle spawning) so
    // it stays FPS-safe even with many pets on screen — same discipline as the
    // hero aura. Tier 0 (level < 5) adds nothing.
    _buildPetAura(level) {
        // Tear down any previous aura.
        if (this.petParts && this.petParts.aura) {
            const a = this.petParts.aura;
            [a.ring, a.glow, ...(a.sparkles || [])].forEach(m => {
                if (!m) return;
                this.petMesh.remove(m);
                if (m.geometry) m.geometry.dispose();
                if (m.material) m.material.dispose();
            });
            this.petParts.aura = null;
        }
        if (!this.petMesh || !this.petParts) return;
        const tier = this._petTier(level);
        if (tier === 0) return;
        const color = this._petAuraColor();
        const floats = this.petMesh.userData.float;
        const groundY = floats ? 0.05 : 0.02;
        const aura = { ring: null, glow: null, sparkles: [] };

        // Ground halo ring (tier 1+): a thin glowing torus that spins.
        const ringR = 0.34 + tier * 0.05;
        const ringGeo = new THREE.TorusGeometry(ringR, 0.02 + tier * 0.006, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.55 + tier * 0.06,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = groundY;
        this.petMesh.add(ring);
        aura.ring = ring;

        // Orbiting sparkles (tier 2+): a few tiny glow motes circling the pet.
        if (tier >= 2) {
            const count = tier >= 4 ? 5 : (tier >= 3 ? 4 : 3);
            const orbitR = ringR + 0.04;
            const orbitY = floats ? 0.5 : 0.28;
            for (let i = 0; i < count; i++) {
                const s = new THREE.Mesh(
                    new THREE.SphereGeometry(0.035 + tier * 0.006, 6, 6),
                    new THREE.MeshBasicMaterial({
                        color, transparent: true, opacity: 0.9,
                        blending: THREE.AdditiveBlending, depthWrite: false,
                    })
                );
                s.userData.phase = (i / count) * Math.PI * 2;
                s.userData.orbitR = orbitR;
                s.userData.orbitY = orbitY;
                this.petMesh.add(s);
                aura.sparkles.push(s);
            }
        }

        // Radiant body glow (tier 3+): a soft additive shell that breathes.
        if (tier >= 3) {
            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(floats ? 0.34 : 0.3, 10, 10),
                new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.16 + (tier - 3) * 0.06,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                })
            );
            glow.position.y = floats ? 0.5 : 0.26;
            this.petMesh.add(glow);
            aura.glow = glow;
        }

        this.petParts.aura = aura;
    }

    // ===== Worn gear visuals (helmet / body armor / cape / boots / shield) =====
    // Armor items only gave stats before; now each equipped piece shows on the
    // hero. Colours are chosen per item so a steel plate, a gold set and a dark
    // scale mail all look different. Rebuilt whenever gear changes.
    _disposeMesh(m) {
        if (!m) return;
        this.mesh.remove(m);
        m.traverse?.(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) Array.isArray(c.material) ? c.material.forEach(x => x.dispose()) : c.material.dispose();
        });
    }

    // Signature colour for a piece of gear, by item name (falls back by rarity).
    _gearColor(name, fallback = 0x9aa4b2) {
        const MAP = {
            // shields
            'Wooden Buckler': 0x8a5a2b, 'Iron Shield': 0x9aa4b2, 'Tear Shield': 0x315d99,
            'Golden Shield': 0xffcc33, 'Aegis of Olympus': 0x7fd0ff,
            // head
            'Iron Helm': 0xb8c0cc, 'Ranger Hood': 0x3f6d3f,
            // body
            'Cotton Shirt': 0xdcdce6, 'Adventurer Suit': 0x7a5a3a, 'Steel Plate Mail': 0x9aa4b2,
            'Valkyrie Armor': 0xe8edf2, 'Dragon Scale Mail': 0x315f5b,
            // garment
            'Leather Cloak': 0x6b4a2a, 'Shadow Garment': 0x2a2140, 'Odin Garment': 0x2f5fbf,
            // feet
            'Speed Boots': 0x6b4a2a,
            // pants
            'Leather Pants': 0x6b4a2a, 'Plate Legguards': 0x9aa4b2, 'Dragon Greaves': 0x3a5a44,
            // wrist
            'Leather Bracer': 0x6b4a2a, 'Steel Bracer': 0x9aa4b2, 'Guardian Wristguard': 0xffbe46,
            'Empyrean Plate': 0xfff3cf, 'Wings of Aeon': 0xf7fbff, 'Aegis Prime': 0xfff0bc,
            'Titan Bracers': 0xffedb5, 'Astral Legguards': 0x253b77, 'Worldwalker Greaves': 0xf7f7ea,
            'Eternity Ring': 0xffd84d, 'Heart of Cosmos': 0x246dff, 'Celestial Sovereign Helm': 0xfff2d2,
        };
        if (MAP[name] != null) return MAP[name];
        const it = ITEMS[name];
        const byRarity = { common: 0xcfd3dd, rare: 0x6aa8ff, epic: 0xbf7bff, legendary: 0xffbe46, mythic: 0xff5a8c };
        return (it && byRarity[it.rarity]) || fallback;
    }

    _gearAccent(name, fallback = 0xd8b04a) {
        const MAP = {
            'Wooden Buckler': 0x8e949c, 'Iron Shield': 0x515a66, 'Tear Shield': 0xd7e5ef,
            'Golden Shield': 0xffe68a, 'Aegis of Olympus': 0xd9ad42,
            'Iron Helm': 0x59616b, 'Ranger Hood': 0x253f2b,
            'Cotton Shirt': 0x8a5b32, 'Adventurer Suit': 0x3e2a1c, 'Steel Plate Mail': 0x4f5864,
            'Dragon Scale Mail': 0x74a99b, 'Valkyrie Armor': 0xf0bd3e,
            'Leather Cloak': 0x342217, 'Shadow Garment': 0x8c58c7, 'Odin Garment': 0xe5b646,
            'Speed Boots': 0xb27a35, 'Leather Pants': 0x39261a, 'Plate Legguards': 0x4f5864,
            'Dragon Greaves': 0x7eb7c2, 'Leather Bracer': 0x3d2819, 'Steel Bracer': 0x4f5864,
            'Guardian Wristguard': 0x3d6b9a,
            'Empyrean Plate': 0x36dff2, 'Wings of Aeon': 0x48e9ff, 'Aegis Prime': 0x2bd9ff,
            'Titan Bracers': 0x4ee7ff, 'Astral Legguards': 0xffd35a, 'Worldwalker Greaves': 0x45eaff,
            'Eternity Ring': 0x41dfff, 'Heart of Cosmos': 0xffd84d, 'Celestial Sovereign Helm': 0x42e9ff,
        };
        return MAP[name] ?? fallback;
    }

    _updateDivineAura() {
        if (!this.mesh) return;
        if (this.divineAura) { this._disposeMesh(this.divineAura); this.divineAura = null; }
        const divineNames = new Set(['Solaris Edge', 'Chronos Bow', 'Genesis Staff', 'Seraph Rod', 'Empyrean Plate', 'Wings of Aeon', 'Aegis Prime', 'Crown of the First Light', 'Oracle Lens', 'Titan Bracers', 'Astral Legguards', 'Worldwalker Greaves', 'Eternity Ring', 'Heart of Cosmos', 'Celestial Sovereign Helm']);
        const equipped = [this.equippedWeapon, this.equippedShield, this.equippedHat, this.equippedGlasses, ...Object.values(this.equippedGear || {})];
        const count = equipped.filter(name => divineNames.has(name)).length;
        if (!count) return;
        const group = new THREE.Group();
        const additive = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const floorCyan = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.045, 8, 40), additive(0x54eaff, 0.85));
        floorCyan.rotation.x = Math.PI / 2; floorCyan.position.y = 0.04; group.add(floorCyan);
        const floorGold = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 8, 32), additive(0xffd85a, 0.85));
        floorGold.rotation.x = Math.PI / 2; floorGold.position.y = 0.055; group.add(floorGold);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), additive(0xffef9d, 0.75));
        halo.position.set(0, 1.25, -0.28); group.add(halo);
        const orbit = new THREE.Group(); orbit.position.y = 1.05;
        for (let i = 0; i < Math.min(6, 3 + count); i++) {
            const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055 + count * 0.004), additive(i % 2 ? 0xffdc62 : 0x60efff, 0.95));
            const angle = i / Math.min(6, 3 + count) * Math.PI * 2;
            gem.position.set(Math.cos(angle) * 0.82, (i % 2) * 0.22, Math.sin(angle) * 0.82); orbit.add(gem);
        }
        group.add(orbit); group.userData.orbit = orbit; group.userData.power = Math.min(1.45, 1 + count * 0.06);
        this.mesh.add(group); this.divineAura = group;
    }

    // Rebuild all armor/shield meshes from equippedGear + equippedShield.
    updateGearVisuals() {
        if (!this.mesh) return;
        if (!this.gearMeshes) this.gearMeshes = {};
        for (const k of Object.keys(this.gearMeshes)) { this._disposeMesh(this.gearMeshes[k]); this.gearMeshes[k] = null; }

        const g = this.equippedGear || {};
        const lambert = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
        const additive = (color, opacity = 0.78) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

        // ---- Helmet (head armor) ----
        if (g.head) {
            const grp = new THREE.Group();
            const mat = lambert(this._gearColor(g.head));
            const signature = getEquipmentVisualSpec('head', g.head);
            if (g.head === 'Ranger Hood') {
                const hood = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.58, 8), mat);
                hood.position.y = 1.91; hood.rotation.y = Math.PI / 8; grp.add(hood);
                const opening = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 12, Math.PI), lambert(this._gearAccent(g.head)));
                opening.position.set(0, 1.78, 0.27); opening.rotation.z = Math.PI; grp.add(opening);
                const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), mat);
                tail.position.set(0, 1.66, -0.3); tail.rotation.x = -0.35; grp.add(tail);
            } else {
                const dome = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
                dome.position.y = 1.82; grp.add(dome);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 12), lambert(this._gearAccent(g.head)));
                rim.position.y = 1.8; grp.add(rim);
                const faceGuard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.045), mat);
                faceGuard.position.set(0, 1.7, 0.29); grp.add(faceGuard);
                const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.34), lambert(this._gearAccent(g.head)));
                crest.position.y = 2.02; grp.add(crest);
                if (signature === 'celestial-helm') {
                    [-1, 1].forEach(side => {
                        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 5), lambert(0xeaffff, { emissive: 0x27dff5, emissiveIntensity: 0.65 }));
                        wing.position.set(side * 0.36, 1.98, 0); wing.rotation.z = side * -0.72; grp.add(wing);
                    });
                    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.095), additive(0x78f4ff, 0.95));
                    star.position.set(0, 2.13, 0.16); grp.add(star);
                }
            }
            this.mesh.add(grp); this.gearMeshes.head = grp;
        }

        // ---- Body armor (chest plate + pauldrons over the torso) ----
        if (g.body) {
            const grp = new THREE.Group();
            const signature = getEquipmentVisualSpec('body', g.body);
            const mat = lambert(this._gearColor(g.body), { emissive: signature === 'empyrean-star' ? 0x164c5d : 0x000000, emissiveIntensity: signature === 'empyrean-star' ? 0.4 : 0 });
            const chest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.62, 0.46), mat);
            chest.position.y = 1.06; grp.add(chest);
            const accent = lambert(this._gearAccent(g.body));
            const belt = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.48), accent);
            belt.position.y = 0.72; grp.add(belt);
            if (g.body === 'Cotton Shirt') {
                const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 5, 12), accent);
                collar.position.set(0, 1.38, 0.23); collar.rotation.x = Math.PI / 2; grp.add(collar);
                for (let y = 0.95; y < 1.28; y += 0.1) {
                    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.025), accent);
                    lace.position.set(0, y, 0.245); lace.rotation.z = (Math.round(y * 10) % 2 ? 0.35 : -0.35); grp.add(lace);
                }
            } else if (g.body === 'Adventurer Suit') {
                [-1, 1].forEach(side => {
                    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.68, 0.025), accent);
                    strap.position.set(side * 0.19, 1.08, 0.245); strap.rotation.z = side * 0.25; grp.add(strap);
                    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.3), mat);
                    pad.position.set(side * 0.42, 1.31, 0); grp.add(pad);
                });
            } else {
                const breastplate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.05), accent);
                breastplate.position.set(0, 1.08, 0.25); grp.add(breastplate);
                [-0.42, 0.42].forEach(x => {
                    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat);
                    pad.scale.set(1.25, 0.62, 1); pad.position.set(x, 1.33, 0); grp.add(pad);
                });
                if (g.body === 'Dragon Scale Mail') {
                    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
                        const scale = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.13, 4), accent);
                        scale.position.set(-0.19 + col * 0.125, 0.96 + row * 0.12, 0.3); scale.rotation.z = Math.PI; grp.add(scale);
                    }
                }
                if (g.body === 'Valkyrie Armor') {
                    [-1, 1].forEach(side => {
                        for (let i = 0; i < 3; i++) {
                            const feather = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 5), mat);
                            feather.position.set(side * (0.5 + i * 0.07), 1.35 + i * 0.06, -0.02);
                            feather.rotation.z = side * (-0.65 - i * 0.12); grp.add(feather);
                        }
                    });
                    mat.emissive = new THREE.Color(0x4b3a08); mat.emissiveIntensity = 0.18;
                }
                if (signature === 'empyrean-star') {
                    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), additive(0x62efff, 0.95));
                    core.position.set(0, 1.12, 0.34); grp.add(core);
                    for (let i = 0; i < 3; i++) {
                        const ray = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 4), additive(0xffec9a));
                        ray.position.set((i - 1) * 0.17, 1.43, 0.05); ray.rotation.z = (i - 1) * 0.45; grp.add(ray);
                    }
                }
            }
            this.mesh.add(grp); this.gearMeshes.body = grp;
        }

        // ---- Garment (cape down the back) ----
        if (g.garment) {
            const grp = new THREE.Group();
            const signature = getEquipmentVisualSpec('garment', g.garment);
            const mat = lambert(this._gearColor(g.garment), { side: THREE.DoubleSide });
            const cape = new THREE.Mesh(new THREE.BoxGeometry(signature === 'aeon-wings' ? 0.34 : 0.56, 1.0, 0.06), mat);
            cape.position.set(0, 0.95, -0.26); cape.rotation.x = 0.06; grp.add(cape);
            const collar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.18), mat);
            collar.position.set(0, 1.42, -0.16); grp.add(collar);
            if (g.garment === 'Odin Garment') {
                const trim = lambert(this._gearAccent(g.garment));
                [-0.25, 0.25].forEach(x => {
                    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.92, 0.075), trim);
                    edge.position.set(x, 0.94, -0.3); grp.add(edge);
                });
                const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), trim);
                clasp.position.set(0, 1.46, -0.06); grp.add(clasp);
            }
            if (signature === 'shadow-cape') {
                for (let i = 0; i < 4; i++) {
                    const wisp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 5), additive(0xa957ff, 0.48));
                    wisp.position.set(-0.22 + i * 0.145, 0.42, -0.32); wisp.rotation.z = (i - 1.5) * 0.18; grp.add(wisp);
                }
            } else if (signature === 'aeon-wings') {
                [-1, 1].forEach(side => {
                    for (let i = 0; i < 5; i++) {
                        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.62 - i * 0.055, 6), lambert(i % 2 ? 0xbaf6ff : 0xffffff, { emissive: 0x2cbfd4, emissiveIntensity: 0.35 }));
                        feather.position.set(side * (0.25 + i * 0.1), 1.15 - i * 0.08, -0.27); feather.rotation.z = side * (-0.65 - i * 0.09); grp.add(feather);
                    }
                });
            }
            this.mesh.add(grp); this.gearMeshes.garment = grp;
        }

        // ---- Legguards (pants) over the upper legs ----
        if (g.pants) {
            const grp = new THREE.Group();
            const mat = lambert(this._gearColor(g.pants, 0x3a3a5a));
            [-0.15, 0.15].forEach(x => {
                const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.3), mat);
                guard.position.set(x, 0.45, 0); grp.add(guard);
                if (g.pants !== 'Leather Pants') {
                    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lambert(this._gearAccent(g.pants)));
                    knee.scale.set(1, 0.7, 0.6); knee.position.set(x, 0.35, 0.18); grp.add(knee);
                }
            });
            const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.44), mat);
            skirt.position.y = 0.64; grp.add(skirt);
            if (getEquipmentVisualSpec('pants', g.pants) === 'astral-legguards') {
                [-0.15, 0.15].forEach(x => { const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), additive(0xffdf65, 0.92)); star.position.set(x, 0.44, 0.22); grp.add(star); });
            }
            this.mesh.add(grp); this.gearMeshes.pants = grp;
        }

        // ---- Bracers (wrist) on both forearms ----
        if (g.wrist) {
            const grp = new THREE.Group();
            const mat = lambert(this._gearColor(g.wrist, 0x6b4a2a));
            [-0.45, 0.45].forEach(x => {
                const br = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), mat);
                br.position.set(x, 0.78, 0); grp.add(br);
                if (g.wrist === 'Guardian Wristguard' || g.wrist === 'Titan Bracers') {
                    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), lambert(this._gearAccent(g.wrist), { emissive: 0x16436f, emissiveIntensity: 0.5 }));
                    gem.position.set(x, 0.78, 0.14); grp.add(gem);
                    if (g.wrist === 'Titan Bracers') {
                        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 5), additive(0x63edff));
                        spike.position.set(x, 0.92, 0); grp.add(spike);
                    }
                }
            });
            this.mesh.add(grp); this.gearMeshes.wrist = grp;
        }

        // ---- Boots (feet) ----
        if (g.feet) {
            const grp = new THREE.Group();
            const mat = lambert(this._gearColor(g.feet, 0x6b4a2a));
            [-0.15, 0.15].forEach(x => {
                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.32), mat);
                boot.position.set(x, 0.22, 0.02); grp.add(boot);
                const toe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.14), mat);
                toe.position.set(x, 0.1, 0.2); grp.add(toe);
                if (g.feet === 'Speed Boots') {
                    [-1, 1].forEach(side => {
                        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 5), lambert(0xc9efff, { emissive: 0x4a9dc8, emissiveIntensity: 0.35 }));
                        wing.position.set(x + side * 0.13, 0.23, 0.02); wing.rotation.z = side * 0.8; grp.add(wing);
                    });
                }
                if (g.feet === 'Dragon Greaves') {
                    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 5), lambert(this._gearAccent(g.feet)));
                    claw.position.set(x, 0.12, 0.3); claw.rotation.x = Math.PI / 2; grp.add(claw);
                } else if (g.feet === 'Worldwalker Greaves') {
                    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 6, 18), additive(0x4aeaff));
                    halo.position.set(x, 0.1, 0.03); halo.rotation.x = Math.PI / 2; grp.add(halo);
                }
            });
            this.mesh.add(grp); this.gearMeshes.feet = grp;
        }

        // Rings now visibly wrap the right hand and retain their icon theme.
        if (g.ring) {
            const grp = new THREE.Group();
            const signature = getEquipmentVisualSpec('ring', g.ring);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 7, 18), lambert(this._gearColor(g.ring, 0xd9dde5)));
            ring.position.set(0.48, 0.67, 0.04); ring.rotation.y = Math.PI / 2; grp.add(ring);
            const gemColor = signature === 'gorgon-eye' ? 0x58ff62 : signature === 'glow-ring' ? 0xe45cff : signature === 'eternity-ring' ? 0x45eaff : 0xc8e4ff;
            const gem = new THREE.Mesh(new THREE.OctahedronGeometry(signature === 'eternity-ring' ? 0.075 : 0.052), additive(gemColor, 0.95));
            gem.position.set(0.55, 0.7, 0.05); grp.add(gem);
            if (signature === 'eternity-ring') {
                const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 20), additive(0xffd84d));
                orbit.position.set(0.49, 0.69, 0.03); orbit.rotation.y = Math.PI / 2; grp.add(orbit);
            }
            this.mesh.add(grp); this.gearMeshes.ring = grp;
        }

        // Accessories appear at their real location: earring or cosmic pendant.
        if (g.accessory) {
            const grp = new THREE.Group();
            if (getEquipmentVisualSpec('accessory', g.accessory) === 'gold-earring') {
                const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 6, 16), lambert(0xffce45));
                hoop.position.set(0.31, 1.62, 0.05); hoop.rotation.y = Math.PI / 2; grp.add(hoop);
            } else {
                const chain = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 24, Math.PI), lambert(0xffdc66));
                chain.position.set(0, 1.25, 0.25); chain.rotation.z = Math.PI; grp.add(chain);
                const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.105), additive(0x45a5ff, 0.95));
                heart.position.set(0, 1.08, 0.29); heart.scale.y = 1.25; grp.add(heart);
                const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 5, 24), additive(0xffd84d));
                orbit.position.copy(heart.position); orbit.rotation.x = 0.75; grp.add(orbit);
            }
            this.mesh.add(grp); this.gearMeshes.accessory = grp;
        }

        // ---- Shield (off-hand, on the left arm) ----
        if (this.equippedShield) {
            const grp = new THREE.Group();
            const mat = lambert(this._gearColor(this.equippedShield));
            const shieldSignature = getEquipmentVisualSpec('shield', this.equippedShield);
            const round = ['wood-buckler', 'olympus-aegis', 'prime-aegis'].includes(shieldSignature);
            const plate = round
                ? new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16), mat)
                : new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.29, 0.52, 5), mat);
            if (round) plate.rotation.x = Math.PI / 2;
            else plate.rotation.x = Math.PI / 2;
            plate.position.set(-0.62, 1.0, 0.08);
            grp.add(plate);
            const accent = lambert(this._gearAccent(this.equippedShield));
            const rim = new THREE.Mesh(round ? new THREE.TorusGeometry(0.28, 0.025, 7, 18) : new THREE.TorusGeometry(0.22, 0.025, 7, 5), accent);
            rim.position.set(-0.62, 1.0, 0.14); grp.add(rim);
            const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), accent);
            boss.position.set(-0.66, 1.0, 0.12); grp.add(boss);
            if (this.equippedShield === 'Aegis of Olympus') {
                const aura = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshBasicMaterial({ color: 0x72cfff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
                aura.position.set(-0.62, 1.0, 0.08); grp.add(aura);
            }
            if (shieldSignature === 'tear-shield') {
                const tear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), additive(0x8ddcff));
                tear.position.set(-0.62, 0.87, 0.19); grp.add(tear);
            } else if (shieldSignature === 'prime-aegis') {
                const aura = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 7, 24), additive(0x56eeff));
                aura.position.set(-0.62, 1.0, 0.1); grp.add(aura);
                for (let i = 0; i < 4; i++) {
                    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), additive(0xffe982));
                    const angle = i * Math.PI / 2;
                    ray.position.set(-0.62 + Math.cos(angle) * 0.32, 1 + Math.sin(angle) * 0.32, 0.12);
                    ray.rotation.z = -angle; grp.add(ray);
                }
            }
            this.mesh.add(grp); this.gearMeshes.shield = grp;
        }
        this._updateDivineAura();
    }

    // Achievement titles rendered above the name. Glow color feeds the canvas
    // shadowBlur; the sprite itself gets a soft pulse in update().
    static TITLE_META = {
        master_angler: { text: '🏆 Master Angler', color: '#ffd24a', glow: '#ffb020' },
    };

    setTitle(titleId) {
        const t = titleId && CharacterManager.TITLE_META[titleId] ? titleId : null;
        if (t === this.title) return;
        this.title = t;
        this.updateNameTag();
    }

    updateNameTag() {
        if (this.nameSprite) {
            this.mesh.remove(this.nameSprite);
        }

        const meta = this.title ? CharacterManager.TITLE_META[this.title] : null;
        const tierInfo = getJobTierInfo(this.stats.job, this.stats.level);

        const canvas = document.createElement('canvas');
        canvas.width = 320;
        const hasMeta = !!meta;
        canvas.height = hasMeta ? 120 : 84;

        const ctx = canvas.getContext('2d');
        const nameY = hasMeta ? 102 : 70;
        const stripY = hasMeta ? 78 : 46;

        // Shadow/Background behind the name line
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, stripY, 320, 32);

        // Achievement title line (above name)
        if (meta) {
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = meta.glow;
            ctx.shadowBlur = 12;
            const grad = ctx.createLinearGradient(60, 0, 260, 0);
            grad.addColorStop(0, '#ffe9a0');
            grad.addColorStop(0.5, meta.color);
            grad.addColorStop(1, '#ffe9a0');
            ctx.fillStyle = grad;
            ctx.fillText(meta.text, 160, 28);
            ctx.fillText(meta.text, 160, 28);
            ctx.shadowBlur = 0;
        }

        // Job Tier Title line
        if (tierInfo) {
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = tierInfo.glow;
            ctx.shadowBlur = 10;
            ctx.fillStyle = tierInfo.color;
            const tierText = `T${tierInfo.tier} ${tierInfo.name}`;
            ctx.fillText(tierText, 160, hasMeta ? 64 : 32);
            ctx.fillText(tierText, 160, hasMeta ? 64 : 32);
            ctx.shadowBlur = 0;
        }

        // Name text
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${this.stats.name} Lv.${this.stats.level}`, 160, nameY);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.nameSprite = new THREE.Sprite(spriteMat);
        this.nameSprite.position.y = hasMeta ? 2.95 : 2.8;
        this.nameSprite.scale.set(2.5, hasMeta ? 0.94 : 0.66, 1);
        this.mesh.add(this.nameSprite);
    }

    showKillStreakEffect(count) {
        if (this.streakSprite) {
            this.mesh.remove(this.streakSprite);
            if (this.streakTimeout) clearTimeout(this.streakTimeout);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Styles based on streak count
        let msg = count + ' KILL STREAK!';
        let color1 = '#ffaa00';
        let color2 = '#ff4400';
        let fontSize = 'bold 48px Arial';
        let glowColor = 'rgba(255, 100, 0, 0.8)';

        if (count >= 10) {
            msg = '🔥 RAMPAGE (' + count + ') 🔥';
            color1 = '#ff3300'; color2 = '#ff0000';
            fontSize = 'bold 54px Arial';
            glowColor = 'rgba(255, 0, 0, 0.9)';
        }
        if (count >= 20) {
            msg = '⚡ UNSTOPPABLE (' + count + ') ⚡';
            color1 = '#00ccff'; color2 = '#0066ff';
            fontSize = 'bold 58px Arial';
            glowColor = 'rgba(0, 150, 255, 1.0)';
        }
        if (count >= 50) {
            msg = '👑 GODLIKE (' + count + ') 👑';
            color1 = '#ffd700'; color2 = '#ff8800';
            fontSize = 'bold 64px Arial';
            glowColor = 'rgba(255, 215, 0, 1.0)';
        }

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 15;
        ctx.font = fontSize;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw text with gradient
        const grad = ctx.createLinearGradient(0, 40, 0, 90);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.strokeText(msg, 256, 64);
        ctx.fillText(msg, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.streakSprite = new THREE.Sprite(spriteMat);

        // Position it higher than name and chat
        this.streakSprite.position.y = 3.5;
        this.streakSprite.scale.set(4.5, 1.12, 1);
        this.mesh.add(this.streakSprite);

        // Animate up slightly
        let startTime = Date.now();
        const animate = () => {
            if (!this.streakSprite) return;
            let elapsed = Date.now() - startTime;
            if (elapsed < 3000) {
                this.streakSprite.position.y = 3.5 + (elapsed / 3000) * 0.5;
                this.streakSprite.material.opacity = 1 - (elapsed / 3000) * 0.2;
                requestAnimationFrame(animate);
            } else {
                if (this.streakSprite) {
                    this.mesh.remove(this.streakSprite);
                    this.streakSprite = null;
                }
            }
        };
        animate();

        this.streakTimeout = setTimeout(() => {
            if (this.streakSprite) {
                this.mesh.remove(this.streakSprite);
                this.streakSprite = null;
            }
        }, 4000);
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

        const maxWidth = 400;
        const allLines = wrapCanvasText(tempCtx, String(text).slice(0, 240), maxWidth);
        const lines = allLines.slice(0, 5);
        if (allLines.length > lines.length) {
            const lastIndex = lines.length - 1;
            let lastLine = lines[lastIndex].trimEnd();
            while (lastLine && tempCtx.measureText(`${lastLine}…`).width > maxWidth) {
                lastLine = splitGraphemes(lastLine).slice(0, -1).join('');
            }
            lines[lastIndex] = `${lastLine}…`;
        }
        const maxLineWidth = Math.max(...lines.map(value => tempCtx.measureText(value).width));

        // High-res canvas for sharpness
        const canvas = document.createElement('canvas');
        const padding = 20;
        const pointerHeight = 15;
        const lineHeight = 38;

        const bubbleWidth = Math.max(120, Math.min(maxWidth, maxLineWidth) + padding * 2);
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

        // Clamp the destination into the map so click-to-move can't target the
        // void — the character then stops cleanly at the edge instead of walking
        // in place against the boundary.
        const tx = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, targetPoint.x));
        const tz = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, targetPoint.z));
        const dir = new THREE.Vector3(tx - this.mesh.position.x, 0, tz - this.mesh.position.z);

        if (dir.length() > 0.1) {
            dir.normalize();
            this.mesh.position.add(dir.multiplyScalar(this.moveSpeed * dt));
            clampToWorld(this.mesh.position);

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
            clampToWorld(this.mesh.position);

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
            // Milestone: push the level-up to the server immediately so it can't
            // be lost to an abrupt disconnect before the next auto-save tick.
            if (typeof window !== 'undefined') window.zolosSaveNow?.();
        }

        return leveledUp;
    }

    // Every incoming player hit crosses this one boundary, including aggro,
    // world-boss, duel, and CombatSystem attacks.
    takeDamage(amount, options = {}) {
        const rawDamage = Number(amount) || 0;
        const effects = this.getCardEffects();
        const currentDef = Number(this.stats.def) || 0;
        const reduce = (damage) => applyIncomingCardEffects({ damage }, effects);
        let actualDmg;
        if (options.preMitigated) {
            // Legacy aggro arrives after main.js's first defense pass. Preserve
            // its historical second pass, then layer card reduction on top.
            const legacyDamage = options.ignoreDefense
                ? Math.max(0, rawDamage)
                : Math.max(1, rawDamage - Math.floor(currentDef * 0.3));
            actualDmg = reduce(legacyDamage);
        } else {
            const reducedDamage = reduce(rawDamage);
            actualDmg = options.ignoreDefense
                ? Math.max(0, reducedDamage)
                : Math.max(1, reducedDamage - Math.floor(currentDef * 0.3));
        }

        // Step 4: Ensure hp is a number before subtracting
        const currentHp = Number(this.stats.hp);
        if (isNaN(currentHp)) {
            this.stats.hp = Number(this.stats.max_hp) || 100;
        }

        this.stats.hp = Math.max(0, (Number(this.stats.hp) || 0) - actualDmg);
        return actualDmg;
    }

    // Resolve every player-originated hit through catalog card effects. Combat
    // and skills call this shared path so execute, lifesteal, and kill restores
    // cannot drift apart.
    applyCardDamage(target, damage, isCritical = false) {
        if (!target || typeof target.takeDamage !== 'function') return 0;

        const targetStats = target.data || target.stats || {};
        const targetHp = Number(target.hp ?? targetStats.hp) || 0;
        const targetMaxHp = Number(target.maxHp ?? targetStats.max_hp) || 1;
        const metadata = getMonsterCombatMeta(target.type, target.data || {});
        const effects = this.getCardEffects();
        const outcome = resolveOutgoingCardEffects({
            damage,
            isBoss: metadata.isBoss,
            family: metadata.family,
            playerHpRatio: (Number(this.stats.hp) || 0) / (Number(this.stats.max_hp) || 1),
            targetHpRatio: targetHp / targetMaxHp,
            targetHp,
        }, effects);
        const options = { ignoreDefense: outcome.execute };
        const actualDmg = target.data
            ? target.takeDamage(outcome.damage, isCritical, options)
            : target.takeDamage(outcome.damage, options);

        if (effects.lifestealPct > 0) {
            const healed = Math.max(1, Math.floor(actualDmg * effects.lifestealPct));
            this.stats.hp = Math.min(this.stats.max_hp, (Number(this.stats.hp) || 0) + healed);
        }

        const targetDied = target.data ? !target.alive : !target.isAlive?.();
        if (targetDied && (effects.onKillRestore.hp > 0 || effects.onKillRestore.sp > 0)) {
            const restored = applyOnKillCardEffects({
                hp: this.stats.hp,
                maxHp: this.stats.max_hp,
                sp: this.stats.sp,
                maxSp: this.stats.max_sp,
            }, effects);
            this.stats.hp = restored.hp;
            this.stats.sp = restored.sp;
        }

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
        const firstPerson = window.sceneManager?.getCameraMode?.() === 'first';
        this.mesh.visible = !firstPerson;

        // Step 8: Flag for CombatSystem to check for auto-resume
        this.justRespawned = true;
    }

    // Get save data
    getSaveData() {
        const inventory = window.gameUI ? window.gameUI.inventory : null;
        return {
            characterId: this.characterId,
            userId: this.userId,
            inventory: inventory, // Include inventory for server-side backup
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
                zol: this.stats.zol,
                job: this.stats.job || null,
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
                shield: this.equippedShield,
                armor: this.equippedGear?.body || null,
                // DB columns body_color/hair_color/pants_color are INTEGER — persist
                // the raw numeric color (e.g. 0x4060c0). Saving a hex string here made
                // the whole UPDATE fail (invalid integer), so nothing persisted.
                body_color: (this.bodyColor | 0),
                hair_color: (this.hairColor | 0),
                pants_color: (this.pantsColor | 0),
                // Full look (pet / refine / cards / every gear slot) as a JSON
                // blob so OFFLINE players' profiles can render the complete
                // appearance — the single columns above can't hold all of it.
                appearance: this.getAppearance()
            }
        };
    }

    // Update animation
    update(dt) {
        this.animTimer += dt;
        this.attackTimer += dt;

        // Spin the aura ring + gentle breathing pulse (rotation only — cheap).
        if (this.auraRing) {
            this.auraRing.rotation.z += dt * 0.7;
            const s = 1 + Math.sin(this.animTimer * 2.2) * 0.05;
            this.auraRing.scale.set(s, s, 1);
        }
        if (this.divineAura) {
            this.divineAura.rotation.y += dt * 0.65;
            const orbit = this.divineAura.userData.orbit;
            if (orbit) { orbit.rotation.y -= dt * 1.8; orbit.rotation.z = Math.sin(this.animTimer * 1.5) * 0.08; }
            const pulse = (this.divineAura.userData.power || 1) * (1 + Math.sin(this.animTimer * 3) * 0.045);
            this.divineAura.scale.set(pulse, pulse, pulse);
        }

        // Pet animation: a real rig, not just a bouncing blob. Legged pets trot
        // (hips swing, body bobs) when their owner is moving and idle-shift when
        // still; legless pets keep the springy hop; floaters bob and flap. On
        // top of that every pet wags its tail, bobs its ears and blinks. All
        // rotation/scale only — cheap enough for a crowd of pets on screen.
        if (this.petMesh) {
            const P = this.petParts;
            const floats = this.petMesh.userData.float;
            const legged = P && P.legs.length > 0;
            const t = this.animTimer;
            const speed = 1 + Math.min(this.petLevel, 40) * 0.012; // livelier as it grows
            const moving = this.state === 'walking' || this.state === 'running';

            if (floats) {
                this.petMesh.position.y = 0.35 + Math.sin(t * 2.4 * speed) * 0.1;
                this.petMesh.rotation.y = -0.35 + Math.sin(t * 1.3) * 0.16;
                this.petMesh.rotation.z = Math.sin(t * 2.4 * speed) * 0.06;
                this.petMesh.scale.set(1, 1, 1);
            } else if (legged) {
                // Standing on legs: a small trot-bob when moving, gentle breathing
                // when idle. The stride itself comes from the hip pivots below.
                const bob = moving ? Math.abs(Math.sin(t * 8 * speed)) * 0.045 : Math.sin(t * 2 * speed) * 0.01;
                this.petMesh.position.y = bob;
                const breathe = moving ? 1 : 1 + Math.sin(t * 2 * speed) * 0.02;
                this.petMesh.scale.set(1, breathe, 1);
                this.petMesh.rotation.y = -0.35 + (moving ? 0 : Math.sin(t * 1.6 * speed) * 0.07);
                this.petMesh.rotation.z = 0;
            } else {
                // Legless (slime/bunny/cloud on ground): springy hop with
                // squash/stretch → "ดุ๊กดิ๊ก".
                const hop = Math.abs(Math.sin(t * 3.4 * speed));
                this.petMesh.position.y = hop * 0.14;
                this.petMesh.scale.set(1 - hop * 0.1, 1 + hop * 0.16, 1 - hop * 0.1);
                this.petMesh.rotation.y = -0.35 + Math.sin(t * 2.2 * speed) * 0.1;
                this.petMesh.rotation.z = Math.sin(t * 6.8 * speed) * 0.05; // wiggle
            }

            if (P) {
                // Legs stride from the hips (diagonal gait via per-leg phase).
                if (P.legs.length) {
                    const f = (moving ? 9 : 2.4) * speed;
                    const amp = moving ? 0.6 : 0.05;
                    for (const lg of P.legs) lg.rotation.x = Math.sin(t * f + lg.userData.phase) * amp;
                }
                // Arms/hands swing counter to the stride.
                if (P.arms.length) {
                    const f = (moving ? 9 : 2) * speed;
                    const amp = moving ? 0.5 : 0.12;
                    for (const a of P.arms) a.rotation.x = Math.sin(t * f + a.userData.phase) * amp * (a.userData.side || 1);
                }
                // Ears/horns bob.
                for (const ear of P.ears) ear.rotation.x = (ear.userData.baseRotX || 0) + Math.sin(t * (moving ? 7 : 3) * speed + ear.userData.phase) * (moving ? 0.16 : 0.09);
                // Tail wag (livelier when moving).
                for (const tl of P.tails) tl.rotation.y = Math.sin(t * (moving ? 8 : 3.2) * speed) * (moving ? 0.5 : 0.32);
                // Flap any tagged wings.
                if (P.wings.length) {
                    const flap = Math.sin(t * (floats ? 9 : 13) * speed) * (floats ? 0.5 : 0.7);
                    for (const w of P.wings) w.rotation.z = (w.userData.baseRotZ || 0) + flap * (w.userData.side || 1);
                }
                // Blink: squash the eyes to a line for ~0.14s, then reschedule.
                if (P.eyes.length) {
                    const b = this._petBlink || (this._petBlink = { t: -1, next: 2 });
                    if (b.t < 0) {
                        b.next -= dt;
                        if (b.next <= 0) b.t = 0;
                    } else {
                        b.t += dt;
                        const k = Math.min(1, b.t / 0.14);
                        const sy = 1 - Math.sin(k * Math.PI) * 0.92; // 1 → ~0.08 → 1
                        for (const e of P.eyes) e.scale.y = sy;
                        if (b.t >= 0.14) { b.t = -1; b.next = 1.8 + Math.random() * 3; for (const e of P.eyes) e.scale.y = 1; }
                    }
                }
            }

            // Animate the level-scaled aura.
            const aura = this.petParts && this.petParts.aura;
            if (aura) {
                if (aura.ring) {
                    aura.ring.rotation.z += dt * 1.6;
                    aura.ring.material.opacity = (0.5 + Math.sin(t * 3) * 0.1);
                }
                if (aura.sparkles) {
                    for (const s of aura.sparkles) {
                        const a = s.userData.phase + t * 2.2;
                        s.position.set(
                            Math.cos(a) * s.userData.orbitR,
                            s.userData.orbitY + Math.sin(t * 4 + s.userData.phase) * 0.05,
                            Math.sin(a) * s.userData.orbitR
                        );
                    }
                }
                if (aura.glow) {
                    const g = 1 + Math.sin(t * 3.5) * 0.08;
                    aura.glow.scale.set(g, g, g);
                }
            }

            // Level-up pop: a quick over-scale that eases back to normal.
            if (this.petLevelFlash > 0) {
                this.petLevelFlash = Math.max(0, this.petLevelFlash - dt * 2.2);
                const pop = 1 + this.petLevelFlash * 0.4;
                this.petMesh.scale.multiplyScalar(pop);
            }
        }

        // Achievement title pulse — the glowing badge gently breathes
        if (this.title && this.nameSprite && this.nameSprite.material) {
            this.nameSprite.material.opacity = 0.86 + Math.sin(this.animTimer * 2.6) * 0.14;
        }

        // Natural regeneration is now handled by CombatSystem.js to avoid double regen issues

        // Count down skill cooldowns
        for (const skillId in this.cooldowns) {
            if (this.cooldowns[skillId] > 0) {
                this.cooldowns[skillId] = Math.max(0, this.cooldowns[skillId] - dt);
            }
        }

        // Expire temporary ATK/DEF buffs
        this.updateBuffs(dt);

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
    // The 3 skill ids this character can cast, from its job (Novice until one
    // is chosen). Single source of truth for the skill bar and AUTO casting.
    getSkills() {
        return getJobSkills(this.stats.job);
    }

    // ---- Temporary skill buffs ----
    getBuffPct(stat) {
        const b = this.activeBuffs && this.activeBuffs[stat];
        return b && b.remaining > 0 ? b.pct : 0;
    }

    // Per-class combat multiplier for hp/sp/atk/def (1.0 for a job-less Novice).
    // Applied at read time in the stat getters, so it never corrupts the saved
    // base stats and reverts cleanly on a job change.
    _jobMod(key) {
        const m = getJobMods(this.stats && this.stats.job);
        return (m && m[key]) || 1;
    }

    applyBuff(skill) {
        if (!this.activeBuffs) this.activeBuffs = { atk: null, def: null };
        // Recasting refreshes rather than stacks.
        this.activeBuffs[skill.buffStat] = {
            pct: skill.buffPct,
            remaining: skill.buffDuration,
            name: skill.name,
            emoji: skill.emoji,
        };
    }

    // Count buffs down; called from update(dt).
    updateBuffs(dt) {
        if (!this.activeBuffs) return;
        for (const stat of Object.keys(this.activeBuffs)) {
            const b = this.activeBuffs[stat];
            if (!b) continue;
            b.remaining -= dt;
            if (b.remaining <= 0) this.activeBuffs[stat] = null;
        }
    }

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

        // ---- Execute: dispatched on skill.type, so every skill is pure data ----
        const refund = () => { this.stats.sp += skill.spCost; this.cooldowns[skillId] = 0; };
        // Damage roll: ±spread around the base (single target ±10%, AoE ±20%).
        const roll = (base, spread) => Math.max(1, Math.floor(base * (1 - spread + Math.random() * spread * 2)));

        if (skill.type === 'physical' || skill.type === 'magic') {
            if (!currentTarget) {
                if (gameUI) gameUI.addCombatLog(`❌ ต้องการเป้าหมายในการใช้ ${skill.name}!`, 'system');
                refund();
                return false;
            }
            // Ranged skills reach further than a melee swing; melee ones have no
            // castRange and rely on the caller's own range check.
            if (skill.castRange && currentTarget.mesh) {
                const d = this.mesh.position.distanceTo(currentTarget.mesh.position);
                if (d > skill.castRange) {
                    if (gameUI) gameUI.addCombatLog(`❌ ${skill.name} ไกลเกินไป (ระยะ ${skill.castRange})`, 'system');
                    refund();
                    return false;
                }
            }

            const finalDmg = roll(this.stats.atk * skill.damageMultiplier, 0.1);
            const actualDmg = this.applyCardDamage(currentTarget, finalDmg);

            if (window.duelState && currentTarget.stats) {
                import('../network/GameSync.js').then(({ sendDuelHit }) => {
                    sendDuelHit(window.duelState.opponentUserId, finalDmg, false);
                });
            }

            if (gameUI) {
                const targetName = currentTarget.stats ? currentTarget.stats.name : (currentTarget.data ? currentTarget.data.name : currentTarget.name);
                gameUI.addCombatLog(`${skill.emoji} ใช้ [${skill.name}] โจมตี ${targetName}! สร้างความเสียหาย ${actualDmg}`, 'atk');
            }

            if (particleSystem) {
                if (particleSystem.spawnSkillEffect) {
                    particleSystem.spawnSkillEffect(skillId, this.mesh.position, currentTarget.mesh.position);
                } else if (particleSystem.createCriticalBurst) {
                    particleSystem.createCriticalBurst(currentTarget.mesh.position);
                }
            }

            if (effectCallback) effectCallback(skillId, currentTarget, actualDmg);

        } else if (skill.type === 'physical_aoe' || skill.type === 'magic_aoe') {
            // NOTE: this used to read skill.radius, which no skill defines — the
            // radius came out undefined so every `distance <= radius` test was
            // false and AoE skills reliably hit nothing. The field is aoeRange.
            const radius = skill.aoeRange || 5;
            const dmgBase = this.stats.atk * skill.damageMultiplier;

            if (gameUI) gameUI.addCombatLog(`${skill.emoji} ใช้ [${skill.name}] โจมตีเป็นวงกว้าง!`, 'atk');
            if (particleSystem && particleSystem.spawnSkillEffect) {
                particleSystem.spawnSkillEffect(skillId, this.mesh.position);
            } else if (particleSystem && particleSystem.createExplosion) {
                particleSystem.createExplosion(this.mesh.position, skill.color || 0xff6600);
            }

            let hits = 0;
            if (window.duelState) {
                const opponent = window.remotePlayersMap?.get(window.duelState.opponentUserId);
                if (opponent && opponent.character && opponent.character.isAlive()
                    && opponent.mesh.position.distanceTo(this.mesh.position) <= radius) {
                    const finalDmg = roll(dmgBase, 0.2);
                    const actualDmg = this.applyCardDamage(opponent.character, finalDmg);
                    hits++;
                    import('../network/GameSync.js').then(({ sendDuelHit }) => {
                        sendDuelHit(window.duelState.opponentUserId, finalDmg, false);
                    });
                    if (effectCallback) effectCallback(skillId, opponent.character, actualDmg);
                }
            } else if (monsterManager && monsterManager.monsters) {
                monsterManager.monsters.forEach(m => {
                    if (m.alive && m.mesh.position.distanceTo(this.mesh.position) <= radius) {
                        const finalDmg = roll(dmgBase, 0.2);
                        const actualDmg = this.applyCardDamage(m, finalDmg);
                        hits++;
                        if (effectCallback) effectCallback(skillId, m, actualDmg);
                    }
                });
            }

            if (hits === 0 && gameUI) {
                gameUI.addCombatLog('...แต่ไม่มีศัตรูอยู่ในระยะ', 'system');
            }

        } else if (skill.type === 'heal') {
            const healVal = this.stats.level * skill.healBase + Math.floor(this.stats.atk * 0.5);
            this.heal(healVal);

            if (gameUI) gameUI.addCombatLog(`${skill.emoji} ใช้ [${skill.name}] ฟื้นฟู HP +${healVal}!`, 'heal');
            if (particleSystem && particleSystem.spawnSkillEffect) {
                particleSystem.spawnSkillEffect(skillId, this.mesh.position);
            } else if (particleSystem && particleSystem.createHealEffect) {
                particleSystem.createHealEffect(this.mesh.position);
            }
            if (effectCallback) effectCallback(skillId, this, healVal);

        } else if (skill.type === 'buff') {
            this.applyBuff(skill);
            if (gameUI) {
                const label = skill.buffStat === 'atk' ? 'ATK' : 'DEF';
                gameUI.addCombatLog(
                    `${skill.emoji} ใช้ [${skill.name}] ${label} +${Math.round(skill.buffPct * 100)}% นาน ${skill.buffDuration} วิ`,
                    'heal');
            }
            if (particleSystem && particleSystem.spawnSkillEffect) {
                particleSystem.spawnSkillEffect(skillId, this.mesh.position);
            } else if (particleSystem && particleSystem.createHealEffect) {
                particleSystem.createHealEffect(this.mesh.position);
            }
            if (effectCallback) effectCallback(skillId, this, 0);
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
        this.stats.zol = isNaN(Number(data.zol)) ? 0 : Number(data.zol);
        // Job: null/unknown means Novice (hasn't chosen a path yet).
        this.stats.job = JOBS[data.job] ? data.job : null;
        this._applyJobAppearance(); // render the class silhouette once the job is known
        this.stats.total_kills = isNaN(Number(data.total_kills)) ? 0 : Number(data.total_kills);
        this.stats.play_time = isNaN(Number(data.play_time)) ? 0 : Number(data.play_time);
        // PVP ranking (server-authoritative — written only by the map server)
        this.stats.mmr = isNaN(Number(data.mmr)) ? 1000 : Number(data.mmr);
        this.stats.pvp_wins = isNaN(Number(data.pvp_wins)) ? 0 : Number(data.pvp_wins);
        this.stats.pvp_losses = isNaN(Number(data.pvp_losses)) ? 0 : Number(data.pvp_losses);

        // Load appearance if available
        if (data.gender) this.setGender(data.gender);
        if (data.body_color !== undefined && data.body_color !== null) this.setBodyColor(data.body_color);
        if (data.hair_color !== undefined && data.hair_color !== null) this.setHairColor(data.hair_color);
        if (data.pants_color !== undefined && data.pants_color !== null) this.setPantsColor(data.pants_color);
        if (data.hat) this.setHat(data.hat);
        if (data.glasses) this.setGlasses(data.glasses);
        if (data.weapon) this.equipWeapon(data.weapon);
        if (data.appearance && typeof data.appearance === 'object') {
            this.restoreCardAppearance(data.appearance);
        }

        // Load game settings — check DB data first, then fallback to localStorage
        let localSettings = {};
        try {
            const userIdKey = `zolos_settings_${data.user_id}`;
            const charIdKey = `zolos_settings_${this.characterId}`;
            localSettings = JSON.parse(localStorage.getItem(userIdKey) || localStorage.getItem(charIdKey) || '{}');
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

    _getRenderedColor(mesh, fallback) {
        const value = mesh?.material?.color?.getHex?.();
        return Number.isFinite(value) ? value : fallback;
    }

    getAppearance() {
        return {
            gender: this.gender,
            bodyColor: this._getRenderedColor(this.body, this.bodyColor),
            hairColor: this._getRenderedColor(this.hair, this.hairColor),
            pantsColor: this._getRenderedColor(this.leftLeg, this.pantsColor),
            hat: this.equippedHat,
            glasses: this.equippedGlasses,
            weapon: this.equippedWeapon,
            shield: this.equippedShield || null,
            gear: { ...(this.equippedGear || {}) }, // helmet/body/cape/boots so others see them
            pet: this.equippedPet || null,          // companion so others see it too
            petLevel: this.petLevel || 1,           // so others see the right aura tier
            petName: this.petName || null,          // custom pet name others can see
            refine: { ...(this.equipRefine || {}) }, // +N per slot so profiles show refine
            cards: { ...(this.equippedCards || {}) }, // canonical socketed card IDs
            cardState: normalizeCardState(this.cardState),
            job: this.stats ? (this.stats.job || null) : null,
            title: this.title
        };
    }

    restoreCardAppearance(appearance) {
        if (!appearance || typeof appearance !== 'object') return;
        if (appearance.cards && this.equippedCards) {
            for (const slot of Object.keys(this.equippedCards)) this.equippedCards[slot] = null;
            for (const [slot, idOrName] of Object.entries(appearance.cards)) {
                this.equipCard(slot, idOrName);
            }
        }
        if (appearance.cardState !== undefined) {
            this.cardState = normalizeCardState(appearance.cardState);
        }
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
        // Worn armor/shield → visible on remote heroes too.
        if (app.gear !== undefined && app.gear) {
            for (const k of Object.keys(this.equippedGear)) this.equippedGear[k] = app.gear[k] || null;
        }
        if (app.shield !== undefined) this.equippedShield = app.shield || null;
        // Refine (+N) per slot + socketed cards, so remote heroes carry them and
        // re-broadcast correctly (used by the profile popup to show +N / cards).
        if (app.refine && this.equipRefine) {
            for (const k of Object.keys(this.equipRefine)) this.equipRefine[k] = app.refine[k] || 0;
        }
        this.restoreCardAppearance(app);
        if (app.gear !== undefined || app.shield !== undefined) this.updateGearVisuals();
        if (app.pet !== undefined && app.pet !== this.equippedPet) {
            this.setPet(app.pet, app.petLevel || 1, 0, app.petName || null);
        } else if (app.pet !== undefined) {
            // Same pet key — sync level (teammate levelled up) and/or name.
            if ((app.petLevel || 1) !== this.petLevel) {
                this.petLevel = app.petLevel || 1;
                if (this.petMesh) this._buildPetAura(this.petLevel);
            }
            if (app.petName !== undefined) this.petName = app.petName || null;
        }
        // Sync class so other players see this hero's job-specific look.
        if (app.job !== undefined) {
            if (!this.stats) this.stats = {};
            const jobChanged = this.stats.job !== app.job;
            const jobVisualMissing = !!app.job
                && (!Array.isArray(this._jobDecor) || this._jobDecor.length === 0);
            if (jobChanged || jobVisualMissing) {
                this.stats.job = app.job;
                this._applyJobAppearance();
                this.updateNameTag();
            }
        }
        if (app.title !== undefined) this.setTitle(app.title);
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
