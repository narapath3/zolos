// ZOLOS — Idle RPG Online
// Main Entry Point
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { CombatSystem } from './engine/CombatSystem.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
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
} from './network/GameSync.js';

// ============ App State ============
let sceneManager, character, monsters, combat, particles, gameUI;
let userId = null;
let username = 'Adventurer';
let onlinePlayers = [];

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

    // Init UI
    gameUI = new GameUI();

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

    // Join presence
    joinPresence(userId, username, character.stats.level, (players) => {
        onlinePlayers = players;
        gameUI.updateOnlinePlayers(players);
    });

    // Start auto-save
    startAutoSave(() => character.getSaveData(), 15000);

    // Show game screen
    gameUI.show();
    gameUI.addCombatLog(`Welcome to Prontera Field, ${username}!`, 'system');
    gameUI.addCombatLog('Press AUTO to start farming! ⚔️', 'system');

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

            // Death particles
            const screen = sceneManager.worldToScreen(event.targetPos);
            particles.spawnDeathEffect(event.targetPos, 0xffd040);
            break;
        }

        case 'levelUp': {
            particles.showLevelUpEffect(event.level);
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

    // Update systems
    character.update(dt);
    monsters.update(dt, sceneManager.camera, character.stats.level);
    combat.update(dt);
    particles.update(dt);

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
