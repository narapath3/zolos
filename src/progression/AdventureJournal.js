export const JOURNAL_VERSION = 1;

export const MONSTER_MASTERY_TIERS = Object.freeze([
  { id: 'bronze', label: 'Bronze', kills: 10, color: '#cd7f32' },
  { id: 'silver', label: 'Silver', kills: 50, color: '#c7d2df' },
  { id: 'gold', label: 'Gold', kills: 200, color: '#ffd65a' },
]);

export function createAdventureJournal() {
  return { version: JOURNAL_VERSION, monsters: {}, totalKills: 0, lastUpdated: null };
}

export function normalizeMonsterName(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function sanitizeAdventureJournal(raw) {
  const result = createAdventureJournal();
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, entry] of Object.entries(raw.monsters || {})) {
    const normalized = normalizeMonsterName(key);
    if (!normalized) continue;
    const kills = Math.max(0, Math.floor(Number(entry?.kills ?? entry) || 0));
    if (!kills) continue;
    result.monsters[normalized] = {
      kills,
      firstDefeatedAt: typeof entry?.firstDefeatedAt === 'string' ? entry.firstDefeatedAt : null,
      lastDefeatedAt: typeof entry?.lastDefeatedAt === 'string' ? entry.lastDefeatedAt : null,
    };
  }
  result.totalKills = Object.values(result.monsters).reduce((sum, entry) => sum + entry.kills, 0);
  result.lastUpdated = typeof raw.lastUpdated === 'string' ? raw.lastUpdated : null;
  return result;
}

export function recordMonsterDefeat(journal, monsterName, now = new Date().toISOString()) {
  const clean = sanitizeAdventureJournal(journal);
  const key = normalizeMonsterName(monsterName);
  if (!key) return { journal: clean, entry: null, firstDiscovery: false, tierUnlocked: null };
  const previous = clean.monsters[key] || { kills: 0, firstDefeatedAt: now, lastDefeatedAt: now };
  const previousTier = masteryForKills(previous.kills).id;
  const entry = {
    kills: previous.kills + 1,
    firstDefeatedAt: previous.firstDefeatedAt || now,
    lastDefeatedAt: now,
  };
  clean.monsters[key] = entry;
  clean.totalKills += 1;
  clean.lastUpdated = now;
  const currentTier = masteryForKills(entry.kills).id;
  return {
    journal: clean,
    entry,
    firstDiscovery: previous.kills === 0,
    tierUnlocked: currentTier !== previousTier && currentTier !== 'unranked' ? currentTier : null,
  };
}

export function masteryForKills(kills) {
  const count = Math.max(0, Number(kills) || 0);
  let current = { id: 'unranked', label: 'Unranked', kills: 0, color: '#77849a' };
  for (const tier of MONSTER_MASTERY_TIERS) if (count >= tier.kills) current = tier;
  const next = MONSTER_MASTERY_TIERS.find(tier => count < tier.kills) || null;
  return { ...current, next, remaining: next ? Math.max(0, next.kills - count) : 0 };
}

export function getMonsterJournalEntry(journal, monster) {
  const names = [monster?.name, monster?.key].map(normalizeMonsterName).filter(Boolean);
  for (const name of names) if (journal?.monsters?.[name]) return journal.monsters[name];
  return { kills: 0, firstDefeatedAt: null, lastDefeatedAt: null };
}

export function summarizeJournal(journal, monsterCatalog) {
  const clean = sanitizeAdventureJournal(journal);
  const monsters = Object.entries(monsterCatalog || {}).map(([key, monster]) => ({ key, ...monster }));
  const entries = monsters.map(monster => ({ monster, entry: getMonsterJournalEntry(clean, monster) }));
  const discovered = entries.filter(row => row.entry.kills > 0).length;
  const tierCounts = Object.fromEntries(MONSTER_MASTERY_TIERS.map(tier => [tier.id, 0]));
  for (const row of entries) {
    const tier = masteryForKills(row.entry.kills).id;
    if (tierCounts[tier] != null) tierCounts[tier]++;
  }
  return {
    totalSpecies: monsters.length,
    discovered,
    discoveryPercent: monsters.length ? Math.round(discovered / monsters.length * 100) : 0,
    totalKills: clean.totalKills,
    tierCounts,
    entries,
  };
}
