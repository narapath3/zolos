// ZOLOS — Idle RPG Online
// Main Entry Point

// Build version banner — bump BUILD_VERSION on notable fixes so we can
// instantly tell from the console which bundle a client is running.
const BUILD_VERSION = '2026-07-14.5 (gender-select)';
console.log(`%c[Zolos] Build ${BUILD_VERSION}`, 'color:#4ade80;font-weight:bold');
window.ZOLOS_BUILD = BUILD_VERSION;
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
import { announcementSystem } from './ui/AnnouncementSystem.js';
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
    updatePresence,
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

// Reusable vector for per-frame rod tip queries (avoids per-frame allocation)
const rodTipTmp = new THREE.Vector3();

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
        // Pass guest flag to character select
        showCharacterSelect(sessionData.isGuest);
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

        // Skill hotkeys (1/2/3) are handled by the window keydown listener
        // below, which routes to gameUI.castSkill(). Do not register a second
        // handler here to avoid double-casting.
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
                // Hide the rod's short built-in line — the dynamic bezier line
                // to the bobber replaces it while fishing
                if (character) character.setRodLineVisible(false);
                if (gameUI) gameUI.addCombatLog('🎣 Cast the line into the water...', 'system');
                break;
            case 'fishingBite':
                if (sceneManager) sceneManager.animateFishBite();
                // Small rod twitch as the fish tugs the line
                if (character) character.triggerRodLift(0.35, 0.4);
                if (gameUI) gameUI.addCombatLog('❗ Fish on the line!', 'system');
                break;
            case 'fishCaught':
                // Full yank: lift the rod overhead to hoist the fish out,
                // hold at the top briefly, then ease back down
                if (character) character.triggerRodLift(1, 1.0);
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
                if (character) character.setRodLineVisible(true);
                break;
        }
    }, sceneManager);

    // Initialize Game UI with character
    gameUI = new GameUI(character, soundManager, combatSystem);
    window.gameUI = gameUI;
    gameUI.particles = particles;

    // Initialize Announcement System
    announcementSystem.init();
    window.announcementSystem = announcementSystem;

    // Set guest mode state
    gameUI.setGuestMode(charData.isGuest === true);

    // Setup bind account callback
    gameUI.setupBindAccountCallback(async (email, password) => {
        const { bindAccount } = await import('./network/SupabaseClient.js');
        await bindAccount(email, password);
        charData.isGuest = false; // Update local state
    });

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

    // In-game BGM: stream via hidden YouTube embed (see YouTubeBGM.js)
    import('./engine/YouTubeBGM.js').then(({ youtubeBGM }) => {
        window.youtubeBGM = youtubeBGM;
        youtubeBGM.setEnabled(character?.gameSettings?.sound_enabled !== false);
        youtubeBGM.start();
    });

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
        gameUI.setupProfileSaveCallback(async (data) => {
            // Step 3: Ensure all equipment and appearance updates are called
            if (data.name !== undefined) {
                character.stats.name = data.name;
                character.updateNameTag();
            }
            if (data.shirtColor !== undefined) character.setBodyColor(data.shirtColor);
            if (data.hairColor !== undefined) character.setHairColor(data.hairColor);
            if (data.pantsColor !== undefined) character.setPantsColor(data.pantsColor);

            // --- Sync equipment changes: Profile → Inventory ---
            // When user changes equipment in Profile, update inventory equipped flags
            if (data.weapon !== undefined) {
                character.equipWeapon(data.weapon === 'None' ? null : data.weapon);
                await gameUI.syncEquipFromProfile('weapon', data.weapon);
            }
            if (data.hat !== undefined) {
                character.setHat(data.hat === 'None' ? null : data.hat);
                await gameUI.syncEquipFromProfile('hat', data.hat);
            }
            if (data.glasses !== undefined) {
                character.setGlasses(data.glasses === 'None' ? null : data.glasses);
                await gameUI.syncEquipFromProfile('glasses', data.glasses);
            }
            if (data.armor !== undefined) {
                character.equippedArmor = data.armor === 'None' ? null : data.armor;
                await gameUI.syncEquipFromProfile('armor', data.armor);
            }
            if (data.shield !== undefined) {
                character.equippedShield = data.shield === 'None' ? null : data.shield;
                await gameUI.syncEquipFromProfile('shield', data.shield);
            }

            // Persist character appearance & stats to DB
            try {
                console.log('[Zolos] 💾 Profile save triggered. Saving appearance...');
                await character.saveStatsToDatabase();
                if (charData.user_id) {
                    const { saveCharacterByUserId } = await import('./network/GameSync.js');
                    await saveCharacterByUserId(charData.user_id, character.getSaveData().updates);
                }
                console.log('[Zolos] ✅ Profile appearance saved successfully.');
            } catch (err) {
                console.error('[Zolos] ❌ Profile appearance save failed:', err);
                gameUI.addCombatLog('❌ บันทึกโปรไฟล์ล้มเหลว!', 'system');
            }

            // Refresh all UI panels
            gameUI._renderInventory();
            gameUI.updateHUD(character.stats);
            gameUI.updateStats(character.stats);
        });
    }

    // Join multiplayer
    joinPresence(
        userId,
        username,
        character.stats.level,
        async (players) => {
            // Update online players list
            if (gameUI) gameUI.updateOnlinePlayers(players);

            // Handle map isolation and cleanup
            const currentIds = new Set(players.map(p => p.userId));
            for (const [id, rp] of remotePlayersMap.entries()) {
                if (!currentIds.has(id)) {
                    sceneManager.scene.remove(rp.mesh);
                    remotePlayersMap.delete(id);
                }
            }

            players.forEach(p => {
                if (p.userId === userId) return;
                if (p.mapId && p.mapId !== sceneManager.currentMap) {
                    if (remotePlayersMap.has(p.userId)) {
                        const rp = remotePlayersMap.get(p.userId);
                        if (rp.mesh) sceneManager.scene.remove(rp.mesh);
                        remotePlayersMap.delete(p.userId);
                    }
                }
            });

            // Setup announcement listeners for Socket.io broadcasts (after socket is connected)
            try {
                const { setupAnnouncementListeners } = await import('./network/AnnouncementSync.js');
                setupAnnouncementListeners((announcementData) => {
                    if (window.announcementSystem) {
                        window.announcementSystem.addAnnouncement(
                            announcementData.text,
                            announcementData.type || 'info',
                            announcementData.duration || 8000
                        );
                    }
                });
            } catch (err) {
                console.warn('[Zolos] Failed to setup announcement listeners:', err);
            }
        },
        (p) => {
            // Handle remote player position updates
            if (p.userId === userId) return;

            // Map isolation: Only update/render if on the same map
            if (p.mapId && p.mapId !== sceneManager.currentMap) {
                if (remotePlayersMap.has(p.userId)) {
                    const rp = remotePlayersMap.get(p.userId);
                    if (rp.mesh) sceneManager.scene.remove(rp.mesh);
                    remotePlayersMap.delete(p.userId);
                }
                return;
            }

            let rp = remotePlayersMap.get(p.userId);
            if (!rp) {
                // Step 12: Wait for valid position before creating remote mesh to prevent "stuck at portal" visuals
                if (p.x === undefined || p.z === undefined) return;

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
            if (p.x !== undefined && p.y !== undefined && p.z !== undefined) {
                rp.mesh.position.set(p.x, p.y, p.z);
            }
            if (p.rY !== undefined) {
                rp.mesh.rotation.y = p.rY;
            }

            if (rp.character) {
                rp.character.state = p.state || 'idle';

                // Step 10 Part B: Robust water detection for remote players.
                const remoteEnv = sceneManager.getEnvironmentAt(rp.mesh.position);
                if (remoteEnv === 'water') {
                    rp.character.baseY = -0.5;
                    rp.character.state = 'swimming';
                } else {
                    rp.character.baseY = 1.2;
                }

                if (p.appearance) {
                    rp.character.applyAppearance(p.appearance);
                }
                // Update animations for remote player
                rp.character.update(1 / 60);
            }
        },
        // Step 9: Use consistent object format for chat messages
        (chatMsg) => {
            // Map isolation: Only show chat from players on the same map
            if (chatMsg.mapId && chatMsg.mapId !== sceneManager.currentMap) return;

            if (gameUI) gameUI.receiveChatMessage(chatMsg.username, chatMsg.message);

            // Show chat bubble above character
            if (chatMsg.userId === userId) {
                if (character) character.showChatBubble(chatMsg.message);
            } else {
                const rp = remotePlayersMap.get(chatMsg.userId);
                if (rp && rp.character) {
                    rp.character.showChatBubble(chatMsg.message);
                }
            }
        },
        sceneManager.currentMap
    );

    // Start auto-save
    startAutoSave(() => {
        const saveData = character.getSaveData();
        // Auto-save daily quests and friends in the background
        if (gameUI) {
            gameUI._saveDailyQuestsToDB().catch(() => { });
            gameUI._saveFriendsListToDB().catch(() => { });
        }
        return {
            characterId: charData.id,
            userId: charData.user_id,
            updates: saveData.updates
        };
    }, 15000);

    // Load Inventory, Daily Quests, and Friends List from DB
    await gameUI.loadInventoryFromDB(charData.id);
    await gameUI.loadDailyQuestsFromDB(charData.id);
    await gameUI.loadFriendsFromDB(charData.id);

    // Initial Monster Spawn
    monsters.spawnInitial(character.stats.level);

    // Step 9: Wire up chat send callback
    if (gameUI) {
        gameUI.setupChatSendCallback((message) => {
            broadcastChat(userId, username, character.stats.level, message, sceneManager.currentMap);
            // Local bubble is now handled by the echo in broadcastChat callback
        });
    }

    // Setup Logout Button
    gameUI.setupLogoutButton(async () => {
        // Save final state before logout
        if (character && charData.id) {
            gameUI.addCombatLog('💾 กำลังบันทึกข้อมูลตัวละคร...', 'system');
            const saveData = character.getSaveData();
            try {
                const { saveCharacter, saveCharacterByUserId, saveDailyQuests, saveFriendsList } = await import('./network/GameSync.js');
                if (charData.user_id) {
                    await saveCharacterByUserId(charData.user_id, saveData.updates);
                } else {
                    await saveCharacter(charData.id, saveData.updates);
                }
                if (gameUI.dailyQuestsState) {
                    await saveDailyQuests(charData.id, gameUI.dailyQuestsState);
                }
                await saveFriendsList(charData.id, gameUI.friends);
                gameUI.addCombatLog('✅ บันทึกข้อมูลสำเร็จ', 'system');
            } catch (e) {
                console.error('Final state save error:', e);
            }
        }

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

        // 6. Full page reload for a clean slate.
        // Re-entering the game without reloading leaks the previous session:
        // the old requestAnimationFrame chain keeps running (each re-login adds
        // another parallel loop → severe stutter), a new WebGL renderer is
        // created on the same canvas each time, and window/canvas/UI event
        // listeners get bound again (double skill casts, double saves).
        // Reloading guarantees all of it is torn down.
        window.location.reload();
    });

    // Setup HUD & Initial Stats
    if (gameUI.initHUD) {
        gameUI.initHUD(character);
    }
    gameUI.updateStats(character.stats);

    isGameStarted = true;
    lastTime = performance.now();
    // Guard: never start a second parallel rAF chain (would double all updates)
    if (!window.__zolosLoopStarted) {
        window.__zolosLoopStarted = true;
        requestAnimationFrame(gameLoop);
    }

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
        const hit = sceneManager.getMouseIntersection(e, monsters, sceneManager.getNPCs(), remotePlayersMap);

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
        canvas.style.cursor = newHoverMesh ? "url('/assets/cute_cursor_32.png'), pointer" : "url('/assets/cute_cursor_32.png'), default";
    });
}

async function showCharacterSelect(isGuest = false) {
    // For now, load default character or create screen
    try {
        const char = await loadCharacter(userId);
        if (char) {
            char.isGuest = isGuest;
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

    const hit = sceneManager.getMouseIntersection(event, monsters, sceneManager.getNPCs(), remotePlayersMap);
    if (!hit) return;

    // While fishing, social clicks stay available: clicking another player
    // opens their profile popup (add friend / send items) without breaking
    // the fishing pose. Ground/monster/NPC clicks remain blocked so the
    // character doesn't walk away or switch targets mid-cast.
    if (combatSystem && combatSystem.isFishing && hit.type !== 'player') return;

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
        // Open Shop based on NPC type
        const npcType = hit.object.userData.npcType;
        if (npcType === 'sell') {
            gameUI._togglePanel('sell-shop-panel');
            gameUI._renderSellShop();
        } else {
            gameUI._togglePanel('shop-panel');
            gameUI._renderShop();
        }
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
    requestAnimationFrame(gameLoop);
    if (!isGameStarted) return;

    try {
        const dt = Math.min(0.1, (time - lastTime) / 1000);
        lastTime = time;

        // 1a. Dead-state guard: stop processing updates if character is dead
        if (character && !character.isAlive()) {
            if (particles) particles.update(dt);
            if (combatSystem) combatSystem.update(dt);
            sceneManager.render();
            return;
        }

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

                    // Clear stale combat state before loading new map
                    if (character) {
                        character.targetMonster = null;
                        character.state = 'idle';
                    }
                    if (combatSystem) {
                        combatSystem.currentTarget = null;
                        combatSystem.autoFarm = false;
                        combatSystem.isFishing = false;
                    }
                    if (gameUI && typeof gameUI.clearTarget === 'function') {
                        gameUI.clearTarget();
                    }
                    if (inputManager && typeof inputManager.reset === 'function') {
                        inputManager.reset();
                    }

                    // Set safe spawn point for new map
                    const spawn = { x: 0, y: 1.2, z: 10 };
                    character.baseY = spawn.y;
                    character.mesh.position.set(spawn.x, spawn.y, spawn.z);

                    console.log(`[Warp] Starting warp to ${targetMap}`);
                    sceneManager.loadMap(targetMap);
                    console.log(`[Warp] Map ${targetMap} loaded`);
                    monsters.clearAll();
                    monsters.mapId = targetMap;
                    monsters.spawnInitial(character.stats.level);
                    console.log(`[Warp] Monsters spawned`);

                    // Update multiplayer presence for the new map
                    updatePresence(character.stats.level, username, targetMap);
                    console.log(`[Warp] Presence updated`);

                    // Immediately broadcast position on the new map so others see us at the spawn point
                    broadcastPosition(
                        userId,
                        username,
                        character.stats.level,
                        character.getPosition(),
                        character.mesh.rotation.y,
                        character.state,
                        character.getAppearance(),
                        targetMap
                    );
                    console.log(`[Warp] Initial position broadcasted for new map`);
                    
                    // Clear remote players from old map
                    for (const [id, rp] of remotePlayersMap.entries()) {
                        if (rp.mesh) sceneManager.scene.remove(rp.mesh);
                    }
                    remotePlayersMap.clear();
                    console.log(`[Warp] Remote players cleared`);
                }
            }
        });
    }

    // 5. Updates
    character.update(dt);

    // Fishing line follows the live rod tip (incl. the catch yank)
    if (isFishingActive && sceneManager && character.getRodTipPosition) {
        sceneManager.updateFishingRodTip(
            character.getRodTipPosition(rodTipTmp),
            character.getRodYankProgress()
        );
    }
    monsters.update(dt, sceneManager.camera, character.stats.level);
    sceneManager.updateAnimations(dt);
    if (particles) particles.update(dt);
    if (combatSystem) combatSystem.update(dt);
    if (gameUI) gameUI.updateTargetIndicator(sceneManager);

    // 6. Camera & Networking
    sceneManager.followTarget(character.getPosition(), character.baseY);

    const now = performance.now();
    if (now - lastBroadcastTime > 100) {
        broadcastPosition(userId, username, character.stats.level, character.getPosition(), character.mesh.rotation.y, character.state, character.getAppearance(), sceneManager.currentMap);
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
    } catch (err) {
        console.error('[GameLoop] Error:', err);
    }
}

// Start
initAuth();
