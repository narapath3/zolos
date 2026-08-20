import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'src/engine/SceneManager.js'), 'utf8');

 test('Japanese-minimal street lamps are procedural shoji-style assets', () => {
    assert.match(source, /_createStreetLamps\(config\)/);
    assert.match(source, /root\.name = 'japanese-minimal-street-lamps'/);
    assert.match(source, /const postGeo = new THREE\.CylinderGeometry/);
    assert.match(source, /const lanternGeo = new THREE\.BoxGeometry/);
    assert.match(source, /const slatGeo = new THREE\.BoxGeometry/);
    assert.match(source, /const roofGeo = new THREE\.ConeGeometry/);
    assert.match(source, /paperMat = new THREE\.MeshBasicMaterial/);
});

test('street lamps follow route corridors but avoid interaction and arena zones', () => {
    assert.match(source, /Lamps sit just outside its four-unit walking width/);
    assert.match(source, /addLamp\(x, index % 2 \? 3\.15 : -3\.15/);
    assert.match(source, /addLamp\(index % 2 \? 3\.15 : -3\.15, z/);
    assert.match(source, /isNearPetBoutique\(x, z, 3\.0\)/);
    assert.match(source, /isNearWeaponSmith\(x, z, 2\.8\)/);
    assert.match(source, /portalBlocked\(x, z\) \|\| npcBlocked\(x, z\)/);
    assert.match(source, /this\.isInArena\?\.\(x, z, 2\.2\)/);
    assert.match(source, /this\.currentMap === 'prontera' && !this\._isOnLand\(x, z\)/);
});

test('street lamp quality tiers keep geometry, point lights, and shadows mobile-safe', () => {
    assert.match(source, /const tierCount = quality === 'high' \? 16 : quality === 'medium' \? 11 : quality === 'low' \? 7 : 4/);
    assert.match(source, /const lightBudget = quality === 'high' \? 10 : quality === 'medium' \? 6 : 0/);
    assert.match(source, /if \(this\.streetLamps\.length < lightBudget\)/);
    assert.match(source, /base\.castShadow = quality === 'high'/);
    assert.match(source, /post\.castShadow = quality === 'high'/);
    assert.match(source, /const lampNight = this\.currentMap === 'prontera' \? night : 0\.18/);
});

test('street lamps are reset on map changes and animated through the existing atmosphere loop', () => {
    assert.match(source, /this\.streetLamps = \[\];/);
    assert.match(source, /this\._createStreetLamps\(config\);/);
    assert.match(source, /if \(this\.streetLamps\?\.length\)/);
    assert.match(source, /entry\.light\.intensity = lampNight/);
    assert.match(source, /entry\.bulb\.scale\.setScalar\(glow\)/);
});
