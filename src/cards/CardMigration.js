import { getCard } from './CardCatalog.js';
import { normalizeCardState } from './CardProgression.js';

function quantityOf(row) {
  return Math.max(0, Math.floor(Number(row?.quantity) || 0));
}

function cardStats(row, card) {
  const stats = { ...(row.stats || {}) };
  stats.card_id = card.id;
  stats.card_stars = Math.min(5, Math.max(1, Math.floor(Number(stats.card_stars) || 1)));
  return stats;
}

function canonicalizeSockets(cards) {
  const result = {};
  const claimedCardIds = new Set();
  for (const [slot, value] of Object.entries(cards || {})) {
    if (!value) {
      result[slot] = null;
      continue;
    }
    const card = getCard(value);
    if (card && claimedCardIds.has(card.id)) {
      result[slot] = null;
      continue;
    }
    result[slot] = card?.id || value;
    if (card) claimedCardIds.add(card.id);
  }
  return result;
}

function isSocketed(equippedCards, cardId) {
  return Object.values(equippedCards).includes(cardId);
}

export function migrateLegacyCards(inventory = [], cards = {}) {
  const canonicalRows = new Map();
  const normalizedInventory = [];
  const cardState = {};
  const equippedCards = canonicalizeSockets(cards);

  for (const row of Array.isArray(inventory) ? inventory : []) {
    const card = row?.item_type === 'card' && (getCard(row.item_name) || getCard(row.stats?.card_id));
    if (!card) {
      normalizedInventory.push(row);
      continue;
    }

    const quantity = quantityOf(row);
    const stats = cardStats(row, card);
    const socketSlot = stats.slot || stats.equippedSlot;
    if (socketSlot && (stats.equipped === true || stats.equippedSlot)) {
      if (!equippedCards[socketSlot] && !isSocketed(equippedCards, card.id)) {
        equippedCards[socketSlot] = card.id;
      }
    }
    const existing = canonicalRows.get(card.id);
    if (existing) {
      existing.quantity += quantity;
      for (const [key, value] of Object.entries(stats)) {
        if (existing.stats[key] === undefined) existing.stats[key] = value;
      }
      existing.stats.card_stars = Math.max(existing.stats.card_stars, stats.card_stars);
      continue;
    }

    const normalized = {
      ...row,
      item_name: card.itemName,
      item_type: 'card',
      quantity,
      stats,
    };
    canonicalRows.set(card.id, normalized);
    normalizedInventory.push(normalized);
  }

  const socketSlotsByCardId = new Map();
  for (const [slot, id] of Object.entries(equippedCards)) {
    const card = getCard(id);
    if (card && !socketSlotsByCardId.has(card.id)) socketSlotsByCardId.set(card.id, slot);
  }

  for (const [id, row] of canonicalRows) {
    const socketSlot = socketSlotsByCardId.get(id);
    if (socketSlot) {
      row.stats.equipped = true;
      row.stats.slot = socketSlot;
      if (row.stats.equippedSlot !== undefined) row.stats.equippedSlot = socketSlot;
    } else {
      row.stats.equipped = false;
      delete row.stats.slot;
      delete row.stats.equippedSlot;
    }
  }

  for (const [id, row] of canonicalRows) {
    cardState[id] = {
      owned: row.quantity,
      stars: row.stats.card_stars,
      pity: Math.max(0, Math.floor(Number(row.stats.card_pity) || 0)),
    };
  }

  return {
    inventory: normalizedInventory,
    cardState: normalizeCardState(cardState),
    equippedCards,
    migrated: true,
  };
}
