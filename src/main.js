// ZOLOS — Idle RPG Online
// Main Entry Point
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { SoundManager } from './engine/SoundManager.js';
import { GameUI } from './ui/GameUI.js';
import { AuthUI } from './ui/AuthUI.js';
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
let soundManager;
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
    
    // Initialize Game UI with character
    gameUI = new GameUI(character, soundManager);
    
    // Join multiplayer
    joinPresence(
        userId,
        username,
        character.stats.level,
        (players) => {
            // Update online players list
            if (gameUI) gameUI.updateOnlinePlayers(players);
        },
        (p) => {
            // Handle remote player position updates
            if (p.userId === userId) return;
            let rp = remotePlayersMap.get(p.userId);
            if (!rp) {
                // In a real implementation, we'd have a RemotePlayer class
            }
        },
        (chatMsg) => {
            if (gameUI) gameUI.addChatMessage(chatMsg.username, chatMsg.message);
        }
    );

    // Start auto-save
    startAutoSave(charData.id, () => character.getSaveData().updates);

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
        if (!character.moveToward(autoPath, dt)) autoPath = null;
    }

    // 2. Environment Check (Water)
    const env = sceneManager.getEnvironmentAt(character.getPosition());
    if (env === 'water') {
        character.state = 'swimming';
        character.moveSpeed = 2.2;
        character.baseY = -0.5; // Partially submerged, visible while swimming
    } else {
        character.baseY = 1.2; // Default ground height
        // Only reset to 4 if not manually moving (to allow shift-running)
        if (dirX === 0 && dirZ === 0 && !autoPath) {
            character.moveSpeed = 4;
        }
    }

    // 3. Combat
    if (character.targetMonster) {
        const dist = character.getPosition().distanceTo(character.targetMonster.mesh.position);
        if (dist <= character.getAttackRange()) {
            autoPath = null;
            if (character.attackTimer >= character.getAttackCooldown()) {
                const dmg = Math.floor(character.stats.atk * (0.8 + Math.random() * 0.4));
                character.targetMonster.takeDamage(dmg);
                character.attackTimer = 0;
                character.state = 'attacking';
                character.animTimer = 0;
                
                if (soundManager) soundManager.playAtkSound();
                if (particles) particles.createHitBurst(character.targetMonster.mesh.position);
                
                if (!character.targetMonster.alive) {
                    const leveledUp = character.addExp(character.targetMonster.expValue);
                    if (leveledUp && soundManager) soundManager.playLevelUpSound();
                    character.targetMonster = null;
                }
            }
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
                    monsters.spawnInitial(character.stats.level);
                }
            }
        });
    }

    // 5. Updates
    character.update(dt);
    monsters.update(dt, character, sceneManager);
    sceneManager.updateAnimations(dt);
    if (particles) particles.update(dt);
    
    // 6. Camera & Networking
    sceneManager.followTarget(character.getPosition());
    
    const now = performance.now();
    if (now - lastBroadcastTime > 100) {
        broadcastPosition(userId, username, character.stats.level, character.getPosition(), character.mesh.rotation.y, character.state, {});
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
        }
        lastHUDTime = now;
    }

    sceneManager.render();
    requestAnimationFrame(gameLoop);
}

// Start
initAuth();
