// ZOLOS — Idle RPG Online
// Main Entry Point

// Build version banner — bump BUILD_VERSION on notable fixes so we can
// instantly tell from the console which bundle a client is running.
const BUILD_VERSION = '2026-07-14.25 (almanac-close-fix)';
console.log(`%c[Zolos] Build ${BUILD_VERSION}`, 'color:#4ade80;font-weight:bold');
window.ZOLOS_BUILD = BUILD_VERSION;

// Notify + offer reload when a newer build is deployed while this tab is open
import('./engine/UpdateChecker.js').then(({ startUpdateChecker }) => startUpdateChecker());
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
    sendBossHit,
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
window.remotePlayersMap = remotePlayersMap;
let lastBroadcastTime = 0;
let lastHUDTime = 0;
let lastStatsTime = 0;
let lastMinimapTime = 0;

// Input state
let autoPath = null;
let isShiftPressed = false;

// Reusable vector for per-frame rod tip queries (avoids per-frame allocation)
const rodTipTmp = new THREE.Vector3();

// Mobile/touch detection — duel camera pulls back further on small screens
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

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
const _w2sTmp = new THREE.Vector3();
function worldToScreen(pos, offsetY = 1.6) {
    if (!sceneManager || !sceneManager.camera || !sceneManager.canvas) return { x: 0, y: 0 };
    const tempV = _w2sTmp.copy(pos); // reuse to avoid a per-call allocation
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
    particles.camera = sceneManager.camera; // used to billboard sword-slash arcs
    soundManager = new SoundManager();
    monsters = new MonsterManager(sceneManager.scene, sceneManager);

    // Initialize Combat System
    combatSystem = new CombatSystem(character, monsters, (event) => {
        // Combat event handler — connects CombatSystem to particles, sound, and UI
        if (!event) return;
        switch (event.type) {
            case 'playerRangedAttack':
                if (particles) {
                    const wc = event.weaponClass || 'bow';
                    const resolveHit = () => {
                        if (combatSystem) combatSystem._resolveDamage(event.target, wc);
                    };
                    if (wc === 'gun') {
                        particles.spawnBullet(event.startPos, event.target, resolveHit);
                        if (soundManager) soundManager.playAtkSound();
                    } else {
                        particles.spawnArrow(event.startPos, event.target, resolveHit);
                    }
                }
                break;
            case 'playerAttack':
                if (particles) {
                    // Sword slash arc for melee; plain hit spark for ranged impacts
                    if (event.weaponClass === 'melee') {
                        particles.spawnSlash(event.targetPos, event.critical);
                    }
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
                    // Record it in the Fishing Almanac (discovery bonus on new species)
                    if (gameUI.recordFishCatch) gameUI.recordFishCatch(event.item);
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

    // Build the World Boss HUD (countdown, HP bar, summary board)
    initBossUI();

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

    // Persisted audio prefs (per-device, in localStorage). Separate controls
    // for Music (BGM) and Sound Effects (SFX), each with its own volume.
    const musicEnabled = localStorage.getItem('zolos_music_enabled') !== 'false';
    const musicVolume = parseInt(localStorage.getItem('zolos_music_volume') || '25', 10);
    const sfxEnabled = localStorage.getItem('zolos_sfx_enabled') !== 'false';
    const sfxVolumeStr = localStorage.getItem('zolos_sfx_volume');

    // In-game BGM: stream via hidden YouTube embed (see YouTubeBGM.js)
    import('./engine/YouTubeBGM.js').then(({ youtubeBGM }) => {
        window.youtubeBGM = youtubeBGM;
        youtubeBGM.setVolume(musicVolume);
        youtubeBGM.setEnabled(musicEnabled);
        youtubeBGM.start();
    });

    // Apply persisted SFX prefs to the sound manager
    if (soundManager) {
        soundManager.enabled = sfxEnabled;
        if (sfxVolumeStr !== null) {
            const v = parseInt(sfxVolumeStr, 10);
            if (!isNaN(v)) soundManager.masterVolume = Math.max(0, Math.min(1, v / 100));
        }
    }

    // Apply persisted game settings
    if (character && character.gameSettings) {
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
                // Show this remote player's fishing line while they're fishing
                rp.character.syncFishingLine(rp.character.state === 'fishing');
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
    await gameUI.loadFishingAlmanacFromDB(charData.id);

    // Initial Monster Spawn
    monsters.spawnInitial(character.stats.level);

    // Populate the arena MMR leaderboard board
    refreshArenaLeaderboard();

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
    // Background simulation loop (keeps AUTO bot running when tab is hidden)
    if (!bgIntervalId) {
        bgIntervalId = setInterval(backgroundTick, 500);
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

    // Handle PVP Duels: limit targeting to only ground and the opponent
    if (duelState) {
        if (hit.type === 'ground') {
            autoPath = hit.point;
            character.targetMonster = null;
            particles.createClickIndicator(hit.point, 0x44ff44);
        } else if (hit.type === 'player' && hit.object.userId === duelState.opponentUserId) {
            // Click opponent: flash red indicator but don't open profile popup
            particles.createClickIndicator(hit.point, 0xff4444);
        }
        return;
    }

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

// Fetch top-MMR players and paint them onto the arena board
async function refreshArenaLeaderboard() {
    if (!sceneManager || !sceneManager.updateArenaLeaderboard) return;
    try {
        const { getMMRLeaderboard } = await import('./network/GameSync.js');
        const entries = await getMMRLeaderboard(8);
        sceneManager.updateArenaLeaderboard(entries);
    } catch (e) {
        console.warn('[Zolos] refreshArenaLeaderboard failed:', e.message);
    }
}

// ============ PVP Duel Manager ============
// duel_start → teleport both players to the arena and enter duel mode.
// While dueling, walking into attack range auto-swings at the opponent;
// hits are relayed victim-authoritative (each client applies damage to its
// own HP). When a player dies their client reports duel_end; the server
// settles MMR (Elo) and broadcasts duel_result.
let duelState = null; // { duelId, opponentUserId, cooldown }

window.duelManager = {
    onDuelStart(payload) {
        if (!payload || !character || !payload.players) return;
        const me = payload.players.find(p => p.userId === userId);
        const foe = payload.players.find(p => p.userId !== userId);
        if (!me || !foe) return;

        // Stop PvE activities so the duel is clean
        if (combatSystem) {
            combatSystem.autoFarm = false;
            combatSystem.currentTarget = null;
            if (combatSystem.isFishing) combatSystem.toggleFishing();
        }
        character.targetMonster = null;
        autoPath = null;

        // Teleport to the arena spawn and heal to full for a fair fight
        character.mesh.position.set(me.spawn.x, 1.2, me.spawn.z);
        character.stats.hp = character.stats.max_hp;
        character.stats.sp = character.stats.max_sp;

        // Raise the cage — players are locked inside until the duel ends
        if (sceneManager && sceneManager.showArenaCage) sceneManager.showArenaCage();

        duelState = { duelId: payload.duelId, opponentUserId: foe.userId, cooldown: 1.0 };
        window.duelState = duelState;

        if (gameUI) {
            if (gameUI.showDuelBanner) gameUI.showDuelBanner('start');
            gameUI.addCombatLog('🏟️ เข้าสู่สังเวียน! กรงถูกปิด — สู้จนกว่าจะมีผู้ชนะ!', 'levelup');
            gameUI.setAutoFarmState(false);
            gameUI.updateHUD(character.stats);
        }
    },

    onDuelHit(payload) {
        if (!duelState || !payload || !character) return;
        const dmg = Math.max(1, Number(payload.damage) || 0);
        const actual = character.takeDamage(dmg);
        if (gameUI) gameUI.addCombatLog(`🩸 โดนโจมตี -${actual}${payload.critical ? ' (CRIT!)' : ''}`, 'warning');
        if (particles) {
            const screenPos = worldToScreen(character.getPosition(), 1.6);
            particles.spawnDamageNumber(screenPos.x, screenPos.y, actual, 'monster-dmg');
            particles.spawnHitEffect(character.getPosition(), !!payload.critical);
        }
        if (gameUI) gameUI.updateHUD(character.stats);

        // I died → report defeat; server settles MMR and notifies both sides
        if (!character.isAlive()) {
            import('./network/GameSync.js').then(({ reportDuelEnd }) => {
                reportDuelEnd(payload.attackerUserId || duelState.opponentUserId, userId);
            });
        }
    },

    onDuelResult(payload) {
        if (!payload) return;
        const won = payload.winnerUserId === userId;
        const myMmr = won ? payload.winnerMmr : payload.loserMmr;
        const deltaTxt = payload.delta !== undefined
            ? (won ? ` (+${payload.delta} MMR → ${myMmr})` : ` (-${payload.delta} MMR → ${myMmr})`)
            : '';
        if (gameUI) {
            if (won) {
                gameUI.addCombatLog(`🏆 ชนะการดวล!${payload.forfeit ? ' (คู่ต่อสู้ออกจากเกม)' : ''}${deltaTxt}`, 'levelup');
            } else {
                gameUI.addCombatLog(`💀 แพ้การดวล...${deltaTxt}`, 'death');
                gameUI.triggerScreenShake(true);
            }
            // Big victory/defeat banner
            if (gameUI.showDuelResult) {
                gameUI.showDuelResult(won, payload.delta, myMmr, !!payload.forfeit);
            }
        }
        // Drop the cage now the fight is over
        if (sceneManager && sceneManager.hideArenaCage) sceneManager.hideArenaCage();
        // Refresh the leaderboard board with the new MMR values
        refreshArenaLeaderboard();
        // Restore both players to full HP; loser gets back on their feet
        if (character) {
            character.stats.hp = character.stats.max_hp;
            character.state = 'idle';
            if (gameUI) gameUI.updateHUD(character.stats);
            // Keep MMR in local stats for display
            if (myMmr !== undefined) character.stats.mmr = myMmr;
        }
        duelState = null;
        window.duelState = null;
    },
};

// Keep a dueling player locked inside the cage (called each frame).
function clampToArena() {
    if (!duelState || !character || !sceneManager || !sceneManager.getArenaInfo) return;
    const { x: cx, z: cz, radius } = sceneManager.getArenaInfo();
    const p = character.mesh.position;
    const dx = p.x - cx, dz = p.z - cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > radius) {
        p.x = cx + (dx / d) * radius;
        p.z = cz + (dz / d) * radius;
        autoPath = null; // cancel any click-to-move heading out
    }
}

// Per-frame duel combat: auto-swing at the opponent when in range
function updateDuelCombat(dt) {
    if (!duelState || !character || !character.isAlive()) return;
    duelState.cooldown = Math.max(0, duelState.cooldown - dt);

    const rp = remotePlayersMap.get(duelState.opponentUserId);
    if (!rp || !rp.mesh) return; // opponent not in view yet

    const myPos = character.getPosition();
    const foePos = rp.mesh.position;
    const dx = foePos.x - myPos.x;
    const dz = foePos.z - myPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= character.getAttackRange() + 0.7) {
        character.mesh.rotation.y = Math.atan2(dx, dz);
        if (duelState.cooldown <= 0) {
            duelState.cooldown = character.getAttackCooldown();
            character.state = 'attacking';
            const isCritical = Math.random() < 0.1;
            let dmg = (Number(character.stats.atk) || 10) + Math.floor(Math.random() * 5);
            if (isCritical) dmg = Math.floor(dmg * 1.8);

            import('./network/GameSync.js').then(({ sendDuelHit }) => {
                sendDuelHit(duelState?.opponentUserId, dmg, isCritical);
            });
            if (particles) {
                const screenPos = worldToScreen(foePos, 1.2);
                particles.spawnDamageNumber(screenPos.x, screenPos.y, dmg, isCritical ? 'critical-dmg' : 'player-dmg');
                particles.spawnHitEffect(foePos.clone(), isCritical);
            }
            if (soundManager) soundManager.playAtkSound();
        } else if (duelState.cooldown < character.getAttackCooldown() * 0.5 && character.state === 'attacking') {
            character.state = 'idle';
        }
    }
}

// ============ World Boss ============
// A giant server-scheduled boss everyone fights together. The server owns the
// shared HP and per-player damage; this client renders the boss, deals damage
// (relayed via sendBossHit), shows the countdown/HP bar, and applies the reward
// the server assigns to *this* player when the boss dies.
let bossState = null;           // { active, name, hp, maxHp, x, z }
let bossCountdownTarget = 0;     // epoch ms of next spawn (for the countdown pill)
let bossFleeTarget = 0;          // epoch ms the active boss flees
let bossAtkTimer = 0;            // boss AoE counter-attack cadence
let bossSwingCd = 0;             // our attack cooldown vs the boss
let bossRewardClaimed = false;   // guard so a reward is applied once per kill

const BOSS_ITEM_META = {
    'Dragon Heart': { emoji: '🐲', type: 'material', rarity: 'legendary', price: 20000, desc: 'หัวใจมังกรจากบอสโลก — ล้ำค่าที่สุด' },
    'Mythril Shard': { emoji: '💠', type: 'material', rarity: 'rare', price: 6000, desc: 'เศษมิธริลจากบอสโลก' },
};

function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// Build the boss HUD (countdown pill, HP bar, spawn toast, summary board) once.
function initBossUI() {
    if (document.getElementById('boss-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'boss-ui-style';
    style.textContent = `
    #boss-countdown{position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:60;
      background:linear-gradient(135deg,rgba(60,20,20,.92),rgba(30,10,30,.92));
      border:1px solid #b4462e;border-radius:20px;padding:5px 14px;color:#ffd9a0;
      font-weight:700;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.5);display:none;
      backdrop-filter:blur(4px);white-space:nowrap;cursor:default;user-select:none;}
    #boss-hpbar{position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:61;
      width:min(560px,86vw);display:none;text-align:center;}
    #boss-hpbar .bh-name{color:#ffcf6a;font-weight:800;font-size:15px;
      text-shadow:0 2px 6px rgba(0,0,0,.8);letter-spacing:.5px;margin-bottom:3px;}
    #boss-hpbar .bh-track{height:20px;border-radius:11px;background:rgba(0,0,0,.55);
      border:1.5px solid #7a2d1f;overflow:hidden;position:relative;box-shadow:0 4px 14px rgba(0,0,0,.5);}
    #boss-hpbar .bh-fill{height:100%;width:100%;
      background:linear-gradient(90deg,#ff3b30,#ff7a2e,#ffb038);transition:width .18s ease;}
    #boss-hpbar .bh-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,.9);}
    #boss-hpbar .bh-flee{color:#ffb0a0;font-size:11px;margin-top:2px;text-shadow:0 1px 3px rgba(0,0,0,.8);}
    @media(max-width:768px){
      #boss-countdown{top:82px;font-size:11px;padding:4px 10px;}
      #boss-hpbar{top:78px;}
      #boss-hpbar .bh-name{font-size:13px;}
      #boss-hpbar .bh-track{height:16px;}
      #boss-hpbar .bh-text{font-size:10px;}
    }
    #boss-toast{position:fixed;top:34%;left:50%;transform:translate(-50%,-50%) scale(.7);z-index:2000;
      text-align:center;pointer-events:none;opacity:0;transition:all .5s cubic-bezier(.2,1.3,.4,1);}
    #boss-toast.show{opacity:1;transform:translate(-50%,-50%) scale(1);}
    #boss-toast .bt-title{font-size:40px;font-weight:900;color:#ff6a2a;
      text-shadow:0 0 24px rgba(255,80,20,.9),0 4px 10px rgba(0,0,0,.9);}
    #boss-toast .bt-sub{font-size:16px;color:#ffe0b0;margin-top:6px;text-shadow:0 2px 8px rgba(0,0,0,.9);}
    #boss-summary{position:fixed;inset:0;z-index:2100;display:none;align-items:center;justify-content:center;
      background:rgba(0,0,0,.62);backdrop-filter:blur(3px);}
    #boss-summary .bs-card{width:min(430px,92vw);max-height:86vh;overflow:auto;border-radius:18px;
      background:linear-gradient(160deg,#241019,#1a0f22);border:1.5px solid #8a3b2a;
      box-shadow:0 20px 60px rgba(0,0,0,.7);padding:20px 18px;text-align:center;
      animation:bsPop .4s cubic-bezier(.2,1.3,.4,1);}
    @keyframes bsPop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
    #boss-summary .bs-crown{font-size:38px}
    #boss-summary .bs-title{font-size:20px;font-weight:900;color:#ffcf6a;margin:4px 0}
    #boss-summary .bs-killer{color:#ffe0b0;font-size:13px;margin-bottom:12px}
    #boss-summary .bs-row{display:flex;align-items:center;gap:8px;padding:7px 10px;margin:4px 0;
      border-radius:10px;background:rgba(255,255,255,.05);font-size:13px;color:#f0e6d8;}
    #boss-summary .bs-row.me{background:linear-gradient(90deg,rgba(255,140,40,.25),rgba(255,80,40,.12));
      border:1px solid #ff8a2e;}
    #boss-summary .bs-rank{width:26px;font-weight:800;color:#ffd070;flex:none;text-align:center}
    #boss-summary .bs-nm{flex:1;text-align:left;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #boss-summary .bs-dmg{color:#ff9a6a;font-size:11px;flex:none}
    #boss-summary .bs-rw{color:#7ee08a;font-size:11px;flex:none;font-weight:700}
    #boss-summary .bs-mine{margin-top:12px;padding:10px;border-radius:12px;
      background:linear-gradient(135deg,rgba(255,180,60,.18),rgba(255,90,40,.1));border:1px solid #ff8a2e;
      color:#ffe6c0;font-weight:700;font-size:13px;}
    #boss-summary .bs-close{margin-top:14px;padding:9px 26px;border:none;border-radius:22px;cursor:pointer;
      background:linear-gradient(135deg,#ff7a2e,#ff3b30);color:#fff;font-weight:800;font-size:14px;}
    `;
    document.head.appendChild(style);

    const cd = document.createElement('div');
    cd.id = 'boss-countdown';
    document.body.appendChild(cd);

    const bar = document.createElement('div');
    bar.id = 'boss-hpbar';
    bar.innerHTML = `<div class="bh-name"></div>
      <div class="bh-track"><div class="bh-fill"></div><div class="bh-text"></div></div>
      <div class="bh-flee"></div>`;
    document.body.appendChild(bar);

    const toast = document.createElement('div');
    toast.id = 'boss-toast';
    toast.innerHTML = `<div class="bt-title"></div><div class="bt-sub"></div>`;
    document.body.appendChild(toast);

    const summary = document.createElement('div');
    summary.id = 'boss-summary';
    summary.innerHTML = `<div class="bs-card"></div>`;
    summary.addEventListener('click', (e) => { if (e.target === summary) summary.style.display = 'none'; });
    document.body.appendChild(summary);
}

window.worldBossManager = {
    onState(p) {
        if (!p) return;
        if (p.active) {
            bossState = { active: true, name: p.name, hp: p.hp, maxHp: p.maxHp, x: p.x || 0, z: p.z || 0 };
            bossFleeTarget = Date.now() + (p.msUntilFlee || 0);
            bossRewardClaimed = false;
            this._showBar();
        } else {
            bossState = null;
            bossCountdownTarget = Date.now() + (p.msUntilSpawn || 0);
            this._hideBar();
        }
        this.reconcileMesh();
    },

    onSpawn(p) {
        if (!p) return;
        bossState = { active: true, name: p.name, hp: p.hp, maxHp: p.maxHp, x: p.x || 0, z: p.z || 0 };
        bossFleeTarget = Date.now() + (p.msUntilFlee || 0);
        bossRewardClaimed = false;
        this._showBar();
        this.reconcileMesh();
        if (gameUI) gameUI.addCombatLog(`👹 บอสโลก [${p.name}] ปรากฏตัวกลางทุ่ง Prontera! รีบไปช่วยกันตี!`, 'levelup');
        this._toast(`👹 ${p.name}`, 'บอสโลกปรากฏตัว! ไปที่ทุ่งหญ้า Prontera เพื่อร่วมรบ');
        if (soundManager) soundManager.playLevelUpSound();
    },

    onHp(p) {
        if (!p || !bossState) return;
        bossState.hp = p.hp;
        bossState.maxHp = p.maxHp;
        this._updateBar();
    },

    onDead(p) {
        if (!p) return;
        bossState = null;
        bossCountdownTarget = Date.now() + (p.msUntilSpawn || 0);
        this._hideBar();
        // Death flourish, then remove the mesh
        if (sceneManager && sceneManager._worldBoss && sceneManager.getWorldBossInfo) {
            const bi = sceneManager.getWorldBossInfo();
            sceneManager.playBossHitReaction();
            for (let i = 0; i < 14; i++) {
                setTimeout(() => {
                    if (particles && bi) particles.spawnHitEffect(
                        new THREE.Vector3(bi.x + (Math.random() - 0.5) * 3.5, 1 + Math.random() * 4.5, bi.z + (Math.random() - 0.5) * 3.5), true);
                }, i * 55);
            }
            setTimeout(() => { if (sceneManager) sceneManager.removeWorldBoss(); }, 950);
        }
        this._applyReward(p);
        this._showSummary(p);
        if (gameUI) gameUI.addCombatLog(`💀 ${p.name} ถูกปราบแล้ว! ผู้ปิดจ๊อบ: ${p.killerName}`, 'levelup');
    },

    onFlee(p) {
        bossState = null;
        bossCountdownTarget = Date.now() + ((p && p.msUntilSpawn) || 0);
        this._hideBar();
        if (sceneManager) sceneManager.removeWorldBoss();
        if (gameUI) gameUI.addCombatLog(`🌫️ ${(p && p.name) || 'บอส'} หนีหายเข้าไปในหมอก... ไม่มีใครปราบได้ทัน`, 'warning');
    },

    // Mesh exists iff there's an active boss and we're on the home field.
    reconcileMesh() {
        if (!sceneManager) return;
        const onField = sceneManager.currentMap === 'prontera';
        if (bossState && bossState.active && onField) {
            if (!sceneManager._worldBoss) sceneManager.spawnWorldBoss(bossState.name, bossState.x, bossState.z);
        } else if (sceneManager._worldBoss) {
            sceneManager.removeWorldBoss();
        }
    },

    _applyReward(p) {
        if (bossRewardClaimed || !p || !Array.isArray(p.ranking) || !character) return;
        const mine = p.ranking.find(r => r.userId === userId);
        if (!mine) return;
        bossRewardClaimed = true;
        character.stats.gold = (Number(character.stats.gold) || 0) + (mine.gold || 0);
        if (mine.exp) {
            const leveled = character.addExp(mine.exp);
            if (leveled && gameUI) gameUI.addCombatLog(`🎉 LEVEL UP! เลเวล ${character.stats.level}!`, 'levelup');
        }
        if (mine.item && gameUI) {
            const meta = BOSS_ITEM_META[mine.item] || { emoji: '💎', type: 'material', rarity: 'legendary', price: 5000, desc: 'ของหายากจากบอสโลก' };
            gameUI.addItem({ name: mine.item, type: meta.type, emoji: meta.emoji, rarity: meta.rarity, price: meta.price, desc: meta.desc });
        }
        if (gameUI) {
            gameUI.addCombatLog(`🏆 อันดับ #${mine.rank} | +${mine.gold} Gold, +${mine.exp} EXP${mine.item ? `, ได้รับ ${mine.item}!` : ''}`, 'loot');
            gameUI.updateHUD(character.stats);
        }
    },

    _showBar() {
        const cd = document.getElementById('boss-countdown');
        const bar = document.getElementById('boss-hpbar');
        if (cd) cd.style.display = 'none';
        if (bar) { bar.style.display = 'block'; bar.querySelector('.bh-name').textContent = `👹 ${bossState.name}`; }
        this._updateBar();
    },
    _updateBar() {
        const bar = document.getElementById('boss-hpbar');
        if (!bar || !bossState) return;
        const pct = Math.max(0, Math.min(100, (bossState.hp / bossState.maxHp) * 100));
        bar.querySelector('.bh-fill').style.width = pct + '%';
        bar.querySelector('.bh-text').textContent = `${Math.ceil(bossState.hp).toLocaleString()} / ${bossState.maxHp.toLocaleString()}`;
    },
    _hideBar() {
        const bar = document.getElementById('boss-hpbar');
        if (bar) bar.style.display = 'none';
    },
    _toast(title, sub) {
        const t = document.getElementById('boss-toast');
        if (!t) return;
        t.querySelector('.bt-title').textContent = title;
        t.querySelector('.bt-sub').textContent = sub;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3800);
    },
    _showSummary(p) {
        const box = document.getElementById('boss-summary');
        if (!box) return;
        const card = box.querySelector('.bs-card');
        const ranking = (p.ranking || []).slice(0, 8);
        const mine = (p.ranking || []).find(r => r.userId === userId);
        const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
        let rows = ranking.map(r => `
            <div class="bs-row ${r.userId === userId ? 'me' : ''}">
              <div class="bs-rank">${medal(r.rank)}</div>
              <div class="bs-nm">${escapeHtml(r.name)}</div>
              <div class="bs-dmg">${r.dmg.toLocaleString()} dmg</div>
              <div class="bs-rw">+${r.gold}g${r.item ? ' 🎁' : ''}</div>
            </div>`).join('');
        const mineHtml = mine
            ? `<div class="bs-mine">รางวัลของคุณ (อันดับ #${mine.rank}): +${mine.gold} Gold · +${mine.exp} EXP${mine.item ? ` · ${BOSS_ITEM_META[mine.item]?.emoji || '💎'} ${mine.item}` : ''}</div>`
            : `<div class="bs-mine">คุณไม่ได้ร่วมโจมตีบอสครั้งนี้ — ครั้งหน้าอย่าพลาด!</div>`;
        card.innerHTML = `
            <div class="bs-crown">🏆</div>
            <div class="bs-title">ปราบ ${escapeHtml(p.name)} สำเร็จ!</div>
            <div class="bs-killer">⚔️ ผู้ปิดจ๊อบ: ${escapeHtml(p.killerName || '-')}</div>
            ${rows}
            ${mineHtml}
            <button class="bs-close">รับรางวัล</button>`;
        card.querySelector('.bs-close').onclick = () => { box.style.display = 'none'; };
        box.style.display = 'flex';
        setTimeout(() => { if (box.style.display === 'flex') box.style.display = 'none'; }, 12000);
    },
};

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Update the boss countdown pill / HP-bar flee timer (called on the HUD throttle).
function updateBossHud() {
    const cd = document.getElementById('boss-countdown');
    if (bossState && bossState.active) {
        if (cd) cd.style.display = 'none';
        const flee = document.querySelector('#boss-hpbar .bh-flee');
        if (flee) {
            const onField = sceneManager && sceneManager.currentMap === 'prontera';
            const rem = fmtCountdown(bossFleeTarget - Date.now());
            flee.textContent = onField ? `⏳ หนีใน ${rem}` : `⏳ หนีใน ${rem} — ไปทุ่ง Prontera เพื่อร่วมรบ!`;
        }
    } else if (bossCountdownTarget) {
        if (cd) {
            cd.style.display = 'block';
            cd.textContent = `👹 บอสโลกเกิดในอีก ${fmtCountdown(bossCountdownTarget - Date.now())}`;
        }
    }
}

// Per-frame: rush the boss, keep swinging with big visible effects, and take
// the counter-slams. While "engaged" we set window.bossEngaged so CombatSystem
// stands down (no idle-reset / no wandering off to farm nearby monsters), which
// is what makes the attack animation actually play instead of freezing at idle.
function updateBossCombat(dt) {
    // Not engageable → release the takeover so normal combat resumes.
    if (duelState || !bossState || !bossState.active || !character || !character.isAlive()
        || (combatSystem && combatSystem.isFishing)
        || !sceneManager || sceneManager.currentMap !== 'prontera' || !sceneManager._worldBoss) {
        window.bossEngaged = false;
        return;
    }

    const info = sceneManager.getWorldBossInfo();
    if (!info) { window.bossEngaged = false; return; }

    const myPos = character.getPosition();
    const dx = info.x - myPos.x;
    const dz = info.z - myPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.0001;

    const wc = character.getWeaponClass ? character.getWeaponClass() : 'melee';
    // Melee gets a forgiving reach (the boss is huge); ranged keeps its distance.
    const reach = character.getAttackRange() + info.radius + (wc === 'melee' ? 1.2 : 0.4);
    const ENGAGE = info.radius + 12; // rush in when this close to the boss

    // ----- Boss AoE counter-attack (slams anyone standing near it) -----
    bossAtkTimer -= dt;
    if (dist < info.radius + 3.8 && bossAtkTimer <= 0) {
        bossAtkTimer = 2.4;
        const bossDmg = 8 + Math.floor(Math.random() * 10) + Math.floor((character.stats.level || 1) * 0.4);
        const actual = character.takeDamage(bossDmg);
        if (particles) {
            const sp = worldToScreen(myPos, 1.6);
            particles.spawnDamageNumber(sp.x, sp.y, actual, 'monster-dmg');
            particles.spawnHitEffect(myPos.clone(), false);
        }
        if (gameUI) {
            gameUI.addCombatLog(`🔥 ${bossState.name} ฟาดใส่คุณ -${actual}`, 'warning');
            gameUI.updateHUD(character.stats);
        }
        if (!character.isAlive()) {
            window.bossEngaged = false;
            if (gameUI) { gameUI.addCombatLog('💀 คุณถูกบอสปราบ! กำลังเกิดใหม่ใน 3 วินาที...', 'death'); gameUI.setAutoFarmState(false); }
            if (combatSystem) { combatSystem.autoFarm = false; combatSystem.currentTarget = null; }
            character.targetMonster = null;
            setTimeout(() => {
                if (character && !character.isAlive()) {
                    character.respawn();
                    if (gameUI) { gameUI.addCombatLog('💚 คุณเกิดใหม่แล้ว!', 'system'); gameUI.updateHUD(character.stats); }
                }
            }, 3000);
            return;
        }
    }

    // Outside the engage bubble → let normal play continue.
    if (dist > ENGAGE) { window.bossEngaged = false; return; }

    // Engaged: take over auto-farm targeting so it doesn't drag us off to a mob.
    window.bossEngaged = true;
    character.targetMonster = null;
    character.mesh.rotation.y = Math.atan2(dx, dz); // always face the boss

    // Auto-rush the boss if out of swing range — but only when the player isn't
    // steering themselves (WASD or click-to-move), so walking away still works.
    const manualDir = (inputManager && !(combatSystem && combatSystem.isFishing)) ? inputManager.getMovementDirection() : null;
    if (dist > reach) {
        if (!manualDir && !autoPath) {
            character.moveSpeed = isShiftPressed ? 9 : 5.5;
            character.moveToward(new THREE.Vector3(info.x, myPos.y, info.z), dt);
            character.state = 'running';
        }
        return; // not close enough to hit yet
    }

    // In range → keep the attack animation running continuously (the arm loops
    // its swing while state stays 'attacking'; CombatSystem no longer resets it).
    character.state = 'attacking';

    bossSwingCd = Math.max(0, bossSwingCd - dt);
    if (bossSwingCd > 0) return;
    bossSwingCd = character.getAttackCooldown();

    // ----- Land a hit with spectacular feedback -----
    const isCrit = Math.random() < 0.14;
    let dmg = (Number(character.stats.atk) || 10) + Math.floor(Math.random() * 6);
    if (isCrit) dmg = Math.floor(dmg * 1.95);

    const dirX = dx / dist, dirZ = dz / dist;
    const bossBody = new THREE.Vector3(info.x, 3.2, info.z);
    // A slash arc right at the hero's swing, plus impacts on the boss body.
    const swingPos = new THREE.Vector3(myPos.x + dirX * 1.6, myPos.y + 1.35, myPos.z + dirZ * 1.6);

    const applyHit = () => {
        sendBossHit(dmg, isCrit);
        if (sceneManager) sceneManager.playBossHitReaction();
        if (particles) {
            const sp = worldToScreen(bossBody, 0);
            particles.spawnDamageNumber(sp.x, sp.y, dmg, isCrit ? 'critical-dmg' : 'player-dmg');
            particles.spawnHitEffect(bossBody.clone(), isCrit);
            // Extra ember sparks bursting off the boss for impact
            particles.spawnHitEffect(new THREE.Vector3(
                info.x + (Math.random() - 0.5) * 1.8, 2.2 + Math.random() * 1.8, info.z + (Math.random() - 0.5) * 1.8), isCrit);
        }
    };

    if (wc === 'bow' || wc === 'gun') {
        const targetWrap = { alive: true, getPosition: () => bossBody.clone() };
        if (particles) {
            if (wc === 'gun') particles.spawnBullet(myPos, targetWrap, applyHit);
            else particles.spawnArrow(myPos, targetWrap, applyHit);
        } else applyHit();
    } else {
        // Melee: a big slash in front of the hero + one across the boss body
        if (particles) {
            particles.spawnSlash(swingPos, isCrit);
            particles.spawnSlash(bossBody.clone(), isCrit);
        }
        applyHit();
    }
    if (isCrit && gameUI) gameUI.triggerScreenShake(true);
    if (soundManager) soundManager.playAtkSound();
}

// ============ Game Loop ============
// ===== Background simulation =====
// The browser pauses requestAnimationFrame when the tab is hidden/minimized,
// which would freeze the AUTO bot (farming & fishing). This setInterval keeps
// the simulation advancing while hidden. It only does work when the tab is
// hidden (rAF handles the visible case), and advances in fixed sub-steps so
// combat/fishing progress at real speed even though hidden-tab intervals are
// throttled to ~1s.
let bgLastTime = 0;
let bgIntervalId = null;

function backgroundTick() {
    if (!isGameStarted || !document.hidden || !character) return;
    const now = performance.now();
    if (!bgLastTime) bgLastTime = now;
    let elapsed = (now - bgLastTime) / 1000;
    bgLastTime = now;
    if (elapsed <= 0) return;
    elapsed = Math.min(elapsed, 5); // cap catch-up after long sleep/background

    try {
        let remaining = elapsed;
        while (remaining > 0) {
            const step = Math.min(0.1, remaining);
            character.update(step);
            if (combatSystem) combatSystem.update(step);       // auto-farm + fishing + attacks
            if (monsters) monsters.update(step, sceneManager.camera, character.stats.level);
            if (particles) particles.update(step);             // advance/cleanup effects
            remaining -= step;
        }
        if (gameUI) gameUI.updateHUD(character.stats);
    } catch (e) {
        console.warn('[Zolos] background tick error:', e);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        bgLastTime = performance.now(); // start fresh — don't over-catch-up
    } else {
        bgLastTime = 0;
        lastTime = performance.now();   // avoid a huge dt spike in the rAF loop on resume
    }
});

function gameLoop(time) {
    requestAnimationFrame(gameLoop);
    if (!isGameStarted) return;
    // While hidden, the background interval drives the simulation instead.
    if (document.hidden) return;

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

        // Clamp inside PvP Arena during active duel
        if (duelState) {
            const arenaCenterX = -14;
            const arenaCenterZ = 14;
            const dx = character.mesh.position.x - arenaCenterX;
            const dz = character.mesh.position.z - arenaCenterZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const limitRange = 5.8; // Arena floor radius is 6.2, keep player inside 5.8
            if (dist > limitRange) {
                character.mesh.position.x = arenaCenterX + (dx / dist) * limitRange;
                character.mesh.position.z = arenaCenterZ + (dz / dist) * limitRange;
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

        // PVP duel: auto-swing at the opponent when in range, and stay caged
        updateDuelCombat(dt);
        clampToArena();
        // World boss: keep the mesh in sync and swing when in range
        if (window.worldBossManager) window.worldBossManager.reconcileMesh();
        updateBossCombat(dt);
        monsters.update(dt, sceneManager.camera, character.stats.level);
        sceneManager.updateAnimations(dt);
        if (particles) particles.update(dt);
        if (combatSystem) combatSystem.update(dt);
        if (gameUI) gameUI.updateTargetIndicator(sceneManager);

        // 6. Camera & Networking
        // During a duel, frame both fighters (extra pull-back on mobile).
        const duelFoe = duelState ? remotePlayersMap.get(duelState.opponentUserId) : null;
        if (duelState && duelFoe && duelFoe.mesh) {
            sceneManager.frameDuel(character.getPosition(), duelFoe.mesh.position, IS_MOBILE);
        } else {
            sceneManager.followTarget(character.getPosition(), character.baseY);
        }

        const now = performance.now();
        if (now - lastBroadcastTime > 100) {
            broadcastPosition(userId, username, character.stats.level, character.getPosition(), character.mesh.rotation.y, character.state, character.getAppearance(), sceneManager.currentMap);
            lastBroadcastTime = now;
        }

        if (now - lastHUDTime > 100) {
            updateBossHud();
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
