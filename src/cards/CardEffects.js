import { getCard } from './CardCatalog.js';
import { normalizeCardState, starMultiplier } from './CardProgression.js';

export const EFFECT_CAPS = Object.freeze({
  critBonus: 0.5,
  lifestealPct: 0.25,
  damageReduction: 0.35,
  executePct: 0.1,
  bossDamagePct: 0.5,
  dropRatePct: 1,
});

const FLAT_STAT_FIELDS = Object.freeze(['atkBonus', 'defBonus', 'hpBonus', 'spBonus']);
const SCALAR_EFFECT_FIELDS = Object.freeze([
  'damagePct', 'critBonus', 'lifestealPct', 'damageReduction',
  'executePct', 'bossDamagePct', 'dropRatePct',
]);

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function createEffects() {
  return {
    stats: { atkBonus: 0, defBonus: 0, hpBonus: 0, spBonus: 0 },
    damagePct: 0,
    critBonus: 0,
    lifestealPct: 0,
    damageToFamily: {},
    damageReduction: 0,
    onKillRestore: { hp: 0, sp: 0 },
    executePct: 0,
    lowHpPower: { threshold: 0, value: 0 },
    bossDamagePct: 0,
    dropRatePct: 0,
  };
}

function addCardStats(effects, stats, multiplier) {
  for (const field of FLAT_STAT_FIELDS) {
    effects.stats[field] += numberOrZero(stats?.[field]) * multiplier;
  }

  for (const field of SCALAR_EFFECT_FIELDS) {
    effects[field] += numberOrZero(stats?.[field]) * multiplier;
  }

  // Legacy card data used `dmgPct`; retain compatibility while normalizing the
  // result to the catalog's declarative `damagePct` field.
  effects.damagePct += numberOrZero(stats?.dmgPct) * multiplier;
}

function addCardEffect(effects, effect, multiplier) {
  if (!effect) return;

  if (SCALAR_EFFECT_FIELDS.includes(effect.type)) {
    effects[effect.type] += numberOrZero(effect.value) * multiplier;
    return;
  }

  if (effect.type === 'damageToFamily' && effect.family) {
    const family = String(effect.family);
    effects.damageToFamily[family] = (effects.damageToFamily[family] || 0)
      + numberOrZero(effect.value) * multiplier;
    return;
  }

  if (effect.type === 'onKillRestore') {
    effects.onKillRestore.hp += numberOrZero(effect.hp) * multiplier;
    effects.onKillRestore.sp += numberOrZero(effect.sp) * multiplier;
    return;
  }

  if (effect.type === 'lowHpPower') {
    effects.lowHpPower.threshold = Math.max(
      effects.lowHpPower.threshold,
      numberOrZero(effect.threshold),
    );
    effects.lowHpPower.value += numberOrZero(effect.value) * multiplier;
  }
}

function cap(value, maximum) {
  return Math.min(maximum, Math.max(0, value));
}

export function aggregateCardEffects({ equippedCards = {}, cardState = {} } = {}) {
  const effects = createEffects();
  const normalizedState = normalizeCardState(cardState);
  const seenCardIds = new Set();

  for (const cardId of Object.values(equippedCards || {})) {
    const card = cardId && getCard(cardId);
    if (!card || seenCardIds.has(card.id)) continue;
    seenCardIds.add(card.id);

    const multiplier = starMultiplier(normalizedState[card.id]?.stars);
    addCardStats(effects, card.stats, multiplier);
    addCardEffect(effects, card.effect, multiplier);
  }

  for (const field of FLAT_STAT_FIELDS) effects.stats[field] = Math.round(effects.stats[field]);
  for (const [field, maximum] of Object.entries(EFFECT_CAPS)) effects[field] = cap(effects[field], maximum);

  return effects;
}

export function applyOutgoingCardEffects(context = {}, effects = createEffects()) {
  const damage = numberOrZero(context.damage);
  let bonus = numberOrZero(effects.damagePct);
  if (context.isBoss) bonus += numberOrZero(effects.bossDamagePct);
  if (context.family) bonus += numberOrZero(effects.damageToFamily?.[context.family]);
  if (numberOrZero(context.playerHpRatio) <= numberOrZero(effects.lowHpPower?.threshold)) {
    bonus += numberOrZero(effects.lowHpPower?.value);
  }

  const boostedDamage = bonus === 0 ? damage : Math.round(damage * (1 + bonus));
  const canExecute = !context.isBoss
    && numberOrZero(effects.executePct) > 0
    && numberOrZero(context.targetHpRatio) <= numberOrZero(effects.executePct)
    && numberOrZero(context.targetHp) > 0;
  return canExecute ? Math.max(boostedDamage, numberOrZero(context.targetHp)) : boostedDamage;
}

export function applyIncomingCardEffects(context = {}, effects = createEffects()) {
  const damage = numberOrZero(context.damage);
  const reduction = cap(numberOrZero(effects.damageReduction), EFFECT_CAPS.damageReduction);
  return reduction === 0 ? damage : Math.round(damage * (1 - reduction));
}

export function applyOnKillCardEffects(context = {}, effects = createEffects()) {
  const hp = numberOrZero(context.hp);
  const sp = numberOrZero(context.sp);
  const maxHp = numberOrZero(context.maxHp);
  const maxSp = numberOrZero(context.maxSp);
  return {
    hp: Math.min(maxHp, hp + numberOrZero(effects.onKillRestore?.hp)),
    sp: Math.min(maxSp, sp + numberOrZero(effects.onKillRestore?.sp)),
  };
}
