import test from 'node:test';
import assert from 'node:assert/strict';
import { MonsterManager } from '../src/engine/MonsterManager.js';

function fixture() {
  const manager = Object.create(MonsterManager.prototype);
  manager.serverMode = true;
  manager.monsters = [];
  manager.waterMonsters = [];
  manager._initialSpawnDone = true;
  manager.sceneManager = { getTerrainHeight: () => 0 };
  const monster = {
    id: 'land_0', type: 'poring', alive: true,
    mesh: { visible: true, position: { set() {} } },
    isWaterMonster: false,
    setServerHp(hp, maxHp) { this.hp = hp; this.maxHp = maxHp; },
    setServerTarget() {},
  };
  manager._srvById = new Map([[monster.id, monster]]);
  return { manager, monster };
}

test('a stale pre-death snapshot cannot revive a server monster', () => {
  const { manager, monster } = fixture();
  assert.equal(manager.killServerMonster('land_0'), monster);
  manager.applyServerState({ mons: [{ id: 'land_0', t: 'poring', x: 1, z: 2, r: 0, hp: 1, mhp: 30 }] });
  assert.equal(monster.alive, false);
  assert.equal(monster.mesh.visible, false);
});

test('a complete snapshot omission hides a monster when mon_dead was dropped', () => {
  const { manager, monster } = fixture();
  manager.applyServerState({ mons: [] });
  assert.equal(monster.alive, false);
  assert.equal(monster.mesh.visible, false);
  assert.equal(monster._seenAbsentSinceDeath, true);
});

test('same-id respawn is accepted only after an absent snapshot barrier', () => {
  const { manager, monster } = fixture();
  manager.killServerMonster('land_0');
  manager.applyServerState({ mons: [] });
  manager.applyServerState({ mons: [{ id: 'land_0', t: 'poring', x: 3, z: 4, r: 0, hp: 30, mhp: 30 }] });
  assert.equal(monster.alive, true);
  assert.equal(monster.mesh.visible, true);
  assert.equal(monster._awaitingServerRespawn, false);
  assert.equal(monster.hp, 30);
});
