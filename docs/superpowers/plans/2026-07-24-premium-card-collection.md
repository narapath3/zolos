# Premium Pixel Card Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy 17-card implementation with a secure, data-driven 60-card collection featuring five rarities, unique pixel art, source-specific drops, pity, five-star fusion, declarative combat effects, and a responsive premium album.

**Architecture:** `CardCatalog.js` is the single source of truth, while focused pure modules calculate progression, combat effects, migration, and drops. The client owns presentation and offline progression; the Socket server owns online world-boss eligibility and rolls. Existing inventory rows and appearance JSON remain compatible through aliases and an idempotent migration layer.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Vite 8, Three.js game client, Socket.IO server, Supabase/Postgres, CSS, WebP pixel assets.

## Global Constraints

- Ship exactly 60 cards: 12 Common, 12 Rare, 12 Epic, 12 Legendary, and 12 Mythic.
- Card art uses 96×96 transparent pixel artwork with nearest-neighbor scaling; emoji must never be used as card art.
- Normal monster cards drop only from their named owner; boss and event cards drop only from their declared source.
- Only one copy of a card ID may be socketed at once.
- Star fusion costs 1, 2, 3, and 5 duplicates; five stars require 11 consumed duplicates.
- Star multipliers are exactly 1.00, 1.08, 1.18, 1.30, and 1.45.
- Online drops and fusion are authoritative and atomic; offline mode uses the same state shape and pure rules.
- Existing quantities and socket assignments for all 17 legacy card names must survive migration.
- Random drop chance is capped at 2× base; drop-rate bonuses do not change pity thresholds.
- Animations must respect `prefers-reduced-motion`; touch targets are at least 44px.

---

## File Structure

- Create `src/cards/CardCatalog.js`: all 60 immutable definitions, rarity metadata, source IDs, aliases, and lookup helpers.
- Create `src/cards/CardProgression.js`: star costs, multipliers, caps, collection normalization, and fusion transactions.
- Create `src/cards/CardEffects.js`: declarative equipped-card stat/effect aggregation.
- Create `src/cards/CardDrops.js`: deterministic drop and pity resolver shared by offline tests and the server.
- Create `src/cards/CardMigration.js`: idempotent legacy inventory and socket conversion.
- Create `src/ui/CardAlbum.js`: album, filters, detail/fusion surfaces, and drop reveal.
- Create `src/styles/cards.css`: Celestial Foil Pixel visuals and responsive/reduced-motion behavior.
- Create `server/cardRewards.js`: server-owned world-boss records, eligibility, reward roll, and atomic persistence boundary.
- Create `migrations/20260724_card_collection.sql`: card progression state, pity state, and atomic fusion/drop RPCs.
- Create `public/assets/cards/*.webp`: 60 unique 96×96 transparent pixel-art assets.
- Modify `src/engine/GameData.js`: derive legacy `ITEMS` card entries and fitting helpers from the catalog; remove the old independent boss roll.
- Modify `src/engine/CharacterManager.js`: use aggregated card stats/effects and preserve card progression in appearance data.
- Modify `src/engine/CombatSystem.js`: evaluate bounded conditional effects in damage/kill paths.
- Modify `src/ui/GameUI.js`: mount the new album, connect socket/fusion/reveal actions, and remove emoji gallery CSS.
- Modify `src/network/GameSync.js`: card-state load/save and server reward/fusion messages.
- Modify `server/server.js`: structured boss IDs and authoritative reward dispatch.
- Modify `src/styles/index.css`: import the focused card stylesheet.
- Create tests under `test/cards/` and extend server/build acceptance coverage.

### Task 1: Establish the 60-card catalog

**Files:**
- Create: `src/cards/CardCatalog.js`
- Create: `test/cards/cardCatalog.test.js`
- Modify: `src/engine/GameData.js:110-133,1446-1485`

**Interfaces:**
- Produces: `CARD_CATALOG`, `CARD_BY_ID`, `CARD_BY_ITEM_NAME`, `RARITY_META`, `getCard(idOrName)`, `getCardsBySource(kind, id)`, and `toLegacyItem(card)`.
- `getCard(idOrName)` returns a frozen catalog record or `null`.

- [ ] **Step 1: Write the failing catalog contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_CATALOG, CARD_BY_ID, CARD_BY_ITEM_NAME,
  getCard, getCardsBySource,
} from '../../src/cards/CardCatalog.js';

const validRarities = new Set(['common', 'rare', 'epic', 'legendary', 'mythic']);
const validSlots = new Set(['weapon', 'armor', 'shield', 'accessory']);
const supportedEffects = new Set([
  'damagePct', 'critBonus', 'lifestealPct', 'damageToFamily',
  'damageReduction', 'onKillRestore', 'executePct', 'lowHpPower',
  'bossDamagePct', 'dropRatePct',
]);

test('catalog contains 60 unique cards and 12 of each rarity', () => {
  assert.equal(CARD_CATALOG.length, 60);
  assert.equal(new Set(CARD_CATALOG.map(card => card.id)).size, 60);
  assert.deepEqual(
    Object.fromEntries([...validRarities].map(rarity => [
      rarity, CARD_CATALOG.filter(card => card.rarity === rarity).length,
    ])),
    { common: 12, rare: 12, epic: 12, legendary: 12, mythic: 12 },
  );
});

test('every card has a complete valid record and lookup', async () => {
  for (const card of CARD_CATALOG) {
    assert.ok(validRarities.has(card.rarity));
    assert.ok(validSlots.has(card.slot));
    assert.match(card.collectionNo, /^[CRELM]-\d{2}$/);
    assert.equal(CARD_BY_ID.get(card.id), card);
    assert.equal(CARD_BY_ITEM_NAME.get(card.itemName), card);
    assert.equal(getCard(card.id), card);
    assert.equal(getCard(card.itemName), card);
    assert.ok(card.abilityName && card.lore && card.source.label);
    assert.ok(card.source.chance > 0 && card.source.pity > 0);
    if (card.effect) assert.ok(supportedEffects.has(card.effect.type));
  }
});

test('owner-source lookup returns only the matching source', () => {
  assert.deepEqual(
    getCardsBySource('monster', 'poring').map(card => card.id),
    ['poring'],
  );
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node --test test/cards/cardCatalog.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/cards/CardCatalog.js`.

- [ ] **Step 3: Implement the immutable catalog and lookup helpers**

Create the 60 records exactly as specified in `docs/superpowers/specs/2026-07-24-premium-card-collection-design.md`. Use this module shape:

```js
export const RARITY_META = Object.freeze({
  common: { rank: 1, label: 'COMMON', color: '#b8c0cc' },
  rare: { rank: 2, label: 'RARE', color: '#5aa9ff' },
  epic: { rank: 3, label: 'EPIC', color: '#c07bff' },
  legendary: { rank: 4, label: 'LEGENDARY', color: '#ffb43a' },
  mythic: { rank: 5, label: 'MYTHIC', color: '#d9a7ff' },
});

const records = [
  {
    id: 'poring', itemName: 'Poring Card', displayName: 'Poring',
    collectionNo: 'C-01', rarity: 'common', slot: 'armor',
    art: '/assets/cards/poring.webp', abilityName: 'Gelatin Guard',
    stats: { hpBonus: 80 }, effect: null,
    source: { kind: 'monster', id: 'poring', label: 'Poring · Prontera Field', chance: 0.02, pity: 100 },
    lore: 'A soft heart that hardens when its owner is threatened.',
    legacyAliases: ['Poring Card'],
  },
];

export const CARD_CATALOG = Object.freeze(records.map(card => Object.freeze({
  ...card,
  stats: Object.freeze({ ...card.stats }),
  effect: card.effect ? Object.freeze({ ...card.effect }) : null,
  source: Object.freeze({ ...card.source }),
  legacyAliases: Object.freeze([...(card.legacyAliases || [])]),
})));
export const CARD_BY_ID = new Map(CARD_CATALOG.map(card => [card.id, card]));
export const CARD_BY_ITEM_NAME = new Map();
for (const card of CARD_CATALOG) {
  CARD_BY_ITEM_NAME.set(card.itemName, card);
  for (const alias of card.legacyAliases) CARD_BY_ITEM_NAME.set(alias, card);
}
export function getCard(idOrName) {
  return CARD_BY_ID.get(idOrName) || CARD_BY_ITEM_NAME.get(idOrName) || null;
}
export function getCardsBySource(kind, id) {
  return CARD_CATALOG.filter(card => card.source.kind === kind && card.source.id === id);
}
export function toLegacyItem(card) {
  return {
    type: 'card', cardId: card.id, cardSlot: card.slot,
    rarity: card.rarity, art: card.art, card: { ...card.stats },
    desc: card.abilityName, price: 0,
  };
}
```

Transcribe C-02 through M-12 from the five catalog tables in the approved spec into the same explicit object schema, in collection-number order. Do not generate records from rarity defaults because every ability, source, art filename, and lore entry is independently reviewable. Add all legacy aliases: Willow, Andre, Poring, Pupa, Lunatic, Vadon, Skeleton, Fabre, Rocker, Sohee, Goblin, Marina, Mantis, Doppelganger, Angeling, Ghostring, and Golden Thief Bug. Map obsolete names to the closest approved IDs without changing inventory item names during migration.

- [ ] **Step 4: Derive the compatibility surface in `GameData.js`**

```js
import {
  CARD_CATALOG, RARITY_META, getCard, toLegacyItem,
} from '../cards/CardCatalog.js';

for (const card of CARD_CATALOG) ITEMS[card.itemName] = toLegacyItem(card);

export const RARITY_COLOR = Object.fromEntries(
  Object.entries(RARITY_META).map(([rarity, meta]) => [rarity, meta.color]),
);
export const ALL_CARDS = CARD_CATALOG.map(card => card.itemName);
export function cardFitsSlot(cardName, slotId) {
  const card = getCard(cardName);
  return Boolean(card && card.slot === cardCategoryForSlot(slotId));
}
```

Delete `CARD_DROP_CHANCE` and `rollBossCards`; all later drops go through `CardDrops.js`.

- [ ] **Step 5: Run catalog and full tests**

Run: `node --test test/cards/cardCatalog.test.js && npm test`

Expected: catalog tests PASS and the existing suite reports zero failures.

- [ ] **Step 6: Commit**

```bash
git add src/cards/CardCatalog.js src/engine/GameData.js test/cards/cardCatalog.test.js
git commit -m "feat: add 60-card catalog"
```

### Task 2: Add five-star progression and legacy migration

**Files:**
- Create: `src/cards/CardProgression.js`
- Create: `src/cards/CardMigration.js`
- Create: `test/cards/cardProgression.test.js`
- Create: `test/cards/cardMigration.test.js`
- Modify: `src/engine/CharacterManager.js:89,221-242,2021-2037,2469-2551`

**Interfaces:**
- Consumes: `getCard(idOrName)`.
- Produces: `normalizeCardState(raw)`, `starMultiplier(stars)`, `previewFusion(state,id)`, `fuseCard(state,id)`, `migrateLegacyCards(inventory,cards)`.

- [ ] **Step 1: Write failing progression and migration tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSION_COSTS, STAR_MULTIPLIERS, fuseCard, previewFusion,
} from '../../src/cards/CardProgression.js';

test('fusion consumes 1, 2, 3, and 5 duplicates through five stars', () => {
  let state = { poring: { owned: 12, stars: 1, pity: 0 } };
  for (const expected of [
    { stars: 2, owned: 11 }, { stars: 3, owned: 9 },
    { stars: 4, owned: 6 }, { stars: 5, owned: 1 },
  ]) {
    state = fuseCard(state, 'poring');
    assert.deepEqual(state.poring, { ...expected, pity: 0 });
  }
  assert.deepEqual(FUSION_COSTS, [0, 1, 2, 3, 5]);
  assert.deepEqual(STAR_MULTIPLIERS, [0, 1, 1.08, 1.18, 1.30, 1.45]);
  assert.throws(() => fuseCard(state, 'poring'), /maximum star/);
});

test('failed fusion leaves the original state untouched', () => {
  const state = { poring: { owned: 1, stars: 1, pity: 7 } };
  assert.throws(() => fuseCard(state, 'poring'), /duplicate/);
  assert.deepEqual(state, { poring: { owned: 1, stars: 1, pity: 7 } });
  assert.equal(previewFusion(state, 'poring').canFuse, false);
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyCards } from '../../src/cards/CardMigration.js';

test('migration preserves quantities and socketed legacy cards and is idempotent', () => {
  const inventory = [
    { item_name: 'Poring Card', item_type: 'card', quantity: 4, stats: { equippedSlot: 'body' } },
    { item_name: 'Andre Card', item_type: 'card', quantity: 2, stats: {} },
  ];
  const first = migrateLegacyCards(inventory, { body: 'Poring Card', weapon: 'Andre Card' });
  const second = migrateLegacyCards(first.inventory, first.equippedCards);
  assert.deepEqual(second, first);
  assert.deepEqual(first.cardState.poring, { owned: 4, stars: 1, pity: 0 });
  assert.equal(first.equippedCards.body, 'poring');
  assert.equal(first.inventory.reduce((sum, row) => sum + row.quantity, 0), 6);
});
```

- [ ] **Step 2: Run both tests and verify failure**

Run: `node --test test/cards/cardProgression.test.js test/cards/cardMigration.test.js`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement pure progression**

```js
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
  return { cardId: id, fromStars: entry.stars, toStars: Math.min(5, entry.stars + 1), cost, canFuse: cost > 0 && entry.owned - 1 >= cost };
}
export function fuseCard(state, id) {
  const next = normalizeCardState(state);
  const preview = previewFusion(next, id);
  if (preview.fromStars >= 5) throw new Error('Card is already at maximum star level');
  if (!preview.canFuse) throw new Error('Not enough duplicate cards');
  next[id] = { ...next[id], stars: preview.toStars, owned: next[id].owned - preview.cost };
  return next;
}
```

- [ ] **Step 4: Implement idempotent alias migration**

`migrateLegacyCards` must use `getCard`, retain non-card inventory rows byte-for-byte, normalize each card row to its canonical `itemName`, put `card_id` and `card_stars` in `stats`, merge duplicate canonical rows, and convert socket values to IDs. It must return:

```js
{
  inventory: normalizedRows,
  cardState: { [cardId]: { owned, stars, pity } },
  equippedCards: { ...canonicalCardIdsBySlot },
  migrated: true,
}
```

If two old names map to one canonical ID, sum quantities and retain one base copy. Calling the function twice must produce deep-equal output.

- [ ] **Step 5: Integrate normalized state with character appearance**

Initialize `this.cardState = {}`. Serialize `cardState` beside `cards` in `getAppearance()`, normalize it in `applyAppearance()`, and store canonical IDs in `equippedCards`. During load, invoke migration once before rebuilding sockets. Reject a socket request when its ID already appears in another slot.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test test/cards/cardProgression.test.js test/cards/cardMigration.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cards/CardProgression.js src/cards/CardMigration.js src/engine/CharacterManager.js test/cards/cardProgression.test.js test/cards/cardMigration.test.js
git commit -m "feat: add card fusion and migration"
```

### Task 3: Implement bounded combat and drop effects

**Files:**
- Create: `src/cards/CardEffects.js`
- Create: `test/cards/cardEffects.test.js`
- Modify: `src/engine/CharacterManager.js:210-245`
- Modify: `src/engine/CombatSystem.js`

**Interfaces:**
- Consumes: catalog records, equipped card IDs, and normalized card state.
- Produces: `aggregateCardEffects({equippedCards,cardState})`, `applyOutgoingCardEffects(context,effects)`, `applyIncomingCardEffects(context,effects)`, `applyOnKillCardEffects(context,effects)`.

- [ ] **Step 1: Write failing effect tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCardEffects, applyOutgoingCardEffects,
  applyIncomingCardEffects, applyOnKillCardEffects,
} from '../../src/cards/CardEffects.js';

test('numeric stats scale with stars and duplicate socket IDs count once', () => {
  const effects = aggregateCardEffects({
    equippedCards: { body: 'poring', head: 'poring', weapon: 'willow' },
    cardState: { poring: { owned: 12, stars: 5, pity: 0 }, willow: { owned: 1, stars: 1, pity: 0 } },
  });
  assert.equal(effects.stats.hpBonus, Math.round(80 * 1.45));
  assert.equal(effects.stats.atkBonus, 8);
});

test('conditional effects respect boss, family, health, execute, and caps', () => {
  const effects = {
    damagePct: 0.12, bossDamagePct: 0.14, damageToFamily: { beast: 0.08 },
    executePct: 0.05, lowHpPower: { threshold: 0.3, value: 0.14 },
    damageReduction: 0.9, onKillRestore: { hp: 20, sp: 20 },
  };
  assert.equal(applyOutgoingCardEffects({ damage: 100, isBoss: true, family: 'beast', playerHpRatio: 0.2, targetHpRatio: 1 }, effects), 148);
  assert.equal(applyOutgoingCardEffects({ damage: 1, isBoss: false, family: 'undead', playerHpRatio: 1, targetHpRatio: 0.04, targetHp: 500 }, effects), 500);
  assert.equal(applyIncomingCardEffects({ damage: 100 }, effects), 65);
  assert.deepEqual(applyOnKillCardEffects({ hp: 90, maxHp: 100, sp: 5, maxSp: 20 }, effects), { hp: 100, sp: 20 });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test test/cards/cardEffects.test.js`

Expected: FAIL with missing `CardEffects.js`.

- [ ] **Step 3: Implement declarative aggregation and explicit caps**

Implement a plain aggregate with `stats`, `damagePct`, `critBonus`, `lifestealPct`, `damageToFamily`, `damageReduction`, `onKillRestore`, `executePct`, `lowHpPower`, `bossDamagePct`, and `dropRatePct`. Apply star multipliers before summing. Enforce these caps after summing:

```js
export const EFFECT_CAPS = Object.freeze({
  critBonus: 0.5, lifestealPct: 0.25, damageReduction: 0.35,
  executePct: 0.1, bossDamagePct: 0.5, dropRatePct: 1,
});
```

Round flat ATK/DEF/HP/SP bonuses to integers. In outgoing damage, add eligible percentage bonuses together and multiply once. Execute never applies to bosses. Incoming reduction cannot exceed 35%. Restore cannot exceed max HP/SP.

- [ ] **Step 4: Connect the helpers to combat paths**

Replace direct iteration over `ITEMS[name].card` in `CharacterManager` with `aggregateCardEffects`. In `CombatSystem`, run outgoing effects immediately before final damage application, incoming reduction before HP subtraction, lifesteal after dealt damage, and restore after a confirmed kill. Preserve the existing behavior when no cards are equipped.

- [ ] **Step 5: Run focused, combat, and full tests**

Run: `node --test test/cards/cardEffects.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cards/CardEffects.js src/engine/CharacterManager.js src/engine/CombatSystem.js test/cards/cardEffects.test.js
git commit -m "feat: apply bounded card combat effects"
```

### Task 4: Build the shared source-specific drop resolver

**Files:**
- Create: `src/cards/CardDrops.js`
- Create: `test/cards/cardDrops.test.js`
- Modify: `src/engine/MonsterManager.js`
- Modify: `src/main.js:1807`

**Interfaces:**
- Consumes: `getCardsBySource`, card state, contribution/MVP flags, and injected `random`.
- Produces: `resolveCardDrops(input)` returning `{drops,cardState,rolls}` without mutating input.

- [ ] **Step 1: Write failing deterministic drop tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCardDrops } from '../../src/cards/CardDrops.js';

test('only the named owner card is eligible and a success resets its pity', () => {
  const result = resolveCardDrops({
    source: { kind: 'monster', id: 'poring' },
    cardState: { poring: { owned: 0, stars: 1, pity: 12 } },
    random: () => 0,
  });
  assert.deepEqual(result.drops, ['poring']);
  assert.deepEqual(result.cardState.poring, { owned: 1, stars: 1, pity: 0 });
});

test('pity guarantees the eligible card and failures increment only it', () => {
  const fail = resolveCardDrops({
    source: { kind: 'monster', id: 'poring' },
    cardState: { poring: { owned: 1, stars: 1, pity: 98 } },
    random: () => 0.999,
  });
  assert.equal(fail.drops.length, 0);
  assert.equal(fail.cardState.poring.pity, 99);
  const pity = resolveCardDrops({ source: { kind: 'monster', id: 'poring' }, cardState: fail.cardState, random: () => 0.999 });
  assert.deepEqual(pity.drops, ['poring']);
});

test('MVP and drop bonuses never exceed twice the base chance', () => {
  const result = resolveCardDrops({
    source: { kind: 'world_boss', id: 'valdris' }, cardState: {},
    isMvp: true, dropRatePct: 9, eligible: true, random: () => 0.0069,
  });
  assert.equal(result.rolls[0].chance, 0.007);
  assert.deepEqual(result.drops, ['valdris']);
});

test('ineligible contributor receives no roll or pity', () => {
  assert.deepEqual(resolveCardDrops({
    source: { kind: 'world_boss', id: 'valdris' },
    cardState: {}, eligible: false, random: () => 0,
  }).rolls, []);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test test/cards/cardDrops.test.js`

Expected: FAIL because the resolver is absent.

- [ ] **Step 3: Implement the pure resolver**

For each card returned by `getCardsBySource(kind,id)`, normalize its entry, skip the roll when `eligible === false`, compute:

```js
const mvpMultiplier = input.isMvp ? 2 : 1;
const chance = Math.min(card.source.chance * 2, card.source.chance * mvpMultiplier * (1 + Math.max(0, input.dropRatePct || 0)));
const guaranteed = entry.pity + 1 >= card.source.pity;
const won = guaranteed || input.random() < chance;
```

On success increment `owned` and reset pity; otherwise increment pity. Return diagnostics in `rolls` as `{cardId,chance,guaranteed,won}`.

- [ ] **Step 4: Integrate offline monster death**

On a locally authoritative monster death, call the resolver once using the monster definition’s stable ID and the aggregated `dropRatePct`. Persist the returned `cardState`. Queue each result to `GameUI.showCardDropReveal(cardId, { sourceLabel, isNew })`. Do not add card rolls to each monster’s ordinary loot array.

- [ ] **Step 5: Run tests and commit**

Run: `node --test test/cards/cardDrops.test.js && npm test`

Expected: all tests PASS.

```bash
git add src/cards/CardDrops.js src/engine/MonsterManager.js src/main.js test/cards/cardDrops.test.js
git commit -m "feat: add source-specific card drops and pity"
```

### Task 5: Make online world-boss rewards authoritative and atomic

**Files:**
- Create: `server/cardRewards.js`
- Create: `test/cards/serverCardRewards.test.js`
- Create: `migrations/20260724_card_collection.sql`
- Modify: `server/server.js:123-235,376-386`
- Modify: `src/network/GameSync.js:1224-1228,2108`

**Interfaces:**
- Consumes: authenticated socket identity, trusted boss state, contribution ranking, and server-side Supabase client.
- Produces: `WORLD_BOSSES`, `minimumContribution(maxHp)`, `buildBossCardRewards(input)`, Socket event `card_reward`.

- [ ] **Step 1: Write failing server reward tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_BOSSES, minimumContribution, buildBossCardRewards,
} from '../../server/cardRewards.js';

test('six bosses expose stable IDs and unchanged visible names', () => {
  assert.deepEqual(WORLD_BOSSES.map(b => b.id), [
    'valdris', 'ignarok', 'abyss_golem', 'morgath', 'kaltharu', 'zulgaroth',
  ]);
  assert.equal(WORLD_BOSSES.length, 6);
});

test('meaningful contribution is at least one percent of boss HP', () => {
  assert.equal(minimumContribution(7000), 70);
  const rewards = buildBossCardRewards({
    bossId: 'valdris', maxHp: 7000,
    ranking: [{ userId: 'low', dmg: 69 }, { userId: 'mvp', dmg: 400 }],
  });
  assert.equal(rewards.find(r => r.userId === 'low').eligible, false);
  assert.equal(rewards.find(r => r.userId === 'mvp').isMvp, true);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test test/cards/serverCardRewards.test.js`

Expected: FAIL with missing server module.

- [ ] **Step 3: Implement structured boss records and reward eligibility**

```js
export const WORLD_BOSSES = Object.freeze([
  { id: 'valdris', name: 'Valdris จอมมารเพลิง' },
  { id: 'ignarok', name: 'Ignarok ราชันมังกร' },
  { id: 'abyss_golem', name: 'Golem แห่งหุบเหวลึก' },
  { id: 'morgath', name: 'Morgath ผู้กลืนวิญญาณ' },
  { id: 'kaltharu', name: 'Kaltharu อสูรน้ำแข็ง' },
  { id: 'zulgaroth', name: "Zul'garoth เทพสังหาร" },
]);
export const minimumContribution = maxHp => Math.max(1, Math.ceil(maxHp * 0.01));
export function buildBossCardRewards({ bossId, maxHp, ranking }) {
  const minimum = minimumContribution(maxHp);
  return ranking.map((row, index) => ({
    userId: row.userId, bossId, eligible: row.dmg >= minimum,
    isMvp: index === 0 && row.dmg >= minimum,
  }));
}
```

Store the full selected boss record in `worldBoss.boss`, include `id` and `name` in public state, and stop selecting from display-name strings.

- [ ] **Step 4: Add database state and atomic RPCs**

Create tables keyed by `(character_id, card_id)`:

```sql
create table if not exists public.character_cards (
  character_id uuid not null references public.characters(id) on delete cascade,
  card_id text not null,
  owned integer not null default 0 check (owned >= 0),
  stars smallint not null default 1 check (stars between 1 and 5),
  pity integer not null default 0 check (pity >= 0),
  primary key (character_id, card_id)
);
alter table public.character_cards enable row level security;
create policy "read own cards" on public.character_cards for select
using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));
```

Add `security definer` RPCs `award_card_drop(p_character_id,p_card_id,p_expected_pity,p_new_pity,p_won)` and `fuse_card(p_character_id,p_card_id,p_expected_stars,p_cost)`. Lock the row with `FOR UPDATE`, verify expected state, apply exactly one transition, and revoke execution from `anon`/`authenticated`; only the service role server invokes them. Include idempotency key storage so retrying a reward/fusion request cannot apply twice.

- [ ] **Step 5: Roll and persist rewards before emitting them**

At boss death, resolve each eligible contributor on the server, load their card row, call the atomic award RPC, and emit `card_reward` only to that authenticated user’s socket after persistence succeeds. The payload is `{cardId,owned,stars,pity,source:{kind:'world_boss',id,label},isNew}`. Do not accept chance, rarity, card ID, stars, or pity from a client message.

- [ ] **Step 6: Handle trusted reward messages on the client**

Add a `card_reward` listener that merges the server-returned values into `character.cardState`, refreshes inventory/album, and opens the reveal. Remove client-side world-boss card rolling.

- [ ] **Step 7: Run migration checks and tests**

Run: `node --test test/cards/serverCardRewards.test.js test/migrationSecurity.test.js && npm test`

Expected: all tests PASS; migration security checks confirm no authenticated direct mutation policy.

- [ ] **Step 8: Commit**

```bash
git add server/cardRewards.js server/server.js src/network/GameSync.js migrations/20260724_card_collection.sql test/cards/serverCardRewards.test.js test/migrationSecurity.test.js
git commit -m "feat: secure authoritative boss card rewards"
```

### Task 6: Add atomic fusion networking and offline parity

**Files:**
- Create: `test/cards/cardSync.test.js`
- Modify: `src/network/GameSync.js`
- Modify: `server/server.js`
- Modify: `src/ui/GameUI.js`

**Interfaces:**
- Produces: `requestCardFusion(cardId,requestId)` and events `card_fusion_result`, `card_fusion_error`.
- Client never subtracts duplicates until success is confirmed.

- [ ] **Step 1: Write the failing network boundary test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('fusion payload accepts identity-free card ID and idempotency key only', async () => {
  const client = await readFile(new URL('../../src/network/GameSync.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../../server/server.js', import.meta.url), 'utf8');
  assert.match(client, /socket\.emit\(['"]card_fuse['"],\s*\{\s*cardId,\s*requestId\s*\}\)/);
  assert.match(server, /socket\.on\(['"]card_fuse['"]/);
  assert.doesNotMatch(server, /payload\.(?:stars|cost|quantity|userId)/);
  assert.match(server, /fuse_card/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test test/cards/cardSync.test.js`

Expected: FAIL because `card_fuse` is not implemented.

- [ ] **Step 3: Implement online and offline fusion adapters**

`requestCardFusion` emits only `{cardId,requestId}` online. The server resolves the character from the authenticated socket, looks up cost from trusted state, invokes `fuse_card`, and returns the committed row. Offline mode calls pure `fuseCard`, persists the whole next state, then publishes the same result shape. On any error, inventory and stars remain unchanged and the confirmation dialog displays the returned Thai error.

- [ ] **Step 4: Prevent duplicate socket assignment at both boundaries**

Before client requests a socket change, check canonical IDs across every slot. Server save sanitization must reject an appearance payload whose `cards` values contain the same non-null card ID twice or a card in an incompatible category.

- [ ] **Step 5: Run focused and security tests**

Run: `node --test test/cards/cardSync.test.js test/securityPolicy.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/network/GameSync.js server/server.js src/ui/GameUI.js test/cards/cardSync.test.js test/securityPolicy.test.js
git commit -m "feat: add atomic card fusion sync"
```

### Task 7: Build the responsive premium Card Album

**Files:**
- Create: `src/ui/CardAlbum.js`
- Create: `src/styles/cards.css`
- Create: `test/cards/cardAlbum.test.js`
- Modify: `src/ui/GameUI.js:1200-1405,1490-1800`
- Modify: `src/styles/index.css:1`

**Interfaces:**
- Consumes: `CARD_CATALOG`, card state, equipped slots, fusion/drop callbacks.
- Produces: `new CardAlbum(options)`, `.mount(element)`, `.render()`, `.showDropReveal(cardId,context)`, `.destroy()`.

- [ ] **Step 1: Write the failing static UI contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/ui/CardAlbum.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/styles/cards.css', import.meta.url), 'utf8');

test('album includes filters, progress, locked cards, detail, fusion, and reveal', () => {
  for (const hook of [
    'card-album__filters', 'card-album__progress', 'card-tile--locked',
    'card-detail__source', 'card-detail__pity', 'card-fusion',
    'card-drop-reveal',
  ]) assert.match(source, new RegExp(hook));
});

test('album is phone-safe, touch-safe, and motion-safe', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(min-width:\s*370px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /image-rendering:\s*pixelated/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test test/cards/cardAlbum.test.js`

Expected: FAIL because the component and stylesheet are absent.

- [ ] **Step 3: Implement the album state and semantic DOM**

The component renders all 60 cards ordered by `collectionNo`. State is:

```js
this.filters = { rarity: 'all', slot: 'all', ownership: 'all', source: 'all' };
this.selectedCardId = CARD_CATALOG[0].id;
```

Use buttons for cards/actions, labels for filter controls, `aria-pressed` for selected cards, `aria-live="polite"` for progress/result messages, and a focus-trapped confirmation dialog. Undiscovered normal cards show silhouette art and source hint. Undiscovered event cards use “Secret Card” and conceal full art/source until discovered.

- [ ] **Step 4: Implement detail, values, pity, socket, and fusion confirmation**

Show current/next values using `starMultiplier`, current star row, duplicate meter, exact source chance as a percentage, per-card pity, compatible slot, lore, socket/replace action, and disabled fusion at insufficient duplicates/five stars. Confirmation shows cost and exact before/after values. Await the provided fusion callback before changing rendered state.

- [ ] **Step 5: Implement queued drop reveal**

`showDropReveal` queues rewards so simultaneous drops never overlap. Freeze only the overlay controls with a modal backdrop; never pause or mutate game simulation. Render art, rarity, monster/source, and NEW/DUPLICATE state. Legendary/Mythic invoke the existing global rare-drop feed callback. Reduced motion displays the final static state immediately.

- [ ] **Step 6: Implement Celestial Foil Pixel CSS**

Use 5:7 cards, rarity variables, layered borders, art windows, and `object-fit:contain`. Common has no animation; Rare has restrained runes; Epic has diagonal sheen; Legendary has gold pulse/sigils; Mythic has prismatic constellation motion and a five-star crown. Default phone grid is two columns, 370px+ is three columns, desktop uses `auto-fill` with a 140px minimum. Hover lift exists only in a fine-pointer media query.

- [ ] **Step 7: Replace the legacy gallery in `GameUI`**

Remove `_ensureCardGalleryStyles` and `_renderCardGallery`. Instantiate one `CardAlbum` when the Card tab first opens, update its card state on inventory/reward/fusion changes, and destroy it when `GameUI` is torn down. Import `cards.css` from `index.css`.

- [ ] **Step 8: Run UI and full tests**

Run: `node --test test/cards/cardAlbum.test.js && npm test`

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/ui/CardAlbum.js src/ui/GameUI.js src/styles/cards.css src/styles/index.css test/cards/cardAlbum.test.js
git commit -m "feat: build premium responsive card album"
```

### Task 8: Produce and validate 60 unique pixel-art assets

**Files:**
- Create: `public/assets/cards/*.webp`
- Create: `test/cards/cardArt.test.js`

**Interfaces:**
- Consumes: every `card.art` path and visual identity in `CARD_CATALOG`.
- Produces: one transparent 96×96 WebP image per card.

- [ ] **Step 1: Write the failing asset validation test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CARD_CATALOG } from '../../src/cards/CardCatalog.js';

test('every catalog art path is a unique WebP without emoji fallback', async () => {
  const hashes = new Set();
  for (const card of CARD_CATALOG) {
    assert.match(card.art, /^\/assets\/cards\/[a-z0-9_]+\.webp$/);
    const bytes = await readFile(new URL(`../../public${card.art}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
    hashes.add(Buffer.from(bytes).toString('base64'));
  }
  assert.equal(hashes.size, 60);
});
```

- [ ] **Step 2: Run and verify asset failures**

Run: `node --test test/cards/cardArt.test.js`

Expected: FAIL listing missing asset paths.

- [ ] **Step 3: Generate the 60-card art set**

Use the `imagegen` skill to generate cohesive sprite sheets by rarity, with this fixed art direction: “96×96 game sprite, transparent background, crisp pixel art, full creature silhouette, centered, no frame, no lettering, no icon, no emoji, limited palette, readable at 48px.” Give every creature its named anatomy/colors and each Mythic a unique celestial aura. Split sprite sheets into exact catalog filenames without resampling blur; convert with lossless WebP and preserve transparency.

- [ ] **Step 4: Inspect representative and high-rarity assets**

Render and visually inspect C-01, R-01, E-01, all 12 Legendary, and all 12 Mythic at native 96×96 and nearest-neighbor 384×384. Regenerate any image with illegible silhouette, accidental text/frame, opaque background, duplicated composition, or non-pixel smoothing.

- [ ] **Step 5: Run validation and commit**

Run: `node --test test/cards/cardArt.test.js test/cards/cardCatalog.test.js`

Expected: both tests PASS and report 60 unique valid WebP files.

```bash
git add public/assets/cards test/cards/cardArt.test.js
git commit -m "feat: add collectible pixel card art"
```

### Task 9: End-to-end verification and release readiness

**Files:**
- Create: `test/cards/cardIntegration.test.js`
- Modify: `README.md`

**Interfaces:**
- Verifies all preceding interfaces together; produces no new runtime API.

- [ ] **Step 1: Add the integration acceptance test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_CATALOG } from '../../src/cards/CardCatalog.js';
import { migrateLegacyCards } from '../../src/cards/CardMigration.js';
import { aggregateCardEffects } from '../../src/cards/CardEffects.js';
import { resolveCardDrops } from '../../src/cards/CardDrops.js';
import { fuseCard } from '../../src/cards/CardProgression.js';

test('drop, collect, fuse, socket, and aggregate golden path', () => {
  const migrated = migrateLegacyCards([], {});
  let dropped = migrated.cardState;
  for (let i = 0; i < 12; i += 1) {
    dropped = resolveCardDrops({
      source: { kind: 'monster', id: 'poring' },
      cardState: dropped, random: () => 0,
    }).cardState;
  }
  for (let i = 0; i < 4; i += 1) dropped = fuseCard(dropped, 'poring');
  const effects = aggregateCardEffects({
    equippedCards: { body: 'poring' }, cardState: dropped,
  });
  assert.equal(dropped.poring.stars, 5);
  assert.equal(dropped.poring.owned, 1);
  assert.equal(effects.stats.hpBonus, 116);
  assert.equal(CARD_CATALOG.length, 60);
});
```

- [ ] **Step 2: Run the entire automated suite**

Run: `npm test`

Expected: zero failed tests, including all `test/cards/*.test.js`.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite exit 0; no missing card asset or import errors.

- [ ] **Step 4: Perform responsive and gameplay checks**

Start the app with `npm run dev -- --host 127.0.0.1`. In the browser, verify:

- 320×568: two card columns, no horizontal overflow, detail actions reachable.
- 390×844: three card columns, filter row usable, confirmation fits viewport.
- Desktop: hover effect works with mouse and keyboard focus remains visible.
- Reduced motion: foil/reveal animation is disabled.
- Defeat Poring: only Poring Card is eligible and gameplay never pauses.
- Duplicate Poring: counter/pity updates and fusion preview is correct.
- Equip a card: same ID cannot be placed in a second slot.
- Upgrade a socketed card: its effect changes without removing it.
- World boss below contribution threshold: no roll or pity.
- Eligible/MVP world-boss reward: server result persists across reload.
- Legacy profile: all old quantities and socket assignments remain.

- [ ] **Step 5: Document player-facing rules**

Add a concise README section stating rarity rates/pity, owner-specific sources, one-name socket rule, 1/2/3/5 fusion costs, five-star multipliers, and online server authority. Link the complete catalog spec rather than duplicating all 60 rows.

- [ ] **Step 6: Check repository state and commit**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files are listed.

```bash
git add test/cards/cardIntegration.test.js README.md
git commit -m "test: verify premium card collection flow"
```

- [ ] **Step 7: Final verification**

Run: `npm test && npm run build`

Expected: both commands exit 0. Record the exact pass count and build output in the implementation handoff.
