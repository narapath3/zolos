import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
const sceneSource = source;
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const characterSource = fs.readFileSync(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
const gameDataSource = fs.readFileSync(new URL('../src/engine/GameData.js', import.meta.url), 'utf8');
const monsterSource = fs.readFileSync(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');
const serverMonsterSource = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');

test('fantasy sky includes a physical sun halo, horizon haze and banding control', () => {
  assert.match(source, /sunDirection/);
  assert.match(source, /sunDisc/);
  assert.match(source, /horizonGlow/);
  assert.match(source, /gradient banding/);
});

test('ground uses a lit production material with detail relief', () => {
  assert.match(source, /new THREE\.MeshStandardMaterial\(\{\s*vertexColors: true/);
  assert.match(source, /bumpMap: this\._detailTexture/);
  assert.match(source, /roughness: 0\.91/);
  assert.match(source, /anisotropy = Math\.min\(8/);
});

test('grass density scales by quality and its shader receives animated wind', () => {
  for (const tier of ["'ultra-low'", 'low', 'medium', 'high']) assert.match(source, new RegExp(`${tier}: \\d+`));
  assert.match(source, /uGrassTime/);
  assert.match(source, /grassWindUniform\.value = this\.time/);
  assert.match(source, /Math\.max\(55, Math\.round\(BLADES \/ 7\)\)/);
});

test('lighting preserves warm key light with cool sky fill and soft shadow bias', () => {
  assert.match(source, /skyFillLight = new THREE\.DirectionalLight/);
  assert.match(source, /shadow\.normalBias = 0\.025/);
  assert.match(source, /outputColorSpace = THREE\.SRGBColorSpace/);
});

test('river water upgrades to an adaptive Fresnel shader on medium/high tiers and keeps a low-cost fallback', () => {
  assert.match(source, /const useAdaptiveWater = this\.graphicsQuality === 'medium' \|\| this\.graphicsQuality === 'high'/);
  assert.match(source, /uTime: \{ value: 0 \}/);
  assert.match(source, /uniform sampler2D uMap/);
  assert.match(source, /float fresnel = pow/);
  assert.match(source, /uDeepColor: \{ value: new THREE\.Color\(0x075779\) \}/);
  assert.match(source, /uShallowColor: \{ value: new THREE\.Color\(0x39bfd4\) \}/);
  assert.match(source, /this\.currentMap === 'prontera'\s*\n\s*\? new THREE\.Color\(0x1f91bd\)/);
  assert.match(source, /float centerDepth = smoothstep/);
  assert.match(source, /mix\(uShallowColor, uDeepColor, centerDepth \* uDepthAmount\)/);
  assert.match(source, /uWaterOpacity: \{ value: this\.graphicsQuality === 'high' \? 0\.90 : 0\.86 \}/);
  assert.match(source, /float alpha = clamp\(uWaterOpacity/);
  assert.match(source, /opacity: 0\.86/);
  assert.match(source, /float windWaveSlow = sin/);
  assert.match(source, /float windWaveDetail = sin/);
  assert.match(source, /float windWave = smoothstep/);
  assert.match(source, /float crestFoam = smoothstep/);
  assert.match(source, /float currentRibbon =/);
  assert.match(source, /float microWave =/);
  assert.match(source, /float sunGlint =/);
  assert.match(source, /float foamLace =/);
  assert.match(source, /float waveRibbon =/);
  assert.match(source, /waterShaderUniforms\.uTime\.value = this\.time/);
  assert.match(source, /Ultra-low\/low keeps a single inexpensive lit material/);
});

test('waterfall uses quality-scaled flow ribbons, foam, mist, and impact spray', () => {
  assert.match(source, /const useAdaptiveFall = this\.graphicsQuality === 'medium' \|\| this\.graphicsQuality === 'high'/);
  assert.match(source, /const makeFlowMaterial = \(color, opacity, phase = 0\)/);
  assert.match(source, /flowUv\.y -= uTime \* 0\.58/);
  assert.match(source, /const mistN = this\.graphicsQuality === 'high'/);
  assert.match(source, /const sprayN = this\.graphicsQuality === 'high'/);
  assert.match(source, /waterfallStateFinal\.spray/);
  assert.match(source, /wf\.foam\.scale\.set/);
  assert.match(source, /wf\.pool\.scale\.setScalar/);
});

test('water reflection-heavy effects remain scoped to adaptive tiers', () => {
  assert.match(source, /this\.graphicsQuality === 'medium' \|\| this\.graphicsQuality === 'high'/g);
  assert.match(source, /depthWrite: false/);
  assert.match(source, /toneMapped: false/);
});

test('adaptive water adds shoreline foam and Fresnel reflection without forcing high-tier probes on low devices', () => {
  assert.match(source, /uFoamStrength/);
  assert.match(source, /uReflectionStrength/);
  assert.match(source, /float shoreBand =/);
  assert.match(source, /float foamMask = clamp\(shoreBand/);
  assert.match(source, /float fresnel = pow/);
  assert.match(source, /vec3 skyReflection = mix/);
  assert.match(source, /const enablePlanarReflection = this\.graphicsQuality === 'high'/);
  assert.match(source, /uPlanarReflectionStrength: \{ value: enablePlanarReflection \? 1\.0 : 0\.0 \}/);
});

test('high-tier planar reflection is resolution-capped and disposed on map changes', () => {
  assert.match(source, /const riverWidth = 11\.4/);
  assert.match(source, /_warpPronteraRiverSurfaceGeometry\(geometry\)/);
  assert.match(source, /positions\.setY\(i, across - Math\.sin\(x \* 0\.08\) \* 10\)/);
  assert.match(source, /const PRONTERA_RIVER_HALF_WIDTH = 5\.7/);
  assert.match(source, /const reflectionGeo = new THREE\.PlaneGeometry/);
  assert.match(source, /this\._warpPronteraRiverSurfaceGeometry\(reflectionGeo\)/);
  assert.match(source, /reflectionProbe = new Reflector\(reflectionGeo/);
  assert.match(source, /Math\.max\(256, Math\.min\(512/);
  assert.match(source, /multisample: 0/);
  assert.match(source, /if \(object\.isReflector && typeof object\.dispose === 'function'\)/);
  assert.match(source, /this\.waterReflection = null/);
});

test('river palette stays blue and does not use brown terrain colors', () => {
  assert.match(source, /const deepBed = new THREE\.Color\(0x0b4860\)/);
  assert.match(source, /const bedLight = new THREE\.Color\(0x1b7890\)/);
  assert.match(source, /const shoreWater = new THREE\.Color\(0x39aabd\)/);
  assert.match(source, /Blue wet shoreline follows the actual water plane edge/);
  assert.match(source, /A muted teal\/grass transition makes the soil edge readable/);
  assert.doesNotMatch(source, /const mudColor = new THREE\.Color\(0x3a2e24\)/);
});

test('river surface stays aligned with the actual bank width instead of a flat oversized slab', () => {
  assert.match(source, /const riverWidth = 11\.4/);
  assert.match(source, /_warpPronteraRiverSurfaceGeometry\(geometry\)/);
  assert.match(source, /positions\.setY\(i, across - Math\.sin\(x \* 0\.08\) \* 10\)/);
  assert.match(source, /const PRONTERA_RIVER_HALF_WIDTH = 5\.7/);
  assert.match(source, /new THREE\.PlaneGeometry\(riverLength, riverWidth/);
  assert.match(source, /The old 40-unit slab made the river read as a flat blue rectangle/);
});

test('pet sanctuary is placed on a clear dry-land meadow', () => {
  assert.match(source, /export const PET_BOUTIQUE_POSITION = Object\.freeze\(\{ x: 6, z: -15 \}\)/);
  assert.match(source, /const PET_BOUTIQUE_CLEAR_RADIUS = 5\.1/);
  assert.match(source, /const isNearPetBoutique = \(x, z, extra = 0\) =>/);
  assert.match(source, /group\.userData\.npcType = 'pet_boutique'/);
  assert.match(source, /group\.userData\.collisionRadius = 3\.4/);
  assert.match(source, /this\.getTerrainHeight\(PET_BOUTIQUE_POSITION\.x, PET_BOUTIQUE_POSITION\.z\)/);
  assert.match(source, /this\._isOnLand\(x, z\).*isNearPetBoutique\(x, z, 0\.8\).*isNearWeaponSmith\(x, z, 0\.8\)/);
  assert.match(source, /isNearPetBoutique\(x, z\).*isNearWeaponSmith\(x, z\).*isNearSellNpc\(x, z\)\) continue/);

  const riverZ = Math.sin(6 * 0.08) * 10 - 2;
  assert.ok(Math.abs(-15 - riverZ) > 7, 'boutique must be outside the river keep-out band');
});

test('weapon smith is placed on a clear dry-land field away from the river', () => {
  assert.match(source, /export const WEAPON_SMITH_POSITION = Object\.freeze\(\{ x: 14, z: -8 \}\)/);
  assert.match(source, /const WEAPON_SMITH_CLEAR_RADIUS = 4\.8/);
  assert.match(source, /const isNearWeaponSmith = \(x, z, extra = 0\) =>/);
  assert.match(source, /group\.userData\.npcType = 'weaponsmith'/);
  assert.match(source, /group\.userData\.collisionRadius = 2\.15/);
  assert.match(source, /this\.getTerrainHeight\(WEAPON_SMITH_POSITION\.x, WEAPON_SMITH_POSITION\.z\)/);
  assert.match(source, /!isNearWeaponSmith\(x, z, 0\.8\)/);
  assert.match(source, /\|\| isNearWeaponSmith\(x, z\) \|\| isNearSellNpc\(x, z\)\) continue/);

  const riverZ = Math.sin(14 * 0.08) * 10 - 2;
  assert.ok(Math.abs(-8 - riverZ) > 8, 'weapon smith must be outside the river and bank keep-out band');
});

test('service zoning separates the item-buying stall from the smith and pet sanctuary', () => {
  assert.match(source, /export const SELL_NPC_POSITION = Object\.freeze\(\{ x: -5, z: -14 \}\)/);
  assert.match(source, /const SELL_NPC_CLEAR_RADIUS = 4\.2/);
  assert.match(source, /const isNearSellNpc = \(x, z, extra = 0\) =>/);
  assert.match(source, /group\.userData\.collisionRadius = 2\.6/);
  assert.match(source, /SELL_NPC_POSITION\.x,\s*\n\s*this\.getTerrainHeight\(SELL_NPC_POSITION\.x, SELL_NPC_POSITION\.z\),\s*\n\s*SELL_NPC_POSITION\.z/);
  assert.match(source, /isNearPetBoutique\(x, z\).*isNearWeaponSmith\(x, z\).*isNearSellNpc\(x, z\)/);

  const pet = { x: 6, z: -15 };
  const smith = { x: 14, z: -8 };
  const sell = { x: -5, z: -14 };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(distance(pet, smith) > 9, 'pet sanctuary and smith need a readable gap');
  assert.ok(distance(pet, sell) > 9, 'pet sanctuary and item stall need a readable gap');
  assert.ok(distance(smith, sell) > 9, 'smith and item stall need a readable gap');
});

test('generic ground fence is removed while river guard rails remain shoreline-only', () => {
  assert.doesNotMatch(source, /this\._createFence\(\)/);
  assert.doesNotMatch(source, /_createFence\(\) \{/);
  assert.doesNotMatch(source, /post\.position\.set\(-20, 0\.4, i \* 2\)/);
  assert.match(source, /const PRONTERA_RIVER_RAIL_OFFSET = 5\.82/);
  assert.match(source, /const z = riverZ \+ side \* PRONTERA_RIVER_RAIL_OFFSET/);
});

test('river guard rails block land-to-water movement but keep the bridge crossing open', () => {
  assert.match(sceneSource, /resolveMovementCollision\(fromPosition, toPosition, character = null\)/);
  assert.match(sceneSource, /const guardLine = PRONTERA_RIVER_GUARD_LINE/);
  assert.match(sceneSource, /const PRONTERA_RIVER_PLAYER_RADIUS = 0\.52/);
  assert.match(sceneSource, /const innerLine = PRONTERA_RIVER_INNER_LINE/);
  assert.match(sceneSource, /const segmentCrosses = \(threshold\) =>/);
  assert.match(sceneSource, /const steps = Math\.min\(24, Math\.max\(2, Math\.ceil\(length \/ 0\.35\)\)\)/);
  assert.match(sceneSource, /if \(previousDistance >= threshold && currentDistance < threshold\) return true/);
  assert.match(sceneSource, /const pushTo = \(side, distance\) =>/);
  assert.match(sceneSource, /const crossedToOtherSide = toSide !== fromSide/);
  assert.match(sceneSource, /resolved\.z = riverCenter\(toPosition\.x\) \+ side \* distance/);
  assert.match(sceneSource, /const PRONTERA_BRIDGE_HALF_WIDTH = 1\.8/);
  assert.match(sceneSource, /const bridgeDeckOpen = \(p\) => Math\.abs\(p\.x\) < PRONTERA_BRIDGE_HALF_WIDTH/);
  assert.match(sceneSource, /const fromOnBridge = bridgeDeckOpen\(fromPosition\)/);
  assert.match(sceneSource, /const toOnBridge = bridgeDeckOpen\(toPosition\)/);
  assert.match(sceneSource, /if \(fromOnBridge && toOnBridge\) return resolved/);
  assert.match(sceneSource, /const toDistance = Math\.abs\(toDelta\)/);
  assert.match(sceneSource, /const fromSide = Math\.sign\(fromDelta\) \|\| 1/);
  assert.match(sceneSource, /const toSide = Math\.sign\(toDelta\) \|\| fromSide/);
  assert.match(sceneSource, /if \(fromDistance < waterLine\)/);
  assert.match(sceneSource, /if \(fromDistance < outerLine\) return pushTo\(fromSide, outerLine\)/);
  assert.match(sceneSource, /return pushTo\(toSide, waterLine\)/);
  assert.match(sceneSource, /const enteringFromEnd = Math\.abs\(fromPosition\.x\) < PRONTERA_BRIDGE_HALF_WIDTH/);
  assert.match(sceneSource, /resolved\.x = Math\.sign\(fromPosition\.x \|\| toPosition\.x\) \* PRONTERA_BRIDGE_HALF_WIDTH/);
  assert.match(mainSource, /setMovementCollisionResolver/);
  assert.match(mainSource, /sceneManager\.resolvePlayerCollisions\?\.\(resolved, fromPosition\)/);
  assert.match(characterSource, /movementCollisionResolver/);
  assert.match(characterSource, /const resolvedPosition = this\.movementCollisionResolver/);
});

test('river adds segmented wooden guard rails while collision seals the approach gaps', () => {
  assert.match(source, /_createRiverGuardRails\(riverLength\)/);
  assert.match(source, /const spacing = quality === 'high' \? 2\.8 : quality === 'medium' \? 3\.15 : 3\.55/);
  assert.match(source, /const postHeight = quality === 'ultra-low' \? 1\.72 : 1\.92/);
  assert.match(source, /const bridgeRailGap = PRONTERA_BRIDGE_HALF_WIDTH \+ 0\.20/);
  assert.match(source, /const PRONTERA_RIVER_BANK_EDGE = 6\.05/);
  assert.match(source, /const PRONTERA_RIVER_RAIL_OFFSET = 5\.82/);
  assert.match(source, /const PRONTERA_RIVER_GUARD_LINE = PRONTERA_RIVER_RAIL_OFFSET/);
  assert.match(source, /\+ PRONTERA_RIVER_PLAYER_RADIUS \+ 0\.06/);
  assert.match(source, /const z = riverZ \+ side \* PRONTERA_RIVER_RAIL_OFFSET/);
  assert.match(source, /river-guard-rail-segment/);
  assert.match(source, /river-guard-rail-span/);
  assert.match(source, /const postGeo = new THREE\.CylinderGeometry/);
  assert.match(source, /const railGeo = new THREE\.CylinderGeometry/);
  assert.match(source, /const ropeGeo = new THREE\.CylinderGeometry/);
  assert.match(source, /if \(Math\.abs\(x\) < bridgeRailGap\) continue/);
  assert.match(source, /if \(a\.x <= -bridgeRailGap && b\.x >= bridgeRailGap\) continue/);
  assert.match(source, /this\.waterGuardRails\.push/);
});

test('river adds tier-scaled aquatic props without covering the readable water silhouette', () => {
  assert.match(source, /_createAquaticProps\(riverLength\)/);
  assert.match(source, /const propCount = quality === 'high' \? 24 : quality === 'medium' \? 16 : 9/);
  assert.match(source, /aquatic-prop-\$\{type\}/);
  assert.match(source, /aquaticPropType = type/);
  assert.match(source, /underwater-rock/);
  assert.match(source, /seaweed/);
  assert.match(source, /surface-pad/);
  assert.match(source, /this\.waterAquaticProps\.push/);
  assert.match(source, /this\.waterAquaticProps\.forEach/);
});

test('water surface adds mobile-safe air bubbles and wind-driven ripple rings', () => {
  assert.match(source, /_createWaterBubbleField\(riverLength\)/);
  assert.match(source, /const count = quality === 'high' \? 34 : quality === 'medium' \? 22 : 10/);
  assert.match(source, /new THREE\.PointsMaterial/);
  assert.match(source, /points\.name = 'water-air-bubbles'/);
  assert.match(source, /_createWaterRipples\(riverLength\)/);
  assert.match(source, /group\.name = 'water-wind-ripples'/);
  assert.match(source, /this\.waterBubbleField\.data\.forEach/);
  assert.match(source, /this\.waterRippleMeshes\.forEach/);
});

test('river shoreline edge follows the water plane and adds sparse wet stones', () => {
  assert.match(source, /_createRiverBankEdge\(riverLength\)/);
  assert.match(source, /river-shoreline-edge/);
  assert.match(source, /const z = centerZ \+ side \* \(PRONTERA_RIVER_HALF_WIDTH \+ 0\.10\)/);
  assert.match(source, /narrow wet shoulder/);
  assert.match(source, /const PRONTERA_RIVER_RAIL_OFFSET = 5\.82/);
  assert.match(source, /new THREE\.TubeGeometry\(curve, segments, edgeRadius, 6, false\)/);
  assert.match(source, /const stoneCount = quality === 'high' \? 12 : quality === 'medium' \? 8 : 4/);
});

test('river shoreline foam uses bounded geometry and animated bubbles', () => {
  assert.match(source, /_createRiverFoam\(config, riverLength\)/);
  assert.match(source, /const segments = quality === 'high' \? 72 : 48/);
  assert.match(source, /const radius = quality === 'high' \? 0\.052 : 0\.038/);
  assert.match(source, /new THREE\.TubeGeometry\(curve, segments, radius, 5, false\)/);
  assert.match(source, /float bubbles = sin\(vUv\.x \* 38\.0/);
  assert.match(source, /this\.waterFoamMeshes\.forEach/);
});

test('all aquatic species are ambient actors rather than combat monsters', () => {
  assert.match(gameDataSource, /export const AMBIENT_WATER_TYPES = Object\.freeze\(\['shrimp', 'clam', 'fish', 'crab', 'marina'\]\)/);
  for (const type of ['shrimp', 'clam', 'fish', 'crab', 'marina']) {
    assert.match(gameDataSource, new RegExp(`${type}:\\s*\\{[\\s\\S]*?ambientOnly: true`));
  }
  assert.match(gameDataSource, /All water species are ambient actors; there are no water combat spawns/);
  assert.doesNotMatch(gameDataSource, /table\.push\(\{ type: '(?:shrimp|clam|fish|crab|marina)'/);
  assert.match(gameDataSource, /Aquatic scenery is intentionally absent from combat metadata/);
  assert.match(monsterSource, /this\.isAmbient = this\.data\.ambientOnly === true/);
  assert.match(monsterSource, /if \(!this\.isAmbient\) \{/);
  assert.match(monsterSource, /if \(this\.isAmbient\) return \{ killed: false, damage: 0 \}/);
  assert.match(monsterSource, /const AMBIENT_WATER_SET = new Set\(AMBIENT_WATER_TYPES\)/);
  assert.match(monsterSource, /if \(AMBIENT_WATER_SET\.has\(s\?\.t\)\)/);
  assert.match(monsterSource, /if \(!m\.alive \|\| m\.isAmbient\) continue/);
  assert.match(source, /_createAmbientAquaticActors\(riverLength\)/);
  assert.match(source, /const types = \['shrimp', 'fish', 'crab', 'marina', 'clam'\]/);
  assert.match(source, /actor\.userData\.ambientType = type/);
});

test('server filters legacy aquatic rows from authoritative water spawn, respawn and snapshots', () => {
  assert.match(serverMonsterSource, /import \{ AMBIENT_WATER_TYPES \} from '\.\.\/\.\.\/src\/engine\/GameData\.js'/);
  assert.match(serverMonsterSource, /const AMBIENT_WATER_SET = new Set\(AMBIENT_WATER_TYPES\)/);
  assert.match(serverMonsterSource, /AMBIENT_WATER_TYPES/);
  assert.match(serverMonsterSource, /s\.is_water && !AMBIENT_WATER_SET\.has\(s\.monster_type\)/);
  assert.match(serverMonsterSource, /!!s\.is_water === m\.isWater && !AMBIENT_WATER_SET\.has\(s\.monster_type\)/);
  assert.match(serverMonsterSource, /!m\.alive \|\| AMBIENT_WATER_SET\.has\(m\.type\)/);
});
