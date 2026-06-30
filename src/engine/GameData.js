// Game Data — Monster definitions, items, EXP curve, etc.

// ============ MONSTERS ============
export const MONSTERS = {
    poring: {
        name: 'Poring',
        emoji: '🟢',
        color: 0x80ff80,
        hp: 30,
        atk: 5,
        def: 2,
        exp: 15,
        gold: { min: 2, max: 8 },
        size: 0.6,
        speed: 0.5,
        loot: [
            { name: 'Jellopy', emoji: '💎', type: 'material', chance: 0.6 },
            { name: 'Sticky Mucus', emoji: '💧', type: 'material', chance: 0.2 },
            { name: 'Apple', emoji: '🍎', type: 'consumable', chance: 0.15 },
        ]
    },
    lunatic: {
        name: 'Lunatic',
        emoji: '🐰',
        color: 0xffffff,
        hp: 40,
        atk: 8,
        def: 3,
        exp: 20,
        gold: { min: 3, max: 12 },
        size: 0.5,
        speed: 0.8,
        loot: [
            { name: 'Clover', emoji: '🍀', type: 'material', chance: 0.5 },
            { name: 'Feather', emoji: '🪶', type: 'material', chance: 0.3 },
            { name: 'Carrot', emoji: '🥕', type: 'consumable', chance: 0.15 },
        ]
    },
    fabre: {
        name: 'Fabre',
        emoji: '🐛',
        color: 0x80c040,
        hp: 50,
        atk: 10,
        def: 4,
        exp: 28,
        gold: { min: 5, max: 15 },
        size: 0.5,
        speed: 0.3,
        loot: [
            { name: 'Worm Peeling', emoji: '🧬', type: 'material', chance: 0.5 },
            { name: 'Green Herb', emoji: '🌿', type: 'consumable', chance: 0.3 },
            { name: 'Silk', emoji: '🧵', type: 'material', chance: 0.1 },
        ]
    },
    rocker: {
        name: 'Rocker',
        emoji: '🦗',
        color: 0xc08040,
        hp: 70,
        atk: 14,
        def: 5,
        exp: 40,
        gold: { min: 8, max: 20 },
        size: 0.7,
        speed: 0.6,
        loot: [
            { name: 'Grasshopper Leg', emoji: '🦿', type: 'material', chance: 0.5 },
            { name: 'Scell', emoji: '🪙', type: 'material', chance: 0.2 },
            { name: 'Yellow Herb', emoji: '🌾', type: 'consumable', chance: 0.15 },
        ]
    },
    willow: {
        name: 'Willow',
        emoji: '🌳',
        color: 0x604020,
        hp: 100,
        atk: 18,
        def: 8,
        exp: 55,
        gold: { min: 10, max: 30 },
        size: 0.9,
        speed: 0.2,
        loot: [
            { name: 'Tree Root', emoji: '🪵', type: 'material', chance: 0.5 },
            { name: 'Wooden Heart', emoji: '❤️‍🔥', type: 'material', chance: 0.1 },
            { name: 'Red Herb', emoji: '🌺', type: 'consumable', chance: 0.25 },
        ]
    },
    poporing: {
        name: 'Poporing',
        emoji: '🟣',
        color: 0xc060ff,
        hp: 150,
        atk: 22,
        def: 10,
        exp: 80,
        gold: { min: 15, max: 40 },
        size: 0.65,
        speed: 0.5,
        loot: [
            { name: 'Grape', emoji: '🍇', type: 'consumable', chance: 0.4 },
            { name: 'Poison Spore', emoji: '☠️', type: 'material', chance: 0.3 },
            { name: 'Blue Herb', emoji: '💙', type: 'consumable', chance: 0.1 },
        ]
    },
    drops: {
        name: 'Drops',
        emoji: '🟠',
        color: 0xff8020,
        hp: 200,
        atk: 28,
        def: 12,
        exp: 110,
        gold: { min: 20, max: 50 },
        size: 0.6,
        speed: 0.6,
        loot: [
            { name: 'Orange Juice', emoji: '🧃', type: 'consumable', chance: 0.3 },
            { name: 'Sticky Webfoot', emoji: '🦶', type: 'material', chance: 0.2 },
            { name: 'Crystal Blue', emoji: '🔵', type: 'material', chance: 0.05 },
        ]
    }
};

// ============ EXP TABLE ============
export function getExpRequired(level) {
    return Math.floor(100 * Math.pow(1.35, level - 1));
}

// ============ STAT GAINS PER LEVEL ============
export function getStatGains(level) {
    return {
        max_hp: 15 + Math.floor(level * 2),
        max_sp: 5 + Math.floor(level * 0.8),
        atk: 2 + Math.floor(level * 0.5),
        def: 1 + Math.floor(level * 0.3),
    };
}

// ============ SPAWN TABLE (by level) ============
export function getSpawnTable(playerLevel) {
    const table = [];

    // Always spawn Porings
    table.push({ type: 'poring', weight: Math.max(10, 40 - playerLevel * 3) });

    if (playerLevel >= 1) table.push({ type: 'lunatic', weight: 30 });
    if (playerLevel >= 3) table.push({ type: 'fabre', weight: 25 });
    if (playerLevel >= 5) table.push({ type: 'rocker', weight: 20 });
    if (playerLevel >= 8) table.push({ type: 'willow', weight: 18 });
    if (playerLevel >= 12) table.push({ type: 'poporing', weight: 15 });
    if (playerLevel >= 16) table.push({ type: 'drops', weight: 12 });

    return table;
}

export function pickRandomMonster(playerLevel) {
    const table = getSpawnTable(playerLevel);
    const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of table) {
        roll -= entry.weight;
        if (roll <= 0) return entry.type;
    }
    return table[0].type;
}
