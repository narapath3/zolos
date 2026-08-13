import { getCard } from '../cards/CardCatalog.js';

// Canonical visual identity shared by shop, inventory, market, equipment UI,
// and character rendering. Never trust the emoji stored on an inventory row:
// old rows may contain a stale platform-colored glyph.

const EQUIPMENT_NAMES = [
  'Novice Cutter', 'Sword', 'Bow', 'Gun', 'Mage Staff', 'Holy Rod',
  'Katana', 'Crossbow', 'Silver Dagger', 'Heavy Warhammer', 'Excalibur', 'Rudra Bow',
  'Ragnarok Blade', 'Ember Fang', 'Frost Cleaver', 'Stormcaller Bow', 'Soulreaper', 'Godslayer',
  'Wooden Buckler', 'Iron Shield', 'Tear Shield', 'Golden Shield', 'Aegis of Olympus', 'Cowboy Hat',
  'Wizard Hat', 'Crown', 'Sunglasses', 'Classic Glasses', 'Cotton Shirt', 'Adventurer Suit',
  'Iron Helm', 'Leather Cloak', 'Steel Plate Mail', 'Ranger Hood', 'Dragon Scale Mail', 'Valkyrie Armor',
  'Solaris Edge', 'Chronos Bow', 'Genesis Staff', 'Seraph Rod', 'Empyrean Plate', 'Wings of Aeon',
  'Aegis Prime', 'Crown of the First Light', 'Oracle Lens', 'Titan Bracers', 'Astral Legguards',
  'Worldwalker Greaves', 'Eternity Ring', 'Heart of Cosmos',
  'Celestial Sovereign Helm',
];

const SHOP_VISUAL_NAMES = [
  'Apple', 'Carrot', 'Red Herb', 'Green Herb', 'Yellow Herb', 'Orange Juice',
  'Blue Herb', 'Grape', 'Fishing Rod', 'Silver Ring', 'Speed Boots', 'Odin Garment',
  'Leather Bracer', 'Leather Pants', 'Steel Bracer', 'Plate Legguards', 'Guardian Wristguard', 'Dragon Greaves',
  'Poring Pet', 'Chick Pet', 'Kitten Pet', 'Puppy Pet', 'Owl Pet', 'Baby Dragon Pet',
  'Oridecon', 'Elunium',
];

const FISH_VISUAL_NAMES = [
  'Tilapia', 'Catfish', 'Carp', 'Perch', 'Sardine', 'Anchovy', 'Mackerel', 'Herring', 'Shad', 'Smelt',
  'Goby', 'Mullet', 'Sole', 'Crucian Carp', 'Bass', 'Trout', 'Pike', 'Bluegill', 'Minnow', 'Sunfish',
  'Roach', 'Dace', 'Whiting', 'Flounder', 'Snapper', 'Cod', 'Haddock', 'Pollock', 'Butterfish', 'Sea Bass',
  'Rainbow Trout', 'Salmon', 'Tuna', 'Swordfish', 'Eel', 'Barramundi', 'Grouper', 'Red Snapper', 'Yellowtail',
  'Pompano', 'Wahoo', 'Mahi-Mahi', 'Sailfish', 'Sturgeon', 'Walleye', 'Striped Bass', 'King Mackerel',
  'Dorado', 'Arapaima', 'Paddlefish', 'Tarpon', 'Bonefish', 'Golden Koi', 'Arowana', 'Moonfish', 'Ghost Fish',
  'Crystal Fish', 'Sunstone Fish', 'Stargazer', 'Coelacanth', 'Electric Eel', 'Oarfish', 'Piranha', 'Marlin',
  'Giant Catfish', 'Anglerfish', 'Great White Shark', 'Hammerhead', 'Raja Ampat Shark', 'Leviathan',
  'Phoenix Fish', 'Frost Dragon Fish', 'Emperor Fish',
];

const PET_ATLAS_ORDER = [
  'Poring Pet', 'Chick Pet', 'Kitten Pet', 'Puppy Pet',
  'Sunfox Pet', 'Moss Turtle Pet', 'Owl Pet', 'Cloudling Pet',
  'Moon Hare Pet', 'Baby Dragon Pet', 'Bloom Fairy Pet', 'Ember Phoenix Pet',
];

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const ITEM_VISUALS = Object.freeze(Object.fromEntries([
  ...[...EQUIPMENT_NAMES, ...SHOP_VISUAL_NAMES].map(name => [name, Object.freeze({ icon: `/assets/items/equipment/${slug(name)}.png` })]),
  ...FISH_VISUAL_NAMES.map(name => [name, Object.freeze({ icon: `/assets/items/fish/${slug(name)}.png` })]),
  ['Bug Hunter Emblem', Object.freeze({ icon: '/assets/items/titles/bug-hunter-emblem.png' })],
  ['Master Angler Trophy', Object.freeze({ icon: '/assets/items/titles/master-angler-trophy.png' })],
]));

export function canonicalItemName(itemOrName) {
  if (typeof itemOrName === 'string') return itemOrName;
  return itemOrName?.item_name || itemOrName?.name || '';
}

export function itemIconPath(itemOrName) {
  const name = canonicalItemName(itemOrName);
  return ITEM_VISUALS[name]?.icon || getCard(name)?.art || null;
}

export function itemIconMarkup(itemOrName, _legacyFallback = '', className = '') {
  const name = canonicalItemName(itemOrName);
  const petIndex = PET_ATLAS_ORDER.indexOf(name);
  const path = itemIconPath(name);
  const safeName = String(name).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  if (petIndex >= 0) {
    const col = petIndex % 4;
    const row = Math.floor(petIndex / 4);
    const x = col * 100 / 3;
    const y = row * 50;
    return `<span class="item-visual item-visual--pet ${className}" aria-hidden="true"><span class="item-visual__pet-art" style="--pet-x:${x}%;--pet-y:${y}%"></span></span><span class="sr-only">${safeName}</span>`;
  }
  if (path) {
    return `<span class="item-visual ${className}" aria-hidden="true"><img src="${path}" alt="" loading="lazy" onerror="this.src='/assets/items/fallback/unknown-loot.png';this.onerror=null"></span><span class="sr-only">${safeName}</span>`;
  }
  return `<span class="item-visual item-visual--model ${className}" aria-hidden="true"><img data-item-model="${safeName}" alt="" loading="lazy" src="/assets/items/fallback/unknown-loot.png"></span><span class="sr-only">${safeName}</span>`;
}
