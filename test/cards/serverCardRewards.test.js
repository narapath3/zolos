import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  WORLD_BOSSES,
  awardBossCardRewards,
  buildBossRanking,
  buildBossCardRewards,
  minimumContribution,
} from '../../server/cardRewards.js';

test('six bosses expose stable IDs and unchanged visible names', () => {
  assert.deepEqual(WORLD_BOSSES, [
    { id: 'valdris', name: 'Valdris จอมมารเพลิง' },
    { id: 'ignarok', name: 'Ignarok ราชันมังกร' },
    { id: 'abyss_golem', name: 'Golem แห่งหุบเหวลึก' },
    { id: 'morgath', name: 'Morgath ผู้กลืนวิญญาณ' },
    { id: 'kaltharu', name: 'Kaltharu อสูรน้ำแข็ง' },
    { id: 'zulgaroth', name: "Zul'garoth เทพสังหาร" },
  ]);
});

test('meaningful contribution is at least one percent of boss HP', () => {
  assert.equal(minimumContribution(7000), 70);
  assert.equal(minimumContribution(1), 1);

  const rewards = buildBossCardRewards({
    bossId: 'valdris',
    maxHp: 7000,
    ranking: [
      { userId: 'low', dmg: 69 },
      { userId: 'eligible', dmg: 70 },
    ],
  });

  assert.equal(rewards[0].eligible, false);
  assert.equal(rewards[0].isMvp, false, 'an ineligible #1 contributor is not MVP');
  assert.equal(rewards[1].eligible, true);
  assert.equal(rewards[1].isMvp, true, 'the highest-damage eligible contributor is MVP');
});

function createRewardHarness({ rpcError = null, random = () => 0 } = {}) {
  const calls = [];
  const emitted = [];
  const cardRow = { owned: 0, stars: 1, pity: 0 };
  const supabase = {
    from(table) {
      assert.equal(table, 'character_cards');
      return {
        select(columns) {
          assert.equal(columns, 'owned, stars, pity');
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return this;
            },
            async maybeSingle() {
              calls.push(['read']);
              return { data: cardRow, error: null };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (rpcError) return { data: null, error: rpcError };
      return {
        data: {
          card_id: args.p_card_id,
          owned: cardRow.owned + (args.p_won ? 1 : 0),
          stars: cardRow.stars,
          pity: args.p_new_pity,
          is_new: args.p_won && cardRow.owned === 0,
          won: args.p_won,
        },
        error: null,
      };
    },
  };
  const io = {
    to(socketId) {
      return {
        emit(event, payload) {
          calls.push(['emit']);
          emitted.push({ socketId, event, payload });
        },
      };
    },
  };
  const onlinePlayers = new Map([
    ['socket-mvp', {
      userId: 'mvp-user',
      socketId: 'socket-mvp',
      verified: true,
      characterId: 'character-mvp',
    }],
  ]);
  const userSocketMap = new Map([['mvp-user', 'socket-mvp']]);

  const logger = { error() {} };
  return { calls, emitted, io, logger, onlinePlayers, random, supabase, userSocketMap };
}

test('eligible MVP uses the server catalog/resolver and persists before a private emit', async () => {
  const harness = createRewardHarness();

  const result = await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking: [{ userId: 'mvp-user', characterId: 'character-mvp', dmg: 7000 }],
    rewardId: 'boss-spawn-1',
  });

  assert.equal(result.persisted, 1);
  assert.equal(result.emitted, 1);
  assert.deepEqual(
    harness.calls.filter(call => call[0] === 'rpc')[0],
    ['rpc', 'award_card_drop', {
      p_character_id: 'character-mvp',
      p_card_id: 'valdris',
      p_expected_pity: 0,
      p_new_pity: 0,
      p_won: true,
      p_idempotency_key: 'world_boss:boss-spawn-1:mvp-user:valdris',
    }],
  );
  assert.ok(
    harness.calls.findIndex(call => call[0] === 'rpc')
      < harness.calls.findIndex(call => call[0] === 'emit'),
    'the atomic write must finish before emit',
  );
  assert.deepEqual(harness.emitted, [{
    socketId: 'socket-mvp',
    event: 'card_reward',
    payload: {
      cardId: 'valdris',
      owned: 1,
      stars: 1,
      pity: 0,
      source: { kind: 'world_boss', id: 'valdris', label: 'Valdris world boss' },
      isNew: true,
    },
  }]);
});

test('failed rolls persist pity but do not emit a card award', async () => {
  const harness = createRewardHarness({ random: () => 0.99 });

  const result = await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking: [{ userId: 'mvp-user', characterId: 'character-mvp', dmg: 7000 }],
    rewardId: 'boss-spawn-2',
  });

  assert.equal(result.persisted, 1);
  assert.equal(result.emitted, 0);
  assert.equal(harness.emitted.length, 0);
  assert.equal(harness.calls.find(call => call[0] === 'rpc')[2].p_new_pity, 1);
  assert.equal(harness.calls.find(call => call[0] === 'rpc')[2].p_won, false);
});

test('database failure never emits a card award', async () => {
  const harness = createRewardHarness({ rpcError: new Error('database unavailable') });

  const result = await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking: [{ userId: 'mvp-user', characterId: 'character-mvp', dmg: 7000 }],
    rewardId: 'boss-spawn-3',
  });

  assert.equal(result.persisted, 0);
  assert.equal(result.emitted, 0);
  assert.equal(result.failed, 1);
  assert.equal(harness.emitted.length, 0);
});

test('unverified, disconnected, and below-threshold contributors cannot roll', async () => {
  const harness = createRewardHarness();
  harness.onlinePlayers.get('socket-mvp').verified = false;

  const result = await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking: [
      { userId: 'mvp-user', dmg: 7000 },
      { userId: 'low-user', characterId: 'character-low', dmg: 69 },
      { userId: 'offline-user', dmg: 1000 },
    ],
    rewardId: 'boss-spawn-4',
  });

  assert.deepEqual(result, { eligible: 2, persisted: 0, emitted: 0, failed: 0, skipped: 3 });
  assert.equal(harness.calls.some(call => call[0] === 'rpc'), false);
});

test('earned reward persists for the bound character after disconnect without emitting', async () => {
  const harness = createRewardHarness();
  harness.onlinePlayers.clear();
  harness.userSocketMap.clear();

  const result = await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking: [{ userId: 'mvp-user', characterId: 'character-mvp', dmg: 7000 }],
    rewardId: 'boss-spawn-disconnect',
  });

  assert.equal(result.persisted, 1);
  assert.equal(result.emitted, 0);
  assert.equal(harness.calls.find(call => call[0] === 'rpc')[2].p_character_id, 'character-mvp');
});

test('real ranking output carries the contribution-bound character into persistence', async () => {
  const harness = createRewardHarness();
  const ranking = buildBossRanking(new Map([
    ['mvp-user', {
      name: 'MVP',
      characterId: 'character-earned-on',
      dmg: 7000,
    }],
  ]));

  assert.equal(ranking[0].characterId, 'character-earned-on');
  await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking,
    rewardId: 'boss-spawn-real-ranking',
  });
  assert.equal(
    harness.calls.find(call => call[0] === 'rpc')[2].p_character_id,
    'character-earned-on',
  );
});

test('reconnect on another character cannot redirect or receive the earned reward', async () => {
  const harness = createRewardHarness();
  harness.onlinePlayers.get('socket-mvp').characterId = 'character-other';

  const result = await awardBossCardRewards({
    ...harness,
    boss: WORLD_BOSSES[0],
    maxHp: 7000,
    ranking: [{ userId: 'mvp-user', characterId: 'character-original', dmg: 7000 }],
    rewardId: 'boss-spawn-reconnect',
  });

  assert.equal(harness.calls.find(call => call[0] === 'rpc')[2].p_character_id, 'character-original');
  assert.equal(result.persisted, 1);
  assert.equal(result.emitted, 0);
});

test('map server binds an owned active character and awaits rewards at boss death', async () => {
  const source = await readFile(new URL('../../server/server.js', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{[\s\S]*awardBossCardRewards[\s\S]*WORLD_BOSSES[\s\S]*\}\s*from '\.\/cardRewards\.js'/);
  assert.doesNotMatch(source, /const BOSS_NAMES\s*=/);
  assert.match(source, /worldBoss\.boss\s*=\s*WORLD_BOSSES\[/);
  assert.match(source, /id:\s*worldBoss\.boss\?\.id/);
  assert.match(source, /playerInfo[\s\S]*characterId:\s*verifiedCharacter\?\.id\s*\|\|\s*null/);
  assert.match(source, /worldBoss\.damage\.get\(player\.userId\)[\s\S]*characterId:\s*player\.characterId/);
  assert.match(source, /const ranking = buildBossRanking\(worldBoss\.damage\)/);

  const awardIndex = source.indexOf('await awardBossCardRewards({');
  const deathEmitIndex = source.indexOf("io.emit('boss_dead'");
  assert.ok(awardIndex > 0, 'boss death must invoke the authoritative reward service');
  assert.ok(deathEmitIndex > awardIndex, 'boss rewards persist before the death result is broadcast');
});

test('map server never accepts client card roll inputs', async () => {
  const source = await readFile(new URL('../../server/server.js', import.meta.url), 'utf8');
  const bossHitStart = source.indexOf("socket.on('boss_hit'");
  const bossHitEnd = source.indexOf('// --- VENDING STALLS ---', bossHitStart);
  const handler = source.slice(bossHitStart, bossHitEnd);
  for (const field of ['chance', 'cardId', 'cardState', 'stars', 'pity', 'rarity']) {
    assert.doesNotMatch(handler, new RegExp(`payload\\.${field}\\b`));
  }
});
