// Visual contract for every equippable item. The coverage test prevents new
// equipment from silently falling back to an unrelated generic costume.
export const EQUIPMENT_VISUAL_SPECS = Object.freeze({
  body: { 'Cotton Shirt':'laced-shirt','Adventurer Suit':'adventurer-straps','Steel Plate Mail':'steel-plate','Dragon Scale Mail':'dragon-scales','Valkyrie Armor':'valkyrie-wings','Empyrean Plate':'empyrean-star' },
  weapon: { 'Novice Cutter':'cutter',Sword:'sword',Bow:'bow',Gun:'gun','Mage Staff':'mage-staff','Holy Rod':'holy-rod',Katana:'katana',Crossbow:'crossbow','Silver Dagger':'silver-dagger','Heavy Warhammer':'warhammer',Excalibur:'excalibur','Rudra Bow':'rudra-bow','Ragnarok Blade':'ragnarok-blade','Ember Fang':'ember-fang','Frost Cleaver':'frost-cleaver','Stormcaller Bow':'stormcaller-bow',Soulreaper:'soulreaper',Godslayer:'godslayer','Solaris Edge':'solaris-edge','Chronos Bow':'chronos-bow','Genesis Staff':'genesis-staff','Seraph Rod':'seraph-rod' },
  shield: { 'Wooden Buckler':'wood-buckler','Iron Shield':'iron-kite','Tear Shield':'tear-shield','Golden Shield':'golden-shield','Aegis of Olympus':'olympus-aegis','Aegis Prime':'prime-aegis' },
  glasses: { Sunglasses:'sunglasses','Classic Glasses':'classic-glasses','Oracle Lens':'oracle-lens' },
  hat: { 'Cowboy Hat':'cowboy-hat','Wizard Hat':'wizard-hat',Crown:'crown','Crown of the First Light':'first-light-crown' },
  head: { 'Iron Helm':'iron-helm','Ranger Hood':'ranger-hood','Celestial Sovereign Helm':'celestial-helm' },
  ring: { 'Silver Ring':'silver-ring','Gorgon Ring':'gorgon-eye','Glow Ring':'glow-ring','Eternity Ring':'eternity-ring' },
  feet: { 'Speed Boots':'speed-wings','Dragon Greaves':'dragon-greaves','Worldwalker Greaves':'worldwalker-greaves' },
  garment: { 'Leather Cloak':'leather-cape','Shadow Garment':'shadow-cape','Odin Garment':'odin-cape','Wings of Aeon':'aeon-wings' },
  pants: { 'Leather Pants':'leather-pants','Plate Legguards':'plate-legguards','Astral Legguards':'astral-legguards' },
  wrist: { 'Leather Bracer':'leather-bracer','Steel Bracer':'steel-bracer','Guardian Wristguard':'guardian-gem','Titan Bracers':'titan-crystal' },
  accessory: { 'Gold Earring':'gold-earring','Heart of Cosmos':'cosmos-heart' },
});

export function getEquipmentVisualSpec(slot, itemName) {
  return EQUIPMENT_VISUAL_SPECS[slot]?.[itemName] || null;
}
