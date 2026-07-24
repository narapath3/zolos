export const FUSION_COSTS = Object.freeze([0, 1, 2, 3, 5]);
export const STAR_MULTIPLIERS = Object.freeze([0, 1, 1.08, 1.18, 1.30, 1.45]);

export function normalizeCardState(raw = {}) {
  const result = {};
  for (const [id, value] of Object.entries(raw || {})) {
    result[id] = {
      owned: Math.max(0, Math.floor(Number(value?.owned) || 0)),
      stars: Math.min(5, Math.max(1, Math.floor(Number(value?.stars) || 1))),
      pity: Math.max(0, Math.floor(Number(value?.pity) || 0)),
    };
  }
  return result;
}

export function starMultiplier(stars) {
  return STAR_MULTIPLIERS[Math.min(5, Math.max(1, Math.floor(stars) || 1))];
}

export function previewFusion(state, id) {
  const entry = normalizeCardState(state)[id] || { owned: 0, stars: 1, pity: 0 };
  const cost = entry.stars >= 5 ? 0 : FUSION_COSTS[entry.stars];
  return {
    cardId: id,
    fromStars: entry.stars,
    toStars: Math.min(5, entry.stars + 1),
    cost,
    canFuse: cost > 0 && entry.owned - 1 >= cost,
  };
}

export function fuseCard(state, id) {
  const next = normalizeCardState(state);
  const preview = previewFusion(next, id);
  if (preview.fromStars >= 5) throw new Error('Card is already at maximum star level');
  if (!preview.canFuse) throw new Error('Not enough duplicate cards');
  next[id] = {
    ...next[id],
    stars: preview.toStars,
    owned: next[id].owned - preview.cost,
  };
  return next;
}
