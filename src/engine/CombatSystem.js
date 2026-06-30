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
            return;
        }

        if (!this.autoFarm) {
            if (this.character.state === 'attacking' && this.character.animTimer >= 0.5) {
                this.character.state = 'idle';
            }
            return;
        }

        // Auto-farm logic
        const playerPos = this.character.getPosition();

        // Find/validate target
        if (!this.currentTarget || !this.currentTarget.alive) {
            this.currentTarget = this.monsters.findNearest(playerPos);
            if (!this.currentTarget) {
                this.character.state = 'idle';
                return;
            }
        }

        const targetPos = this.currentTarget.getPosition();
        const distance = playerPos.distanceTo(targetPos);

        if (distance > this.attackRange) {
            // Move toward target
            this.character.moveToward(targetPos, dt);
        } else {
            // In range — attack!
            this.character.state = 'attacking';

            // Face target
            const dx = targetPos.x - playerPos.x;
            const dz = targetPos.z - playerPos.z;
            this.character.mesh.rotation.y = Math.atan2(dx, dz);

            if (this.globalCooldown <= 0) {
                this._performAttack();
                this.globalCooldown = this.character.attackCooldown;
            }
        }
    }

    _performAttack() {
        const monster = this.currentTarget;
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
        this.currentTarget = null;
    }
}
