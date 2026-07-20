// ZOLOS — Idle RPG Online
// Main Entry Point

// Security/privacy: silence verbose console output in production so the browser
// devtools can't be used to watch live player data, positions or internals.
// Errors & warnings stay for diagnostics. (Dev keeps full logging on localhost.)
// Bundler-agnostic on purpose — rolldown-vite ignores esbuild's `drop`.
(() => {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return;
    const noop = () => {};
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.table = noop;
    console.dir = noop;
})();

// Build version banner — bump BUILD_VERSION on notable fixes so we can
// instantly tell from the console which bundle a client is running.
const BUILD_VERSION = '2026-07-16.52 (socket-jwt-auth)';
window.ZOLOS_BUILD = BUILD_VERSION;

// Notify + offer reload when a newer build is deployed while this tab is open
import('./engine/UpdateChecker.js').then(({ startUpdateChecker }) => startUpdateChecker());
// PWA: register the service worker + wire the "Install app" button
import('./pwa.js').then(({ initPWA }) => initPWA());

// Block the browser right-click context menu while in-game (keep it working on
// the login screen, and always allow it on text fields so paste still works).
window.addEventListener('contextmenu', (e) => {
    const gameScreen = document.getElementById('game-screen');
    const inGame = gameScreen && gameScreen.style.display !== 'none';
    if (!inGame) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
}, { capture: true });
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
import { TutorialSystem } from './ui/TutorialSystem.js';
import { GlobalAnnouncements } from './ui/GlobalAnnouncements.js';
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
let globalAnnouncements = null;
let isGameStarted = false;
let lastTime = 0;
let portalCooldown = 0;
window.portalCooldown = portalCooldown;
let userId = null;
let username = 'Adventurer';

// Multiplayer state
const remotePlayersMap = new Map();
window.remotePlayersMap = remotePlayersMap;
let lastBroadcastTime = 0;
// Attack signal broadcast to other players so they hear our weapon. `localAtkSeq`
// bumps once per swing; `localWsc` is the current weapon's sound class.
let localAtkSeq = 0;
let localWsc = 'unarmed';
function registerLocalAttack(wsc) {
    localWsc = wsc || 'sword';
    localAtkSeq = (localAtkSeq + 1) & 0xffff; // wrap so the number stays small
    if (soundManager) soundManager.playWeaponAttack(localWsc);
}
let lastHUDTime = 0;
let lastStatsTime = 0;
let lastMinimapTime = 0;

// Input state
let autoPath = null;
window.autoPath = autoPath;
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

// ============ Vending Stalls (player shops in town) ============
// Presence rows live in Supabase; the socket 'stalls_update' ping triggers a
// refetch so every client rebuilds the market street when a stall opens/closes.
window.stallManager = {
    async refresh() {
        if (!sceneManager) return;
        if (sceneManager.currentMap !== 'prontera') { sceneManager.clearVendingStalls(); return; }
        try {
            const { fetchVendingStalls, fetchMarketListings } = await import('./network/GameSync.js');
            const [stalls, listings] = await Promise.all([fetchVendingStalls(), fetchMarketListings()]);
            const bySeller = {};
            (listings || []).forEach(l => { (bySeller[l.seller_id] = bySeller[l.seller_id] || []).push(l); });
            sceneManager.buildVendingStalls((stalls || []).map(s => ({ ...s, items: (bySeller[s.user_id] || []).slice(0, 3) })));
        } catch (e) {
            console.warn('[Stalls] refresh failed:', e);
        }
    },
};

// ============ Forged-weapon signature on-hit burst ============
// Colored explosion matching the equipped forged weapon's element. Throttled so
// it stays spectacular without spamming a 30-spark burst on every single hit.
const FORGE_EFFECT_COLORS = { fire: 0xff5a1a, frost: 0x66ddff, storm: 0x9fc0ff, soul: 0xaa66ff, nova: 0xffe066 };
function spawnForgeBurst(pos, isCrit) {
    if (!character || !particles || !pos || !character.getForgeEffect) return;
    const eff = character.getForgeEffect();
    if (!eff) return;
    if (!isCrit && Math.random() > 0.4) return; // always on crit, ~40% otherwise
    particles.createExplosion(pos, FORGE_EFFECT_COLORS[eff] || 0xffcf4a);
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
    window.particles = particles; // exposed for the forge's craft-success burst
    soundManager = new SoundManager();
    monsters = new MonsterManager(sceneManager.scene, sceneManager);
    // Aggro: when a monster reaches the player it swings back for real damage.
    monsters.onMonsterAttackPlayer = (mon) => {
        if (!character || !character.isAlive || !character.isAlive()) return;
        if (window.bossEngaged || duelState) return; // boss/duel own their own combat
        const atk = (mon.data && mon.data.atk) || 10;
        const def = character.stats.def || 0;
        const dmg = Math.max(1, atk - Math.floor(def * 0.3) + Math.floor(Math.random() * 3));
        const actual = character.takeDamage(dmg);
        if (particles) {
            const sp = worldToScreen(character.getPosition(), 1.6);
            particles.spawnDamageNumber(sp.x, sp.y, actual, 'monster-dmg');
            particles.spawnHitEffect(character.getPosition(), false);
        }
        if (gameUI) {
            gameUI.addCombatLog(`🩸 ${mon.data.name} จู่โจมคุณ -${actual}`, 'warning');
            gameUI.updateHUD(character.stats);
        }
        if (!character.isAlive()) {
            if (combatSystem) { combatSystem.autoFarm = false; combatSystem.currentTarget = null; }
            character.targetMonster = null;
            if (gameUI) {
                gameUI.addCombatLog(`💀 คุณถูก ${mon.data.name} ปราบ! กำลังเกิดใหม่ใน 3 วินาที...`, 'death');
                gameUI.setAutoFarmState(false);
                if (gameUI.showDeathBanner) gameUI.showDeathBanner(mon.data.name);
            }
            setTimeout(() => {
                if (character && !character.isAlive()) {
                    character.respawn();
                    if (gameUI) { gameUI.addCombatLog('💚 คุณเกิดใหม่แล้ว!', 'system'); gameUI.updateHUD(character.stats); }
                }
            }, 3000);
        }
    };

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
                    } else if (wc === 'magic') {
                        particles.spawnLightningBolt(event.startPos, event.target, resolveHit);
                    } else {
                        particles.spawnArrow(event.startPos, event.target, resolveHit);
                    }
                }
                // Ranged weapons sound at release (gun bang / bow twang); this
                // also broadcasts the attack so nearby players hear it.
                registerLocalAttack(event.weaponClass || 'bow');
                break;
            case 'playerAttack':
                if (particles) {
                    // Sword slash arc for melee; plain hit spark for ranged impacts
                    if (event.weaponClass === 'melee') {
                        particles.spawnSlash(event.targetPos, event.critical);
                    }
                    particles.spawnHitEffect(event.targetPos, event.critical);
                    spawnForgeBurst(event.targetPos, event.critical); // forged-weapon element burst
                    const screenPos = worldToScreen(event.targetPos, 1.2);
                    const dmgType = event.critical ? 'critical-dmg' : 'player-dmg';
                    particles.spawnDamageNumber(screenPos.x, screenPos.y, event.damage, dmgType);
                }
                // Melee weapons sound on the hit itself (ranged weapons already
                // sounded at release, so don't double up). Broadcasts to others.
                if (event.weaponClass === 'melee') {
                    registerLocalAttack(character && character.getWeaponSoundClass ? character.getWeaponSoundClass() : 'sword');
                }
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
                if (particles) particles.spawnLevelUpEffect(character.getPosition());
                if (gameUI) gameUI.addCombatLog(`🎉 LEVEL UP! You are now level ${event.level}!`, 'levelup');
                // Hitting the unlock level opens the job picker (once per session).
                if (gameUI && gameUI.maybePromptJobSelect) {
                    setTimeout(() => gameUI.maybePromptJobSelect(), 800);
                }
                break;
            case 'lootDrop':
                if (gameUI) gameUI.addCombatLog(`🎁 Dropped: ${event.item.name}`, 'loot');
                if (gameUI) gameUI.addItem(event.item);
                break;
            case 'monsterKilled':
                if (gameUI) gameUI.handleMonsterKill(event.monsterName);
                break;
            case 'playerDeath':
                if (gameUI) {
                    const killer = event.monsterName || 'มอนสเตอร์';
                    gameUI.addCombatLog(`💀 คุณถูก ${killer} ปราบ! กำลังเกิดใหม่ใน 3 วินาที...`, 'death');
                    gameUI.setAutoFarmState(false);
                    if (gameUI.showDeathBanner) gameUI.showDeathBanner(killer);
                    if (gameUI) gameUI.killStreak = 0;
                    const respawnBtn = document.getElementById('btn-respawn-now');
                    if (respawnBtn) respawnBtn.style.display = 'block';
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
    // Exposed alongside the other systems (particles / rendererSystem /
    // remotePlayersMap) so the scene is reachable for debugging.
    window.sceneManager = sceneManager;
    gameUI.particles = particles;

    // Expose globals for _doWarp and other external systems
    window.monsters = monsters;
    window.combatSystem = combatSystem;
    window.character = character;
    window.userId = userId;
    window.username = username;
    window.updatePresence = updatePresence;
    window.broadcastPosition = broadcastPosition;

    // Build the World Boss HUD (countdown, HP bar, summary board)
    initBossUI();

    // Initialize Announcement System
    announcementSystem.init();
    window.announcementSystem = announcementSystem;

    // Initialize Global Announcements (server events feed)
    globalAnnouncements = new GlobalAnnouncements();
    window.globalAnnouncements = globalAnnouncements;
    // Connect to socket for real-time events
    import('./network/GameSync.js').then(({ getSocket }) => {
        const socket = getSocket();
        if (socket) {
            globalAnnouncements.init(socket);
        }
    }).catch(e => console.warn('[GlobalAnnouncements] Socket init failed:', e));

    // Initialize Tutorial System for new players
    const tutorialSystem = new TutorialSystem(gameUI, character, sceneManager);
    window.tutorialSystem = tutorialSystem;
    // Pass full charData so TutorialSystem can read tutorial_completed from DB
    await tutorialSystem.loadTutorialState(charData);
    // Only auto-start if character has a job already (e.g. returning player)
    // New players will start tutorial after they pick their job in GameUI.js
    if (tutorialSystem.shouldAutoStart() && charData.job) {
        setTimeout(() => tutorialSystem.initTutorialFlow(), 1200);
    }

    // Set guest mode state
    gameUI.setGuestMode(charData.isGuest === true);

    // Setup bind account callback.
    // Guests are local (no anonymous auth session on this project), so binding
    // creates a real account and migrates the guest's progress to it, then
    // reloads into the new account.
    gameUI.setupBindAccountCallback(async (email, password) => {
        const { migrateGuestToAccount } = await import('./network/GameSync.js');
        const saveData = character.getSaveData();
        const guest = {
            name: character.stats.name,
            gender: character.gender || charData.gender || 'male',
            stats: { ...saveData.updates },
            inventory: (gameUI.inventory || []).map(i => ({
                item_name: i.item_name, item_type: i.item_type, quantity: i.quantity, stats: i.stats || {}
            })),
            friends: gameUI.friends || [],
            dailyQuests: gameUI.dailyQuestsState || null,
            almanac: gameUI.almanac || null,
            loginStreak: gameUI.loginStreak || null,
        };
        const result = await migrateGuestToAccount(email, password, guest);
        charData.isGuest = false; // Update local state
        // If any item failed to transfer, tell the player instead of hiding it.
        if (result && result.failedItems && result.failedItems.length && gameUI) {
            gameUI.addCombatLog(`⚠️ บางไอเทมย้ายไม่สำเร็จ: ${result.failedItems.join(', ')} (ลองผูกบัญชีซ้ำได้)`, 'warning');
        }
        // Reload into the freshly-created real account (its Supabase session now
        // wins over the old local-guest fallback), with all progress migrated.
        setTimeout(() => window.location.reload(), 2200);
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

    // Global Kill Streak Handler (Self & Others)
    window.onKillStreakReceived = (payload) => {
        if (!payload || !sceneManager) return;
        
        // Only show if on the same map
        if (payload.mapId && payload.mapId !== sceneManager.currentMap) return;

        if (payload.userId === userId) {
            // Self
            if (character) character.showKillStreakEffect(payload.count);
        } else {
            // Others
            const rp = remotePlayersMap.get(payload.userId);
            if (rp && rp.character) {
                rp.character.showKillStreakEffect(payload.count);
            }
        }

        // Add to combat log for extra flair
        if (gameUI) {
            const isMe = payload.userId === userId;
            const color = payload.count >= 50 ? 'levelup' : 'loot';
            const prefix = isMe ? '🔥 คุณ' : `🔥 [${payload.username}]`;
            gameUI.addCombatLog(`${prefix} ทำ Kill Streak ได้ถึง ${payload.count} ตัวแล้ว!`, color);
        }
    };

    // Fix C: Wire profileSaveCallback in main.js
    if (gameUI) {
        gameUI.setupProfileSaveCallback(async (data) => {
            // Part 2.3: Update runtime username and presence immediately
            if (data.name !== undefined) {
                character.stats.name = data.name;
                character.updateNameTag();
                
                // Update module-level username for presence state
                username = data.name;
                
                // Update presence state immediately
                try {
                    const { supabase, localDb, isOfflineMode } = await import('./network/SupabaseClient.js');
                    if (isOfflineMode) {
                        localDb.set(`profile_${charData.user_id}`, { id: charData.user_id, username: data.name, updated_at: new Date().toISOString() });
                    } else if (supabase) {
                        // profiles has no updated_at column — including it made the
                        // whole upsert fail (PGRST204), so the name never synced.
                        await supabase.from('profiles').upsert({ id: charData.user_id, username: data.name });
                    }
                    
                    // Force presence update if function exists
                    if (typeof updatePresenceState === 'function') {
                        updatePresenceState({ username: data.name });
                    }
                } catch (e) {
                    console.warn('Failed to update profile name in DB:', e);
                }
            }
            // Step 3: Ensure all equipment and appearance updates are called
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

            // Remote attack SFX — when the attacker's swing counter changes,
            // play their weapon's sound attenuated by how far away they are, so
            // you actually hear other players fighting near you.
            if (p.aseq !== undefined && soundManager && character && character.getPosition) {
                if (rp.lastAseq === undefined) {
                    rp.lastAseq = p.aseq; // first sighting: arm, don't fire a sound
                } else if (p.aseq !== rp.lastAseq) {
                    rp.lastAseq = p.aseq;
                    const me = character.getPosition();
                    const dx = (p.x ?? me.x) - me.x;
                    const dz = (p.z ?? me.z) - me.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const vol = Math.max(0, 1 - dist / 34); // fades out past ~34 units
                    if (vol > 0.02) {
                        soundManager.playWeaponAttack(p.wsc || 'sword', { volume: vol * 0.9 });
                        
                        // Visual replication for special weapon classes (Mage lightning)
                        if (p.wsc === 'lightning' && particles) {
                            // For remote players, we don't necessarily have their target ID replicated,
                            // but we can spawn a cosmetic bolt at their approximate facing direction or target
                            // If they have a targetMonster assigned in their CharacterManager, use it.
                            const target = rp.character.targetMonster;
                            if (target && target.alive) {
                                particles.spawnLightningBolt(rp.character.getPosition(), target);
                            } else {
                                // Fallback: strike slightly in front of them if no target
                                const forward = new THREE.Vector3(0, 0, 5).applyQuaternion(rp.character.mesh.quaternion);
                                const strikePos = rp.character.getPosition().add(forward);
                                // Dummy target-like object for the particle system
                                const dummyTarget = { getPosition: () => strikePos, alive: true };
                                particles.spawnLightningBolt(rp.character.getPosition(), dummyTarget);
                            }
                        }
                    }
                }
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
    await gameUI.loadLoginStreakFromDB(charData.id); // daily reward — auto-opens if claimable
    window.stallManager.refresh(); // build the player market street

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
    // Restore device settings (skill sounds, visual effects) onto the live systems.
    if (gameUI.applyDeviceSettings) gameUI.applyDeviceSettings();
    // Paint the skill bar from the character's job (Novice until one is chosen).
    if (gameUI.renderSkillBar) gameUI.renderSkillBar();
    // Existing Lv.10+ characters that predate jobs get the picker on entry.
    if (gameUI.maybePromptJobSelect) setTimeout(() => gameUI.maybePromptJobSelect(), 1200);

    isGameStarted = true;
    lastTime = performance.now();
    // Guard: never start a second parallel rAF chain (would double all updates)
    if (!window.__zolosLoopStarted) {
        window.__zolosLoopStarted = true;
        requestAnimationFrame(gameLoop);
    }
    // Background simulation loop (keeps the whole game running when tab is hidden)
    startBackgroundHeartbeat();

    // Input listeners — Shift key for sprinting
    window.addEventListener('keydown', (e) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftPressed = true;

        // Don't fire game hotkeys while typing in a text field (chat, forms).
        // Otherwise typing "1/2/3" in chat would cast skills.
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
            return;
        }

        // Skill hotkeys 1/2/3 — cast whatever sits in that slot for the current job
        if (e.code === 'Digit1' || e.key === '1') {
            gameUI.castSkillSlot(0);
        } else if (e.code === 'Digit2' || e.key === '2') {
            gameUI.castSkillSlot(1);
        } else if (e.code === 'Digit3' || e.key === '3') {
            gameUI.castSkillSlot(2);
        }

        // Reset the camera angle back to default
        if (e.code === 'KeyR') {
            if (sceneManager && sceneManager.resetCameraYaw) sceneManager.resetCameraYaw();
        }

        // Toggle first-person / third-person view (PC only). Like Minecraft's
        // F5, but F5 reloads the browser — use V instead.
        if (e.code === 'KeyV' && !IS_MOBILE && sceneManager && sceneManager.toggleCameraMode) {
            applyCameraMode(sceneManager.toggleCameraMode());
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftPressed = false;
    });

    canvas.addEventListener('mousedown', (e) => handleMouseInteraction(e));

    // ----- Right-click drag to rotate the camera -----
    // Frees the player from the fixed viewing angle. The contextmenu blocker
    // (added earlier) keeps the browser menu from popping up while dragging.
    let camDragging = false;
    let camDragLastX = 0;
    let camDragLastY = 0;
    let camDownX = 0, camDownY = 0;  // where the right-button press started
    let camDragDist = 0;             // accumulated drag distance, to tell a click from a rotate
    const ROTATE_SENS = 0.006; // radians per pixel dragged (horizontal yaw)
    const PITCH_SENS = 0.005;  // radians per pixel dragged (vertical tilt)
    const RCLICK_MAX_MOVE = 6; // px: a right-press that moves less than this counts as a click, not a drag
    canvas.addEventListener('mousedown', (e) => {
        // In first-person the mouse controls look via pointer lock, not orbit.
        if (e.button === 2 && sceneManager && sceneManager.getCameraMode?.() === 'first') return;
        if (e.button === 2) {
            camDragging = true;
            camDragLastX = e.clientX;
            camDragLastY = e.clientY;
            camDownX = e.clientX; camDownY = e.clientY;
            camDragDist = 0;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!camDragging) return;
        const dx = e.clientX - camDragLastX;
        const dy = e.clientY - camDragLastY;
        camDragLastX = e.clientX;
        camDragLastY = e.clientY;
        camDragDist += Math.abs(dx) + Math.abs(dy);
        // Vertical drag tilts the camera up/down (drag up = look down from higher).
        if (sceneManager && sceneManager.orbitCameraPitch) {
            sceneManager.orbitCameraPitch(-dy * PITCH_SENS);
        }
        if (sceneManager && sceneManager.rotateCamera) {
            sceneManager.rotateCamera(-dx * ROTATE_SENS);
        }
    });
    const endCamDrag = () => {
        if (!camDragging) return;
        camDragging = false;
        canvas.style.cursor = "url('/assets/cute_cursor_32.png'), default";
    };
    window.addEventListener('mouseup', (e) => {
        if (e.button !== 2) return;
        // A right-click that barely moved = "view profile" gesture on PC; an actual
        // drag = camera rotate (handled in mousemove above). Capture the click test
        // before endCamDrag() clears camDragging.
        const wasClick = camDragging
            && camDragDist <= RCLICK_MAX_MOVE
            && Math.abs(e.clientX - camDownX) <= RCLICK_MAX_MOVE
            && Math.abs(e.clientY - camDownY) <= RCLICK_MAX_MOVE;
        endCamDrag();
        if (wasClick && isGameStarted && sceneManager) {
            const hit = sceneManager.getMouseIntersection(e, monsters, sceneManager.getNPCs(), remotePlayersMap);
            if (hit && hit.type === 'player' && gameUI) {
                particles.createClickIndicator(hit.point, 0x60a0ff);
                gameUI._showPlayerPopup(hit.object);
            }
        }
    });
    window.addEventListener('blur', endCamDrag);

    // ----- Mouse Wheel to Zoom (Roblox-style) -----
    canvas.addEventListener('wheel', (e) => {
        // Prevent default scroll behavior
        e.preventDefault();

        if (sceneManager && sceneManager.adjustZoom) {
            sceneManager.adjustZoom(e.deltaY);
        }
    }, { passive: false });

    // ----- First-person mouse-look (pointer lock) -----
    const FP_LOOK_SENS = 0.0025; // radians per pixel of mouse movement
    let fpHint = null;
    const ensureFpHint = () => {
        if (fpHint) return fpHint;
        fpHint = document.createElement('div');
        fpHint.id = 'fp-hint';
        fpHint.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:120;background:rgba(8,12,24,0.82);color:#cfe0ff;border:1px solid rgba(120,170,230,0.35);border-radius:8px;padding:6px 12px;font-size:12px;pointer-events:none;display:none;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.4);';
        document.body.appendChild(fpHint);
        return fpHint;
    };
    // Function declaration so the earlier keydown handler can call it (hoisted).
    function applyCameraMode(mode) {
        const first = mode === 'first';
        // Hide our own body in first-person so the camera (inside the head)
        // doesn't render the model; other players still see us normally.
        if (character && character.mesh) character.mesh.visible = !first;
        const hint = ensureFpHint();
        if (first) {
            hint.textContent = '🎥 มุมมองบุคคลที่ 1 — คลิกเพื่อล็อกเมาส์แล้วขยับมองรอบ · ESC ปล่อยเมาส์ · กด V กลับมุมปกติ';
            hint.style.display = 'block';
            canvas.requestPointerLock?.();
        } else {
            hint.style.display = 'none';
            if (document.pointerLockElement) document.exitPointerLock?.();
        }
    }
    // Expose so other code (e.g. leaving a duel/map) can force third-person.
    window.applyCameraMode = applyCameraMode;

    document.addEventListener('mousemove', (e) => {
        if (!sceneManager || sceneManager.getCameraMode?.() !== 'first') return;
        if (document.pointerLockElement !== canvas) return; // only while locked
        sceneManager.adjustLook(-e.movementX * FP_LOOK_SENS, -e.movementY * FP_LOOK_SENS);
    });

    // Mouse move for monster/player hovering with highlight glow
    canvas.addEventListener('mousemove', (e) => {
        if (camDragging) return; // don't fight the rotate cursor / waste raycasts
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
    try {
        const char = await loadCharacter(userId);
        if (char) {
            char.isGuest = isGuest;
            initGame(char);
        } else {
            // loadCharacter resolved without a character. This should not happen
            // (it either returns one or creates one), so treat it as a load
            // failure rather than fabricating a level-1 character — starting the
            // game with defaults lets auto-save overwrite the real DB row.
            showCharacterLoadError();
        }
    } catch (e) {
        console.error("Failed to load character:", e);
        // CRITICAL: never fall through to a fresh level-1 character here. A
        // transient read failure (network/RLS/timeout) used to start the game
        // with default stats, and auto-save then wrote level 1 back over the
        // player's real character (saveCharacterByUserId updates by user_id),
        // permanently resetting accounts. Abort to a retry screen instead so
        // nothing is ever saved on top of unknown existing data.
        showCharacterLoadError();
    }
}

// Non-destructive failure screen: keeps the player OUT of the game (so no
// auto-save can run) and offers a manual retry. Reloading re-attempts the load
// from scratch; it never writes to the DB.
function showCharacterLoadError() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.style.display = 'block';
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.style.display = 'none';

    let overlay = document.getElementById('char-load-error');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'char-load-error';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(6,10,20,.92);backdrop-filter:blur(4px);';
        overlay.innerHTML = `
            <div style="max-width:420px;text-align:center;padding:28px 26px;border:1px solid #4aa3ff;border-radius:14px;background:#0e1626;color:#e2e8f0;font-family:system-ui,sans-serif;">
                <div style="font-size:38px;margin-bottom:8px;">⚠️</div>
                <div style="font-weight:800;font-size:18px;color:#9fccff;margin-bottom:10px;">โหลดตัวละครไม่สำเร็จ</div>
                <div style="font-size:13px;line-height:1.6;opacity:.9;margin-bottom:20px;">
                    เชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว เพื่อความปลอดภัยของข้อมูล
                    ระบบจะไม่เข้าเกมจนกว่าจะโหลดข้อมูลเดิมได้ครบ<br>กรุณาลองใหม่อีกครั้ง
                </div>
                <button id="char-load-retry" style="border:none;border-radius:10px;padding:11px 22px;cursor:pointer;font-weight:800;font-size:14px;background:#4aa3ff;color:#04101f;">ลองใหม่</button>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#char-load-retry').addEventListener('click', () => location.reload());
    }
    overlay.style.display = 'flex';
}

// ============ Input Handling ============
function handleMouseInteraction(event) {
    if (!isGameStarted) return;
    // Only the left button (or touch, which has no button) moves/targets.
    // Right button is reserved for camera rotation (see below).
    if (event.button === 2 || event.button === 1) return;

    // In first-person, a left click captures the mouse for look control instead
    // of click-to-move (there's no cursor to aim on the ground).
    if (sceneManager && sceneManager.getCameraMode && sceneManager.getCameraMode() === 'first') {
        const cv = sceneManager.renderer?.domElement;
        if (cv && document.pointerLockElement !== cv) cv.requestPointerLock?.();
        return;
    }

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

    if (hit.type === 'stall') {
        particles.createClickIndicator(hit.point, 0xffd24a);
        if (gameUI) {
            if (hit.object && hit.object.empty) {
                // Vacant stand → offer to open your own shop here
                gameUI._openVendingStallSetup();
            } else {
                gameUI.openStallShop(hit.object);
            }
        }
        return;
    }

    if (hit.type === 'ore') {
        const node = hit.object;
        const hasPickaxe = gameUI && gameUI.bestPickaxeYield() > 0;
        if (!hasPickaxe) {
            gameUI.addCombatLog('⛏️ ต้องสวมพลั่วขุดก่อน — ซื้อจากพ่อค้าสวรรค์แล้วสวมใส่ในกระเป๋า', 'system');
            particles.createClickIndicator(hit.point, 0xff6060);
            return;
        }
        // Walk to the node first if we're not close enough, then mine.
        if (character.getPosition().distanceTo(node.position) > 3.5) {
            autoPath = node.position.clone();
            character.targetMonster = null;
            particles.createClickIndicator(node.position, 0x7fe0ff);
            return;
        }
        gameUI.mineOreNode(node);
        particles.createClickIndicator(hit.point, 0x7fe0ff);
        return;
    }

    if (hit.type === 'monster') {
        character.targetMonster = hit.object;
        autoPath = hit.point;
        // Step 11: Monster click: red indicator
        particles.createClickIndicator(hit.point, 0xff4444);
    } else if (hit.type === 'player') {
        if (event.fromTouch) {
            // Mobile: tapping a character opens their profile popup.
            particles.createClickIndicator(hit.point, 0x60a0ff);
            if (gameUI) gameUI._showPlayerPopup(hit.object);
        } else if (!(combatSystem && combatSystem.isFishing)) {
            // PC left-click on a player: walk toward them (profile opens on
            // right-click instead). Suppressed while fishing so the pose holds.
            autoPath = hit.point;
            character.targetMonster = null;
            particles.createClickIndicator(hit.point, 0x44ff44);
        }
    } else if (hit.type === 'npc') {
        // Open Shop based on NPC type
        const npcType = hit.object.userData.npcType;
        if (npcType === 'sell') {
            gameUI._togglePanel('sell-shop-panel');
            gameUI._renderSellShop();
        } else if (npcType === 'weaponsmith') {
            // Weapon smith opens the Forge (craft special weapons from materials)
            gameUI.openForge();
        } else if (npcType === 'heaven_merchant') {
            gameUI.openHeavenShop();
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

        // A duel uses a cinematic two-fighter camera, so drop out of first-person
        // (which also un-hides our own body for the fight).
        if (sceneManager && sceneManager.getCameraMode && sceneManager.getCameraMode() === 'first') {
            sceneManager.cameraMode = 'third';
            sceneManager.cameraPitch = 0;
            if (window.applyCameraMode) window.applyCameraMode('third');
        }

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

// ============ Map Warp (shared by portals + warp-to-friend) ============
// Loads a new map, moves the player to `spawn`, respawns monsters, refreshes
// multiplayer presence and clears remote players carried over from the old map.
function loadMapAndSpawn(targetMap, spawn) {
    portalCooldown = 2.0;
    window.portalCooldown = 2.0;
    autoPath = null;
    window.autoPath = null;

    // Clear stale combat state before loading the new map
    if (character) {
        character.targetMonster = null;
        character.state = 'idle';
    }
    if (combatSystem) {
        combatSystem.currentTarget = null;
        combatSystem.autoFarm = false;
        combatSystem.isFishing = false;
    }
    if (gameUI && typeof gameUI.clearTarget === 'function') gameUI.clearTarget();
    if (inputManager && typeof inputManager.reset === 'function') inputManager.reset();

    // Move to the spawn point BEFORE loading, so the first render is correct
    character.baseY = spawn.y;
    character.mesh.position.set(spawn.x, spawn.y, spawn.z);

    sceneManager.loadMap(targetMap);
    monsters.clearAll();
    monsters.mapId = targetMap;
    monsters.spawnInitial(character.stats.level);

    // Update multiplayer presence for the new map + broadcast our new spot
    updatePresence(character.stats.level, username, targetMap);
    broadcastPosition(
        userId, username, character.stats.level,
        character.getPosition(), character.mesh.rotation.y,
        character.state, character.getAppearance(), targetMap
    );

    // Clear remote players carried over from the old map
    for (const [, rp] of remotePlayersMap.entries()) {
        if (rp.mesh) sceneManager.scene.remove(rp.mesh);
    }
    remotePlayersMap.clear();

    // Rebuild the player market street when arriving in town
    if (window.stallManager) window.stallManager.refresh();
}

// ============ Warp To Friend ============
// The player picked an online friend to warp to. sendWarpRequest() asks the
// server for that friend's current map + position; the reply lands here via the
// `warp_result` socket event.
window.warpManager = {
    pending: null, // { targetName } while a request is in flight

    onWarpResult(payload) {
        this.pending = null;
        if (!payload || !character || !sceneManager) return;

        if (!payload.ok) {
            if (gameUI) gameUI.addCombatLog(
                payload.reason === 'offline'
                    ? '❌ วาปไม่ได้ — เพื่อนออฟไลน์แล้ว'
                    : '❌ วาปไม่ได้ ลองใหม่อีกครั้ง',
                'warning'
            );
            return;
        }

        if (typeof payload.x !== 'number' || typeof payload.z !== 'number') {
            if (gameUI) gameUI.addCombatLog('❌ วาปไม่ได้ — ยังไม่รู้ตำแหน่งเพื่อน ลองอีกครั้งสักครู่', 'warning');
            return;
        }

        // Not allowed mid-duel
        if (duelState) {
            if (gameUI) gameUI.addCombatLog('❌ วาปไม่ได้ระหว่างการดวล', 'warning');
            return;
        }

        const targetMap = payload.mapId || 'prontera';
        // Land a short distance away so we don't stack right on top of them
        const ang = Math.random() * Math.PI * 2;
        const off = 1.8;
        const sx = payload.x + Math.cos(ang) * off;
        const sz = payload.z + Math.sin(ang) * off;

        if (targetMap !== sceneManager.currentMap) {
            loadMapAndSpawn(targetMap, { x: sx, y: 1.2, z: sz });
        } else {
            // Same map — just reposition and re-broadcast (no reload needed)
            autoPath = null;
            character.targetMonster = null;
            character.baseY = 1.2;
            character.mesh.position.set(sx, 1.2, sz);
            broadcastPosition(
                userId, username, character.stats.level,
                character.getPosition(), character.mesh.rotation.y,
                character.state, character.getAppearance(), targetMap
            );
        }

        // A little sparkle on arrival
        if (particles && typeof particles.spawnHitEffect === 'function') {
            particles.spawnHitEffect(character.getPosition(), true);
        }
        if (gameUI) gameUI.addCombatLog(`✨ วาปไปหา ${payload.targetName || 'เพื่อน'} สำเร็จ!`, 'levelup');
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
            registerLocalAttack(character.getWeaponSoundClass ? character.getWeaponSoundClass() : 'sword');
        } else if (duelState.cooldown < character.getAttackCooldown() * 0.5 && character.state === 'attacking') {
            character.state = 'idle';
        }
    }
}

// ============ World Boss ============
// A giant server-scheduled boss everyone fights together. The server owns the
// shared HP and per-player damage; this client renders the boss in its assigned
// outlying map, deals damage (relayed via sendBossHit), and applies the reward
// the server assigns to *this* player when the boss dies.
let bossState = null;           // { active, name, hp, maxHp, mapId, mapName, x, z }
let bossAtkTimer = 0;            // boss AoE counter-attack cadence
let bossSwingCd = 0;             // our attack cooldown vs the boss
let bossRewardClaimed = false;   // guard so a reward is applied once per kill

const BOSS_ITEM_META = {
    'Dragon Heart': { emoji: '🐲', type: 'material', rarity: 'legendary', price: 20000, desc: 'หัวใจมังกรจากบอสโลก — ล้ำค่าที่สุด' },
    'Mythril Shard': { emoji: '💠', type: 'material', rarity: 'rare', price: 6000, desc: 'เศษมิธริลจากบอสโลก' },
};

// Build the boss HUD (HP bar, spawn toast, summary board) once.
function initBossUI() {
    if (document.getElementById('boss-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'boss-ui-style';
    style.textContent = `
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
    @media(max-width:768px){
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

    const bar = document.createElement('div');
    bar.id = 'boss-hpbar';
    bar.innerHTML = `<div class="bh-name"></div>
      <div class="bh-track"><div class="bh-fill"></div><div class="bh-text"></div></div>`;
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
            bossState = {
                active: true,
                name: p.name,
                hp: p.hp,
                maxHp: p.maxHp,
                mapId: p.mapId || null,
                mapName: p.mapName || p.mapId || 'ดินแดนรอบนอก',
                x: p.x || 0,
                z: p.z || 0,
            };
            bossRewardClaimed = false;
            this._showBar();
        } else {
            bossState = null;
            this._hideBar();
        }
        this.reconcileMesh();
    },

    onSpawn(p) {
        if (!p) return;
        const mapName = p.mapName || p.mapId || 'ดินแดนรอบนอก';
        bossState = {
            active: true,
            name: p.name,
            hp: p.hp,
            maxHp: p.maxHp,
            mapId: p.mapId || null,
            mapName,
            x: p.x || 0,
            z: p.z || 0,
        };
        bossRewardClaimed = false;
        
        // Only show bar if the player is actually on the boss map.
        const onBossMap = sceneManager && sceneManager.currentMap === bossState.mapId;
        if (onBossMap) {
            this._showBar();
        } else {
            this._hideBar();
        }

        this.reconcileMesh();
        if (gameUI) gameUI.addCombatLog(`👹 บอสโลก [${p.name}] ปรากฏตัวที่ ${mapName}! รีบไปช่วยกันตี!`, 'levelup');
        this._toast(`👹 ${p.name}`, `บอสโลกปรากฏตัวที่ ${mapName}!`);
        if (soundManager) soundManager.playLevelUpSound();
    },

    onHp(p) {
        if (!p || !bossState) return;
        bossState.hp = p.hp;
        bossState.maxHp = p.maxHp;
        
        const onBossMap = sceneManager && sceneManager.currentMap === bossState.mapId;
        if (onBossMap) {
            this._showBar(); // Show if they just entered the map
            this._updateBar();
        } else {
            this._hideBar(); // Hide if they are elsewhere
        }
    },

    onDead(p) {
        if (!p) return;
        bossState = null;
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
        this._hideBar();
        if (sceneManager) sceneManager.removeWorldBoss();
        if (gameUI) gameUI.addCombatLog(`🌫️ ${(p && p.name) || 'บอส'} หนีหายเข้าไปในหมอก... ไม่มีใครปราบได้ทัน`, 'warning');
    },

    // The mesh only exists on the outlying map selected by the server.
    reconcileMesh() {
        if (!sceneManager) return;
        const onBossMap = bossState && sceneManager.currentMap === bossState.mapId;
        if (bossState && bossState.active && onBossMap) {
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
        const bar = document.getElementById('boss-hpbar');
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

// Per-frame: rush the boss, keep swinging with big visible effects, and take
// the counter-slams. While "engaged" we set window.bossEngaged so CombatSystem
// stands down (no idle-reset / no wandering off to farm nearby monsters), which
// is what makes the attack animation actually play instead of freezing at idle.
function updateBossCombat(dt) {
    // Not engageable → release the takeover so normal combat resumes.
    if (duelState || !bossState || !bossState.active || !character || !character.isAlive()
        || (combatSystem && combatSystem.isFishing)
        || !sceneManager || sceneManager.currentMap !== bossState.mapId || !sceneManager._worldBoss) {
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
            spawnForgeBurst(bossBody.clone(), isCrit); // forged-weapon element burst
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
    registerLocalAttack(character.getWeaponSoundClass ? character.getWeaponSoundClass() : 'sword');
}

// ============ Auto-Skill (while AUTO farming) ============
// When AUTO is on, cast the 3 skills automatically too: Heal when hurt, Magnum
// Break on clustered monsters, Bash on the current target. castSkill() no-ops
// when a skill is on cooldown or SP is short, and each skill has its own
// cooldown, so they naturally rotate instead of all firing at once.
let autoSkillTimer = 0;
function autoCastSkills(dt) {
    if (!gameUI || !combatSystem || !combatSystem.autoFarm) return;
    if (!character || !character.isAlive()) return;
    if (combatSystem.isFishing || window.duelState || window.bossEngaged) return;

    autoSkillTimer -= dt;
    if (autoSkillTimer > 0) return;
    autoSkillTimer = 0.4; // evaluate ~2.5x per second (one skill per tick)

    // Readiness gate — only cast when off cooldown with enough SP, so useSkill's
    // "on cooldown / not enough SP" error logs never spam the combat feed.
    const ready = (id) => {
        const cd = (character.cooldowns && character.cooldowns[id]) || 0;
        const sp = Number(character.stats.sp) || 0;
        return cd <= 0 && sp >= ((SKILLS[id] && SKILLS[id].spCost) || 0);
    };

    // Pick skills by ROLE out of whatever the current job has, so AUTO works for
    // every job rather than only the old fixed bash/heal/magnumBreak trio.
    const mySkills = character.getSkills ? character.getSkills() : [];
    const byType = (...types) => mySkills.find(id => SKILLS[id] && types.includes(SKILLS[id].type));
    const healId = byType('heal');
    const aoeId = byType('physical_aoe', 'magic_aoe');
    const singleId = byType('physical', 'magic');
    const buffId = byType('buff');

    const maxHp = Number(character.stats.max_hp) || 100;
    const hpPct = (Number(character.stats.hp) || 0) / maxHp;

    // 1) Heal when hurt (skips itself at high HP so SP isn't wasted)
    if (hpPct < 0.6 && healId && ready(healId)) { gameUI.castSkill(healId); return; }

    // 1b) Keep the self-buff up while fighting — it's cheap uptime.
    const buffActive = buffId && SKILLS[buffId]
        && character.getBuffPct && character.getBuffPct(SKILLS[buffId].buffStat) > 0;
    if (buffId && !buffActive && character.targetMonster && ready(buffId)) {
        gameUI.castSkill(buffId);
        return;
    }

    // Count monsters clustered around the player (for the AoE decision)
    let nearby = 0;
    if (monsters && monsters.getAlive) {
        const p = character.getPosition();
        for (const m of monsters.getAlive()) {
            if (m && m.getPosition && p.distanceTo(m.getPosition()) <= 5) nearby++;
        }
    }

    // 2) AoE when 2+ monsters are clustered
    if (nearby >= 2 && aoeId && ready(aoeId)) { gameUI.castSkill(aoeId); return; }

    // 3) Single-target the current/nearest monster
    if ((character.targetMonster || nearby >= 1) && singleId && ready(singleId)) {
        gameUI.castSkill(singleId);
    }
}

// ============ Game Loop ============
// ===== Background simulation =====
// The browser pauses requestAnimationFrame and throttles main-thread timers
// (down to ~1/min under "intensive throttling") when the tab is hidden or
// minimized, which would freeze/slow the game. To keep it running at 100% while
// backgrounded we:
//   1. Drive the tick from a Web Worker heartbeat — worker timers keep firing
//      reliably even when the page is hidden (a main-thread setInterval is the
//      fallback if the worker can't start).
//   2. Advance the exact real elapsed time in fixed sub-steps through the SAME
//      stepWorld() the visible loop uses, so movement, combat, farming, fishing,
//      duels, world-boss and networking all progress identically — just without
//      rendering to the hidden canvas.
let bgLastTime = 0;
let bgIntervalId = null;
let bgWorker = null;

function backgroundTick() {
    if (!isGameStarted || !document.hidden || !character) return;
    const now = performance.now();
    if (!bgLastTime) bgLastTime = now;
    let elapsed = (now - bgLastTime) / 1000;
    bgLastTime = now;
    if (elapsed <= 0) return;
    // Cap catch-up so a long OS suspend (laptop sleep / discarded tab, where no
    // JS runs at all) doesn't try to simulate hours in one frame and freeze the
    // thread. Normal background throttling only delays ticks by ~1s, well under
    // this, so no real game-time is lost while merely backgrounded.
    elapsed = Math.min(elapsed, 60);

    try {
        let remaining = elapsed;
        while (remaining > 0) {
            const step = Math.min(0.1, remaining);
            stepWorld(step);   // full parity with the visible loop (sans render)
            remaining -= step;
        }
        broadcastIfDue();      // stay live to other players while hidden
        if (gameUI) gameUI.updateHUD(character.stats);
    } catch (e) {
        console.warn('[Zolos] background tick error:', e);
    }
}

// Spin up a Web Worker whose only job is to post a steady heartbeat. Worker
// timers are exempt from most of the hidden-tab throttling that would otherwise
// choke a main-thread setInterval, keeping the background sim on real time.
function startBackgroundHeartbeat() {
    if (bgWorker) return;
    try {
        const src = 'let id=setInterval(()=>postMessage(0),250);onmessage=(e)=>{if(e.data==="stop"){clearInterval(id);}};';
        const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        bgWorker = new Worker(url);
        URL.revokeObjectURL(url);
        bgWorker.onmessage = () => { if (document.hidden) backgroundTick(); };
    } catch (e) {
        console.warn('[Zolos] background heartbeat worker unavailable, using timer fallback:', e);
    }
    // Main-thread fallback (also covers the moment before the worker's first
    // message). Harmless when the worker is running — backgroundTick is a no-op
    // unless the tab is actually hidden, and it advances by real elapsed time so
    // running from two sources can't double-speed the simulation.
    if (!bgIntervalId) {
        bgIntervalId = setInterval(() => { if (document.hidden) backgroundTick(); }, 500);
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

// ===== Shared simulation step =====
// Everything the world needs to advance, independent of rendering. Both the
// visible rAF loop and the hidden-tab background loop call this with a dt, so
// the game behaves identically whether or not the tab is in the foreground.
function stepWorld(dt) {
    // Dead-state guard: only effects/combat cleanup advance while dead.
    if (character && !character.isAlive()) {
        if (particles) particles.update(dt);
        if (combatSystem) combatSystem.update(dt);
        return;
    }

    if (portalCooldown > 0) {
        portalCooldown -= dt;
        window.portalCooldown = portalCooldown;
    }

    // 1. Movement
    const isFishingActive = combatSystem && combatSystem.isFishing;
    const moveDir = (!isFishingActive && inputManager) ? inputManager.getMovementDirection() : null;

    if (moveDir) {
        autoPath = null;
        character.moveSpeed = isShiftPressed ? 9 : 5.5;
        // Rotate the input by the camera yaw so "forward" always means
        // "away from the camera", regardless of how it's been rotated.
        const yaw = sceneManager.getCameraYaw ? sceneManager.getCameraYaw() : 0;
        const s = Math.sin(yaw), c = Math.cos(yaw);
        const wx = moveDir.z * s + moveDir.x * c;
        const wz = moveDir.z * c - moveDir.x * s;
        character.manualMove(wx, wz, dt);
    } else if (autoPath && !isFishingActive) {
        // If auto-farm is active, we should clear autoPath to let CombatSystem handle movement
        if (combatSystem && combatSystem.autoFarm) {
            autoPath = null;
        } else {
            if (!character.moveToward(autoPath, dt)) autoPath = null;
        }
    }

    // First-person: keep the body facing where the camera looks (FPS-style), so
    // strafing doesn't spin the model and other players see us aiming correctly.
    if (character && character.mesh && sceneManager && sceneManager.getCameraMode
        && sceneManager.getCameraMode() === 'first') {
        character.mesh.rotation.y = (sceneManager.cameraYaw || 0) + Math.PI;
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
                    console.log(`[Warp] Portal warp to ${targetMap}`);
                    loadMapAndSpawn(targetMap, { x: 0, y: 1.2, z: 10 });
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
    monsters.update(dt, sceneManager.camera, character);
    sceneManager.updateAnimations(dt);
    if (particles) particles.update(dt);
    if (combatSystem) combatSystem.update(dt);
    autoCastSkills(dt); // AUTO also casts the 3 skills
    if (gameUI) {
        updateOreTargeting(dt);       // ore in range + AUTO walks to ore and mines
        gameUI.updateMining();        // timed mining "job" (also runs while hidden)
        gameUI.updateAutoPotion(dt);  // auto HP/SP potions (also while hidden)
    }
}

// Ore targeting + AUTO mining. Finds the ore node you're standing next to (which
// drives the ⛏️ button), and when AUTO is on in Svarrga — a peaceful city with no
// monsters, so the combat bot has nothing to do — walks to the nearest node and
// keeps the mining job running. Called from stepWorld so it also works while the
// tab is backgrounded.
function updateOreTargeting(dt) {
    if (!gameUI || !sceneManager || !character) return;

    const inSvarrga = sceneManager.currentMap === 'svarrga';
    let nearOre = null;                 // in mining range right now
    let nearest = null, nearestDist = Infinity; // closest node at any distance

    if (inSvarrga && sceneManager.getOreNodes) {
        const pp = character.getPosition();
        for (const n of sceneManager.getOreNodes()) {
            if (!n.userData || n.userData.mined) continue;
            const d = pp.distanceTo(n.position);
            if (d < 4.5 && !nearOre) nearOre = n;
            if (d < nearestDist) { nearestDist = d; nearest = n; }
        }
    }
    gameUI.setMineTarget(nearOre);

    // Leaving the mining city ends any running mining job.
    if (!inSvarrga) {
        if (gameUI.miningActive) gameUI.stopMining('⛏️ ออกจากเมืองสวรรค์ — หยุดขุด');
        return;
    }

    // ----- AUTO mines too -----
    if (!combatSystem || !combatSystem.autoFarm) return;
    if (gameUI.bestPickaxeYield() <= 0) return;   // no usable pickaxe equipped
    if (!gameUI.miningActive) gameUI.startMining();
    // Nothing in range yet → walk to the closest node. Move directly rather than
    // via autoPath: stepWorld clears autoPath every frame while autoFarm is on
    // (CombatSystem owns movement then), so an autoPath here would never stick.
    if (!nearOre && nearest && nearestDist > 3.0) {
        character.targetMonster = null;
        character.moveToward(nearest.position, dt);
    }
}

// Broadcast our position/state to other players, throttled. Runs from both the
// visible and hidden loops so we stay live to everyone while backgrounded.
function broadcastIfDue() {
    if (!character) return;
    const now = performance.now();
    if (now - lastBroadcastTime > 100) {
        broadcastPosition(userId, username, character.stats.level, character.getPosition(), character.mesh.rotation.y, character.state, character.getAppearance(), sceneManager.currentMap, localAtkSeq, localWsc);
        lastBroadcastTime = now;
    }
}

function gameLoop(time) {
    requestAnimationFrame(gameLoop);
    if (!isGameStarted) return;
    // While hidden, the background loop drives the simulation instead — no point
    // rendering to an invisible canvas.
    if (document.hidden) return;

    try {
        const dt = Math.min(0.1, (time - lastTime) / 1000);
        lastTime = time;

        // Advance the whole world (movement, combat, monsters, effects, skills).
        stepWorld(dt);

        // Dead: skip camera/HUD work, just present the scene.
        if (character && !character.isAlive()) {
            sceneManager.render();
            return;
        }

        if (gameUI) {
            gameUI.updateTargetIndicator(sceneManager);
            // Performance settings: optionally hide other players' gear/bodies
            // locally (never the duel opponent). Rendering-only, so foreground.
            gameUI.applyRemoteVisibility(remotePlayersMap, duelState ? duelState.opponentUserId : null);
        }

        // 6. Camera & Networking
        // During a duel, frame both fighters (extra pull-back on mobile).
        const duelFoe = duelState ? remotePlayersMap.get(duelState.opponentUserId) : null;
        if (duelState && duelFoe && duelFoe.mesh) {
            sceneManager.frameDuel(character.getPosition(), duelFoe.mesh.position, IS_MOBILE);
        } else {
            sceneManager.followTarget(character.getPosition(), character.baseY);
        }

        broadcastIfDue();

        const now = performance.now();
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
                    const SKILLS_LIST = character.getSkills ? character.getSkills() : [];
                    SKILLS_LIST.forEach(skillId => {
                        const current = character.cooldowns[skillId] || 0;
                        // Take the max straight off the skill instead of a hardcoded
                        // per-name table, so every job's skills fill correctly.
                        const maxCd = (SKILLS[skillId] && SKILLS[skillId].cooldown) || 1;
                        gameUI.updateSkillCooldown(skillId, current, maxCd);
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

        // (Ore targeting + AUTO mining now live in stepWorld so they keep
        // running while the tab is hidden — see updateOreTargeting.)

        sceneManager.render();
    } catch (err) {
        console.error('[GameLoop] Error:', err);
    }
}

// Start
initAuth();
