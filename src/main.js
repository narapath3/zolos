// ZOLOS — Idle RPG Online
// Main Entry Point
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager, RemotePlayer } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { CombatSystem } from './engine/CombatSystem.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { SoundManager } from './engine/SoundManager.js';
import { InputManager } from './engine/InputManager.js';
import { AuthUI } from './ui/AuthUI.js';
import { GameUI } from './ui/GameUI.js';
import { SKILLS, ITEMS } from './engine/GameData.js';
import {
    loadCharacter,
    saveCharacter,
    loadInventory,
    joinPresence,
    leavePresence,
    startAutoSave,
    stopAutoSave,
    broadcastPosition,
    broadcastChat,
} from './network/GameSync.js';

// ============ App State ============
let sceneManager, character, monsters, combat, particles, gameUI;
let soundManager, inputManager;
let userId = null;
let username = 'Adventurer';
let onlinePlayers = [];
const remotePlayersMap = new Map();
let lastBroadcastTime = 0;
let portalCooldown = 0;
// Fishing state machine
let fishingState = 'idle'; // idle | walking | casting | waiting | catching
let fishingTimer = 0;
const FISHING_SPOT = { x: 1.5, y: 0, z: -2 }; // on the bridge edge
const FISHING_BASE_DELAY = 3.0; // seconds between catches (base)
let lastFishingBtnVisible = false;

// ============ Initialize Auth ============
const authUI = new AuthUI(async (authData) => {
    userId = authData.userId;
    username = authData.username;
    await initGame();
});

// ============ Initialize Game ============
async function initGame() {
    const canvas = document.getElementById('game-canvas');

    // Init engine
    sceneManager = new SceneManager(canvas);
    character = new CharacterManager(sceneManager.scene);
    monsters = new MonsterManager(sceneManager.scene, sceneManager);
    particles = new ParticleSystem(sceneManager.scene);
    soundManager = new SoundManager();
    inputManager = new InputManager();

    // Init UI
    gameUI = new GameUI(character, soundManager);

    // Setup chat send callback to route messages through GameSync network layer
    gameUI.setupChatSendCallback((message) => {
        broadcastChat(userId, username, character.stats.level, message);
    });

    // Expose for debugging
    window.sceneManager = sceneManager;
    window.character = character;
    window.monsters = monsters;
    window.gameUI = gameUI;

    // Load character from DB
    try {
        const charData = await loadCharacter(userId);
        character.loadStats(charData);
        character.stats.name = username;

        // Load inventory
        await gameUI.loadInventoryFromDB(charData.id);
    } catch (e) {
        console.warn('Could not load from DB, using defaults:', e.message);
        character.stats.name = username;
    }

    // Init combat system
    combat = new CombatSystem(character, monsters, handleCombatEvent);

    // Spawn monsters
    monsters.spawnInitial(character.stats.level);

    // Setup skill callbacks
    if (inputManager) {
        inputManager.setupSkillHotkey((skillId) => {
            executeActiveSkill(skillId);
        });
    }
    if (gameUI) {
        gameUI.setupSkillClicks((skillId) => {
            executeActiveSkill(skillId);
        });
    }

    // Setup canvas click listener for mouse movement and targeting
    canvas.addEventListener('click', (event) => {
        if (!combat || combat.autoFarm) return;
        if (!character || !character.isAlive()) return;

        const npc = sceneManager.getNPC();
        const hit = sceneManager.getMouseIntersection(event, monsters, npc);
        if (hit) {
            if (hit.type === 'monster') {
                character.targetMonster = hit.object;
                character.targetNPC = null;
                character.targetDest = null;
                gameUI.addCombatLog(`🎯 Target lock: ${hit.object.data.name}`, 'system');
            } else if (hit.type === 'npc') {
                character.targetNPC = hit.object;
                character.targetMonster = null;
                character.targetDest = null;
                gameUI.addCombatLog('🚶 เดินทางไปยังร้านค้า...', 'system');
            } else if (hit.type === 'ground') {
                character.targetDest = hit.point;
                character.targetMonster = null;
                character.targetNPC = null;
            }
        }
    });

    // Setup auto-farm button
    gameUI.setupAutoFarmButton(() => {
        const isActive = combat.toggleAutoFarm();
        if (isActive) {
            // Stop fishing if active
            stopFishing();
            // Clear mouse targets on auto-farm start
            character.targetDest = null;
            character.targetMonster = null;
            character.targetNPC = null;
            gameUI.addCombatLog('⚡ Auto-Farm ACTIVATED!', 'system');
        } else {
            gameUI.addCombatLog('⏸️ Auto-Farm paused', 'system');
        }
        return isActive;
    });

    // Setup fishing button
    gameUI.setupFishingButton(() => {
        if (fishingState !== 'idle') {
            stopFishing();
        } else {
            startFishing();
        }
    });

    // Setup logout button
    gameUI.setupLogoutButton(async () => {
        if (combat && combat.autoFarmActive) {
            combat.toggleAutoFarm();
            gameUI.setAutoFarmState(false);
        }
        if (character && character.characterId) {
            try {
                await saveCharacter(character.characterId, character.getSaveData().updates);
            } catch (e) {
                console.error('Failed to save character on logout:', e);
            }
        }
        leavePresence();
        stopAutoSave();
        const { clearActiveSession } = await import('./network/SupabaseClient.js');
        clearActiveSession();
        location.reload();
    });

    // Join presence
    const activePlayerIds = new Set();
    joinPresence(userId, username, character.stats.level, (players) => {
        onlinePlayers = players;
        gameUI.updateOnlinePlayers(players);

        // Update active player IDs
        activePlayerIds.clear();
        players.forEach(p => {
            if (p.userId !== userId) activePlayerIds.add(p.userId);
        });

        // Clean up players who are no longer present
        for (const [rId, remotePlayer] of remotePlayersMap.entries()) {
            if (!activePlayerIds.has(rId)) {
                remotePlayer.destroy();
                remotePlayersMap.delete(rId);
                gameUI.addCombatLog(`👋 ${remotePlayer.username} left the field`, 'system');
            }
        }
    }, (posData) => {
        if (posData.userId === userId) return;

        let remotePlayer = remotePlayersMap.get(posData.userId);
        if (!remotePlayer) {
            // Pick a consistent color based on username
            const charCodeSum = posData.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const colors = [0x40c060, 0xc0a040, 0x8a40c5, 0x4080c5, 0xc05040, 0xe080a0];
            const color = colors[charCodeSum % colors.length];

            remotePlayer = new RemotePlayer(
                sceneManager.scene,
                posData.userId,
                posData.username,
                posData.level,
                { x: posData.x, y: posData.y, z: posData.z },
                color
            );
            remotePlayersMap.set(posData.userId, remotePlayer);
            gameUI.addCombatLog(`👋 ${posData.username} (Lv.${posData.level}) joined the field!`, 'system');
        }

        remotePlayer.updateData(posData);
    }, (senderUsername, message) => {
        gameUI.receiveChatMessage(senderUsername, message);
    });

    // Start auto-save
    startAutoSave(() => character.getSaveData(), 15000);

    // Show game screen
    gameUI.show();
    gameUI.addCombatLog(`Welcome to Prontera Field, ${username}!`, 'system');
    gameUI.addCombatLog('Press AUTO to start farming! ⚔️', 'system');
    gameUI.addCombatLog('Use W/A/S/D to move, Space+W to sprint 🏃', 'system');

    // Start game loop
    gameLoop();
}

// ============ Combat Event Handler ============
function handleCombatEvent(event) {
    switch (event.type) {
        case 'playerAttack': {
            const screen = sceneManager.worldToScreen(event.targetPos);
            const label = event.critical ? `💥 ${event.damage}` : `${event.damage}`;
            const type = event.critical ? 'critical' : 'player-dmg';
            particles.spawnDamageNumber(screen.x, screen.y, label, type);

            // Hit effects
            particles.spawnHitEffect(event.targetPos, event.critical);

            // Sound effects
            if (event.critical) {
                soundManager.playCriticalSound();
            } else {
                soundManager.playHitSound();
            }

            gameUI.addCombatLog(
                `⚔️ Hit ${event.monsterName} for ${event.damage} damage${event.critical ? ' (CRITICAL!)' : ''}`,
                'damage'
            );
            break;
        }

        case 'monsterAttack': {
            const screen = sceneManager.worldToScreen(event.targetPos);
            particles.spawnDamageNumber(screen.x + 30, screen.y, `-${event.damage}`, 'monster-dmg');
            break;
        }

        case 'expGain': {
            const screen = sceneManager.worldToScreen(event.targetPos);
            particles.spawnDamageNumber(screen.x - 30, screen.y - 20, `+${event.amount} EXP`, 'heal');
            gameUI.addCombatLog(`✨ +${event.amount} EXP`, 'exp');
            break;
        }

        case 'goldGain': {
            gameUI.addCombatLog(`💰 +${event.amount} Zeny`, 'loot');
            break;
        }

        case 'lootDrop': {
            gameUI.addCombatLog(`📦 Got ${event.item.emoji} ${event.item.name}!`, 'loot');
            gameUI.addItem(event.item);

            // Death particles + sound
            const screen = sceneManager.worldToScreen(event.targetPos);
            particles.spawnDeathEffect(event.targetPos, 0xffd040);
            soundManager.playDeathSound();
            break;
        }

        case 'levelUp': {
            particles.showLevelUpEffect(event.level);
            soundManager.playLevelUpSound();
            gameUI.addCombatLog(`🎉 LEVEL UP! You are now Lv.${event.level}!`, 'levelup');

            // Save to DB immediately on level up
            if (character.characterId) {
                saveCharacter(character.characterId, character.getSaveData().updates);
            }
            break;
        }

        case 'playerDeath': {
            gameUI.addCombatLog('💀 You have been defeated! Respawning in 3s...', 'damage');
            gameUI.setAutoFarmState(false);
            break;
        }

        case 'playerRespawn': {
            gameUI.addCombatLog('✨ You have respawned!', 'system');
            break;
        }
    }
}

// ============ Active Skill Cast Handler ============
function executeActiveSkill(skillId) {
    if (!character || !character.isAlive()) return;

    let targetMonster = null;
    const skill = SKILLS[skillId];
    if (!skill) return;

    if (skill.target === 'single') {
        // Find nearest monster within casting range
        targetMonster = monsters.findNearest(character.getPosition(), 15);
    }

    const success = character.useSkill(
        skillId,
        targetMonster,
        monsters,
        gameUI,
        soundManager,
        particles,
        (type, target, val) => {
            const screen = sceneManager.worldToScreen(target.getPosition());
            if (type === 'heal') {
                particles.spawnDamageNumber(screen.x, screen.y - 40, `+${val}`, 'heal');
                particles.spawnHitEffect(target.getPosition(), true);
            } else if (type === 'bash' || type === 'magnumBreak') {
                const label = `💥 ${val}`;
                particles.spawnDamageNumber(screen.x, screen.y - 20, label, 'critical');
                particles.spawnHitEffect(target.getPosition(), true);
            }
        }
    );

    if (success) {
        if (gameUI) {
            gameUI.updateHUD(character.stats);
            gameUI.updateStats(character.stats);
        }
    }
}

// ============ Fishing Actions ============
function startFishing() {
    if (!character || !character.isAlive()) return;
    if (combat && combat.autoFarm) {
        combat.toggleAutoFarm();
        gameUI.setAutoFarmState(false);
    }
    character.targetDest = null;
    character.targetMonster = null;
    character.targetNPC = null;
    fishingState = 'walking';
    gameUI.setFishingState(true);
    gameUI.addCombatLog('🎣 เริ่มการตกปลาแบบออโต้! เริ่มเดินไปยังสะพาน...', 'system');
}

function stopFishing() {
    if (fishingState === 'idle') return;
    fishingState = 'idle';
    gameUI.setFishingState(false);
    if (sceneManager) {
        sceneManager.removeFishingLine();
    }
    gameUI.addCombatLog('⏸️ หยุดการตกปลาแล้ว', 'system');
}

// ============ Game Loop ============
function gameLoop() {
    requestAnimationFrame(gameLoop);

    const dt = Math.min(sceneManager.getDelta(), 0.05); // Cap dt

    // WASD and Mouse manual movement (only when auto-farm is off)
    if (inputManager && !combat.autoFarm) {
        const dir = inputManager.getMovementDirection();
        if (dir) {
            // Keyboard active — override and clear click targets
            character.targetDest = null;
            character.targetMonster = null;
            character.targetNPC = null;
            character.manualMove(dir, inputManager.isRunning(), dt);
        } else if (character.targetMonster) {
            const m = character.targetMonster;
            if (!m.alive) {
                character.targetMonster = null;
                if (character.state === 'walking' || character.state === 'running' || character.state === 'attacking') {
                    character.state = 'idle';
                }
            } else {
                const playerPos = character.getPosition();
                const targetPos = m.getPosition();
                const dist = playerPos.distanceTo(targetPos);

                if (dist > combat.attackRange) {
                    character.moveToward(targetPos, dt);
                } else {
                    if (character.state !== 'attacking') {
                        character.state = 'attacking';
                        character.animTimer = 0;
                    }
                    // Face target
                    const dx = targetPos.x - playerPos.x;
                    const dz = targetPos.z - playerPos.z;
                    character.mesh.rotation.y = Math.atan2(dx, dz);

                    // Perform attack
                    if (combat.globalCooldown <= 0) {
                        combat.currentTarget = m;
                        combat._performAttack();
                        combat.globalCooldown = character.attackCooldown;
                    }
                }
            }
        } else if (character.targetNPC) {
            const npcPos = character.targetNPC.position;
            const playerPos = character.getPosition();
            const dist = playerPos.distanceTo(npcPos);

            if (dist > 3.0) {
                character.moveToward(npcPos, dt);
            } else {
                character.targetNPC = null;
                character.state = 'idle';
                const btnShop = document.getElementById('btn-shop');
                if (btnShop) btnShop.click();
            }
        } else if (character.targetDest) {
            const arrived = character.moveToward(character.targetDest, dt);
            if (arrived) {
                character.targetDest = null;
                character.state = 'idle';
            }
        } else if (character.state === 'walking' || character.state === 'running' || character.state === 'swimming') {
            character.state = 'idle';
        }
    }

    // Swimming state detection: if player is in water, switch to swimming and slow down
    if (sceneManager && character.isAlive()) {
        const pPos = character.getPosition();
        const inWater = sceneManager.isInWater(pPos);
        if (inWater && (character.state === 'walking' || character.state === 'running')) {
            character.state = 'swimming';
            // Slow down in water (reduce position change)
            character.moveSpeed = 2.4; // 60% of normal 4
        } else if (!inWater && character.state === 'swimming') {
            character.state = 'walking';
            character.moveSpeed = 4; // Restore normal speed
        } else if (!inWater) {
            character.moveSpeed = 4;
        }
    }

    // Update systems
    character.update(dt);
    monsters.update(dt, sceneManager.camera, character.stats.level);
    combat.update(dt);
    particles.update(dt);

    // Trigger water splash particles when characters traverse the winding river
    if (sceneManager && particles) {
        // Local player splash
        const pPos = character.getPosition();
        if ((character.state === 'walking' || character.state === 'running' || character.state === 'swimming') && sceneManager.isInWater(pPos)) {
            particles.spawnWaterSplash(pPos);
        }

        // Remote players splash
        for (const remotePlayer of remotePlayersMap.values()) {
            const rPos = remotePlayer.mesh.position;
            if ((remotePlayer.state === 'walking' || remotePlayer.state === 'running') && sceneManager.isInWater(rPos)) {
                particles.spawnWaterSplash(rPos);
            }
        }

        // Monsters splash
        if (monsters && monsters.monsters) {
            for (const m of [...monsters.monsters, ...monsters.waterMonsters]) {
                if (m.alive && m.isMoving && sceneManager.isInWater(m.mesh.position)) {
                    particles.spawnWaterSplash(m.mesh.position);
                }
            }
        }
    }

    if (sceneManager) {
        sceneManager.updateAnimations(dt);

        // Map Portals transition check
        if (portalCooldown > 0) {
            portalCooldown -= dt;
        } else {
            const portals = sceneManager.getPortals();
            const playerPos = character.getPosition();
            for (const portal of portals) {
                const dist = playerPos.distanceTo(portal.position);
                if (dist <= 1.8) {
                    const targetMap = portal.userData.targetMap;
                    gameUI.addCombatLog(`🌀 Entering Portal... Transitioning to ${targetMap === 'payon' ? 'Payon Forest' : 'Prontera Field'}`, 'system');

                    // Set portal cooldown to prevent re-trigger
                    portalCooldown = 2.0;

                    // Stop any combat / auto-farm during transition
                    if (combat.autoFarm) {
                        combat.toggleAutoFarm();
                        gameUI.setAutoFarmState(false);
                    }
                    character.targetDest = null;
                    character.targetMonster = null;
                    character.targetNPC = null;
                    character.state = 'idle';

                    // Clear current monsters
                    monsters.monsters.forEach(m => m.destroy());
                    monsters.monsters = [];
                    monsters.waterMonsters.forEach(m => m.destroy());
                    monsters.waterMonsters = [];
                    monsters.deadQueue = [];

                    // Move player to safe spawn BEFORE loading new map
                    if (targetMap === 'payon') {
                        character.mesh.position.set(-5, 0, 0);
                    } else {
                        character.mesh.position.set(5, 0, 0);
                    }

                    // Swap map visual
                    sceneManager.loadMap(targetMap);

                    // Set monster manager map details
                    monsters.mapId = targetMap;
                    monsters.spawnInitial(character.stats.level);

                    // Sound Effect
                    if (soundManager) {
                        if (soundManager.playPortalSound) {
                            soundManager.playPortalSound();
                        } else {
                            soundManager.playLevelUpSound();
                        }
                    }

                    break;
                }
            }
        }

        // ============ Manual Fishing State Machine ============
        if (fishingState === 'walking') {
            const arrived = character.moveToward(FISHING_SPOT, dt);
            if (arrived) {
                fishingState = 'casting';
                fishingTimer = 0;
                // Face toward water (right side)
                character.mesh.rotation.y = Math.PI / 2;
                character.state = 'idle';
                sceneManager.createFishingLine(character.getPosition());
                gameUI.addCombatLog('🎣 เบ็ดลงน้ำแล้ว... รอปลามากินเบ็ด', 'system');
            }
        } else if (fishingState === 'casting') {
            fishingTimer += dt;
            if (fishingTimer >= 1.0) {
                fishingState = 'waiting';
                fishingTimer = 0;
            }
        } else if (fishingState === 'waiting') {
            fishingTimer += dt;
            if (fishingTimer >= FISHING_BASE_DELAY) {
                fishingState = 'catching';
                fishingTimer = 0;
                sceneManager.animateFishBite();
                if (particles) {
                    const bp = { x: 2.8, y: 0, z: -2 };
                    particles.spawnWaterSplash(bp);
                }
            }
        } else if (fishingState === 'catching') {
            fishingTimer += dt;
            if (fishingTimer >= 1.0) {
                // Determine catch
                const roll = Math.random();
                const catchName = roll < 0.65 ? 'Fish' : 'Trash';
                const catchItem = ITEMS[catchName];

                if (catchItem && gameUI) {
                    gameUI.addItem({ name: catchName, emoji: catchItem.emoji, type: catchItem.type });
                    gameUI.addCombatLog(`🎣 ตกได้ ${catchItem.emoji} ${catchName}!`, 'system');
                }
                if (soundManager && soundManager.playUseItemSound) {
                    soundManager.playUseItemSound();
                }

                // Loop back to waiting
                fishingState = 'waiting';
                fishingTimer = 0;
            }
        }

        // Show/hide fishing button based on rod equipped
        const hasFishingRod = character.equippedWeapon === 'Fishing Rod';
        if (hasFishingRod !== lastFishingBtnVisible) {
            lastFishingBtnVisible = hasFishingRod;
            gameUI.setFishingButtonVisible(hasFishingRod);
            if (!hasFishingRod && fishingState !== 'idle') {
                stopFishing();
            }
        }

        // NPC proximity range checks
        const npc = sceneManager.getNPC();
        if (npc) {
            const pPos = character.getPosition();
            const npcDist = pPos.distanceTo(npc.position);
            const shopPanel = document.getElementById('shop-panel');
            if (npcDist > 4.5 && shopPanel && shopPanel.style.display !== 'none') {
                shopPanel.style.display = 'none';
                gameUI.addCombatLog('👋 เดินห่างจากร้านค้ามากเกินไป', 'system');
            }
        }
    }

    // Update skills cooldown overlays in game UI
    for (const skillId in character.cooldowns) {
        const skill = SKILLS[skillId];
        if (skill && gameUI) {
            gameUI.updateSkillCooldown(skillId, character.cooldowns[skillId], skill.cooldown);
        }
    }

    // Update remote players
    for (const remotePlayer of remotePlayersMap.values()) {
        remotePlayer.update(dt);
    }

    // Camera follow player
    sceneManager.followTarget(character.getPosition());

    // Broadcast own position every 100ms
    const now = performance.now();
    if (now - lastBroadcastTime > 100 && character && userId) {
        broadcastPosition(userId, username, character.stats.level, character.getPosition(), character.mesh.rotation.y, character.state);
        lastBroadcastTime = now;
    }

    // Update UI every few frames
    if (Math.random() < 0.3) {
        gameUI.updateHUD(character.stats);
        gameUI.updateStats(character.stats);
    }

    // Render
    sceneManager.render();
}

// ============ Cleanup on unload ============
window.addEventListener('beforeunload', async () => {
    if (character && character.characterId) {
        await saveCharacter(character.characterId, character.getSaveData().updates);
    }
    leavePresence();
    stopAutoSave();
});

// Remove default Vite content
const defaultApp = document.getElementById('app');
if (defaultApp) defaultApp.remove();
