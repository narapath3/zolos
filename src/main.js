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
import {
    loadCharacter,
    saveCharacter,
    loadInventory,
    joinPresence,
    leavePresence,
    startAutoSave,
    stopAutoSave,
    broadcastPosition,
} from './network/GameSync.js';

// ============ App State ============
let sceneManager, character, monsters, combat, particles, gameUI;
let soundManager, inputManager;
let userId = null;
let username = 'Adventurer';
let onlinePlayers = [];
const remotePlayersMap = new Map();
let lastBroadcastTime = 0;

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
    monsters = new MonsterManager(sceneManager.scene);
    particles = new ParticleSystem(sceneManager.scene);
    soundManager = new SoundManager();
    inputManager = new InputManager();

    // Init UI
    gameUI = new GameUI(character, soundManager);

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

    // Setup auto-farm button
    gameUI.setupAutoFarmButton(() => {
        const isActive = combat.toggleAutoFarm();
        if (isActive) {
            gameUI.addCombatLog('⚡ Auto-Farm ACTIVATED!', 'system');
        } else {
            gameUI.addCombatLog('⏸️ Auto-Farm paused', 'system');
        }
        return isActive;
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

// ============ Game Loop ============
function gameLoop() {
    requestAnimationFrame(gameLoop);

    const dt = Math.min(sceneManager.getDelta(), 0.05); // Cap dt

    // WASD Manual movement (only when auto-farm is off)
    if (inputManager && !combat.autoFarm) {
        const dir = inputManager.getMovementDirection();
        if (dir) {
            character.manualMove(dir, inputManager.isRunning(), dt);
        } else if (character.state === 'walking' || character.state === 'running') {
            character.state = 'idle';
        }
    }

    // Update systems
    character.update(dt);
    monsters.update(dt, sceneManager.camera, character.stats.level);
    combat.update(dt);
    particles.update(dt);

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
