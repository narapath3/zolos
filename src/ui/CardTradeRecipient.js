function normalizedName(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

export function displayedCharacterUid(characterId) {
  const suffix = String(characterId || '').split('_').pop() || '';
  return suffix.slice(0, 8).toUpperCase();
}

export function isRawCharacterUid(value) {
  const clean = String(value || '').trim().replace(/^#/, '');
  return /^[a-z0-9]{8}$/i.test(clean);
}

export function isTradeCharacterOnline(onlinePlayers = [], target = null) {
  if (!target?.characterId) return false;
  return onlinePlayers.some(
    player => player?.characterId === target.characterId
      && (!target.userId || player?.userId === target.userId),
  );
}

export function mergeTradeRecipients(onlinePlayers = [], dbPlayers = [], selfCharacterId = null) {
  const recipients = new Map();

  for (const player of onlinePlayers) {
    const key = normalizedName(player?.username);
    if (!key || player?.characterId === selfCharacterId) continue;
    recipients.set(key, {
      username: player.username,
      userId: player.userId || null,
      characterId: player.characterId || null,
      level: player.level || 1,
      online: true,
    });
  }

  for (const player of dbPlayers) {
    const key = normalizedName(player?.username);
    if (!key || player?.characterId === selfCharacterId) continue;
    const onlineMatch = recipients.get(key);
    recipients.set(key, {
      username: player.username,
      userId: player.userId || onlineMatch?.userId || null,
      characterId: player.characterId || onlineMatch?.characterId || null,
      level: player.level || onlineMatch?.level || 1,
      online: Boolean(onlineMatch),
    });
  }

  return [...recipients.values()].slice(0, 5);
}

export async function resolveTradeRecipientInput({
  rawInput,
  selectedTarget = null,
  searchByName,
  resolveByUid,
}) {
  const input = String(rawInput || '').trim();
  if (!input) return { ok: false, reason: 'missing' };

  if (selectedTarget && (selectedTarget.characterId || selectedTarget.userId)) {
    return { ok: true, source: 'selected', target: selectedTarget };
  }

  if (isRawCharacterUid(input)) {
    const uid = input.replace(/^#/, '').toUpperCase();
    const target = await resolveByUid(uid);
    return target
      ? { ok: true, source: 'uid', target }
      : { ok: false, reason: 'uid_not_found' };
  }

  const matches = await searchByName(input);
  const exact = (matches || []).find(
    candidate => normalizedName(candidate?.username) === normalizedName(input),
  );
  return exact
    ? { ok: true, source: 'name', target: exact }
    : { ok: false, reason: 'name_not_found' };
}
