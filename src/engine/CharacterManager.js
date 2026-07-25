// Character Manager — Player character 3D model, animations, and state
import * as THREE from 'three';
import { getExpRequired, getStatGains, SKILLS, ITEMS, JOBS, getJobSkills, getJobMods, getRefineMult, getMonsterCombatMeta } from './GameData.js';
import { buildPet } from './PetModels.js';
import { getDeterministicGuestName, isPlaceholderName } from '../network/SupabaseClient.js';
import { getCard } from '../cards/CardCatalog.js';
import { normalizeCardState } from '../cards/CardProgression.js';
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
        this.equippedCards = {
            weapon: [null, null, null, null, null],
            shield: [null, null, null, null, null],
            hat: [null, null, null, null, null],
            glasses: [null, null, null, null, null],
            head: [null, null, null, null, null],
            body: [null, null, null, null, null],
            garment: [null, null, null, null, null],
            ring: [null, null, null, null, null],
            wrist: [null, null, null, null, null],
            pants: [null, null, null, null, null],
            feet: [null, null, null, null, null],
            accessory: [null, null, null, null, null]
        };
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
                const bonus = this.getWeaponAtkBonus(this.equippedWeapon) + this.getCardTotal('atkBonus');
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
        let bonus = Math.round((ITEMS[weaponName].atkBonus || 0) * getRefineMult(this.equipRefine.weapon));
        // Add card bonuses if equipped
        const inv = window.gameInventory || [];
        const item = inv.find(i => i.item_name === weaponName && i.stats && i.stats.equipped);
        if (item && item.stats && item.stats.cards) {
            item.stats.cards.forEach(cardName => {
                if (ITEMS[cardName]) bonus += ITEMS[cardName].atkBonus || 0;
            });
        }
        return bonus;
    }

    getWeaponSpBonus(weaponName) {
        if (!weaponName || !ITEMS[weaponName]) return 0;
        let bonus = Math.round((ITEMS[weaponName].spBonus || 0) * getRefineMult(this.equipRefine.weapon));
        const inv = window.gameInventory || [];
        const item = inv.find(i => i.item_name === weaponName && i.stats && i.stats.equipped);
        if (item && item.stats && item.stats.cards) {
            item.stats.cards.forEach(cardName => {
                if (ITEMS[cardName]) bonus += ITEMS[cardName].spBonus || 0;
            });
        }
        return bonus;
    }

    // Sum a bonus field (defBonus/hpBonus/spBonus) across every equipped gear
    // piece — the whole paper-doll contributes, each scaled by its refine level.
    _gearTotal(field) {
        let sum = 0;
        const inv = window.gameInventory || [];
        for (const slot of Object.keys(this.equippedGear)) {
            const name = this.equippedGear[slot];
            if (name && ITEMS[name]) {
                sum += Math.round((ITEMS[name][field] || 0) * getRefineMult(this.equipRefine[slot] || 0));
                // Add card bonuses
                const item = inv.find(i => i.item_name === name && i.stats && i.stats.equipped && i.stats.slot === slot);
                if (item && item.stats && item.stats.cards) {
                    item.stats.cards.forEach(cardName => {
                        if (ITEMS[cardName]) sum += ITEMS[cardName][field] || 0;
                    });
                }
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
    equipCard(slotId, idOrName, socketIdx = 0) {
        if (!(slotId in this.equippedCards)) return false;
        if (!idOrName) {
            if (Array.isArray(this.equippedCards[slotId])) {
                this.equippedCards[slotId][socketIdx] = null;
            } else {
                this.equippedCards[slotId] = null;
            }
            return true;
        }
        const card = getCard(idOrName);
        if (!card) return false;
        // Deduplication: ensure this card ID is not equipped in ANY other socket/slot
        for (const [slot, value] of Object.entries(this.equippedCards)) {
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    if ((slot !== slotId || i !== socketIdx) && value[i] === card.id) {
                        return false; // Already equipped in another socket/slot
                    }
                }
            } else {
                if (slot !== slotId && value === card.id) return false;
            }
        }
        if (Array.isArray(this.equippedCards[slotId])) {
            this.equippedCards[slotId][socketIdx] = card.id;
        } else {
            this.equippedCards[slotId] = card.id;
        }
        return true;
    }
    unequipCard(slotId, socketIdx = 0) {
        if (!(slotId in this.equippedCards)) return false;
        if (Array.isArray(this.equippedCards[slotId])) {
            this.equippedCards[slotId][socketIdx] = null;
        } else {
            this.equippedCards[slotId] = null;
        }
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
        const job = this.stats.job;
        if (w === 'Gun') return 'gun';
        if (w === 'Bow' || w === 'Crossbow' || w === 'Great Bow' || w === 'Rudra Bow' || w === 'Stormcaller Bow') return 'bow';
        if (job === 'mage') return 'magic';
        if (job === 'priest') return 'acolyte';
        return 'melee';
    }

    // Finer weapon class used only to pick an attack SOUND (sword/bow/gun/
    // blunt/staff/unarmed). Kept separate from getWeaponClass() — which drives
    // attack VISUALS as melee/bow/gun — so tuning sounds never changes visuals.
    getWeaponSoundClass() {
        const w = this.equippedWeapon;
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
        this._updateAppearance();
    }

    equipShield(itemName) {
        this.equippedShield = itemName;
        this._updateAppearance();
    }

    equipHat(itemName) {
        this.equippedHat = itemName;
        this._updateAppearance();
    }

    equipGlasses(itemName) {
        this.equippedGlasses = itemName;
        this._updateAppearance();
    }

    equipGear(slot, itemName) {
        if (slot in this.equippedGear) {
            this.equippedGear[slot] = itemName;
            this._updateAppearance();
        }
    }

    equipPet(petKey, uid, name, level, xp) {
        this.equippedPet = petKey;
        this.equippedPetUid = uid;
        this.petName = name;
        this.petLevel = level;
        this.petXp = xp;
        this._updateAppearance();
    }

    setGender(gender) {
        this.gender = gender;
        this._updateAppearance();
    }

    setBodyColor(color) {
        this.bodyColor = color;
        this._updateAppearance();
    }

    setHairColor(color) {
        this.hairColor = color;
        this._updateAppearance();
    }

    setPantsColor(color) {
        this.pantsColor = color;
        this._updateAppearance();
    }

    _updateAppearance() {
        if (!this.mesh) return;
        this._createModel(); // Rebuild model with new equipment
    }

    _createModel() {
        // ... rest of the file
    }
}
