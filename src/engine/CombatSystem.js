// Combat System — Auto-battle logic, damage calculation, loot drops
import * as THREE from 'three';
import { MONSTERS, FISH_SPECIES, FISH_RARITY_WEIGHTS } from './GameData.js';

export class CombatSystem {
    constructor(characterManager, monsterManager, onCombatEvent, sceneManager) {
        this.character = characterManager;
        this.monsters = monsterManager;
        this.onEvent = onCombatEvent; // callback for UI events
        this.sceneManager = sceneManager;
        this.autoFarm = false;
        this.isFishing = false;
        this.fishingTimer = 0;
        this.fishingBiteChance = 0.05;
        this.currentTarget = null;
        this.attackRange = 1.8;
        this.globalCooldown = 0;
    }

    toggleAutoFarm() {
        if (this.isFishing) return false;
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

            const playerPos = this.character.getPosition();
            const waterMatch = this._findNearestWater(playerPos);
            if (!waterMatch) {
                this.isFishing = false;
                this.onEvent({ type: 'fishingNoWater' });
                return false;
            }

            // Calculate stand spot and bobber target
            this.fishingStandSpot = new THREE.Vector3()
                .copy(playerPos)
                .addScaledVector(waterMatch.dir, waterMatch.distance - 0.8);

            // Adjust height to stay grounded
            this.fishingStandSpot.y = playerPos.y;

            this.fishingBobberSpot = new THREE.Vector3()
                .copy(playerPos)
                .addScaledVector(waterMatch.dir, waterMatch.distance + 1.8);
            this.fishingBobberSpot.y = 0.05;

            // Calculate rotation to face water
            this.fishingRotation = Math.atan2(waterMatch.dir.x, waterMatch.dir.z);

            this.onEvent({ type: 'fishingStart' });
        } else {
            this.character.state = 'idle';
            this.onEvent({ type: 'fishingStop' });
        }
        return this.isFishing;
    }

    _findNearestWater(playerPos) {
        if (!this.sceneManager) return null;

        let closestDist = Infinity;
        let closestDir = null;

        // Scan 36 directions
        for (let angle = 0; angle < Math.PI * 2; angle += (Math.PI * 2) / 36) {
            const dirX = Math.sin(angle);
            const dirZ = Math.cos(angle);

            // Scan outward up to 20 units
            for (let dist = 1.0; dist <= 20.0; dist += 0.5) {
                const testPos = new THREE.Vector3(
                    playerPos.x + dirX * dist,
                    playerPos.y,
                    playerPos.z + dirZ * dist
                );

                if (this.sceneManager.isInWater(testPos)) {
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestDir = new THREE.Vector3(dirX, 0, dirZ);
                    }
                    break;
                }
            }
        }

        if (closestDir) {
            return {
                dir: closestDir,
                distance: closestDist
            };
        }
        return null;
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
                // 1c. NaN HP/SP Guards: normalize current values before arithmetic
                const currentHp = isNaN(this.character.stats.hp) ? 0 : Number(this.character.stats.hp);
                const currentSp = isNaN(this.character.stats.sp) ? 0 : Number(this.character.stats.sp);

                const hpRegen = Math.floor(maxHp * 0.02);
                const spRegen = Math.floor(maxSp * 0.03);

                this.character.stats.hp = Math.min(maxHp, currentHp + hpRegen);
                this.character.stats.sp = Math.min(maxSp, currentSp + spRegen);
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

        // Step 6.3: หลังเกิดใหม่ ให้ "พัก" ฟื้นเลือดจนเต็มก่อน แล้วค่อยเปิด AUTO ต่อเอง.
        // Respawn drops us to 20% HP and natural regen is slow (~2%/3s → ~2 min to
        // full), so during this post-death recovery we heal fast (~15%/s) so the
        // wait is only a few seconds. Auto-farm resumes the instant HP is full.
        if (this.wasAutoFarmingBeforeDeath && this.character.isAlive()) {
            const maxHp = isNaN(this.character.stats.max_hp) ? 100 : this.character.stats.max_hp;
            const maxSp = isNaN(this.character.stats.max_sp) ? 50 : this.character.stats.max_sp;
            const curHp = isNaN(this.character.stats.hp) ? 0 : Number(this.character.stats.hp);
            const curSp = isNaN(this.character.stats.sp) ? 0 : Number(this.character.stats.sp);

            if (curHp < maxHp) {
                // Accelerated recovery (at least +1 so it never stalls on rounding)
                this.character.stats.hp = Math.min(maxHp, Math.floor(curHp + Math.max(1, maxHp * 0.15 * clampedDt)));
                this.character.stats.sp = Math.min(maxSp, Math.floor(curSp + Math.max(1, maxSp * 0.15 * clampedDt)));
            } else {
                this.autoFarm = true;
                this.wasAutoFarmingBeforeDeath = false;
                // Fresh cooldowns so auto-skills are ready the moment we resume
                if (this.character.cooldowns) {
                    for (const k of Object.keys(this.character.cooldowns)) this.character.cooldowns[k] = 0;
                }
                if (this.onEvent) this.onEvent({ type: 'autoResume' });
            }
        }

        this.globalCooldown = Math.max(0, this.globalCooldown - clampedDt);

        if (this.isFishing) {
            this._updateFishing(clampedDt);
            return;
        }

        // Determine active target (manual target from characterManager takes priority)
        if (window.duelState) {
            this.currentTarget = null;
            if (this.character.targetMonster) this.character.targetMonster = null;
            return;
        }

        // While actively fighting the World Boss, stand down: the boss combat
        // loop drives movement, facing, and the (continuous) attack animation.
        // Without this, this update would reset state back to 'idle' every frame
        // and drag the player off to farm nearby monsters.
        if (window.bossEngaged) {
            this.currentTarget = null;
            if (this.character.targetMonster) this.character.targetMonster = null;
            return;
        }

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
            // 2D (XZ) distance without allocating Vector2s each frame
            const _ddx = playerPos.x - targetPos.x;
            const _ddz = playerPos.z - targetPos.z;
            const distance = Math.sqrt(_ddx * _ddx + _ddz * _ddz);
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

        const weaponClass = this.character.getWeaponClass
            ? this.character.getWeaponClass()
            : (this.character.isRanged() ? 'bow' : 'melee');

        if (weaponClass === 'bow' || weaponClass === 'gun' || weaponClass === 'acolyte' || weaponClass === 'magic') {
            // Ranged/Projectile: spawn projectile or vertical effect; damage resolves on hit (see main.js)
            this.onEvent({
                type: 'playerRangedAttack',
                weaponClass,
                target: monster,
                startPos: this.character.getPosition()
            });
        } else if (weaponClass === 'thief') {
            // Thief: fast shadow slash (resolves immediately like melee but with special visual)
            this._resolveDamage(monster, 'thief');
        } else {
            // Melee: immediate damage + sword slash
            this._resolveDamage(monster, 'melee');
        }
    }

    _resolveDamage(monster, weaponClass = null) {
        if (!monster || !monster.alive) return;

        // Player attacks monster
        const isCritical = Math.random() < 0.1;

        // Ensure stats are numbers
        const charAtk = isNaN(this.character.stats.atk) ? 10 : this.character.stats.atk;
        let baseDmg = charAtk + Math.floor(Math.random() * 5);
        if (isCritical) baseDmg = Math.floor(baseDmg * 1.8);

        const actualDmg = monster.takeDamage(baseDmg, isCritical);

        // Shared HP: mark that WE damaged this monster (so we still get loot even
        // if a teammate lands the final blow) and relay the hit so everyone's
        // copy drains together and it dies faster.
        monster._localContributed = true;
        if (this.onMonsterDamaged) this.onMonsterDamaged(monster.id, actualDmg);

        this.onEvent({
            type: 'playerAttack',
            damage: actualDmg,
            critical: isCritical,
            targetPos: monster.getPosition(),
            monsterName: monster.data.name,
            weaponClass: weaponClass || (this.character.getWeaponClass ? this.character.getWeaponClass() : 'melee'),
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
            this.onEvent({ type: 'playerDeath', monsterName: monster.data.name });

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

    // A monster that WE (or teammates) killed died. `reward` awards exp/gold/loot
    // — set false when the monster died purely from a teammate's relayed damage
    // and we never touched it, so bystanders don't farm kills for free.
    _onMonsterKilled(monster, reward = true) {
        const data = monster.data;

        if (reward) {
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

            // Pet companion shares a slice of the spoils and grows over time.
            if (this.character.equippedPet && this.character.addPetXp) {
                const petLeveled = this.character.addPetXp(Math.max(1, Math.round(data.exp * 0.5)));
                if (petLeveled) {
                    this.onEvent({ type: 'petLevelUp', level: this.character.petLevel });
                }
            }

            // Daily Quest hunt progress event
            this.onEvent({
                type: 'monsterKilled',
                monsterName: data.name
            });

            // Kill count
            this.character.stats.total_kills++;
        }

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

    // A monster died from combined (relayed) damage on our screen. Reward us only
    // if we contributed any damage to it; either way it respawns for everyone.
    handleRemoteKill(monster) {
        if (!monster) return;
        this._onMonsterKilled(monster, monster._localContributed === true);
    }

    _updateFishing(dt) {
        if (!this.fishingStandSpot || !this.fishingBobberSpot) return;

        const playerPos = this.character.getPosition();
        const dist = playerPos.distanceTo(this.fishingStandSpot);

        if (dist > 0.5) {
            // Walk to calculated stand spot
            this.character.moveToward(this.fishingStandSpot, dt);
        } else {
            // At fishing spot — snap to stand spot and rotate to face bobber
            this.character.mesh.position.copy(this.fishingStandSpot);
            this.character.mesh.rotation.y = this.fishingRotation;

            if (this.character.state !== 'fishing') {
                this.character.state = 'fishing';
                this.onEvent({
                    type: 'fishingCast',
                    bobberPos: this.fishingBobberSpot
                });
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
