# Premium Pixel Card Collection Design

## Objective

Replace the current 17-card presentation and world-boss-only drop roll with a 60-card, long-term collection system. Every card has unique pixel artwork, real combat effects, an explicit source and drop rate, five-star duplicate progression, and a premium collectible presentation.

## Approved Product Direction

- Use a data-driven card catalog as the source of truth.
- Use the Celestial Foil Pixel visual direction.
- Ship exactly 60 cards: 12 Common, 12 Rare, 12 Epic, 12 Legendary, and 12 Mythic.
- Normal monster cards drop from their named owner.
- Boss and event cards drop only from the stated boss, activity, or event.
- Only one copy of a card name may be socketed at a time.
- Duplicate cards upgrade the owned card to five stars.
- Preserve every card already owned or socketed by existing players.

## Player Experience

The golden path is:

1. A player defeats a named monster.
2. A card drop uses a dedicated reveal animation rather than an ordinary loot line.
3. The new card appears in the Card Album with its unique pixel art, collection number, rarity material, ability, socket category, source, and exact drop chance.
4. Selecting the card shows where to hunt the next copy.
5. Duplicate copies fill the star-upgrade requirement.
6. At five stars the card gains its maximum numeric scaling and a distinct foil treatment.

The Card Album always shows all 60 positions. Unowned cards appear as silhouettes with source hints; secret event cards conceal their name and full art until discovered.

## Visual System

### Shared Anatomy

Every card uses a 5:7 ratio and contains:

- collection number and rarity;
- card name;
- unique monster pixel artwork, never emoji artwork;
- socket-category crest;
- primary ability name;
- compact effect values;
- current star row;
- owned quantity or duplicate progress;
- source and drop chance in the detail view.

Pixel assets use a consistent native canvas, transparent background, nearest-neighbor scaling, and no smoothing. The recommended native art size is 96×96 pixels so each monster retains readable silhouettes on phone screens.

### Rarity Materials

- Common: brushed silver, quiet slate background, no animated foil.
- Rare: sapphire edge, blue rune particles, restrained light sweep.
- Epic: amethyst frame, animated holographic diagonal sheen.
- Legendary: engraved gold frame, warm pulse, animated corner sigils.
- Mythic: celestial prismatic frame, unique aura per card, slow constellation motion, and a five-star crown treatment.

Motion must respect `prefers-reduced-motion`. Hover elevation applies only to fine pointers. Touch interactions use press feedback and a minimum 44px target.

## Architecture

### Catalog

Create a dedicated card catalog module. Each card record has:

```js
{
  id: 'poring',
  itemName: 'Poring Card',
  displayName: 'Poring',
  collectionNo: 'C-01',
  rarity: 'common',
  slot: 'armor',
  art: '/assets/cards/poring.webp',
  abilityName: 'Gelatin Guard',
  stats: { hpBonus: 80 },
  effect: null,
  source: {
    kind: 'monster',
    id: 'poring',
    label: 'Poring · Prontera Field',
    chance: 0.02,
    pity: 100
  },
  lore: '...',
  legacyAliases: ['Poring Card']
}
```

The catalog supplies the UI, combat calculations, drop resolver, admin item list, socket picker, and collection progress. Card values must not be duplicated in `ITEMS`.

World bosses currently use display-name strings. Replace that list with structured boss records containing a stable ID, display name, and map eligibility. The six existing bosses receive the IDs `valdris`, `ignarok`, `abyss_golem`, `morgath`, `kaltharu`, and `zulgaroth`; visible names remain unchanged.

### Supported Effects

Keep the effect engine bounded to these reusable effect types:

- `damagePct`: all outgoing damage;
- `critBonus`: critical chance;
- `lifestealPct`: healing from damage dealt;
- `damageToFamily`: bonus damage against a monster family;
- `damageReduction`: incoming damage reduction;
- `onKillRestore`: HP or SP restored after a kill;
- `executePct`: execute non-boss enemies below a health threshold;
- `lowHpPower`: increased damage while player HP is below a threshold;
- `bossDamagePct`: bonus damage against bosses;
- `dropRatePct`: card drop-rate bonus, capped globally.

No card adds an unbounded custom callback. Effects are declarative and evaluated by shared combat/drop helpers.

## Five-Star Fusion

The first owned copy is one star. Upgrades consume duplicate copies:

| Upgrade | Duplicate cost | Total duplicates consumed | Power multiplier |
|---|---:|---:|---:|
| 1★ → 2★ | 1 | 1 | 1.08× |
| 2★ → 3★ | 2 | 3 | 1.18× |
| 3★ → 4★ | 3 | 6 | 1.30× |
| 4★ → 5★ | 5 | 11 | 1.45× |

The multiplier applies to numeric card stats and effect magnitude. Chances and thresholds have per-effect caps so a star upgrade cannot create guaranteed critical hits, full damage immunity, or uncontrolled drop-rate multiplication.

Fusion rules:

- socketed cards may be upgraded without removing them;
- fusion cannot consume the final owned base copy;
- the server/database update is atomic;
- failed persistence leaves quantity and star level unchanged;
- a confirmation screen shows before/after values and duplicate cost.

## Drop Model

Drop resolution happens once in the authoritative reward path. The client never decides whether an online drop succeeded.

### Base Rates

| Rarity | Standard eligible source | Base chance | Pity |
|---|---|---:|---:|
| Common | normal monster owner | 2.00% | 100 eligible kills |
| Rare | normal/elite owner | 0.75% | 250 eligible kills |
| Epic | elite or map boss owner | 0.20% | 500 eligible kills |
| Legendary | map boss/world-boss reward | 1.50% per eligible clear | 50 eligible clears |
| Mythic | named world boss/event reward | 0.35% per eligible clear | 150 eligible clears |

Rules:

- pity is tracked per card, not per rarity;
- a successful drop resets only that card’s pity;
- world-boss eligibility requires meaningful damage contribution;
- MVP may receive 2× the normal roll chance, but no extra pity progress;
- `dropRatePct` bonuses affect random chance only and never reduce pity thresholds;
- final random chance is capped at 2× base;
- offline mode uses the same resolver and persists local pity counters.

## Card Catalog

Effect values below are one-star base values.

### Common — C-01 to C-12

| No. | Card | Slot | Ability | Source |
|---|---|---|---|---|
| C-01 | Poring | armor | Gelatin Guard: HP +80 | Poring · 2.00% |
| C-02 | Willow | weapon | Rooted Strike: ATK +8 | Willow · 2.00% |
| C-03 | Lunatic | accessory | Moon Instinct: Crit +3% | Lunatic · 2.00% |
| C-04 | Fabre | armor | Soft Carapace: HP +70, DEF +2 | Fabre · 2.00% |
| C-05 | Rocker | accessory | Battle Rhythm: ATK +6 | Rocker · 2.00% |
| C-06 | Horn | shield | Shell Guard: DEF +7 | Horn · 2.00% |
| C-07 | Spore | armor | Spore Vitality: HP +90 | Spore · 2.00% |
| C-08 | Shrimp | accessory | River Energy: SP +18 | Shrimp · 2.00% |
| C-09 | Clam | shield | Pearl Shell: DEF +6, HP +30 | Clam · 2.00% |
| C-10 | Fish | accessory | Fresh Catch: SP +12, HP +35 | Fish · 2.00% |
| C-11 | Crab | shield | Sideguard: DEF +8 | Crab · 2.00% |
| C-12 | Dragon Egg | armor | Dormant Scale: HP +110 | Dragon Egg · 2.00% |

### Rare — R-01 to R-12

| No. | Card | Slot | Ability | Source |
|---|---|---|---|---|
| R-01 | Poporing | weapon | Acid Body: ATK +14, damage to Slime +5% | Poporing · 0.75% |
| R-02 | Drops | accessory | Lucky Drop: card drop rate +3% | Drops · 0.75% |
| R-03 | Savage | armor | Wild Hide: HP +160, DEF +4 | Savage · 0.75% |
| R-04 | Boa | weapon | Venom Fang: ATK +18 | Boa · 0.75% |
| R-05 | Bigfoot | armor | Forest Bulk: HP +190 | Bigfoot · 0.75% |
| R-06 | Nine Tail | accessory | Foxfire Focus: Crit +5% | Nine Tail · 0.75% |
| R-07 | Skeleton | weapon | Bone Edge: ATK +22 | Skeleton · 0.75% |
| R-08 | Zombie | armor | Undying Flesh: HP +180, kill restores 6 HP | Zombie · 0.75% |
| R-09 | Hunter Fly | accessory | Blood Wing: Lifesteal +2% | Hunter Fly · 0.75% |
| R-10 | Golem | shield | Stone Body: DEF +15 | Golem · 0.75% |
| R-11 | Marina | armor | Tidal Heart: HP +150, SP +28 | Marina · 0.75% |
| R-12 | Sea Dragon | weapon | Riptide Claw: ATK +20, boss damage +2% | Sea Dragon · 0.75% |

### Epic — E-01 to E-12

| No. | Card | Slot | Ability | Source |
|---|---|---|---|---|
| E-01 | Deviruchi | weapon | Devil’s Bargain: ATK +30, damage +4% | Deviruchi · 0.20% |
| E-02 | Ghostring | accessory | Phase Drain: Lifesteal +4%, SP +25 | Ghostring · 0.20% |
| E-03 | Archer Skeleton | weapon | Deadeye: ATK +24, Crit +6% | Archer Skeleton · 0.20% |
| E-04 | Raydric | armor | Royal Guard: DEF +18, damage reduction +3% | Raydric · 0.20% |
| E-05 | Harpy | accessory | Gale Reflex: Crit +7%, SP +35 | Harpy · 0.20% |
| E-06 | Gargoyle | shield | Granite Wings: DEF +22, HP +150 | Gargoyle · 0.20% |
| E-07 | Stone Golem | armor | Mountain Core: HP +300, DEF +12 | Stone Golem · 0.20% |
| E-08 | Iron Golem | shield | Iron Bastion: DEF +28 | Iron Golem · 0.20% |
| E-09 | Leib Olmai | weapon | Flame Rend: ATK +34, damage to Beast +8% | Leib Olmai · 0.20% |
| E-10 | Dark Illusion | accessory | Shadow Hunger: damage +5%, Lifesteal +2% | Dark Illusion · 0.20% |
| E-11 | Abyss Knight | weapon | Abyssal Edge: ATK +38, boss damage +5% | Abyss Knight · 0.20% |
| E-12 | Storm Dragon | armor | Storm Scale: HP +320, damage reduction +4% | Storm Dragon · 0.20% |

### Legendary — L-01 to L-12

| No. | Card | Slot | Ability | Source |
|---|---|---|---|---|
| L-01 | Dullahan | weapon | Headless Pursuit: ATK +45, execute below 5% | Dullahan · 1.50% map-boss clear |
| L-02 | Ghostring Prime | accessory | Ethereal Feast: Lifesteal +6%, Crit +4% | Ghostring elite event · 1.50% |
| L-03 | Angeling | armor | Holy Sanctuary: HP +480, DEF +14 | Prontera holy event · 1.50% |
| L-04 | Golden Thief Bug | shield | Golden Carapace: DEF +30, damage reduction +5% | Mjolnir elite event · 1.50% |
| L-05 | Doppelganger | weapon | Mirror Assault: ATK +44, damage +8%, Crit +4% | Glast Heim elite event · 1.50% |
| L-06 | Maya | accessory | Queen’s Command: ATK +18, Crit +8% | Payon colony event · 1.50% |
| L-07 | Baphomet | weapon | Crescent Ruin: ATK +50, boss damage +7% | Glast Heim raid · 1.50% |
| L-08 | Drake | accessory | Drowned Fortune: Lifesteal +5%, drop rate +5% | Water festival raid · 1.50% |
| L-09 | Moonlight Flower | accessory | Lunar Grace: Crit +9%, SP +65 | Payon moon event · 1.50% |
| L-10 | Turtle General | shield | General’s Bulwark: DEF +34, HP +260 | Water fortress event · 1.50% |
| L-11 | Samurai Specter | armor | Last Stand: HP +360, low-HP damage +10% | Glast Heim specter event · 1.50% |
| L-12 | Valkyrie | armor | Chosen Guard: HP +520, damage reduction +4% | Celestial trial · 1.50% |

### Mythic — M-01 to M-12

| No. | Card | Slot | Ability | Source |
|---|---|---|---|---|
| M-01 | Valdris | weapon | Infernal Sovereign: ATK +65, damage +12% | Valdris world boss · 0.35% |
| M-02 | Ignarok | armor | Dragon King: HP +700, boss damage +10% | Ignarok world boss · 0.35% |
| M-03 | Abyss Golem | shield | Unbroken World: DEF +48, reduction +8% | Golem of the Deep world boss · 0.35% |
| M-04 | Morgath | accessory | Soul Devourer: Lifesteal +9%, kill restores 20 SP | Morgath world boss · 0.35% |
| M-05 | Kaltharu | armor | Absolute Zero: HP +620, DEF +32 | Kaltharu world boss · 0.35% |
| M-06 | Zul’garoth | weapon | Godslayer: ATK +70, boss damage +14% | Zul’garoth world boss · 0.35% |
| M-07 | Nidhogg | armor | World Eater: HP +800, damage +8% | Abyss season finale · 0.35% |
| M-08 | Fenrir | accessory | Ragnarok Chase: Crit +12%, low-HP damage +14% | Mjolnir season finale · 0.35% |
| M-09 | Jormungandr | shield | Endless Coil: DEF +44, HP +500 | Water season finale · 0.35% |
| M-10 | Yggdrasil Guardian | accessory | World Sap: Lifesteal +7%, HP +420, SP +80 | Anniversary event · 0.35% |
| M-11 | Emperium Avatar | shield | Realm Aegis: DEF +50, reduction +7% | Guild season reward · 0.35% |
| M-12 | Odin’s Echo | weapon | Allfather’s Verdict: ATK +60, damage +10%, Crit +7% | Celestial collection event · 0.35% |

## UI Components

### Card Album

- filters for rarity, socket category, owned/unowned, and source map;
- collection progress by rarity and total;
- stable sorting by collection number;
- responsive grid with two columns at 320px, three at typical phones, and more on desktop;
- locked silhouettes for unowned cards;
- a visible duplicate-progress meter for the selected card.

### Card Detail

The detail surface shows:

- enlarged pixel art and foil frame;
- current star level and next-star preview;
- exact current and next-star values;
- compatible equipment category;
- source, map/activity, base chance, and pity progress;
- socket/replace action;
- fusion action with confirmation;
- short lore text.

### Drop Reveal

- freezes only the loot overlay, never game simulation;
- displays card art, rarity, source monster, and “new” or “duplicate” state;
- Legendary and Mythic drops also enter the global rare-drop feed;
- reduced-motion mode uses a static reveal without flashes.

## Persistence and Migration

- Existing inventory item names remain valid.
- The 17 legacy cards map to catalog IDs through `legacyAliases`.
- Existing quantities become one base copy plus duplicate balance.
- Existing socket assignments remain attached.
- New fields are `card_id`, `card_stars`, and per-card pity progress.
- Online fusion/drop writes are server-authoritative and atomic.
- Offline saves use the same shape so later synchronization does not lose progression.

## Security and Fairness

- The server validates source monster, kill eligibility, contribution, pity, star costs, and socket uniqueness.
- Client-provided rarity, chance, stars, or card stats are ignored.
- Drop rolls use server-side randomness online.
- A card cannot be simultaneously socketed into two equipment slots.
- Migration and fusion operations are idempotent.

## Testing and Acceptance

- Catalog validation proves exactly 60 unique IDs, 12 per rarity, valid slots, valid art paths, and supported effects.
- Every monster-backed card references an existing monster ID.
- Every world-boss card references one of the six normalized boss IDs.
- Drop tests cover base rate selection boundaries, pity, MVP multiplier, contribution requirements, and chance cap.
- Fusion tests cover 1/2/3/5 duplicate costs, five-star cap, atomic failure, and socketed upgrades.
- Migration tests prove all 17 legacy cards, quantities, and sockets survive.
- Combat tests verify each reusable effect type and star multiplier caps.
- Responsive visual checks cover 320×568, 390×844, and desktop.
- The final build must pass the existing full test suite and production build.
