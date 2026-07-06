// ZOLOS — Idle RPG Online
// Main Entry Point
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { CombatSystem } from './engine/CombatSystem.js';
import * as THREE from 'three';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { SoundManager } from './engine/SoundManager.js';
import { GameUI } from './ui/GameUI.js';
import { AuthUI } from './ui/AuthUI.js';
import { AdminUI } from './ui/AdminUI.js';
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
let sceneManager, character, monsters, particles, gameUI, authUI;
let soundManager, combatSystem;
let isGameStarted = false;
let lastTime = 0;
let portalCooldown = 0;
let userId = null;
let username = 'Adventurer';

// Multiplayer state
const remotePlayersMap = new Map();
let lastBroadcastTime = 0;
let lastHUDTime = 0;
let lastStatsTime = 0;
let lastMinimapTime = 0;

// Input state
const keys = {};
let autoPath = null;
let isShiftPressed = false;

// ============ Initialize Auth ============
async function initAuth() {
    // Initial UI setup - Use AuthUI for login screen
    authUI = new AuthUI((sessionData) => {
        userId = sessionData.userId;
        username = sessionData.username;
        showCharacterSelect();
    });
}

// ============ Initialize Game ============
async function initGame(charData) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // Show game screen, hide auth
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';

    sceneManager = new SceneManager(canvas);
    character = new CharacterManager(sceneManager.scene);

    // Load character data
    character.loadStats(charData);
    userId = charData.user_id;
    username = charData.name;

    // Setup systems
    particles = new ParticleSystem(sceneManager.scene);
    soundManager = new SoundManager();
    monsters = new MonsterManager(sceneManager.scene, sceneManager);

    // Initialize Combat System
    combatSystem = new CombatSystem(character, monsters, (event) => {
        // Combat event handler — connects CombatSystem to particles, sound, and UI
        if (!event) return;
        switch (event.type) {
            case 'playerAttack':
                if (particles) particles.createHitBurst(event.targetPos);
                if (soundManager) soundManager.playAtkSound();
                if (gameUI) gameUI.addCombatLog(`⚔️ You hit ${event.monsterName} for ${event.damage} damage${event.critical ? ' (CRITICAL!)' : ''}`, 'damage');
                break;
            case 'monsterAttack':
                if (gameUI) gameUI.addCombatLog(`🩸 ${event.monsterName} hits you for ${event.damage} damage`, 'warning');
                break;
            case 'expGain':
                if (gameUI) gameUI.addCombatLog(`✨ +${event.amount} EXP`, 'exp');
                break;
            case 'goldGain':
                if (gameUI) gameUI.addCombatLog(`💰 +${event.amount} Gold`, 'gold');
                break;
            case 'levelUp':
                if (soundManager) soundManager.playLevelUpSound();
                if (gameUI) gameUI.addCombatLog(`🎉 LEVEL UP! You are now level ${event.level}!`, 'levelup');
                break;
            case 'lootDrop':
                if (gameUI) gameUI.addCombatLog(`🎁 Dropped: ${event.item.name}`, 'loot');
                if (gameUI) gameUI.addItem(event.item);
                break;
            case 'playerDeath':
                if (gameUI) {
                    gameUI.addCombatLog('💀 You have been defeated! Respawning in 3s...', 'death');
                    gameUI.setAutoFarmState(false);
                }
                break;
            case 'playerRespawn':
                if (gameUI) gameUI.addCombatLog('💚 You have respawned!', 'system');
                break;
            case 'fishingStart':
                if (gameUI) gameUI.addCombatLog('🎣 หาที่ว่างริมน้ำเพื่อเริ่มตกปลา...', 'system');
                break;
            case 'fishingCast':
                if (sceneManager && character) sceneManager.createFishingLine(character.getPosition());
                if (gameUI) gameUI.addCombatLog('🎣 โยนเบ็ดลงน้ำแล้ว... รอปลามาติดเบ็ด', 'system');
                break;
            case 'fishingBite':
                if (sceneManager) sceneManager.animateFishBite();
                if (gameUI) gameUI.addCombatLog('❗ ปลาติดเบ็ดแล้ว! กำลังดึงขึ้นมา...', 'system');
                break;
            case 'fishingStop':
                if (sceneManager) sceneManager.removeFishingLine();
                break;
        }
    });

    // Initialize Game UI with character
    gameUI = new GameUI(character, soundManager, combatSystem);

    // Fix D: Clear conflicting autoPath on AUTO activation
    const autoBtn = document.getElementById('btn-auto-farm');
    if (autoBtn) {
        autoBtn.addEventListener('click', () => {
            if (combatSystem && combatSystem.autoFarm) {
                autoPath = null;
            }
        });
    }

    // Initialize Admin UI
    window.adminUI = new AdminUI();
    window.adminUI.checkAdmin(charData.user_id);

    // Fix C: Wire profileSaveCallback in main.js
    if (gameUI) {
        gameUI.setupProfileSaveCallback((data) => {
            if (data.shirtColor !== undefined) character.setBodyColor(data.shirtColor);
            if (data.hairColor !== undefined) character.setHairColor(data.hairColor);
            if (data.pantsColor !== undefined) character.setPantsColor(data.pantsColor);
            if (data.hat !== undefined) character.setHat(data.hat);
            if (data.glasses !== undefined) character.setGlasses(data.glasses);
            if (data.weapon !== undefined) character.equipWeapon(data.weapon);

            // Persist changes
            character.saveStatsToDatabase();
            // Refresh UI
            gameUI.updateStats(character.stats);
        });
    }

    // Join multiplayer
    joinPresence(
        userId,
        username,
        character.stats.level,
        (players) => {
            // Update online players list
            if (gameUI) gameUI.updateOnlinePlayers(players);

            // Clean up players who left
            const currentIds = new Set(players.map(p => p.userId));
            for (const [id, rp] of remotePlayersMap.entries()) {
                if (!currentIds.has(id)) {
                    sceneManager.scene.remove(rp.mesh);
                    remotePlayersMap.delete(id);
                }
            }
        },
        (p) => {
            // Handle remote player position updates
            if (p.userId === userId) return;
            let rp = remotePlayersMap.get(p.userId);
            if (!rp) {
                // Create a real hero model for the remote player
                const remoteChar = new CharacterManager(sceneManager.scene);
                remoteChar.stats.name = p.username || 'Adventurer';
                remoteChar.stats.level = p.level || 1;
                remoteChar.updateNameTag();

                rp = {
                    character: remoteChar,
                    mesh: remoteChar.mesh
                };
                remotePlayersMap.set(p.userId, rp);
            }

            // Update position and appearance
            rp.mesh.position.set(p.x, p.y, p.z);
            rp.mesh.rotation.y = p.rY;

            if (rp.character) {
                rp.character.state = p.state || 'idle';
                if (p.appearance) {
                    rp.character.applyAppearance(p.appearance);
                }
                // Update animations for remote player
                rp.character.update(1 / 60); // dt not available in callback scope; use fixed step
            }
        },
        (chatMsg) => {
            if (gameUI) gameUI.addChatMessage(chatMsg.username, chatMsg.message);
        }
    );

    // Start auto-save
    startAutoSave(() => {
        return {
            characterId: charData.id,
            updates: character.getSaveData()
        };
    }, 15000);

    // Load Inventory from DB
    await gameUI.loadInventoryFromDB(charData.id);

    // Initial Monster Spawn
    monsters.spawnInitial(character.stats.level);

    // Setup HUD & Initial Stats
    if (gameUI.initHUD) {
        gameUI.initHUD(character);
    }
    gameUI.updateStats(character.stats);

    isGameStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Input listeners
    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftPressed = true;
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftPressed = false;
    });

    canvas.addEventListener('mousedown', (e) => handleMouseInteraction(e));
}

async function showCharacterSelect() {
    // For now, load default character or create screen
    try {
        const char = await loadCharacter(userId);
        if (char) {
            initGame(char);
        } else {
            // Fallback for new characters if loadCharacter didn't create one
            const newChar = {
                user_id: userId,
                name: username,
                level: 1,
                hp: 100,
                max_hp: 100
            };
            initGame(newChar);
        }
    } catch (e) {
        console.error("Failed to load character:", e);
        // Fallback to start game anyway for testing
        initGame({ user_id: userId, name: username, level: 1 });
    }
}

// ============ Input Handling ============
function handleMouseInteraction(event) {
    if (!isGameStarted) return;

    const hit = sceneManager.getMouseIntersection(event, monsters, sceneManager.getNPC());
    if (!hit) return;

    if (hit.type === 'monster') {
        character.targetMonster = hit.object;
        autoPath = hit.point;
        particles.createClickIndicator(hit.point, 0xff4444);
    } else if (hit.type === 'npc') {
        // Open Shop when clicking NPC
        gameUI._togglePanel('shop-panel');
        gameUI._renderShop();
        particles.createClickIndicator(hit.point, 0xffff44);
    } else if (hit.type === 'ground') {
        autoPath = hit.point;
        character.targetMonster = null;
        particles.createClickIndicator(hit.point, 0x44ff44);
    }
}

// ============ Game Loop ============
function gameLoop(time) {
    if (!isGameStarted) return;

    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    if (portalCooldown > 0) portalCooldown -= dt;

    // 1. Movement
    let dirX = 0, dirZ = 0;
    if (keys['ArrowUp'] || keys['KeyW']) dirZ -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dirZ += 1;
    if (keys['ArrowLeft'] || keys['KeyA']) dirX -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dirX += 1;

    if (dirX !== 0 || dirZ !== 0) {
        autoPath = null;
        character.moveSpeed = isShiftPressed ? 7 : 4;
        character.manualMove(dirX, dirZ, dt);
    } else if (autoPath) {
        // If auto-farm is active, we should clear autoPath to let CombatSystem handle movement
        if (combatSystem && combatSystem.autoFarm) {
            autoPath = null;
        } else {
            if (!character.moveToward(autoPath, dt)) autoPath = null;
        }
    }

    // 2. Environment Check (Water)
    const env = sceneManager.getEnvironmentAt(character.getPosition());
    if (env === 'water') {
        character.state = 'swimming';
        character.moveSpeed = 2.2;
        character.baseY = -0.5; // Partially submerged, visible while swimming
    } else {
        character.baseY = 1.2; // Default ground height
        // Reset to normal speed when not in water
        if (character.state === 'swimming') {
            character.state = 'idle';
        }
        // Ensure speed is reset to 4 (or higher if shift is pressed)
        const baseSpeed = isShiftPressed ? 6.5 : 4.0;
        if (character.moveSpeed < 4.0) {
            character.moveSpeed = baseSpeed;
        }
    }

    // 3. Combat
    if (character.targetMonster) {
        const dist = character.getPosition().distanceTo(character.targetMonster.mesh.position);
        if (dist <= character.getAttackRange()) {
            autoPath = null;
        } else {
            autoPath = character.targetMonster.mesh.position.clone();
        }
    }

    // 4. Portal Check
    if (portalCooldown <= 0) {
        const portals = sceneManager.getPortals();
        portals.forEach(portal => {
            if (character.getPosition().distanceTo(portal.position) < 1.8) {
                const targetMap = portal.userData.targetMap;
                if (targetMap) {
                    portalCooldown = 2.0;
                    autoPath = null;

                    // Set safe spawn point for new map
                    const spawn = { x: 0, y: 1.2, z: 10 };
                    character.baseY = spawn.y;
                    character.mesh.position.set(spawn.x, spawn.y, spawn.z);

                    sceneManager.loadMap(targetMap);
                    monsters.clearAll();
                    monsters.mapId = targetMap;
                    monsters.spawnInitial(character.stats.level);
                }
            }
        });
    }

    // 5. Updates
    character.update(dt);
    monsters.update(dt, sceneManager.camera, character.stats.level);
    sceneManager.updateAnimations(dt);
    if (particles) particles.update(dt);
    if (combatSystem) combatSystem.update(dt);

    // 6. Camera & Networking
    sceneManager.followTarget(character.getPosition());

    const now = performance.now();
    if (now - lastBroadcastTime > 100) {
        broadcastPosition(userId, username, character.stats.level, character.getPosition(), character.mesh.rotation.y, character.state, character.getAppearance());
        lastBroadcastTime = now;
    }

    if (now - lastHUDTime > 100) {
        if (gameUI) {
            gameUI.updateHUD(character.stats);
            // Also update stats panel if visible (throttled)
            const statsPanel = document.getElementById('stats-panel');
            if (statsPanel && statsPanel.style.display !== 'none') {
                gameUI.updateStats(character.stats);
            }

            // FPS Counter
            const fps = Math.round(1 / dt);
            const fpsEl = document.getElementById('fps-counter');
            if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
        }
        lastHUDTime = now;
    }

    if (now - lastMinimapTime > 150) {
        if (gameUI) {
            gameUI.updateMinimap(
                character.getPosition(),
                monsters.getAlive(),
                sceneManager.portals,
                sceneManager.npcKafra,
                remotePlayersMap,
                sceneManager.currentMapId
            );
        }
        lastMinimapTime = now;
    }

    sceneManager.render();
    requestAnimationFrame(gameLoop);
}

// Start
initAuth();
