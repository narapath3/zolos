import { CARD_CATALOG, RARITY_META } from '../cards/CardCatalog.js';
import {
  normalizeCardState,
  previewFusion,
  starMultiplier,
} from '../cards/CardProgression.js';

const RARITY_ORDER = Object.freeze(['common', 'rare', 'epic', 'legendary', 'mythic']);
const PERCENT_FIELDS = new Set([
  'damagePct', 'critBonus', 'lifestealPct', 'damageReduction',
  'executePct', 'bossDamagePct', 'dropRatePct', 'value',
]);
const STAT_LABELS = Object.freeze({
  atkBonus: 'Attack',
  defBonus: 'Defense',
  hpBonus: 'Health',
  spBonus: 'Spirit',
  damagePct: 'Damage',
  critBonus: 'Critical chance',
  lifestealPct: 'Life steal',
  damageReduction: 'Damage reduction',
  executePct: 'Execute threshold',
  bossDamagePct: 'Boss damage',
  dropRatePct: 'Drop rate',
});
const SOURCE_LABELS = Object.freeze({
  monster: 'Monster',
  mapBoss: 'Map boss',
  world_boss: 'World boss',
  event: 'Event',
});
let albumSequence = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    useGrouping: false,
  }).format(value);
}

function formatPercent(value) {
  return `${formatNumber(Number(value) * 100, 4)}%`;
}

function collectionOrder(card) {
  const rarity = RARITY_ORDER.indexOf(card.rarity);
  const number = Number.parseInt(String(card.collectionNo).split('-').at(-1), 10) || 0;
  return (rarity < 0 ? 99 : rarity) * 100 + number;
}

function isEventSecret(card, state) {
  return card.source.kind === 'event' && state.owned < 1;
}

function scaledRows(card, stars) {
  const multiplier = starMultiplier(stars);
  const rows = [];
  for (const [field, base] of Object.entries(card.stats || {})) {
    if (!Number.isFinite(Number(base))) continue;
    const value = Number(base) * multiplier;
    rows.push({
      label: STAT_LABELS[field] || field,
      value: PERCENT_FIELDS.has(field) || /Pct$/.test(field)
        ? formatPercent(value)
        : formatNumber(value),
    });
  }

  const effect = card.effect;
  if (!effect) return rows;
  if (effect.type === 'damageToFamily') {
    rows.push({
      label: `Damage to ${effect.family}`,
      value: formatPercent(Number(effect.value) * multiplier),
    });
  } else if (effect.type === 'onKillRestore') {
    if (effect.hp) rows.push({ label: 'Health on defeat', value: formatNumber(effect.hp * multiplier) });
    if (effect.sp) rows.push({ label: 'Spirit on defeat', value: formatNumber(effect.sp * multiplier) });
  } else if (effect.type === 'lowHpPower') {
    rows.push({
      label: `Power below ${formatPercent(effect.threshold)} health`,
      value: formatPercent(Number(effect.value) * multiplier),
    });
  } else if (Number.isFinite(Number(effect.value))) {
    rows.push({
      label: STAT_LABELS[effect.type] || effect.type,
      value: PERCENT_FIELDS.has(effect.type) ? formatPercent(Number(effect.value) * multiplier) : formatNumber(Number(effect.value) * multiplier),
    });
  }
  return rows;
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]), select:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

export class CardAlbum {
  constructor(options = {}) {
    this.options = options;
    this.catalog = [...(options.catalog || CARD_CATALOG)].sort((a, b) => collectionOrder(a) - collectionOrder(b));
    this.filters = { rarity: 'all', slot: 'all', ownership: 'all', source: 'all' };
    this.selectedCardId = this.catalog[0]?.id || null;
    this.element = null;
    this.destroyed = false;
    this.dropQueue = [];
    this.revealActive = false;
    this.instanceId = `card-album-${++albumSequence}`;
    this._lastFocus = null;
    this._revealOverlay = null;
  }

  mount(element) {
    if (!element) throw new Error('CardAlbum.mount requires a host element');
    this.element = element;
    this.element.classList.add('card-album-host');
    this.render();
    return this;
  }

  _isDialogOpen() {
    const detail = this.element?.querySelector('.card-detail');
    const fusion = this.element?.querySelector('.card-fusion');
    return !!((detail && (detail.open || detail.hasAttribute('open'))) || (fusion && (fusion.open || fusion.hasAttribute('open'))));
  }

  render() {
    if (!this.element || this.destroyed) return;
    if (this._isDialogOpen()) return;
    const state = this._cardState();
    const ownedCount = this.catalog.filter(card => (state[card.id]?.owned || 0) > 0).length;
    const cards = this.catalog.filter(card => this._matchesFilters(card, state[card.id]));
    const rarityOptions = RARITY_ORDER.map(rarity => (
      `<option value="${rarity}"${this.filters.rarity === rarity ? ' selected' : ''}>${escapeHtml(RARITY_META[rarity]?.label || rarity)}</option>`
    )).join('');
    const slotOptions = [...new Set(this.catalog.map(card => card.slot))].map(slot => (
      `<option value="${slot}"${this.filters.slot === slot ? ' selected' : ''}>${escapeHtml(this._titleCase(slot))}</option>`
    )).join('');
    const sourceOptions = [...new Set(this.catalog.map(card => card.source.kind))].map(source => (
      `<option value="${source}"${this.filters.source === source ? ' selected' : ''}>${escapeHtml(SOURCE_LABELS[source] || this._titleCase(source))}</option>`
    )).join('');

    this.element.innerHTML = `
      <section class="card-album" aria-labelledby="${this.instanceId}-title">
        <header class="card-album__header">
          <div>
            <p class="card-album__eyebrow">CELESTIAL ARCHIVE</p>
            <h2 id="${this.instanceId}-title">Card Album</h2>
            <p class="card-album__subtitle">Hunt, discover, and refine every foil in the constellation.</p>
          </div>
          <div class="card-album__progress" aria-live="polite">
            <strong>${ownedCount}<span aria-hidden="true"> / </span><span class="sr-only"> of </span>${this.catalog.length}</strong>
            <span>unique cards discovered</span>
            <meter min="0" max="${this.catalog.length}" value="${ownedCount}">${ownedCount} of ${this.catalog.length}</meter>
            <span class="card-album__stardust" title="ผงดาว — ได้จากการถลุงการ์ดซ้ำ ใช้เติมตอนหลอมการ์ด">✦ ${this._stardust().toLocaleString()} ผงดาว</span>
          </div>
        </header>

        <div class="card-album__filters" aria-label="Filter card collection">
          <label>Rarity
            <select name="rarity">
              <option value="all"${this.filters.rarity === 'all' ? ' selected' : ''}>All rarities</option>
              ${rarityOptions}
            </select>
          </label>
          <label>Socket
            <select name="slot">
              <option value="all"${this.filters.slot === 'all' ? ' selected' : ''}>All sockets</option>
              ${slotOptions}
            </select>
          </label>
          <label>Ownership
            <select name="ownership">
              <option value="all"${this.filters.ownership === 'all' ? ' selected' : ''}>Owned + undiscovered</option>
              <option value="owned"${this.filters.ownership === 'owned' ? ' selected' : ''}>Owned</option>
              <option value="locked"${this.filters.ownership === 'locked' ? ' selected' : ''}>Undiscovered</option>
            </select>
          </label>
          <label>Source
            <select name="source">
              <option value="all"${this.filters.source === 'all' ? ' selected' : ''}>All sources</option>
              ${sourceOptions}
            </select>
          </label>
        </div>

        <p class="card-album__result" aria-live="polite">
          Showing ${cards.length} of ${this.catalog.length} cards
        </p>
        <div class="card-album__grid" role="list">
          ${cards.length ? cards.map(card => this._cardTile(card, state[card.id])).join('') : `
            <p class="card-album__empty">No cards match these filters.</p>
          `}
        </div>
      </section>
      ${this._detailDialog()}
      ${this._fusionDialog()}
    `;

    this._bindAlbumEvents();
  }

  async showDropReveal(cardId, context = {}) {
    if (this.destroyed) return false;
    return new Promise(resolve => {
      this.dropQueue.push({ cardId, context, resolve });
      this._drainDropQueue();
    });
  }

  destroy() {
    this.destroyed = true;
    this.dropQueue.splice(0).forEach(item => item.resolve(false));
    if (this._revealOverlay) this._revealOverlay.remove();
    this._revealOverlay = null;
    this.revealActive = false;
    if (this.element) {
      this.element.classList.remove('card-album-host');
      this.element.replaceChildren();
    }
    this.element = null;
  }

  _cardState() {
    const raw = typeof this.options.cardState === 'function'
      ? this.options.cardState()
      : this.options.cardState;
    return normalizeCardState(raw || {});
  }

  _equippedSlots() {
    return (typeof this.options.equippedSlots === 'function'
      ? this.options.equippedSlots()
      : this.options.equippedSlots) || {};
  }

  _stardust() {
    const v = typeof this.options.stardust === 'function' ? this.options.stardust() : this.options.stardust;
    return Math.max(0, Math.floor(Number(v) || 0));
  }

  // rarity -> { refine_dust, dust_per_dupe }; empty until the server pushes rates.
  _economyFor(rarity) {
    const econ = (typeof this.options.cardEconomy === 'function' ? this.options.cardEconomy() : this.options.cardEconomy) || {};
    return econ[rarity] || { refine_dust: 0, dust_per_dupe: 0 };
  }

  _matchesFilters(card, rawState) {
    const state = rawState || { owned: 0 };
    if (this.filters.rarity !== 'all' && card.rarity !== this.filters.rarity) return false;
    if (this.filters.slot !== 'all' && card.slot !== this.filters.slot) return false;
    if (this.filters.source !== 'all' && card.source.kind !== this.filters.source) return false;
    if (this.filters.ownership === 'owned' && state.owned < 1) return false;
    if (this.filters.ownership === 'locked' && state.owned > 0) return false;
    return true;
  }

  _cardTile(card, rawState) {
    const state = rawState || { owned: 0, stars: 1, pity: 0 };
    const owned = state.owned > 0;
    const secret = isEventSecret(card, state);
    const displayName = secret ? 'Secret Card' : card.displayName;
    const sourceHint = secret ? 'Limited celestial signal' : card.source.label;
    const stars = Math.max(1, state.stars || 1);
    return `
      <button
        type="button"
        role="listitem"
        class="card-tile card-tile--${escapeHtml(card.rarity)}${owned ? '' : ' card-tile--locked'}${secret ? ' card-tile--secret' : ''}${stars === 5 ? ' card-tile--five-star' : ''}"
        data-card-id="${escapeHtml(card.id)}"
        aria-pressed="${this.selectedCardId === card.id ? 'true' : 'false'}"
        aria-label="${escapeHtml(owned ? `${card.displayName}, ${card.rarity}, ${stars} stars, owned ${state.owned}` : `${displayName}, undiscovered, source ${sourceHint}`)}"
      >
        <span class="card-tile__foil" aria-hidden="true"></span>
        <span class="card-tile__constellation" aria-hidden="true"></span>
        <span class="card-tile__frame">
          <span class="card-tile__topline">
            <span class="card-tile__number">${secret ? '??-??' : escapeHtml(card.collectionNo)}</span>
            <span class="card-tile__rarity">${escapeHtml(RARITY_META[card.rarity]?.label || card.rarity)}</span>
          </span>
          <span class="card-tile__name">${escapeHtml(displayName)}</span>
          ${this._artWindow(card, { owned, secret, tile: true })}
          <span class="card-tile__ability">${escapeHtml(secret ? 'Undiscovered celestial imprint' : card.abilityName)}</span>
          <span class="card-tile__source">${escapeHtml(sourceHint)}</span>
          <span class="card-tile__footer">
            <span>${owned ? `${state.owned} owned` : 'Silhouette'}</span>
            <span class="card-tile__stars" aria-label="${stars} of 5 stars">${owned ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : 'LOCKED'}</span>
          </span>
          ${card.rarity === 'mythic' && stars === 5 ? '<span class="card-tile__crown" aria-label="Five-star crown">V</span>' : ''}
        </span>
      </button>
    `;
  }

  _artWindow(card, { owned, secret, tile = false } = {}) {
    const visible = owned && !secret;
    const modifier = tile ? 'card-art--tile' : 'card-art--detail';
    if (secret) {
      return `<span class="card-art ${modifier} card-art--silhouette card-art--secret" aria-hidden="true"><span class="card-art__figure"></span></span>`;
    }
    return `
      <span class="card-art ${modifier}${visible ? '' : ' card-art--silhouette'}">
        <img
          class="card-art__image${visible ? '' : ' card-art__image--concealed'}"
          src="${escapeHtml(card.art)}"
          alt="${visible ? escapeHtml(`${card.displayName} card artwork`) : ''}"
          ${tile ? 'loading="lazy" decoding="async"' : 'decoding="async"'}
        >
        <span class="card-art__figure" aria-hidden="true"></span>
      </span>
    `;
  }

  _detailDialog() {
    return `
      <dialog class="card-detail" aria-labelledby="${this.instanceId}-detail-title">
        <div class="card-detail__surface">
          <button type="button" class="card-detail__close" aria-label="Close card details">×</button>
          <div class="card-detail__content"></div>
        </div>
      </dialog>
    `;
  }

  _fusionDialog() {
    return `
      <dialog class="card-fusion" aria-labelledby="${this.instanceId}-fusion-title">
        <div class="card-fusion__surface">
          <div class="card-fusion__content"></div>
        </div>
      </dialog>
    `;
  }

  _renderDetail(card) {
    const dialog = this.element.querySelector('.card-detail');
    const content = dialog?.querySelector('.card-detail__content');
    if (!dialog || !content) return;
    const state = this._cardState()[card.id] || { owned: 0, stars: 1, pity: 0 };
    const owned = state.owned > 0;
    const secret = isEventSecret(card, state);
    const stars = Math.max(1, state.stars || 1);
    const nextStars = Math.min(5, stars + 1);
    const currentRows = scaledRows(card, stars);
    const nextRows = scaledRows(card, nextStars);
    const fusion = previewFusion(this._cardState(), card.id);
    const duplicates = Math.max(0, state.owned - 1);
    const equippedSlots = this._equippedSlots();
    const currentSlot = Object.entries(equippedSlots).find(([, cardId]) => cardId === card.id)?.[0] || '';
    const slots = this._socketSlots(card);
    const defaultSlot = currentSlot || slots[0]?.id || '';

    // Stardust economy for this card's rarity.
    const econ = this._economyFor(card.rarity);
    const stardust = this._stardust();
    const missing = Math.max(0, (fusion.cost || 0) - duplicates);            // dupes short of the cost
    const dustPerDupe = econ.dust_per_dupe || 0;
    const dustNeeded = missing * dustPerDupe;                                 // stardust to cover the shortfall
    const canDustFuse = stars < 5 && !fusion.canFuse && missing > 0 && dustPerDupe > 0 && stardust >= dustNeeded;
    const refineGain = econ.refine_dust || 0;

    content.innerHTML = `
      <div class="card-detail__hero card-detail__hero--${escapeHtml(card.rarity)}">
        ${this._artWindow(card, { owned, secret })}
        <div>
          <p class="card-detail__number">${secret ? 'UNKNOWN IMPRINT' : escapeHtml(card.collectionNo)}</p>
          <h3 id="${this.instanceId}-detail-title">${escapeHtml(secret ? 'Secret Card' : card.displayName)}</h3>
          <p class="card-detail__rarity">${escapeHtml(RARITY_META[card.rarity]?.label || card.rarity)} · ${escapeHtml(this._titleCase(card.slot))} socket</p>
          <div class="card-detail__stars" aria-label="${stars} of 5 stars">
            ${owned ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : 'Undiscovered'}
          </div>
        </div>
      </div>

      ${secret ? `
        <section class="card-detail__secret">
          <h4>Celestial signal concealed</h4>
          <p>Discover this event card to reveal its art, source, ability, and lore.</p>
        </section>
      ` : `
        <section class="card-detail__ability">
          <p>ABILITY</p>
          <h4>${escapeHtml(card.abilityName)}</h4>
          <blockquote>${escapeHtml(card.lore)}</blockquote>
        </section>

        <div class="card-detail__facts">
          <section class="card-detail__source">
            <span>Exact source chance</span>
            <strong>${formatPercent(card.source.chance)}</strong>
            <small>${escapeHtml(card.source.label)}</small>
          </section>
          <section class="card-detail__pity">
            <span>Per-card pity</span>
            <strong>${state.pity} / ${card.source.pity}</strong>
            <small>${Math.max(0, card.source.pity - state.pity)} eligible attempts to guarantee</small>
          </section>
          <section>
            <span>Compatible socket</span>
            <strong>${escapeHtml(this._titleCase(card.slot))}</strong>
            <small>One copy can occupy one equipped slot.</small>
          </section>
        </div>

        <section class="card-detail__values">
          <div>
            <p>CURRENT · ${stars} STAR${stars === 1 ? '' : 'S'} · ×${formatNumber(starMultiplier(stars))}</p>
            ${this._valueRows(currentRows)}
          </div>
          <div class="${stars >= 5 ? 'card-detail__values-max' : ''}">
            <p>${stars >= 5 ? 'MAXIMUM REACHED' : `NEXT · ${nextStars} STARS · ×${formatNumber(starMultiplier(nextStars))}`}</p>
            ${this._valueRows(nextRows)}
          </div>
        </section>

        <section class="card-detail__socket">
          <label for="${this.instanceId}-socket">Socket destination</label>
          <div>
            <select id="${this.instanceId}-socket" ${owned ? '' : 'disabled'}>
              ${slots.map(slot => `<option value="${escapeHtml(slot.id)}"${slot.id === defaultSlot ? ' selected' : ''}>${escapeHtml(slot.label)}${equippedSlots[slot.id] && equippedSlots[slot.id] !== card.id ? ' · replace current card' : ''}</option>`).join('')}
            </select>
            <button type="button" class="card-detail__socket-action" data-card-id="${escapeHtml(card.id)}" ${owned && defaultSlot ? '' : 'disabled'}>
              ${currentSlot ? 'Remove from socket' : (equippedSlots[defaultSlot] ? 'Replace socketed card' : 'Socket card')}
            </button>
          </div>
        </section>

        <section class="card-fusion__summary">
          <div>
            <p>FUSION FORGE</p>
            <h4>${stars >= 5 ? 'ระดับดาวสูงสุด' : `${stars} → ${nextStars} ดาว`}</h4>
          </div>
          <div class="card-fusion__meter">
            <span>การ์ดซ้ำ ${duplicates} ใบ · ใช้ ${fusion.cost || 0} ใบในการอัปเกรด</span>
            <meter min="0" max="${Math.max(1, fusion.cost)}" value="${Math.min(duplicates, fusion.cost || 0)}">${duplicates} of ${fusion.cost}</meter>
          </div>
          <button type="button" class="card-fusion__open" data-card-id="${escapeHtml(card.id)}" ${fusion.canFuse ? '' : 'disabled'}>
            ${stars >= 5 ? 'หน้าการ์ดถึงระดับสูงสุดแล้ว' : fusion.canFuse ? `อัปเกรดโดยใช้การ์ดซ้ำ ${fusion.cost} ใบ` : `ต้องการการ์ดซ้ำอีก ${Math.max(0, fusion.cost - duplicates)} ใบ`}
          </button>
          ${(stars < 5 && !fusion.canFuse && missing > 0 && dustPerDupe > 0) ? `
          <button type="button" class="card-fusion__dust" data-card-id="${escapeHtml(card.id)}" ${canDustFuse ? '' : 'disabled'}>
            ✦ เติมผงดาวแทนการ์ดซ้ำ ${missing} ใบ (ใช้ ${dustNeeded.toLocaleString()} ผงดาว)${canDustFuse ? '' : ` · มี ${stardust.toLocaleString()}`}
          </button>` : ''}
        </section>

        ${(duplicates > 0 && refineGain > 0) ? `
        <section class="card-refine">
          <div class="card-refine__head">
            <p>ถลุงการ์ดซ้ำ → ผงดาว</p>
            <small>ได้ ${refineGain} ✦ ต่อ 1 ใบ · เก็บใบหลักไว้เสมอ</small>
          </div>
          <div class="card-refine__controls">
            <input type="number" class="card-refine__qty" min="1" max="${duplicates}" value="${duplicates}" aria-label="จำนวนการ์ดซ้ำที่จะถลุง">
            <button type="button" class="card-refine__go" data-card-id="${escapeHtml(card.id)}">ถลุง (สูงสุด ${duplicates})</button>
          </div>
        </section>
        ` : ''}

        ${this.options.onSell ? `
        <section class="card-detail__trade">
          <button type="button" class="card-detail__sell" data-card-id="${escapeHtml(card.id)}">
            💰 ตั้งขายให้ผู้เล่นอื่น
          </button>
          <p class="card-detail__trade-note">ซื้อขายกันได้เฉพาะในตลาดผู้เล่น · ขายให้ NPC ไม่ได้</p>
        </section>
        ` : ''}
      `}
      <p class="card-detail__status" aria-live="polite"></p>
    `;
    this._bindImageFallbacks(content);
    content.querySelector('.card-detail__socket-action')?.addEventListener('click', event => {
      this._handleSocket(card, event.currentTarget);
    });
    content.querySelector('.card-fusion__open')?.addEventListener('click', event => {
      this._openFusionConfirmation(card, event.currentTarget);
    });
    content.querySelector('.card-fusion__dust')?.addEventListener('click', event => {
      this._handleDustFusion(card, event.currentTarget);
    });
    content.querySelector('.card-refine__go')?.addEventListener('click', event => {
      const qty = Number(content.querySelector('.card-refine__qty')?.value) || 0;
      this._handleRefine(card, qty, event.currentTarget);
    });
    content.querySelector('.card-detail__sell')?.addEventListener('click', () => {
      // The detail is a modal <dialog> (showModal → top layer + backdrop).
      // It MUST be closed before opening the market panel, otherwise its
      // backdrop keeps swallowing every tap and the whole screen looks frozen.
      const dialog = this.element?.querySelector('.card-detail');
      this._closeDialog(dialog, false);
      this.options.onSell?.(card.id);
    });
  }

  _valueRows(rows) {
    if (!rows.length) return '<p class="card-detail__no-values">No numeric modifier</p>';
    return `<dl>${rows.map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl>`;
  }

  _socketSlots(card) {
    const supplied = typeof this.options.socketSlots === 'function'
      ? this.options.socketSlots()
      : this.options.socketSlots;
    const slots = Array.isArray(supplied) ? supplied : [{ id: card.slot, label: this._titleCase(card.slot), category: card.slot }];
    return slots.filter(slot => (slot.category || slot.slot || slot.id) === card.slot);
  }

  async _handleSocket(card, button) {
    const dialog = this.element.querySelector('.card-detail');
    const status = dialog.querySelector('.card-detail__status');
    const slotId = dialog.querySelector(`#${this.instanceId}-socket`)?.value;
    const equippedSlots = this._equippedSlots();
    if (!slotId || button.disabled) return;
    button.disabled = true;
    status.textContent = equippedSlots[slotId] === card.id ? 'Removing card…' : 'Updating socket…';
    try {
      if (equippedSlots[slotId] === card.id) {
        await this.options.onUnsocket?.(slotId, card.id);
      } else {
        await this.options.onSocket?.(card.id, slotId);
      }
      status.textContent = 'Socket updated.';
      this.render();
      this._openDetail(card.id, null, false);
    } catch (error) {
      button.disabled = false;
      status.textContent = error?.message || 'Could not update this socket.';
    }
  }

  // Dust-assisted fusion: not enough natural duplicates, so top up the shortfall
  // with Stardust. Server recomputes the real dupe/dust split; we just request.
  async _handleDustFusion(card, button) {
    const dialog = this.element.querySelector('.card-detail');
    const status = dialog?.querySelector('.card-detail__status');
    if (!button || button.disabled) return;
    button.disabled = true;
    if (status) status.textContent = 'กำลังหลอมโดยเติมผงดาว…';
    try {
      const result = await this.options.onFuseWithDust?.(card.id);
      if (result === false || result == null) throw new Error('การหลอมล้มเหลว');
      if (status) status.textContent = 'หลอมสำเร็จ';
      this.render();
      this._openDetail(card.id, null, false);
    } catch (error) {
      button.disabled = false;
      if (status) status.textContent = error?.message || 'หลอมโดยเติมผงดาวล้มเหลว';
    }
  }

  // Refine N duplicate copies into Stardust (server keeps ≥1 copy).
  async _handleRefine(card, qty, button) {
    const dialog = this.element.querySelector('.card-detail');
    const status = dialog?.querySelector('.card-detail__status');
    const count = Math.max(1, Math.floor(Number(qty) || 0));
    if (!button || button.disabled) return;
    button.disabled = true;
    if (status) status.textContent = `กำลังถลุงการ์ดซ้ำ ${count} ใบ…`;
    try {
      const result = await this.options.onRefine?.(card.id, count);
      if (result === false || result == null) throw new Error('การถลุงล้มเหลว');
      if (status) status.textContent = 'ถลุงสำเร็จ';
      this.render();
      this._openDetail(card.id, null, false);
    } catch (error) {
      button.disabled = false;
      if (status) status.textContent = error?.message || 'ถลุงการ์ดล้มเหลว';
    }
  }

  _openFusionConfirmation(card, trigger) {
    const detail = this.element.querySelector('.card-detail');
    const fusionDialog = this.element.querySelector('.card-fusion');
    const content = fusionDialog.querySelector('.card-fusion__content');
    const state = this._cardState()[card.id] || { owned: 0, stars: 1, pity: 0 };
    const preview = previewFusion(this._cardState(), card.id);
    if (!preview.canFuse) return;
    const beforeRows = scaledRows(card, preview.fromStars);
    const afterRows = scaledRows(card, preview.toStars);
    this._closeDialog(detail, false);

    const beforeCardTileHtml = this._cardTile(card, { owned: state.owned, stars: preview.fromStars });
    const afterCardTileHtml = this._cardTile(card, { owned: state.owned - preview.cost, stars: preview.toStars });

    content.innerHTML = `
      <div class="card-fusion__modal-header">
        <p class="card-fusion__eyebrow">CONFIRM FUSION</p>
        <h3 id="${this.instanceId}-fusion-title" class="card-fusion__title">
          อัปเกรดดาวระดับสูง: ${escapeHtml(card.displayName)}
        </h3>
        <p class="card-fusion__cost">
          การดำเนินการนี้จะใช้การ์ดซ้ำจำนวน <strong style="color:var(--card-focus)">${preview.cost} ใบ</strong> (ระบบจะจดจำระดับดาวทันที)<br>
          การ์ดหลักของคุณจะคงอยู่และได้รับการเลื่อนขั้น
        </p>
      </div>

      <div class="card-fusion__visual-forge">
        <div class="card-fusion__preview-wrapper before">
          <div class="card-fusion__label">สถานะปัจจุบัน</div>
          ${beforeCardTileHtml}
        </div>
        
        <div class="card-fusion__forge-symbol">
          <div class="forge-symbol__sparkle">✨</div>
          <div class="forge-symbol__arrow">⚡</div>
          <div class="forge-symbol__ray"></div>
        </div>

        <div class="card-fusion__preview-wrapper after">
          <div class="card-fusion__label glowing">ระดับที่เลื่อนขั้นแล้ว</div>
          ${afterCardTileHtml}
        </div>
      </div>

      <div class="card-fusion__details-comparison">
        <div class="card-fusion__stat-column">
          <span class="card-fusion__stat-title">สเตตัสปัจจุบัน · ★${preview.fromStars}</span>
          ${this._valueRows(beforeRows)}
        </div>
        <div class="card-fusion__stat-column after">
          <span class="card-fusion__stat-title glowing">สเตตัสใหม่ · ★${preview.toStars}</span>
          ${this._valueRows(afterRows)}
        </div>
      </div>

      <p class="card-fusion__status" aria-live="polite"></p>

      <div class="card-fusion__actions">
        <button type="button" class="card-fusion__cancel">ยกเลิก</button>
        <button type="button" class="card-fusion__confirm" data-card-id="${escapeHtml(card.id)}">
          ยืนยันการหลอมอัปเกรดดาว
        </button>
      </div>
    `;
    this._lastFocus = trigger;
    this._showDialog(fusionDialog);
    content.querySelector('.card-fusion__cancel').addEventListener('click', () => {
      this._closeDialog(fusionDialog, false);
      this._openDetail(card.id, null, false);
    });
    content.querySelector('.card-fusion__confirm').addEventListener('click', event => {
      this._confirmFusion(card, event.currentTarget);
    });
  }

  async _confirmFusion(card, button) {
    const fusionDialog = this.element.querySelector('.card-fusion');
    const status = fusionDialog.querySelector('.card-fusion__status');
    const cancel = fusionDialog.querySelector('.card-fusion__cancel');
    button.disabled = true;
    cancel.disabled = true;
    status.textContent = 'กำลังหลอมการ์ด...';
    try {
      const result = await this.options.onFuse?.(card.id);
      if (result === false || result == null) throw new Error('การดำเนินการล้มเหลว');
      status.textContent = 'หลอมการ์ดสำเร็จ';
      this._closeDialog(fusionDialog, false);
      this.render();
      this._openDetail(card.id, null, false);
    } catch (error) {
      button.disabled = false;
      cancel.disabled = false;
      status.textContent = error?.message || 'หลอมการ์ดล้มเหลว โปรกดลองใหม่อีกครั้ง';
    }
  }

  _bindAlbumEvents() {
    this.element.querySelectorAll('.card-album__filters select').forEach(select => {
      select.addEventListener('change', () => {
        this.filters[select.name] = select.value;
        this.render();
        this.element.querySelector(`.card-album__filters select[name="${select.name}"]`)?.focus();
      });
    });
    this.element.querySelectorAll('.card-tile').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedCardId = button.dataset.cardId;
        this.element.querySelectorAll('.card-tile').forEach(tile => tile.setAttribute('aria-pressed', String(tile === button)));
        this._openDetail(button.dataset.cardId, button);
      });
    });
    this._bindImageFallbacks(this.element);

    const detail = this.element.querySelector('.card-detail');
    const fusion = this.element.querySelector('.card-fusion');
    detail.querySelector('.card-detail__close').addEventListener('click', () => this._closeDialog(detail));
    detail.addEventListener('cancel', event => {
      event.preventDefault();
      this._closeDialog(detail);
    });
    fusion.addEventListener('cancel', event => {
      event.preventDefault();
      const cardId = this.selectedCardId;
      this._closeDialog(fusion, false);
      this._openDetail(cardId, null, false);
    });
    for (const dialog of [detail, fusion]) {
      dialog.addEventListener('keydown', event => this._trapFocus(event, dialog));
      dialog.addEventListener('click', event => {
        if (event.target === dialog) this._closeDialog(dialog);
      });
    }
  }

  _openDetail(cardId, trigger = null, restoreFocus = true) {
    const card = this.catalog.find(entry => entry.id === cardId);
    const dialog = this.element?.querySelector('.card-detail');
    if (!card || !dialog) return;
    this.selectedCardId = card.id;
    if (restoreFocus && trigger) this._lastFocus = trigger;
    this._renderDetail(card);
    this._showDialog(dialog);
  }

  _showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    queueMicrotask(() => focusableElements(dialog)[0]?.focus());
  }

  _closeDialog(dialog, restoreFocus = true) {
    if (!dialog) return;
    const wasOpen = dialog.open || dialog.hasAttribute('open');
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    if (wasOpen) {
      this.render();
    }
    if (restoreFocus) {
      const fallback = this.element?.querySelector(`[data-card-id="${this.selectedCardId}"]`);
      const target = this._lastFocus?.isConnected ? this._lastFocus : fallback;
      queueMicrotask(() => target?.focus?.());
    }
  }

  _trapFocus(event, container) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this._closeDialog(container);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(container);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  _bindImageFallbacks(container) {
    container.querySelectorAll('.card-art__image').forEach(image => {
      const markMissing = () => image.closest('.card-art')?.classList.add('card-art--missing');
      image.addEventListener('error', markMissing, { once: true });
      if (image.complete && image.naturalWidth === 0) markMissing();
    });
  }

  _drainDropQueue() {
    if (this.revealActive || this.destroyed || !this.dropQueue.length) return;
    const item = this.dropQueue.shift();
    const card = this.catalog.find(entry => entry.id === item.cardId);
    if (!card) {
      item.resolve(false);
      this._drainDropQueue();
      return;
    }
    this.revealActive = true;
    const overlay = document.createElement('div');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    overlay.className = `card-drop-reveal card-drop-reveal--${card.rarity}${reducedMotion ? ' card-drop-reveal--static' : ''}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${this.instanceId}-reveal-title`);
    const state = this._cardState()[card.id] || { owned: item.context.isNew ? 1 : 2, stars: 1 };
    overlay.innerHTML = `
      <div class="card-drop-reveal__backdrop"></div>
      <div class="card-drop-reveal__panel">
        <p class="card-drop-reveal__kicker">${item.context.isNew ? 'NEW DISCOVERY' : 'DUPLICATE ACQUIRED'}</p>
        <h2 id="${this.instanceId}-reveal-title">${escapeHtml(card.displayName)}</h2>
        <p class="card-drop-reveal__rarity">${escapeHtml(RARITY_META[card.rarity]?.label || card.rarity)}</p>
        ${this._artWindow(card, { owned: true, secret: false })}
        <p class="card-drop-reveal__source">
          ${escapeHtml(item.context.monsterName || item.context.sourceLabel || card.source.label)}
        </p>
        <p class="card-drop-reveal__owned">${state.owned} owned · ${state.stars || 1} star${state.stars === 1 ? '' : 's'}</p>
        <button type="button" class="card-drop-reveal__continue">แตะเพื่อปิด</button>
      </div>
    `;
    document.body.appendChild(overlay);
    this._revealOverlay = overlay;
    this._bindImageFallbacks(overlay);
    const previousFocus = document.activeElement;

    // The reveal auto-fades so the player never has to dismiss it mid-farm.
    // Rare/mythic linger a little longer since they earn a look. A tap, click,
    // or Escape closes it immediately. `closing` guards against the auto-timer
    // and a manual dismiss both firing.
    let autoTimer = null;
    let closing = false;
    const finish = () => {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      overlay.remove();
      this._revealOverlay = null;
      this.revealActive = false;
      item.resolve(true);
      if (previousFocus?.isConnected) previousFocus.focus();
      this._drainDropQueue();
    };
    const beginClose = () => {
      if (closing) return;
      closing = true;
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      if (reducedMotion) { finish(); return; }
      overlay.classList.add('card-drop-reveal--out');
      setTimeout(finish, 420);
    };

    const isRare = card.rarity === 'legendary' || card.rarity === 'mythic';
    autoTimer = setTimeout(beginClose, isRare ? 4200 : 2800);

    overlay.querySelector('.card-drop-reveal__continue').addEventListener('click', beginClose, { once: true });
    // A tap/click anywhere on the overlay (backdrop included) also dismisses it.
    overlay.addEventListener('click', event => {
      if (event.target.closest('.card-drop-reveal__continue')) return;
      beginClose();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        beginClose();
      } else {
        this._trapFocus(event, overlay);
      }
    });
    queueMicrotask(() => overlay.querySelector('.card-drop-reveal__continue')?.focus());

    if (card.rarity === 'legendary' || card.rarity === 'mythic') {
      this.options.onRareDrop?.(card, item.context);
    }
  }

  _titleCase(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }
}
