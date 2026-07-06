// Main Game Logic — Entry point, state machine, input, and networking
import * as THREE from 'three';
import { SceneManager } from './engine/SceneManager.js';
import { CharacterManager } from './engine/CharacterManager.js';
import { MonsterManager } from './engine/MonsterManager.js';
import { GameUI } from './ui/GameUI.js';
import { SoundManager } from './engine/SoundManager.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { SupabaseClient } from './network/SupabaseClient.js';
import { NetworkManager } from './network/NetworkManager.js';

// ============ App State ============
let sceneManager, character, monsters, gameUI, soundManager, particleSystem;
let supabase, network;
let isGameStarted = false;
let lastTime = 0;
let portalCooldown = 0;

// Input state
const keys = {};
let mouseTarget = null;
let autoPath = null;

// ============ Initialize Auth ============
async function initAuth() {
    supabase = new SupabaseClient();
    const session = await supabase.getSession();
    
    // UI will handle login/guest logic
    gameUI = new GameUI(supabase, (action, data) => handleUIAction(action, data));
    
    if (session) {
        showCharacterSelect();
    } else {
        gameUI.showScreen('login');
    }
}

// ============ Initialize Game ============
async function initGame(charData) {
    const canvas = document.getElementById('game-canvas');
    sceneManager = new SceneManager(canvas);
    
    character = new CharacterManager(sceneManager.scene);
    character.loadStats(charData);
    
    // Load character customizations from DB if available
    if (charData.body_color) character.setBodyColor(charData.body_color);
    if (charData.hair_color) character.setHairColor(charData.hair_color);
    if (charData.pants_color) character.setPantsColor(charData.pants_color);
    if (charData.equipped_hat) character.setHat(charData.equipped_hat);
    if (charData.equipped_glasses) character.setGlasses(charData.equipped_glasses);
    if (charData.equipped_weapon) character.equipWeapon(charData.equipped_weapon);

    // ============ Initialize Optimization Systems ============
    // Particle system for combat effects
    particleSystem = new ParticleSystem(sceneManager.scene);
    
    // Sound manager
    soundManager = new SoundManager();
    
    // Monster manager
    monsters = new MonsterManager(sceneManager.scene, particleSystem);
    monsters.spawnInitial(character.stats.level);
    
    // Network manager for multiplayer
    network = new NetworkManager(supabase, sceneManager.scene);
    await network.joinGame(charData.id, character);

    // Setup HUD
    gameUI.initHUD(character);
    gameUI.showScreen('hud');
    
    isGameStarted = true;
    requestAnimationFrame(gameLoop);
    
    // Input listeners
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    
    canvas.addEventListener('mousedown', (e) => handleMouseInteraction(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

async function showCharacterSelect() {
    const chars = await supabase.getCharacters();
    gameUI.showCharacterSelect(chars);
}

async function handleUIAction(action, data) {
    if (action === 'login') {
        const { user, error } = await supabase.signIn(data.email, data.password);
        if (error) {
            alert('Login failed: ' + error.message);
        } else {
            showCharacterSelect();
        }
    } else if (action === 'guest') {
        const guestData = await supabase.createGuestCharacter();
        initGame(guestData);
    } else if (action === 'select-char') {
        initGame(data);
    } else if (action === 'create-char') {
        const newChar = await supabase.createCharacter(data.name);
        showCharacterSelect();
    } else if (action === 'use-skill') {
        character.useSkill(data.skillId, character.targetMonster, monsters, gameUI, soundManager, particleSystem, (type, target, val) => {
            if (type === 'bash' || type === 'magnumBreak') {
                // Broadcast hit
                network.broadcastAttack(data.skillId, target.id, val);
            }
        });
    } else if (action === 'save-game') {
        const saveData = character.getSaveData();
        await supabase.saveCharacter(saveData.characterId, saveData.updates);
        gameUI.addCombatLog('💾 บันทึกข้อมูลตัวละครสำเร็จ', 'system');
    }
}

// ============ Input Handling ============
function handleMouseInteraction(event) {
    if (!isGameStarted) return;
    
    const hit = sceneManager.getMouseIntersection(event, monsters, sceneManager.getNPC());
    
    if (!hit) return;
    
    if (hit.type === 'monster') {
        character.targetMonster = hit.object;
        character.targetNPC = null;
        autoPath = hit.point;
        
        // Visual indicator
        particleSystem.createClickIndicator(hit.point, 0xff4444);
    } else if (hit.type === 'npc') {
        character.targetNPC = hit.object;
        character.targetMonster = null;
        autoPath = hit.point;
        
        particleSystem.createClickIndicator(hit.point, 0xffff44);
    } else if (hit.type === 'ground') {
        autoPath = hit.point;
        character.targetMonster = null;
        character.targetNPC = null;
        
        // Visual indicator
        particleSystem.createClickIndicator(hit.point, 0x44ff44);
    }
}

// ============ Combat Event Handler ============
function handleCombat(dt) {
    if (!character.targetMonster) return;
    
    const dist = character.getPosition().distanceTo(character.targetMonster.mesh.position);
    const range = character.getAttackRange();
    
    if (dist <= range) {
        // In range, stop moving and attack
        autoPath = null;
        
        if (character.attackTimer >= character.getAttackCooldown()) {
            character.state = 'attacking';
            character.animTimer = 0;
            character.attackTimer = 0;
            
            // Calculate damage
            const dmgBase = character.stats.atk;
            const finalDmg = Math.max(1, Math.floor(dmgBase * (0.8 + Math.random() * 0.4)));
            
            // Apply damage
            const actualDmg = character.targetMonster.takeDamage(finalDmg);
            
            // UI log
            gameUI.addCombatLog(`⚔️ โจมตี ${character.targetMonster.name}! สร้างความเสียหาย ${actualDmg}`, 'atk');
            
            // Sound
            soundManager.playAtkSound();
            
            // Particles
            particleSystem.createHitBurst(character.targetMonster.mesh.position);
            
            // Network broadcast
            network.broadcastAttack('normal', character.targetMonster.id, actualDmg);
            
            // Check if killed
            if (!character.targetMonster.alive) {
                const exp = character.targetMonster.expValue;
                const gold = character.targetMonster.goldValue;
                
                const leveledUp = character.addExp(exp);
                character.stats.gold += gold;
                character.stats.total_kills++;
                
                gameUI.addCombatLog(`🏆 กำจัดศัตรูได้! ได้รับ EXP +${exp}, Gold +${gold}`, 'exp');
                if (leveledUp) {
                    gameUI.addCombatLog('⭐ เลเวลอัป! พลังพื้นฐานเพิ่มขึ้น', 'system');
                    soundManager.playLevelUpSound();
                    particleSystem.createLevelUpEffect(character.mesh.position);
                }
                
                character.targetMonster = null;
            }
        }
    } else {
        // Move toward monster
        autoPath = character.targetMonster.mesh.position.clone();
    }
}

// ============ NPC Interaction ============
function handleNPC(dt) {
    if (!character.targetNPC) return;
    
    const dist = character.getPosition().distanceTo(character.targetNPC.position);
    if (dist <= 2.5) {
        autoPath = null;
        // Show shop/dialog
        if (character.targetNPC.userData.npcType === 'shop') {
            gameUI.showShop();
            character.targetNPC = null; // Close after opening
        }
    }
}

// ============ Active Skill Cast Handler ============
// Handled by UI callback for now, but could be keyboard-driven here
function handleSkills() {
    if (keys['Digit1']) {
        handleUIAction('use-skill', { skillId: 'bash' });
        keys['Digit1'] = false; // Prevent rapid fire
    }
    if (keys['Digit2']) {
        handleUIAction('use-skill', { skillId: 'heal' });
        keys['Digit2'] = false;
    }
    if (keys['Digit3']) {
        handleUIAction('use-skill', { skillId: 'magnumBreak' });
        keys['Digit3'] = false;
    }
}

// ============ Fishing Actions ============
function handleFishing() {
    if (keys['KeyF']) {
        if (character.equippedWeapon === 'Fishing Rod') {
            const env = sceneManager.getEnvironmentAt(character.getPosition());
            if (env === 'ground') { // Must be on land to fish
                // Check if near water
                const pos = character.getPosition();
                const riverZ = Math.sin(pos.x * 0.08) * 10 - 2;
                if (Math.abs(pos.z - riverZ) < 8.0) {
                    startFishing();
                }
            }
        }
        keys['KeyF'] = false;
    }
}

function startFishing() {
    if (character.state === 'fishing') return;
    
    character.state = 'fishing';
    sceneManager.createFishingLine(character.getPosition());
    gameUI.addCombatLog('🎣 เริ่มตกปลา...', 'system');
    
    // Random bite time
    setTimeout(() => {
        if (character.state === 'fishing') {
            sceneManager.animateFishBite();
            gameUI.addCombatLog('❗ ปลาติดเบ็ดแล้ว! กด F เพื่อดึง!', 'system');
            character.fishBite = true;
        }
    }, 3000 + Math.random() * 5000);
}

// ============ Game Loop ============
function gameLoop(time) {
    if (!isGameStarted) return;
    
    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;
    
    if (portalCooldown > 0) portalCooldown -= dt;

    // 1. Input & Movement
    let moved = false;
    let dirX = 0, dirZ = 0;
    
    if (keys['ArrowUp'] || keys['KeyW']) dirZ -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dirZ += 1;
    if (keys['ArrowLeft'] || keys['KeyA']) dirX -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dirX += 1;
    
    if (dirX !== 0 || dirZ !== 0) {
        autoPath = null;
        character.targetMonster = null;
        character.targetNPC = null;
        moved = character.manualMove(dirX, dirZ, dt);
    } else if (autoPath) {
        moved = character.moveToward(autoPath, dt);
        if (!moved) autoPath = null;
    }

    // 2. World Physics / Environment
    const env = sceneManager.getEnvironmentAt(character.getPosition());
    if (env === 'water') {
        character.state = 'swimming';
        character.moveSpeed = 2.2;
        character.baseY = -1.8; // Match water level
    } else {
        character.moveSpeed = keys['ShiftLeft'] ? 7 : 4;
        character.baseY = 1.2; // Default land height
    }

    // 3. Systems Update
    handleCombat(dt);
    handleNPC(dt);
    handleSkills();
    handleFishing();
    
    character.update(dt);
    monsters.update(dt, character, sceneManager);
    sceneManager.updateAnimations(dt);
    particleSystem.update(dt);
    
    // 4. Portal Check
    if (portalCooldown <= 0) {
        const portals = sceneManager.getPortals();
        portals.forEach(portal => {
            const dist = character.getPosition().distanceTo(portal.position);
            if (dist < 1.8) {
                const targetMap = portal.userData.targetMap;
                if (targetMap) {
                    portalCooldown = 2.0;
                    
                    // Cleanup current state
                    autoPath = null;
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
                    // Sync baseY with new position
                    const SPAWN_POSITIONS = {
                        prontera:   { x: 0, y: 1.2, z: 10 },
                        payon:      { x: -5, y: 1.2, z: 10 },
                        glast_heim: { x: 5, y: 1.2, z: 0 },
                        mjolnir:    { x: -5, y: 1.2, z: 0 },
                        abyss_lake: { x: 0, y: 1.2, z: 5 },
                    };
                    const spawn = SPAWN_POSITIONS[targetMap] || { x: 0, y: 1.2, z: 0 };
                    character.baseY = spawn.y;
                    character.mesh.position.set(spawn.x, spawn.y, spawn.z);

                    // Swap map visual
                    sceneManager.loadMap(targetMap);

                    // Update map name in HUD
                    if (gameUI) gameUI.setMapName(sceneManager.getCurrentMapName());

                    // Set monster manager map details
                    monsters.mapId = targetMap;
                    monsters.spawnInitial(character.stats.level);
                }
            }
        });
    }

    // 5. Multiplayer Sync
    network.update(dt, character);
    
    // 6. Camera & Render
    sceneManager.followTarget(character.getPosition());
    sceneManager.render();
    
    requestAnimationFrame(gameLoop);
}

// ============ Cleanup on unload ============
window.addEventListener('beforeunload', async () => {
    if (character && character.characterId) {
        const saveData = character.getSaveData();
        // Use navigator.sendBeacon or a synchronous-like call if possible, 
        // but Supabase is async. Best effort save.
        await supabase.saveCharacter(saveData.characterId, saveData.updates);
    }
});
