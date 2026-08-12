import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeSaveUpdates } from '../server/securityPolicy.js';

const engine = fs.readFileSync(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('server-owned monster death commits one kill and returns the authoritative total', () => {
  const killBlock = engine.match(/async function killMonster[\s\S]*?async function awardMonsterCards/)?.[0] || '';
  assert.match(killBlock, /total_kills = COALESCE\(total_kills, 0\) \+ 1/);
  assert.match(killBlock, /gold = LEAST\(COALESCE\(gold, 0\) \+ \$2, 500000000\)/);
  assert.match(killBlock, /RETURNING gold, total_kills/);
  assert.match(killBlock, /gold_total: Number\(committed\.gold\)/);
  assert.match(killBlock, /total_kills: Number\(committed\.total_kills\)/);
  assert.ok(killBlock.indexOf('await query(') < killBlock.indexOf("sock.emit('mon_reward'"));
});

test('monster rewards freeze the defeated life across slow database work and respawn', () => {
  const killBlock = engine.match(/async function killMonster[\s\S]*?async function awardMonsterCards/)?.[0] || '';
  assert.match(killBlock, /const defeated = \{[\s\S]*type: m\.type[\s\S]*contributors: \[\.\.\.m\.dmgByChar\.entries\(\)\][\s\S]*killNonce:/);
  const firstAwait = killBlock.indexOf('await query(');
  assert.ok(killBlock.indexOf('const defeated = {') < firstAwait);
  assert.match(killBlock, /cfg\.dropsByType\.get\(defeated\.type\)/);
  assert.match(killBlock, /awardMonsterCards\(cid, defeated\.type, mapId, defeated\.id, defeated\.killNonce\)/);
  assert.doesNotMatch(killBlock.slice(firstAwait), /\bm\.type\b|\bm\.id\b|\bm\.dmgByChar\b/);
});

test('client adopts server kill total without incrementing it again', () => {
  const rewardBlock = main.match(/window\.onMonReward = \(payload\) => \{[\s\S]*?\n    };/)?.[0] || '';
  assert.match(rewardBlock, /character\.stats\.total_kills = Math\.max/);
  assert.match(rewardBlock, /character\.stats\.gold = Number\.isFinite\(Number\(payload\.gold_total\)\)/);
  assert.doesNotMatch(rewardBlock, /total_kills\+\+|total_kills \+=/);
});

test('stale client saves cannot decrease the authoritative kill counter', () => {
  const stale = sanitizeSaveUpdates({ total_kills: 41 }, { total_kills: 42 }, 60_000);
  const current = sanitizeSaveUpdates({ total_kills: 42 }, { total_kills: 42 }, 60_000);
  const next = sanitizeSaveUpdates({ total_kills: 43 }, { total_kills: 42 }, 60_000);
  assert.equal(stale.total_kills, undefined);
  assert.equal(current.total_kills, 42);
  assert.equal(next.total_kills, 43);
});
