import { getCardsBySource } from './CardCatalog.js';
import { normalizeCardState } from './CardProgression.js';

const DEFAULT_CARD_STATE = Object.freeze({ owned: 0, stars: 1, pity: 0 });

export function resolveCardDrops(input = {}) {
  const source = input.source || {};
  const cardState = normalizeCardState(input.cardState);
  const drops = [];
  const rolls = [];

  if (input.eligible === false) return { drops, cardState, rolls };

  if (typeof input.random !== 'function') {
    throw new TypeError('resolveCardDrops requires an injected random function');
  }

  const mvpMultiplier = input.isMvp ? 2 : 1;
  const dropRatePct = Math.max(0, Number(input.dropRatePct) || 0);
  const random = input.random;

  for (const card of getCardsBySource(source.kind, source.id)) {
    const entry = cardState[card.id] || DEFAULT_CARD_STATE;
    const chance = Math.min(
      card.source.chance * 2,
      card.source.chance * mvpMultiplier * (1 + dropRatePct),
    );
    const guaranteed = entry.pity + 1 >= card.source.pity;
    const won = guaranteed || random() < chance;

    cardState[card.id] = won
      ? { ...entry, owned: entry.owned + 1, pity: 0 }
      : { ...entry, pity: entry.pity + 1 };
    if (won) drops.push(card.id);
    rolls.push({ cardId: card.id, chance, guaranteed, won });
  }

  return { drops, cardState, rolls };
}
