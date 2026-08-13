export const SKYRAIL_MAP_ID = 'skyrail_bazaar';
export const SKYRAIL_TIME_ZONE = 'Asia/Bangkok';
export const SKYRAIL_OPEN_MINUTE = 18 * 60;
export const SKYRAIL_CLOSE_MINUTE = 24 * 60;
// Temporary QA switch: keep the bazaar reachable all day while its activities
// are being play-tested. Set to false to restore the 18:00–23:59 schedule.
export const SKYRAIL_TEST_ALWAYS_OPEN = true;

export const SKYRAIL_ACTIVITIES = Object.freeze([
  { start: '18:00', end: '18:30', id: 'opening_market', icon: '🎆', name: 'พิธีเปิดตลาดเวหา', desc: 'เช็กอิน รับบัฟ Festival Luck และชมร้านค้าพิเศษเปิดตลาด' },
  { start: '18:30', end: '19:00', id: 'poring_race', icon: '🏁', name: 'Poring Sky Race', desc: 'เลือกเชียร์ Poring นักแข่ง ลุ้นผลการแข่งขันประจำรอบ' },
  { start: '19:00', end: '19:30', id: 'fishing_storm', icon: '🎣', name: 'Fishing Storm', desc: 'ฝูงปลาหายากผ่านเกาะลอย อัตราพบปลาและสมบัติเพิ่มขึ้น' },
  { start: '19:30', end: '20:00', id: 'crystal_rush', icon: '💎', name: 'Crystal Rush', desc: 'ขุด Sky Crystal แข่งกับเวลา พร้อมโบนัสการช่วยกันทั้งแมพ' },
  { start: '20:00', end: '20:30', id: 'pet_parade', icon: '🐾', name: 'Pet Parade', desc: 'พาสัตว์เลี้ยงเดินพาเหรด รับ XP สัตว์เลี้ยงและคะแนนความนิยม' },
  { start: '20:30', end: '21:00', id: 'mimic_hunt', icon: '🎁', name: 'Mimic Hunt', desc: 'ตามหาหีบปลอมที่ซ่อนทั่วตลาดก่อนมันย้ายตำแหน่ง' },
  { start: '21:00', end: '21:30', id: 'skyrail_defense', icon: '🛡️', name: 'Skyrail Defense', desc: 'ร่วมป้องกันแกนพลังงานจากโจรสลัดเวหาและ Mini Boss' },
  { start: '21:30', end: '22:00', id: 'dance_party', icon: '🎶', name: 'Starlight Dance Party', desc: 'ปาร์ตี้กลางลาน รับ Social Buff เมื่ออยู่ร่วมกับผู้เล่นคนอื่น' },
  { start: '22:00', end: '22:30', id: 'fishing_storm_2', icon: '🎣', name: 'Fishing Storm: Moonlight', desc: 'ปลารอบค่ำและหีบ Moonlight ปรากฏเฉพาะช่วงนี้' },
  { start: '22:30', end: '23:00', id: 'mimic_hunt_2', icon: '🔎', name: 'Golden Mimic Hunt', desc: 'ล่าหีบทองหายาก โบนัส Token สูงกว่ารอบปกติ' },
  { start: '23:00', end: '23:30', id: 'skyrail_defense_2', icon: '🐉', name: 'Skyrail Defense: Final Wave', desc: 'ศึกป้องกันรอบใหญ่ ปิดท้ายด้วยกัปตันโจรสลัดเวหา' },
  { start: '23:30', end: '24:00', id: 'grand_jackpot', icon: '🌟', name: 'Grand Bazaar Finale', desc: 'สรุปแต้มทั้งคืน เปิดหีบรวม และถ่ายรูปพลุส่งท้ายตลาด' },
]);

function bangkokParts(now) {
  const date = now instanceof Date ? now : new Date(now);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SKYRAIL_TIME_ZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
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
  const second = p.second || 0;
  const isOpen = SKYRAIL_TEST_ALWAYS_OPEN || (minute >= SKYRAIL_OPEN_MINUTE && minute < SKYRAIL_CLOSE_MINUTE);
  // In QA mode the six-hour festival program loops four times per day.
  const scheduleMinute = SKYRAIL_TEST_ALWAYS_OPEN
    ? SKYRAIL_OPEN_MINUTE + (minute % (SKYRAIL_CLOSE_MINUTE - SKYRAIL_OPEN_MINUTE))
    : minute;
  const currentIndex = isOpen
    ? SKYRAIL_ACTIVITIES.findIndex(a => scheduleMinute >= parseMinute(a.start) && scheduleMinute < parseMinute(a.end))
    : -1;
  const current = currentIndex >= 0 ? SKYRAIL_ACTIVITIES[currentIndex] : null;
  const next = isOpen ? SKYRAIL_ACTIVITIES[currentIndex + 1] || null : SKYRAIL_ACTIVITIES[0];
  const remainingSeconds = current ? Math.max(0, parseMinute(current.end) * 60 - (scheduleMinute * 60 + second)) : 0;
  return { isOpen, minute, current, next, remainingSeconds, opensAt: '18:00', closesAt: '23:59', timeZone: SKYRAIL_TIME_ZONE, testAlwaysOpen: SKYRAIL_TEST_ALWAYS_OPEN };
}

export function canEnterSkyrail(mapId, now = new Date()) {
  return mapId !== SKYRAIL_MAP_ID || getSkyrailStatus(now).isOpen;
}
