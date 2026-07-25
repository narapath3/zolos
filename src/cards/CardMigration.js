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

const ALL_SLOTS = ['weapon', 'shield', 'hat', 'glasses', 'head', 'body', 'garment', 'ring', 'wrist', 'pants', 'feet', 'accessory'];

function canonicalizeSockets(cards) {
  const result = {};
  for (const slot of ALL_SLOTS) {
    result[slot] = [null, null, null, null, null];
  }
  const claimedCardIds = new Set();
  for (const [slot, value] of Object.entries(cards || {})) {
    if (!value) continue;
    const arr = Array.isArray(value) ? value : [value];
    const normalized = [null, null, null, null, null];
    for (let i = 0; i < Math.min(5, arr.length); i++) {
      const val = arr[i];
      if (!val) continue;
      const card = getCard(val);
      if (card && claimedCardIds.has(card.id)) {
        continue;
      }
      normalized[i] = card?.id || val;
      if (card) claimedCardIds.add(card.id);
    }
    result[slot] = normalized;
  }
  return result;
}

function isSocketed(equippedCards, cardId) {
  for (const value of Object.values(equippedCards)) {
    if (Array.isArray(value)) {
      if (value.includes(cardId)) return true;
    } else if (value === cardId) {
      return true;
    }
  }
  return false;
}

export function migrateLegacyCards(inventory = [], cards = {}) {
  const canonicalRows = new Map();
  const normalizedInventory = [];
  const cardState = {};
  const equippedCards = canonicalizeSockets(cards);
  const equipmentRows = [];

  for (const row of Array.isArray(inventory) ? inventory : []) {
    const card = row?.item_type === 'card' && (getCard(row.item_name) || getCard(row.stats?.card_id));
    if (!card) {
      normalizedInventory.push(row);
      if (['weapon', 'shield', 'armor', 'hat', 'glasses', 'head', 'body', 'garment', 'ring', 'wrist', 'pants', 'feet', 'accessory'].includes(row?.item_type)) {
        equipmentRows.push(row);
      }
      continue;
    }

    const quantity = quantityOf(row);
    const stats = cardStats(row, card);
    const socketSlot = stats.slot || stats.equippedSlot;
    if (socketSlot && (stats.equipped === true || stats.equippedSlot)) {
      const slotArray = equippedCards[socketSlot];
      if (slotArray && slotArray.indexOf(card.id) === -1 && !isSocketed(equippedCards, card.id)) {
        const emptyIdx = slotArray.indexOf(null);
        if (emptyIdx !== -1) {
          slotArray[emptyIdx] = card.id;
        }
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

  // RECOVERY: If an equipment item has a stats.cards array (from the detail-box flow),
  // ensure those cards are marked as equipped in the canonical equippedCards map.
  for (const eq of equipmentRows) {
    if (eq.stats && eq.stats.equipped && Array.isArray(eq.stats.cards)) {
      const slot = eq.stats.slot || eq.stats.equippedSlot;
      if (slot && equippedCards[slot]) {
        eq.stats.cards.forEach((cardName, idx) => {
          const card = getCard(cardName);
          if (card && !isSocketed(equippedCards, card.id)) {
            const slotArray = equippedCards[slot];
            if (slotArray[idx] === null) {
              slotArray[idx] = card.id;
            } else {
              const emptyIdx = slotArray.indexOf(null);
              if (emptyIdx !== -1) slotArray[emptyIdx] = card.id;
            }
          }
        });
      }
    }
  }

  const socketSlotsByCardId = new Map();
  for (const [slot, value] of Object.entries(equippedCards)) {
    if (Array.isArray(value)) {
      for (const id of value) {
        if (id) {
          const card = getCard(id);
          if (card && !socketSlotsByCardId.has(card.id)) socketSlotsByCardId.set(card.id, slot);
        }
      }
    } else if (value) {
      const card = getCard(value);
      if (card && !socketSlotsByCardId.has(card.id)) socketSlotsByCardId.set(card.id, slot);
    }
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
