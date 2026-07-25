import test from 'node:test';
import assert from 'node:assert/strict';
import { getJobTierInfo } from '../src/engine/GameData.js';

test('getJobTierInfo maps Novice level 1 to T1 Beginner', () => {
    const info = getJobTierInfo(null, 1);
    assert.equal(info.tier, 1);
    assert.equal(info.name, 'Beginner');
    assert.equal(info.color, '#94a3b8');
});

test('getJobTierInfo maps Swordsman level 15 to T2 นักรบฝึกฝน', () => {
    const info = getJobTierInfo('swordsman', 15);
    assert.equal(info.tier, 2);
    assert.equal(info.name, 'นักรบฝึกฝน');
    assert.equal(info.color, '#4ade80');
});

test('getJobTierInfo maps Mage level 35 to T4 นักเวทเหล็ก', () => {
    const info = getJobTierInfo('mage', 35);
    assert.equal(info.tier, 4);
    assert.equal(info.name, 'นักเวทเหล็ก');
    assert.equal(info.color, '#cbd5e1');
});

test('getJobTierInfo maps Archer level 115 to T12 ผู้พิทักษ์ตำนาน', () => {
    const info = getJobTierInfo('archer', 115);
    assert.equal(info.tier, 12);
    assert.equal(info.name, 'ผู้พิทักษ์ตำนาน');
    assert.equal(info.color, '#f43f5e');
});

test('getJobTierInfo handles boundaries and invalid jobs', () => {
    // Invalid job falls back to global
    const info = getJobTierInfo('assassin', 55);
    assert.equal(info.tier, 6);
    assert.equal(info.name, 'Knight');
    assert.equal(info.color, '#2563eb');

    // Upper boundary level > 120
    const maxInfo = getJobTierInfo('priest', 150);
    assert.equal(maxInfo.tier, 12);
    assert.equal(maxInfo.name, 'ผู้ถือครองแสงนิรันดร์');

    // Lower boundary level = 0
    const zeroInfo = getJobTierInfo('swordsman', 0);
    assert.equal(zeroInfo.tier, 1);
    assert.equal(zeroInfo.name, 'นักดาบฝึกหัด');
});
