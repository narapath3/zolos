import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoSearchWaypoints } from '../src/engine/CombatSystem.js';

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
