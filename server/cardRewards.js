import { resolveCardDrops } from '../src/cards/CardDrops.js';
import { getCardsBySource } from '../src/cards/CardCatalog.js';

export const WORLD_BOSSES = Object.freeze([
  Object.freeze({ id: 'valdris', name: 'Valdris จอมมารเพลิง' }),
  Object.freeze({ id: 'ignarok', name: 'Ignarok ราชันมังกร' }),
  Object.freeze({ id: 'abyss_golem', name: 'Golem แห่งหุบเหวลึก' }),
  Object.freeze({ id: 'morgath', name: 'Morgath ผู้กลืนวิญญาณ' }),
  Object.freeze({ id: 'kaltharu', name: 'Kaltharu อสูรน้ำแข็ง' }),
  Object.freeze({ id: 'zulgaroth', name: "Zul'garoth เทพสังหาร" }),
]);

export function minimumContribution(maxHp) {
  return Math.max(1, Math.ceil(Math.max(0, Number(maxHp) || 0) * 0.01));
}

export function buildBossCardRewards({ bossId, maxHp, ranking = [] } = {}) {
  const minimum = minimumContribution(maxHp);
  let mvpIndex = -1;
  let mvpDamage = -1;
  ranking.forEach((row, index) => {
    const damage = Number(row.dmg) || 0;
    if (damage >= minimum && damage > mvpDamage) {
      mvpIndex = index;
      mvpDamage = damage;
    }
  });
  return ranking.map((row, index) => {
    const eligible = (Number(row.dmg) || 0) >= minimum;
    return {
      userId: row.userId,
      characterId: row.characterId || null,
      bossId,
      eligible,
      isMvp: index === mvpIndex && eligible,
    };
  });
}

export function buildBossRanking(damage = new Map()) {
  const entries = [...damage.entries()]
    .map(([userId, value]) => ({
      userId,
      characterId: value.characterId,
      name: value.name,
      dmg: Math.round(value.dmg),
    }))
    .filter(entry => entry.dmg > 0)
    .sort((left, right) => right.dmg - left.dmg);

  return entries.map((entry, index) => {
    const rank = index + 1;
    let gold = 400 + Math.floor(entry.dmg / 8);
    let exp = 150 + Math.floor(entry.dmg / 12);
    let item = null;
    if (rank === 1) {
      gold += 3000;
      exp += 1800;
      item = 'Dragon Heart';
    } else if (rank === 2) {
      gold += 1800;
      exp += 1100;
      item = 'Mythril Shard';
    } else if (rank === 3) {
      gold += 1100;
      exp += 700;
      item = 'Mythril Shard';
    } else if (rank <= 10) {
      gold += 500;
      exp += 300;
    }
    return { rank, ...entry, gold, exp, item };
  });
}

export function applyBossContribution({ boss, player, damage } = {}) {
  const amount = Number(damage);
  if (
    !boss?.active
    || !boss.damage?.get
    || !player?.userId
    || !player.characterId
    || !Number.isFinite(amount)
    || amount <= 0
  ) {
    return { accepted: false, defeated: false };
  }

  const existing = boss.damage.get(player.userId);
  if (existing && existing.characterId !== player.characterId) {
    return { accepted: false, defeated: false };
  }

  const contribution = existing || {
    name: player.username,
    characterId: player.characterId,
    dmg: 0,
  };
  contribution.name = player.username;
  contribution.dmg += amount;
  boss.damage.set(player.userId, contribution);
  boss.hp = Math.max(0, (Number(boss.hp) || 0) - amount);

  return { accepted: true, defeated: boss.hp <= 0 };
}

async function loadCardRow(supabase, characterId, cardId) {
  const { data, error } = await supabase
    .from('character_cards')
    .select('owned, stars, pity')
    .eq('character_id', characterId)
    .eq('card_id', cardId)
    .maybeSingle();
  if (error) throw error;
  return data || { owned: 0, stars: 1, pity: 0 };
}

/**
 * Resolve, persist, then privately emit world-boss card rewards.
 *
 * Every value that affects the roll comes from server-owned state or the card
 * catalog. The only recipients considered are verified online player records
 * whose active character was ownership-checked during join.
 */
export async function awardBossCardRewards({
  supabase,
  io,
  userSocketMap,
  onlinePlayers,
  boss,
  maxHp,
  ranking = [],
  rewardId,
  random = Math.random,
  logger = console,
} = {}) {
  const outcomes = {
    eligible: 0,
    persisted: 0,
    emitted: 0,
    failed: 0,
    skipped: 0,
  };
  if (!supabase || !io || !boss?.id || !rewardId) return outcomes;

  const card = getCardsBySource('world_boss', boss.id)[0];
  if (!card) return outcomes;

  const rewards = buildBossCardRewards({ bossId: boss.id, maxHp, ranking });
  outcomes.eligible = rewards.filter(reward => reward.eligible).length;

  for (const reward of rewards) {
    if (!reward.eligible) {
      outcomes.skipped++;
      continue;
    }

    if (!reward.characterId) {
      outcomes.skipped++;
      continue;
    }

    try {
      const current = await loadCardRow(supabase, reward.characterId, card.id);
      const resolved = resolveCardDrops({
        source: { kind: 'world_boss', id: boss.id },
        cardState: { [card.id]: current },
        eligible: true,
        isMvp: reward.isMvp,
        dropRatePct: 0,
        random,
      });
      const roll = resolved.rolls.find(entry => entry.cardId === card.id);
      if (!roll) {
        outcomes.skipped++;
        continue;
      }

      const next = resolved.cardState[card.id];
      const { data, error } = await supabase.rpc('award_card_drop', {
        p_character_id: reward.characterId,
        p_card_id: card.id,
        p_expected_pity: current.pity,
        p_new_pity: next.pity,
        p_won: roll.won,
        p_idempotency_key: `world_boss:${rewardId}:${reward.userId}:${card.id}`,
      });
      if (error) throw error;

      const persisted = Array.isArray(data) ? data[0] : data;
      if (!persisted) throw new Error('award_card_drop returned no persisted state');
      if (persisted.card_id !== card.id) {
        throw new Error('award_card_drop returned a different card');
      }
      outcomes.persisted++;

      if (persisted.won) {
        const socketId = userSocketMap?.get(reward.userId);
        const player = socketId ? onlinePlayers?.get(socketId) : null;
        if (
          !player?.verified
          || player.userId !== reward.userId
          || player.characterId !== reward.characterId
          || player.socketId !== socketId
        ) {
          continue;
        }
        io.to(socketId).emit('card_reward', {
          cardId: card.id,
          owned: Number(persisted.owned) || 0,
          stars: Number(persisted.stars) || 1,
          pity: Number(persisted.pity) || 0,
          source: {
            kind: 'world_boss',
            id: boss.id,
            label: card.source.label,
          },
          isNew: persisted.is_new === true,
        });
        outcomes.emitted++;
      }
    } catch (error) {
      outcomes.failed++;
      logger.error(
        `[Server] Card reward persistence failed for ${reward.userId}/${card.id}:`,
        error?.message || error,
      );
    }
  }

  return outcomes;
}
