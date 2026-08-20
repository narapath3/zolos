import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMonsterCombatMeta, getSpawnTable } from '../src/engine/GameData.js';

const serverSource = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../server/api/monstersConfig.js', import.meta.url), 'utf8');
const serverEntrySource = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');

const COMBAT_MAPS = ['prontera', 'payon', 'glast_heim', 'mjolnir', 'abyss_lake'];

test('every combat map has a shared spawn table with combat metadata', () => {
  for (const mapId of COMBAT_MAPS) {
    const spawns = getSpawnTable(999, mapId);
    assert.ok(spawns.length > 0, `${mapId} should have combat monsters`);
    for (const spawn of spawns) {
      const meta = getMonsterCombatMeta(spawn.type);
      assert.notEqual(meta.family, 'unknown', `${spawn.type} on ${mapId} needs a combat family`);
    }
  }
  assert.deepEqual(getSpawnTable(999, 'svarrga'), [], 'Svarrga remains a peaceful safe map');
});

test('server resolves special abilities from shared metadata instead of a missing DB family column', () => {
  assert.match(serverSource, /import \{ AMBIENT_WATER_TYPES \} from '\.\.\/\.\.\/src\/engine\/GameData\.js'/);
  assert.match(serverSource, /import \{ getMonsterCombatMeta \} from '\.\.\/\.\.\/src\/engine\/GameData\.js'/);
  assert.match(serverSource, /const family = def\?\.family \|\| getMonsterCombatMeta\(def\?\.type, def \|\| \{\}\)\.family/);
  assert.match(serverSource, /plant: 'poison_burst'/);
  assert.match(serverSource, /slime: 'ground_slam'/);
  assert.match(serverSource, /\|\| \(def\?\.environment === 'water' \? 'water_burst' : 'ground_slam'\)/);
});

test('server simulation ticks every configured map and broadcasts map-scoped chase/attack/skill events', () => {
  assert.match(serverSource, /for \(const mapId of cfg\.mapCfg\.keys\(\)\)/);
  assert.match(serverSource, /ensureMapSpawned\(mapId\)/);
  assert.match(serverSource, /stepMonster\(m, mapId, now, dtSec\)/);
  assert.match(serverSource, /io\.to\(`map:\$\{mapId\}`\)\.emit\('mon_atk_fx'/);
  assert.match(serverSource, /io\.to\(`map:\$\{mapId\}`\)\.emit\('mon_skill_fx'/);
  assert.match(serverSource, /io\.to\(`map:\$\{mapId\}`\)\.emit\('mon_skill_impact'/);
});

test('existing databases repair missing map defaults without overwriting admin tuning', () => {
  assert.match(configSource, /export async function ensureWorldMapDefaults\(\)/);
  assert.match(configSource, /for \(const m of MAPS\)/);
  assert.match(configSource, /ON CONFLICT \(map_id\) DO NOTHING/);
  assert.match(configSource, /ON CONFLICT \(map_id,monster_type\) DO NOTHING/);
  assert.match(serverEntrySource, /await ensureWorldMapDefaults\(\);/);
});

test('server and local fallback use the shared bridge corridor on every combat map', () => {
  assert.match(serverSource, /const isPronteraBridge = \(_mapId, x, z\)/);
  assert.match(clientSource, /const isMonsterBridge = \(_sceneManager, x, z\)/);
  assert.match(serverSource, /if \(!m\.isWater && isPronteraBridge\(mapId, x, z\)\) return true/);
  assert.match(clientSource, /if \(requiredEnv !== 'water' && isMonsterBridge\(sceneManager, x, z\)\) return true/);
});

test('authoritative monster aggro remains bound to the verified character on its current map', () => {
  assert.match(serverSource, /const charId = player\.characterId;\s*if \(!charId\) return/);
  assert.match(serverSource, /p\.characterId === characterId && p\.mapId === mapId/);
  assert.match(serverSource, /m\.aggroChar = charId/);
  assert.match(serverEntrySource, /clearAggroForCharacter\(player\.characterId\)/);
});

test('server chase avoids map edges and recovers from blocked steering instead of freezing', () => {
  assert.match(serverSource, /const MAP_WALKABLE_HALF = 32\.5/);
  assert.match(serverSource, /const PRONTERA_WALKABLE_HALF = 52\.5/);
  assert.match(serverSource, /isInsideWalkableBounds\(mapId, x, z/);
  assert.match(serverSource, /const angles = \[0, Math\.PI \/ 7, -Math\.PI \/ 7, Math\.PI \/ 10/);
  assert.match(serverSource, /m\.chaseStuckTime = \(m\.chaseStuckTime \|\| 0\) \+ dtSec/);
  assert.match(serverSource, /m\.chaseBias = -\(Number\(m\.chaseBias\) \|\| 1\)/);
});

test('all combat maps can route an aggro target through the shared bridge corridor', () => {
  assert.match(serverSource, /function buildBridgeChaseRoute\(m, pp\)/);
  assert.match(serverSource, /function getChaseGoal\(m, pp\)/);
  assert.match(serverSource, /m\.chaseWaypoints = bridgeRoute/);
  assert.match(serverSource, /const BRIDGE_CENTER_Z = -2/);
  assert.match(clientSource, /const buildMonsterBridgeRoute = \(monster, player\)/);
  assert.match(clientSource, /this\._chaseWaypoints = buildMonsterBridgeRoute\(this, player\)/);
});

test('local fallback leaves cave/mountain biome labels during revenge chase but still blocks water and arena', () => {
  assert.match(clientSource, /During an active revenge chase, land monsters may leave/);
  assert.match(clientSource, /if \(requiredEnv !== 'water'\) return true/);
  assert.match(clientSource, /if \(!isMonsterInsideBounds\(sceneManager, x, z, 0\.8\)\) return false/);
  assert.match(clientSource, /sceneManager\.getEnvironmentAt\(this\._environmentProbe/);
});
