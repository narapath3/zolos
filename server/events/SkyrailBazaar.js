export const SKYRAIL_MAP_ID = 'skyrail_bazaar';
export const SKYRAIL_TIME_ZONE = 'Asia/Bangkok';
export const SKYRAIL_OPEN_MINUTE = 18 * 60;
export const SKYRAIL_CLOSE_MINUTE = 24 * 60;
// Temporary QA switch. Keep in sync with src/events/SkyrailBazaar.js.
export const SKYRAIL_TEST_ALWAYS_OPEN = true;

const ACTIVITY_WINDOWS = Object.freeze([
  ['18:00', '18:30', 'opening_market'], ['18:30', '19:00', 'poring_race'],
  ['19:00', '19:30', 'fishing_storm'], ['19:30', '20:00', 'crystal_rush'],
  ['20:00', '20:30', 'pet_parade'], ['20:30', '21:00', 'mimic_hunt'],
  ['21:00', '21:30', 'skyrail_defense'], ['21:30', '22:00', 'dance_party'],
  ['22:00', '22:30', 'fishing_storm_2'], ['22:30', '23:00', 'mimic_hunt_2'],
  ['23:00', '23:30', 'skyrail_defense_2'], ['23:30', '24:00', 'grand_jackpot'],
]);

function bangkokParts(now) {
  const date = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SKYRAIL_TIME_ZONE, hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
}

function parseMinute(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function getSkyrailStatus(now = new Date()) {
  const p = bangkokParts(now);
  const minute = p.hour * 60 + p.minute;
  const isOpen = SKYRAIL_TEST_ALWAYS_OPEN || (minute >= SKYRAIL_OPEN_MINUTE && minute < SKYRAIL_CLOSE_MINUTE);
  const scheduleMinute = SKYRAIL_TEST_ALWAYS_OPEN
    ? SKYRAIL_OPEN_MINUTE + (minute % (SKYRAIL_CLOSE_MINUTE - SKYRAIL_OPEN_MINUTE))
    : minute;
  const window = ACTIVITY_WINDOWS.find(([start, end]) => scheduleMinute >= parseMinute(start) && scheduleMinute < parseMinute(end));
  return {
    isOpen,
    activityId: window?.[2] || null,
    opensAt: '18:00', closesAt: '23:59', timeZone: SKYRAIL_TIME_ZONE,
    testAlwaysOpen: SKYRAIL_TEST_ALWAYS_OPEN,
  };
}

export function canEnterSkyrail(mapId, now = new Date()) {
  return mapId !== SKYRAIL_MAP_ID || getSkyrailStatus(now).isOpen;
}
