// ZOLOS — Idle RPG Online
// Main Entry Point
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { CombatSystem } from './engine/CombatSystem.js';
import * as THREE from 'three';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { SoundManager } from './engine/SoundManager.js';
import { AdaptiveRendererSystem } from './engine/AdaptiveRendererSystem.js';
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
    getDeterministicGuestName,
    isPlaceholderName,
} from './network/GameSync.js';

// ============ App State ============
let sceneManager, character, monsters, particles, gameUI, authUI;
let soundManager, combatSystem, inputManager;
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
let autoPath = null;
let isShiftPressed = false;

// Hover highlight state
let hoveredMeshGroup = null;
const HOVER_EMISSIVE_PLAYER = new THREE.Color(0x3388ff);
const HOVER_EMISSIVE_MONSTER = new THREE.Color(0xff4444);

function applyHoverHighlight(meshGroup, emissiveColor) {
    if (!meshGroup) return;
    meshGroup.traverse((child) => {
        if (child.isMesh && child.material && child.material.emissive) {
            child.material._origEmissive = child.material.emissive.clone();
            child.material.emissive.copy(emissiveColor);
            child.material.emissiveIntensity = 0.45;
        }
    });
}

function removeHoverHighlight(meshGroup) {
    if (!meshGroup) return;
    meshGroup.traverse((child) => {
        if (child.isMesh && child.material && child.material._origEmissive) {
            child.material.emissive.copy(child.material._origEmissive);
            child.material.emissiveIntensity = 0;
            delete child.material._origEmissive;
        }
    });
}

// ============ Initialize Auth ============
async function initAuth() {
    // Initial UI setup - Use AuthUI for login screen
    authUI = new AuthUI((sessionData) => {
        userId = sessionData.userId;
        username = sessionData.username;
        showCharacterSelect();
    });
}

// Project 3D vector to screen-space 2D coordinates (X, Y in pixels)
function worldToScreen(pos, offsetY = 1.6) {
    if (!sceneManager || !sceneManager.camera || !sceneManager.canvas) return { x: 0, y: 0 };
    const tempV = pos.clone();
    tempV.y += offsetY;
    tempV.project(sceneManager.camera);
    const canvas = sceneManager.canvas;
    const x = (tempV.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (tempV.y * -0.5 + 0.5) * canvas.clientHeight;
    return { x, y };
}

// ============ Initialize Game ============
async function initGame(charData) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // Show game screen, hide auth
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';

    sceneManager = new SceneManager(canvas);

    // Setup input
    import('./engine/InputManager.js').then(({ InputManager }) => {
        inputManager = new InputManager();
        character.inputManager = inputManager;

        // Setup skill hotkeys
        inputManager.setupSkillHotkey((skillId) => {
            if (combatSystem) combatSystem.useSkill(skillId);
        });
    });

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
            case 'playerRangedAttack':
                if (particles) {
                    particles.spawnArrow(event.startPos, event.target, () => {
                        if (combatSystem) combatSystem._resolveDamage(event.target);
                    });
                }
                break;
            case 'playerAttack':
                if (particles) {
                    particles.spawnHitEffect(event.targetPos, event.critical);
                    const screenPos = worldToScreen(event.targetPos, 1.2);
                    const dmgType = event.critical ? 'critical-dmg' : 'player-dmg';
                    particles.spawnDamageNumber(screenPos.x, screenPos.y, event.damage, dmgType);
                }
                if (soundManager) soundManager.playAtkSound();
                if (gameUI) {
                    gameUI.addCombatLog(`⚔️ You hit ${event.monsterName} for ${event.damage} damage${event.critical ? ' (CRITICAL!)' : ''}`, 'damage');
                    // Step 5: Screen shake on critical hits only
                    if (event.critical) {
                        gameUI.triggerScreenShake(true);
                    }
                }
                break;
            case 'monsterAttack':
                if (gameUI) gameUI.addCombatLog(`🩸 ${event.monsterName} hits you for ${event.damage} damage`, 'warning');
                if (particles && event.targetPos) {
                    const screenPos = worldToScreen(event.targetPos, 1.6);
                    particles.spawnDamageNumber(screenPos.x, screenPos.y, event.damage, 'monster-dmg');
                }
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
            case 'autoResume':
                if (gameUI) {
                    gameUI.addCombatLog('🤖 HP recovered! Resuming AUTO mode...', 'system');
                    gameUI.setAutoFarmState(true);
                }
                break;
            case 'fishingStart':
                if (gameUI) gameUI.addCombatLog('🎣 Walking to water...', 'system');
                break;
            case 'fishingNoWater':
                if (gameUI) gameUI.addCombatLog('🚫 ไม่มีแหล่งน้ำใกล้เคียง!', 'warning');
                break;
            case 'fishingCast':
                if (sceneManager && character) sceneManager.createFishingLine(character.getPosition(), event.bobberPos);
                if (gameUI) gameUI.addCombatLog('🎣 Cast the line into the water...', 'system');
                break;
            case 'fishingBite':
                if (sceneManager) sceneManager.animateFishBite();
                if (gameUI) gameUI.addCombatLog('❗ Fish on the line!', 'system');
                break;
            case 'fishCaught':
                if (gameUI) {
                    const rarityEmoji = { common: '⚪', uncommon: '🟢', rare: '🔵', legendary: '🟡' };
                    const e = rarityEmoji[event.rarity] || '⚪';
                    gameUI.addCombatLog(`🎣 You caught a ${e} ${event.item.name}!`, 'loot');
                    // Item is added via 'lootDrop' event in CombatSystem.js
                    gameUI.incrementQuestProgress('fish', 'any');
                }
                break;
            case 'monsterKilled':
                if (gameUI) gameUI.incrementQuestProgress('hunt', event.monsterName);
                break;
            case 'fishingStop':
                if (sceneManager) sceneManager.removeFishingLine();
                break;
        }
    }, sceneManager);

    // Initialize Game UI with character
    gameUI = new GameUI(character, soundManager, combatSystem);
    window.gameUI = gameUI;
    gameUI.particles = particles;

    // Setup skill clicks
    gameUI.setupSkillClicks((skillId) => {
        gameUI.castSkill(skillId);
    });

    // Fix D: Clear conflicting autoPath on AUTO activation
    const autoBtn = document.getElementById('btn-auto-farm');
    if (autoBtn) {
        autoBtn.addEventListener('click', () => {
            if (combatSystem && combatSystem.autoFarm) {
                autoPath = null;
            }
        });
    }

    // Initialize Adaptive Renderer System and expose to window for settings UI
    window.rendererSystem = new AdaptiveRendererSystem(
        sceneManager.renderer,
        sceneManager.camera,
        sceneManager.scene
    );

    // Apply persisted game settings
    if (character && character.gameSettings) {
        if (soundManager) {
            soundManager.enabled = character.gameSettings.sound_enabled !== false;
        }
        if (window.rendererSystem) {
            window.rendererSystem.qualityLevel = character.gameSettings.graphics_quality || 'auto';
            window.rendererSystem.applyQualitySettings();
        }
        const fpsEl = document.getElementById('fps-counter');
        if (fpsEl) {
            const fpsEnabled = character.gameSettings.fps_enabled === true;
            fpsEl.style.display = fpsEnabled ? 'block' : 'none';
            localStorage.setItem('zolos_show_fps', fpsEnabled ? 'true' : 'false');
        }
    } else {
        // FPS counter fallback: hide by default unless user opted in
        const fpsEl = document.getElementById('fps-counter');
        if (fpsEl) {
            fpsEl.style.display = localStorage.getItem('zolos_show_fps') === 'true' ? 'block' : 'none';
        }
    }

    // Initialize Admin UI
    window.adminUI = new AdminUI();
    window.adminUI.checkAdmin(charData.user_id);

    // Fix C: Wire profileSaveCallback in main.js
    if (gameUI) {
        gameUI.setupProfileSaveCallback((data) => {
            // Step 3: Ensure all equipment and appearance updates are called
            if (data.shirtColor !== undefined) character.setBodyColor(data.shirtColor);
            if (data.hairColor !== undefined) character.setHairColor(data.hairColor);
            if (data.pantsColor !== undefined) character.setPantsColor(data.pantsColor);
            if (data.hat !== undefined) character.setHat(data.hat);
            if (data.glasses !== undefined) character.setGlasses(data.glasses);
            if (data.weapon !== undefined) character.equipWeapon(data.weapon);
            if (data.armor !== undefined) character.equippedArmor = data.armor;
            if (data.shield !== undefined) character.equippedShield = data.shield;

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
                let rName = p.username;
                if (!rName || isPlaceholderName(rName)) {
                    rName = getDeterministicGuestName(p.userId);
                }
                remoteChar.stats.name = rName;
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

                // Step 10 Part B: Robust water detection for remote players.
                // Re-run environment check based on received X/Z to ensure correct baseY.
                const remoteEnv = sceneManager.getEnvironmentAt(rp.mesh.position);
                if (remoteEnv === 'water') {
                    rp.character.baseY = -0.5;
                    // Force swimming state if the position is in water, 
                    // regardless of the broadcast state (which might be 'walking' due to AUTO mode)
                    rp.character.state = 'swimming';
                } else {
                    rp.character.baseY = 1.2;
                }

                if (p.appearance) {
                    rp.character.applyAppearance(p.appearance);
                }
                // Update animations for remote player
                rp.character.update(1 / 60); // dt not available in callback scope; use fixed step
            }
        },
        // Step 9: Use consistent object format for chat messages
        (chatMsg) => {
            if (gameUI) gameUI.receiveChatMessage(chatMsg.username, chatMsg.message);
        }
    );

    // Start auto-save
    startAutoSave(() => {
        const saveData = character.getSaveData();
        return {
            characterId: charData.id,
            updates: saveData.updates
        };
    }, 15000);

    // Load Inventory from DB
    await gameUI.loadInventoryFromDB(charData.id);

    // Initial Monster Spawn
    monsters.spawnInitial(character.stats.level);

    // Step 9: Wire up chat send callback
    if (gameUI) {
        gameUI.setupChatSendCallback((message) => {
            broadcastChat(userId, username, character.stats.level, message);
        });
    }

    // Setup Logout Button
    gameUI.setupLogoutButton(async () => {
        // 1. Stop game loop
        isGameStarted = false;

        // 2. Stop auto-save
        stopAutoSave();

        // 3. Leave multiplayer presence
        if (userId) {
            try { leavePresence(userId); } catch (e) { console.error('Leave presence error:', e); }
        }

        // 4. Remove remote player meshes
        for (const [id, rp] of remotePlayersMap.entries()) {
            if (rp.mesh) sceneManager.scene.remove(rp.mesh);
        }
        remotePlayersMap.clear();

        // 5. Sign out from Supabase
        try {
            const { clearActiveSession, supabase } = await import('./network/SupabaseClient.js');
            clearActiveSession();
            if (supabase) await supabase.auth.signOut();
        } catch (e) {
            console.error('Logout Supabase error:', e);
        }

        // 6. Reset UI
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';

        // Close Admin UI on logout
        if (window.adminUI) {
            if (typeof window.adminUI.close === 'function') {
                window.adminUI.close();
            } else {
                window.adminUI.isOpen = false;
                if (window.adminUI.container) {
                    window.adminUI.container.style.display = 'none';
                }
            }
        }

        // 7. Re-show auth screen with fresh state
        if (authUI) {
            authUI._sessionData = null;
            authUI.show();
        }
    });

    // Setup HUD & Initial Stats
    if (gameUI.initHUD) {
        gameUI.initHUD(character);
    }
    gameUI.updateStats(character.stats);

    isGameStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Input listeners — Shift key for sprinting
    window.addEventListener('keydown', (e) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftPressed = true;

        // Skill hotkeys triggers: 1, 2, 3
        if (e.code === 'Digit1' || e.key === '1') {
            gameUI.castSkill('bash');
        } else if (e.code === 'Digit2' || e.key === '2') {
            gameUI.castSkill('heal');
        } else if (e.code === 'Digit3' || e.key === '3') {
            gameUI.castSkill('magnumBreak');
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftPressed = false;
    });

    canvas.addEventListener('mousedown', (e) => handleMouseInteraction(e));

    // Mouse move for monster/player hovering with highlight glow
    canvas.addEventListener('mousemove', (e) => {
        if (!sceneManager || !monsters || !gameUI) return;
        const hit = sceneManager.getMouseIntersection(e, monsters, sceneManager.getNPC(), remotePlayersMap);

        let newHoverMesh = null;
        let emissiveColor = null;

        if (hit && hit.type === 'monster' && hit.object && hit.object.mesh) {
            gameUI.hoveredMonster = hit.object;
            newHoverMesh = hit.object.mesh;
            emissiveColor = HOVER_EMISSIVE_MONSTER;
        } else if (hit && hit.type === 'player' && hit.object) {
            gameUI.hoveredMonster = null;
            // Find the remote player mesh by userId
            const rp = remotePlayersMap.get(hit.object.userId);
            if (rp && rp.mesh) {
                newHoverMesh = rp.mesh;
                emissiveColor = HOVER_EMISSIVE_PLAYER;
            }
        } else {
            gameUI.hoveredMonster = null;
        }

        // Only update highlight if hovered mesh changed
        if (newHoverMesh !== hoveredMeshGroup) {
            removeHoverHighlight(hoveredMeshGroup);
            hoveredMeshGroup = newHoverMesh;
            if (hoveredMeshGroup && emissiveColor) {
                applyHoverHighlight(hoveredMeshGroup, emissiveColor);
            }
        }

        // Update cursor style
        canvas.style.cursor = newHoverMesh ? 'pointer' : 'default';
    });
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
    if (combatSystem && combatSystem.isFishing) return;

    const hit = sceneManager.getMouseIntersection(event, monsters, sceneManager.getNPC(), remotePlayersMap);
    if (!hit) return;

    if (hit.type === 'monster') {
        character.targetMonster = hit.object;
        autoPath = hit.point;
        // Step 11: Monster click: red indicator
        particles.createClickIndicator(hit.point, 0xff4444);
    } else if (hit.type === 'player') {
        // Click other player: blue indicator & open player profile popup
        particles.createClickIndicator(hit.point, 0x60a0ff);
        if (gameUI) gameUI._showPlayerPopup(hit.object);
    } else if (hit.type === 'npc') {
        // Open Shop when clicking NPC
        gameUI._togglePanel('shop-panel');
        gameUI._renderShop();
        particles.createClickIndicator(hit.point, 0xffff44);
    } else if (hit.type === 'ground') {
        autoPath = hit.point;
        character.targetMonster = null;
        // Step 11: Ground click: green indicator
        particles.createClickIndicator(hit.point, 0x44ff44);
    }
}
window.handleCanvasTap = handleMouseInteraction;

// ============ Game Loop ============
function gameLoop(time) {
    if (!isGameStarted) return;

    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    if (portalCooldown > 0) portalCooldown -= dt;

    // 1. Movement
    const isFishingActive = combatSystem && combatSystem.isFishing;
    const moveDir = (!isFishingActive && inputManager) ? inputManager.getMovementDirection() : null;

    if (moveDir) {
        autoPath = null;
        character.moveSpeed = isShiftPressed ? 9 : 5.5;
        character.manualMove(moveDir.x, moveDir.z, dt);
    } else if (autoPath && !isFishingActive) {
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
        // Ensure speed is reset to 5.5 (or higher if shift is pressed)
        const baseSpeed = isShiftPressed ? 9.0 : 5.5;
        if (character.moveSpeed < 5.5) {
            character.moveSpeed = baseSpeed;
        }
    }

    // Step 10 Part A: Force swimming state if in water, regardless of what CombatSystem or moveToward set.
    // This ensures the 'swimming' state is always the one broadcast.
    if (env === 'water') {
        character.state = 'swimming';
    }

    // 3. Combat
    if (character.targetMonster) {
        const dist = character.getPosition().distanceTo(character.targetMonster.mesh.position);
        if (dist <= character.getAttackRange()) {
            autoPath = null;
        } else {
            // Keep walking towards the target monster (works for water monsters too)
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
    if (gameUI) gameUI.updateTargetIndicator(sceneManager);

    // 6. Camera & Networking
    sceneManager.followTarget(character.getPosition(), character.baseY);

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

            // Update skill cooldown progress bars on mobile and desktop slots
            if (character.cooldowns) {
                const SKILLS_LIST = ['bash', 'heal', 'magnumBreak'];
                SKILLS_LIST.forEach(skillId => {
                    const current = character.cooldowns[skillId] || 0;
                    const maxMax = skillId === 'bash' ? 3 : skillId === 'heal' ? 5 : 8; // Max cooldown levels
                    gameUI.updateSkillCooldown(skillId, current, maxMax);
                });
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
