import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoSearchWaypoints, getPortalAvoidanceWaypoint } from '../src/engine/CombatSystem.js';

test('auto search covers the whole map in a serpentine sweep', () => {
  const points = buildAutoSearchWaypoints({ halfExtent: 44, step: 11 });
  assert.ok(points.length >= 70);
  assert.ok(Math.min(...points.map(p => p.x)) <= -44);
  assert.ok(Math.max(...points.map(p => p.x)) >= 44);
  assert.ok(Math.min(...points.map(p => p.z)) <= -44);
  assert.ok(Math.max(...points.map(p => p.z)) >= 44);
  assert.ok(points[0].x < points[1].x);
  const rowLength = 9;
  assert.ok(points[rowLength].x > points[rowLength + 1].x);
});

test('auto search excludes blocked terrain such as water', () => {
  const points = buildAutoSearchWaypoints({ halfExtent: 22, step: 11, isBlocked: p => p.x === 0 });
  assert.ok(points.length > 0);
  assert.equal(points.some(p => p.x === 0), false);
});

test('AUTO movement detours around warp portals instead of crossing their trigger', () => {
  const from = { x: -10, y: 1.2, z: 0 };
  const target = { x: 10, y: 1.2, z: 0 };
  const waypoint = getPortalAvoidanceWaypoint(from, target, [{ position: { x: 0, y: 0, z: 0 } }]);
  assert.ok(Math.abs(waypoint.z) >= 4);
  assert.ok(Math.hypot(waypoint.x, waypoint.z) > 3.4);
});

test('AUTO movement keeps a direct route when no portal blocks it', () => {
  const target = { x: 10, y: 1.2, z: 0 };
  assert.equal(getPortalAvoidanceWaypoint({ x: 0, z: 0 }, target, [{ position: { x: 0, z: 10 } }]), target);
});
