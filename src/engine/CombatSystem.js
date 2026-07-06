// Combat System — Auto-battle logic, damage calculation, loot drops
import { MONSTERS } from './GameData.js';

export class CombatSystem {
    constructor(characterManager, monsterManager, onCombatEvent) {
        this.character = characterManager;
        this.monsters = monsterManager;
        this.onEvent = onCombatEvent; // callback for UI events
        this.autoFarm = false;
        this.currentTarget = null;
        this.attackRange = 1.8;
        this.globalCooldown = 0;
    }

    toggleAutoFarm() {
        this.autoFarm = !this.autoFarm;
        if (!this.autoFarm) {
            this.currentTarget = null;
            this.character.state = 'idle';
        }
        return this.autoFarm;
    }

    update(dt) {
        this.globalCooldown = Math.max(0, this.globalCooldown - dt);

        if (!this.character.isAlive()) {
            // Dead — respawn after 3 seconds
            this.character.state = 'idle';
            this.currentTarget = null;
            if (this.character.targetMonster) this.character.targetMonster = null;
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

        if (target) {
            const playerPos = this.character.getPosition();
            const targetPos = target.getPosition();
            const distance = playerPos.distanceTo(targetPos);
            const range = this.character.getAttackRange();

            if (distance > range) {
                // Auto-farm moves toward target automatically
                if (this.autoFarm) {
                    this.character.moveToward(targetPos, dt);
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

        // Player attacks monster
        const isCritical = Math.random() < 0.1;
        let baseDmg = this.character.stats.atk + Math.floor(Math.random() * 5);
        if (isCritical) baseDmg = Math.floor(baseDmg * 1.8);

        const actualDmg = monster.takeDamage(baseDmg);

        this.onEvent({
            type: 'playerAttack',
            damage: actualDmg,
            critical: isCritical,
            targetPos: monster.getPosition(),
            monsterName: monster.data.name,
        });

        // Monster counter-attacks (if alive)
        if (monster.alive) {
            const monsterDmg = this.character.takeDamage(monster.data.atk + Math.floor(Math.random() * 3));
            this.onEvent({
                type: 'monsterAttack',
                damage: monsterDmg,
                targetPos: this.character.getPosition(),
                monsterName: monster.data.name,
            });
        }

        // Monster killed?
        if (!monster.alive) {
            this._onMonsterKilled(monster);
        }

        // Player died?
        if (!this.character.isAlive()) {
            this.onEvent({ type: 'playerDeath' });
            this.autoFarm = false;
            this.currentTarget = null;
            if (this.character.targetMonster) this.character.targetMonster = null;
            setTimeout(() => {
                this.character.respawn();
                this.onEvent({ type: 'playerRespawn' });
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

        // Fix A: Reset state when monster is killed
        if (this.character.state === 'attacking') {
            this.character.state = 'idle';
        }
        
        // Ensure autoFarm continues if active
        if (this.autoFarm) {
            this.currentTarget = this.monsters.findNearest(this.character.getPosition());
        }
    }
}
