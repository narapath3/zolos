// ZOLOS — Idle RPG Online
// Main Entry Point
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { SoundManager } from './engine/SoundManager.js';
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
let sceneManager, character, monsters, particles, gameUI;
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
    // Initial UI setup
    gameUI = new GameUI((action, data) => handleUIAction(action, data));
    
    // Check for existing session (simplified for now, using guest or prompt)
    const storedUser = localStorage.getItem('zolos_user_id');
    if (storedUser) {
        userId = storedUser;
        username = localStorage.getItem('zolos_username') || 'Adventurer';
        showCharacterSelect();
    } else {
        gameUI.showScreen('login');
    }
}

// ============ Initialize Game ============
async function initGame(charData) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    sceneManager = new SceneManager(canvas);
    character = new CharacterManager(sceneManager.scene);
    
    // Load character data
    character.loadStats(charData);
    userId = charData.user_id;
    username = charData.name;
    
    // Setup systems
    particles = new ParticleSystem(sceneManager.scene);
    soundManager = new SoundManager();
    monsters = new MonsterManager(sceneManager.scene, particles);
    
    // Join multiplayer
    joinPresence(
        userId,
        username,
        character.stats.level,
        (players) => {
            // Update online players list
            gameUI.updateOnlinePlayers(players);
        },
        (p) => {
            // Handle remote player position updates
            if (p.userId === userId) return;
            let rp = remotePlayersMap.get(p.userId);
            if (!rp) {
                // In a real implementation, we'd have a RemotePlayer class
                // For now, we focus on fixing the main game loop and spawn bugs
            }
        },
        (chatMsg) => {
            gameUI.addChatMessage(chatMsg.username, chatMsg.message);
        }
    );

    // Start auto-save
    startAutoSave(charData.id, () => character.getSaveData().updates);

    // Setup HUD
    gameUI.initHUD(character);
    gameUI.showScreen('hud');
    
    isGameStarted = true;
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
    // For now, load default character or show create screen
    const char = await loadCharacter(userId);
    if (char) {
        initGame(char);
    } else {
        gameUI.showScreen('create-char');
    }
}

async function handleUIAction(action, data) {
    if (action === 'login' || action === 'guest') {
        userId = action === 'guest' ? 'guest_' + Math.random().toString(36).substring(2, 10) : data.username;
        username = action === 'guest' ? 'Guest_' + Math.random().toString(36).substring(2, 5).toUpperCase() : data.username;
        localStorage.setItem('zolos_user_id', userId);
        localStorage.setItem('zolos_username', username);
        showCharacterSelect();
    } else if (action === 'use-skill') {
        character.useSkill(data.skillId, character.targetMonster, monsters, gameUI, soundManager, particles);
    } else if (action === 'chat') {
        broadcastChat(username, data.message);
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
        character.baseY = -1.8; // Sink to water level
    } else {
        character.baseY = 1.2; // Default ground height
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
        gameUI.updateHUD(character.stats);
        lastHUDTime = now;
    }

    sceneManager.render();
    requestAnimationFrame(gameLoop);
}

// Start
initAuth();
