import { CARD_CATALOG, getCard } from './CardCatalog.js';

function normalizeRow(payload) {
  const card = getCard(payload?.cardId || payload?.card_id);
  const owned = Number(payload?.owned);
  const stars = Number(payload?.stars);
  const pity = Number(payload?.pity);
  if (
    !card
    || !Number.isInteger(owned) || owned < 0
    || !Number.isInteger(stars) || stars < 1 || stars > 5
    || !Number.isInteger(pity) || pity < 0
  ) {
    return null;
  }
  return { card, state: { owned, stars, pity } };
}

function mergeRow(payload, { character, gameUI }) {
  const normalized = normalizeRow(payload);
  if (!normalized || !character) return null;
  const { card, state } = normalized;
  character.cardState ??= {};
  character.cardState[card.id] = state;

  if (gameUI) {
    gameUI.inventory ??= [];
    const itemIndex = gameUI.inventory.findIndex(entry => getCard(entry.item_name)?.id === card.id);
    if (state.owned === 0) {
      if (itemIndex >= 0) gameUI.inventory.splice(itemIndex, 1);
    } else {
      let item = itemIndex >= 0 ? gameUI.inventory[itemIndex] : null;
      if (!item) {
        item = {
          item_name: card.itemName,
          item_type: 'card',
          quantity: state.owned,
          stats: {},
        };
        gameUI.inventory.push(item);
      }
      item.quantity = state.owned;
      item.stats ??= {};
      item.stats.card_id = card.id;
      item.stats.card_stars = state.stars;
    }
  }
  return card;
}

export function mergeAuthoritativeCardRows(rows, { character, gameUI } = {}) {
  const authoritativeIds = new Set(
    (rows || []).map(row => getCard(row?.card_id)?.id).filter(Boolean),
  );
  let changed = false;
  for (const card of CARD_CATALOG) {
    if (card.source.kind !== 'world_boss' || authoritativeIds.has(card.id)) continue;
    if (character?.cardState?.[card.id]) {
      delete character.cardState[card.id];
      changed = true;
    }
    if (gameUI?.inventory) {
      const before = gameUI.inventory.length;
      gameUI.inventory = gameUI.inventory.filter(
        item => getCard(item.item_name)?.id !== card.id,
      );
      changed ||= gameUI.inventory.length !== before;
    }
  }

  let merged = 0;
  for (const row of rows || []) {
    if (mergeRow(row, { character, gameUI })) merged++;
  }
  if (merged > 0 || changed) {
    gameUI?._renderInventory?.();
    gameUI?.refreshCardAlbum?.();
  }
  return merged;
}

export async function loadAndMergeAuthoritativeCards(
  loadRows,
  { character, gameUI, logger = console } = {},
) {
  try {
    const rows = await loadRows();
    if (!Array.isArray(rows)) return false;
    mergeAuthoritativeCardRows(rows, { character, gameUI });
    return true;
  } catch (error) {
    logger.warn?.(
      '[Zolos] Failed to load authoritative card state; preserving local state:',
      error?.message || error,
    );
    return false;
  }
}

export function applyTrustedCardReward(payload, { character, gameUI } = {}) {
  const card = mergeRow(payload, { character, gameUI });
  if (!card) return false;

  gameUI?._renderInventory?.();
  gameUI?.refreshCardAlbum?.();

  const reveal = {
    sourceLabel: payload.source?.label || card.source.label,
    isNew: payload.isNew === true,
  };
  if (typeof gameUI?.showCardDropReveal === 'function') {
    gameUI.showCardDropReveal(card.id, reveal);
  } else if (gameUI) {
    gameUI.cardDropRevealQueue ??= [];
    gameUI.cardDropRevealQueue.push({ cardId: card.id, ...reveal });
  }
  return true;
}
