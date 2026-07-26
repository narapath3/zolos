export const ONLINE_MAP_NAMES_TH = Object.freeze({
  prontera: 'เมืองพรอนเทรา',
  prontera_field: 'ทุ่งพรอนเทรา',
  payon: 'ป่าเปยอง',
  glast_heim: 'ปราสาทกลาสท์ไฮม์',
  mjolnir: 'เทือกเขามิโอลเนียร์',
  abyss_lake: 'ทะเลสาบห้วงลึก',
  svarrga: 'สรวงสวรรค์',
});

export function escapeOnlineText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

export function formatOnlinePlayerMeta(player = {}, options = {}) {
  const isOffline = player.isOffline === true;
  const parsedLevel = Number.parseInt(player.level, 10);
  const level = Number.isFinite(parsedLevel)
    ? Math.max(1, Math.min(300, parsedLevel))
    : 1;
  const candidate = player.ping == null && options.isLocal
    ? options.localPing
    : player.ping;
  const parsedPing = candidate == null ? Number.NaN : Number(candidate);
  const ping = Number.isFinite(parsedPing) && parsedPing >= 0
    ? Math.round(parsedPing)
    : null;

  return {
    cityLabel: ONLINE_MAP_NAMES_TH[player.mapId] || 'ไม่ทราบเมือง',
    levelLabel: `LV ${level}`,
    pingLabel: isOffline ? 'Offline' : ping == null ? '--ms' : `${ping}ms`,
    pingClass: isOffline
      ? 'ping-offline'
      : ping == null
        ? 'ping-unknown'
        : ping < 80
          ? 'ping-good'
          : ping < 160
            ? 'ping-mid'
            : 'ping-bad',
    isOffline,
  };
}
