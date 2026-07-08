// Combat System — Auto-battle logic, damage calculation, loot drops
import * as THREE from 'three';
import { MONSTERS, FISH_SPECIES, FISH_RARITY_WEIGHTS } from './GameData.js';

export class CombatSystem {
    constructor(characterManager, monsterManager, onCombatEvent) {
        this.character = characterManager;
        this.monsters = monsterManager;
        this.onEvent = onCombatEvent; // callback for UI events
        this.autoFarm = false;
        this.isFishing = false;
        this.fishingTimer = 0;
        this.fishingBiteChance = 0.05;
        this.currentTarget = null;
        this.attackRange = 1.8;
        this.globalCooldown = 0;
    }

    toggleAutoFarm() {
        if (this.isFishing) this.toggleFishing();
        this.autoFarm = !this.autoFarm;
        if (!this.autoFarm) {
            this.currentTarget = null;
            this.character.state = 'idle';
        }
        return this.autoFarm;
    }

    toggleFishing() {
        this.isFishing = !this.isFishing;
        if (this.isFishing) {
            this.autoFarm = false;
            this.currentTarget = null;
            this.fishingTimer = 0;
            this.onEvent({ type: 'fishingStart' });
        } else {
            this.character.state = 'idle';
            this.onEvent({ type: 'fishingStop' });
        }
        return this.isFishing;
    }

    update(dt) {
        // Step 2: Clamp deltaTime to prevent spiral-of-death and ensure it's a valid number
        if (isNaN(dt) || dt === undefined) dt = 1 / 60;
        const clampedDt = Math.min(0.1, dt);

        // Step 6.2: Natural Regeneration
        if (!this.regenTimer) this.regenTimer = 0;
        this.regenTimer += clampedDt;
        if (this.regenTimer >= 3.0) {
            this.regenTimer = 0;
            if (this.character.isAlive()) {
                const maxHp = isNaN(this.character.stats.max_hp) ? 100 : this.character.stats.max_hp;
                const maxSp = isNaN(this.character.stats.max_sp) ? 50 : this.character.stats.max_sp;

                const hpRegen = Math.floor(maxHp * 0.02);
                const spRegen = Math.floor(maxSp * 0.03);

                this.character.stats.hp = Math.min(maxHp, this.character.stats.hp + hpRegen);
                this.character.stats.sp = Math.min(maxSp, this.character.stats.sp + spRegen);
            }
        }

        // Dead-state guard: if character is not alive, set state to 'idle', clear target, and return early
        if (!this.character.isAlive()) {
            this.character.state = 'idle';
            this.currentTarget = null;
            if (this.character.targetMonster) this.character.targetMonster = null;
            // Store autoFarm state if we died while it was active
            if (this.autoFarm) {
                this.wasAutoFarmingBeforeDeath = true;
                this.autoFarm = false;
            }
            return;
        }

        // Step 6.3: AUTO modeกลับมาทำงานอัตโนมัติเมื่อ HP ถึงเกณฑ์
        if (this.wasAutoFarmingBeforeDeath && this.character.isAlive()) {
            const maxHp = isNaN(this.character.stats.max_hp) ? 100 : this.character.stats.max_hp;
            if (this.character.stats.hp >= maxHp * 0.5) {
                this.autoFarm = true;
                this.wasAutoFarmingBeforeDeath = false;
                if (this.onEvent) this.onEvent({ type: 'autoResume' });
            }
        }

        this.globalCooldown = Math.max(0, this.globalCooldown - clampedDt);

        if (this.isFishing) {
            this._updateFishing(clampedDt);
            return;
        }

        // Determine active target (manual target from characterManager takes priority)
        let target = null;
        if (this.character.targetMonster) {
            target = this.character.targetMonster;
            if (!target.alive) {
                this.character.targetMonster = null;
                target = null;
            }
        }

        // Only search/move/attack nearest monster automatically if we don't have a manual target & autoFarm is active
        if (!target && this.autoFarm) {
            if (!this.currentTarget || !this.currentTarget.alive) {
                this.currentTarget = this.monsters.findNearest(this.character.getPosition());
            }
            target = this.currentTarget;
        }

        if (target && target.alive) {
            // Ensure character target is synced for UI target lock in AUTO mode
            if (this.autoFarm && !this.character.targetMonster) {
                this.character.targetMonster = target;
            }

            const playerPos = this.character.getPosition();
            const targetPos = target.getPosition();
            // Use 2D distance (XZ plane) for range checks to avoid issues with submerged monsters
            const distance = new THREE.Vector2(playerPos.x, playerPos.z).distanceTo(new THREE.Vector2(targetPos.x, targetPos.z));
            const range = this.character.getAttackRange();

            if (distance > range) {
                // Auto-farm moves toward target automatically
                if (this.autoFarm) {
                    this.character.moveToward(targetPos, clampedDt);
                }
            } else {
                // In range — face the target
                const dx = targetPos.x - playerPos.x;
                const dz = targetPos.z - playerPos.z;
                this.character.mesh.rotation.y = Math.atan2(dx, dz);

                if (this.globalCooldown <= 0) {
                    // Set attacking state only right when we attack
                    this.character.state = 'attacking';
                    this._performAttack(target);
                    this.globalCooldown = this.character.getAttackCooldown();
                } else {
                    // Between attacks — stand idle so animation doesn't freeze
                    if (this.character.state === 'attacking') {
                        this.character.state = 'idle';
                    }
                }
            }
        } else {
            // Step 2: Dead-state guard - if target died mid-frame
            if (target && !target.alive) {
                if (this.character.targetMonster === target) this.character.targetMonster = null;
                if (this.currentTarget === target) this.currentTarget = null;
                if (this.character.state === 'attacking') this.character.state = 'idle';
            }
            // Reset Target reference if we had any
            this.currentTarget = null;

            // Fix C: Handle case where AUTO finds no monster target
            // Ensure character returns to idle state when no target is found, 
            // especially during autoFarm to prevent getting stuck in 'walking' or 'attacking' state
            if (this.character.state === 'attacking' || this.character.state === 'walking' || this.character.state === 'running') {
                this.character.state = 'idle';
            }
        }

        // Fix B: Ensure globalCooldown reset always returns character to idle
        if (this.globalCooldown <= 0 && this.character.state === 'attacking' && !target) {
            this.character.state = 'idle';
        }
    }

    _performAttack(target) {
        const monster = target;
        if (!monster || !monster.alive) return;

        if (this.character.isRanged()) {
            // Ranged attack: Spawn projectile first
            this.onEvent({
                type: 'playerRangedAttack',
                target: monster,
                startPos: this.character.getPosition()
            });
        } else {
            // Melee attack: Immediate damage
            this._resolveDamage(monster);
        }
    }

    _resolveDamage(monster) {
        if (!monster || !monster.alive) return;

        // Player attacks monster
        const isCritical = Math.random() < 0.1;

        // Ensure stats are numbers
        const charAtk = isNaN(this.character.stats.atk) ? 10 : this.character.stats.atk;
        let baseDmg = charAtk + Math.floor(Math.random() * 5);
        if (isCritical) baseDmg = Math.floor(baseDmg * 1.8);

        const actualDmg = monster.takeDamage(baseDmg, isCritical);

        this.onEvent({
            type: 'playerAttack',
            damage: actualDmg,
            critical: isCritical,
            targetPos: monster.getPosition(),
            monsterName: monster.data.name,
        });

        // Monster counter-attacks (if alive and within range)
        if (monster.alive) {
            const playerPos = this.character.getPosition();
            const monsterPos = monster.getPosition();
            const dist = playerPos.distanceTo(monsterPos);

            // Monsters have a limited counter-attack range (usually melee or slightly more)
            if (dist < 4.0) {
                const monsterAtk = (monster.data && !isNaN(monster.data.atk)) ? monster.data.atk : 5;
                const monsterDmg = this.character.takeDamage(monsterAtk + Math.floor(Math.random() * 3));
                this.onEvent({
                    type: 'monsterAttack',
                    damage: monsterDmg,
                    targetPos: this.character.getPosition(),
                    monsterName: monster.data.name,
                });
            }
        }

        // Monster killed?
        if (!monster.alive) {
            this._onMonsterKilled(monster);
        }

        // Player died?
        if (!this.character.isAlive()) {
            this.onEvent({ type: 'playerDeath' });

            // Step 7: Store autoFarm state to resume after respawn
            const wasAutoFarming = this.autoFarm;
            this.autoFarm = false;
            this.currentTarget = null;
            if (this.character.targetMonster) this.character.targetMonster = null;

            setTimeout(() => {
                // Step 6.1: Respawn ด้วย HP บางส่วน
                this.character.respawn();
                this.onEvent({ type: 'playerRespawn' });

                // Note: wasAutoFarmingBeforeDeath is already set in update loop guard
            }, 3000);
        }
    }

    _onMonsterKilled(monster) {
        const data = monster.data;

        // EXP
        const leveledUp = this.character.addExp(data.exp);
        this.onEvent({
            type: 'expGain',
            amount: data.exp,
            targetPos: monster.getPosition(),
        });

        if (leveledUp) {
            this.onEvent({
                type: 'levelUp',
                level: this.character.stats.level,
            });
        }

        // Gold
        const goldAmount = data.gold.min + Math.floor(Math.random() * (data.gold.max - data.gold.min + 1));
        this.character.stats.gold += goldAmount;
        this.onEvent({
            type: 'goldGain',
            amount: goldAmount,
            targetPos: monster.getPosition(),
        });

        // Loot
        for (const lootEntry of data.loot) {
            if (Math.random() < lootEntry.chance) {
                this.onEvent({
                    type: 'lootDrop',
                    item: lootEntry,
                    targetPos: monster.getPosition(),
                });
            }
        }

        // Kill count
        this.character.stats.total_kills++;

        // Queue respawn
        this.monsters.queueRespawn(monster);

        // Clear target references
        if (this.character.targetMonster === monster) {
            this.character.targetMonster = null;
        }
        if (this.currentTarget === monster) {
            this.currentTarget = null;
        }

        if (this.character.state === 'attacking') {
            this.character.state = 'idle';
        }
        if (this.autoFarm) {
            this.currentTarget = this.monsters.findNearest(this.character.getPosition());
        }
    }

    _updateFishing(dt) {
        // Step 6: Fishing spot position (nearest water edge)
        const fishingSpot = { x: 0, y: 1.2, z: 2 };
        const playerPos = this.character.getPosition();
        const dist = playerPos.distanceTo(new THREE.Vector3(fishingSpot.x, playerPos.y, fishingSpot.z));

        if (dist > 1.0) {
            // Walk to fishing spot
            this.character.moveToward(fishingSpot, dt);
        } else {
            // At fishing spot — face the water (+X direction)
            this.character.mesh.rotation.y = Math.PI / 2;

            if (this.character.state !== 'fishing') {
                this.character.state = 'fishing';
                this.onEvent({ type: 'fishingCast' });
            }

            this.fishingTimer += dt;
            // Check for bite every 3 seconds
            if (this.fishingTimer >= 3.0) {
                this.fishingTimer = 0;
                // Roll a random chance (0.2 per 3s check)
                if (Math.random() < 0.2) {
                    this.onEvent({ type: 'fishingBite' });
                    // Catch fish!
                    setTimeout(() => {
                        if (this.isFishing && this.character.state === 'fishing') {
                            // Weighted random selection of rarity
                            const roll = Math.random();
                            let selectedRarity = 'common';
                            let cumulative = 0;
                            for (const [rarity, weight] of Object.entries(FISH_RARITY_WEIGHTS)) {
                                cumulative += weight;
                                if (roll <= cumulative) {
                                    selectedRarity = rarity;
                                    break;
                                }
                            }

                            // Pick a random fish from the matching rarity pool
                            const pool = Object.entries(FISH_SPECIES).filter(([_, data]) => data.rarity === selectedRarity);
                            const [fishName, fishData] = pool[Math.floor(Math.random() * pool.length)];

                            const fishItem = {
                                name: fishName,
                                emoji: fishData.emoji,
                                type: 'fish',
                                rarity: fishData.rarity,
                                price: fishData.price,
                                desc: fishData.desc
                            };

                            this.onEvent({
                                type: 'fishCaught',
                                item: fishItem,
                                rarity: fishItem.rarity
                            });
                            // Trigger standard loot drop for inventory addition
                            this.onEvent({
                                type: 'lootDrop',
                                item: fishItem,
                                targetPos: this.character.getPosition()
                            });
                        }
                    }, 1000);
                }
            }
        }
    }
}
