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
];

const SHOP_VISUAL_NAMES = [
  'Apple', 'Carrot', 'Red Herb', 'Green Herb', 'Yellow Herb', 'Orange Juice',
  'Blue Herb', 'Grape', 'Fishing Rod', 'Silver Ring', 'Speed Boots', 'Odin Garment',
  'Leather Bracer', 'Leather Pants', 'Steel Bracer', 'Plate Legguards', 'Guardian Wristguard', 'Dragon Greaves',
  'Poring Pet', 'Chick Pet', 'Kitten Pet', 'Puppy Pet', 'Owl Pet', 'Baby Dragon Pet',
  'Oridecon', 'Elunium',
];

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const ITEM_VISUALS = Object.freeze(Object.fromEntries([...EQUIPMENT_NAMES, ...SHOP_VISUAL_NAMES].map(name => [name, Object.freeze({
  icon: `/assets/items/equipment/${slug(name)}.png`,
})])));

export function canonicalItemName(itemOrName) {
  if (typeof itemOrName === 'string') return itemOrName;
  return itemOrName?.item_name || itemOrName?.name || '';
}

export function itemIconPath(itemOrName) {
  return ITEM_VISUALS[canonicalItemName(itemOrName)]?.icon || null;
}

export function itemIconMarkup(itemOrName, fallbackEmoji = '📦', className = '') {
  const name = canonicalItemName(itemOrName);
  const path = itemIconPath(name);
  const safeName = String(name).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  if (path) {
    return `<span class="item-visual ${className}" aria-hidden="true"><img src="${path}" alt="" loading="lazy"><span class="item-visual__fallback">${fallbackEmoji}</span></span><span class="sr-only">${safeName}</span>`;
  }
  return `<span class="item-visual item-visual--emoji ${className}" aria-hidden="true"><span>${fallbackEmoji}</span></span><span class="sr-only">${safeName}</span>`;
}
