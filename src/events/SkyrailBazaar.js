export const SKYRAIL_MAP_ID = 'skyrail_bazaar';
export const SKYRAIL_TIME_ZONE = 'Asia/Bangkok';
export const SKYRAIL_OPEN_MINUTE = 18 * 60;
export const SKYRAIL_CLOSE_MINUTE = 24 * 60;
// Temporary QA switch: keep the bazaar reachable all day while its activities
// are being play-tested. Set to false to restore the 18:00–23:59 schedule.
export const SKYRAIL_TEST_ALWAYS_OPEN = true;

export const SKYRAIL_ACTIVITIES = Object.freeze([
  { start: '18:00', end: '19:30', id: 'skyrail_circuit', icon: '🏁', name: 'Skyrail Circuit', desc: 'วิ่งผ่านลานทั้ง 4 ตามลำดับ: ตะวันออก → เหนือ → ตะวันตก → ใต้' },
  { start: '19:30', end: '21:00', id: 'crystal_relay', icon: '💎', name: 'Crystal Relay', desc: 'ส่งพลังย้อนวงแหวน: ใต้ → ตะวันตก → เหนือ → ตะวันออก → แกนกลาง' },
  { start: '21:00', end: '22:30', id: 'core_calibration', icon: '⚡', name: 'Core Calibration', desc: 'เข้าถึงแกนกลางและยืนรักษาสมดุลพลังงานให้ครบ 15 วินาที' },
  { start: '22:30', end: '24:00', id: 'grand_tour', icon: '🌟', name: 'Grand Bazaar Tour', desc: 'สำรวจแกนกลางและลานครบทั้ง 4 จุดเพื่อเคลียร์รอบสุดท้าย' },
]);

export const SKYRAIL_CHECKPOINTS = Object.freeze({
  east: Object.freeze({ id: 'east', name: 'ลานตะวันออก', x: 19, z: 0, radius: 5 }),
  north: Object.freeze({ id: 'north', name: 'ลานเหนือ', x: 0, z: 19, radius: 5 }),
  west: Object.freeze({ id: 'west', name: 'ลานตะวันตก', x: -19, z: 0, radius: 5 }),
  south: Object.freeze({ id: 'south', name: 'ลานใต้', x: 0, z: -19, radius: 5 }),
  core: Object.freeze({ id: 'core', name: 'แกนพลังงานกลาง', x: 0, z: 0, radius: 6 }),
});

const SKYRAIL_ROUTES = Object.freeze({
  skyrail_circuit: Object.freeze(['east', 'north', 'west', 'south']),
  crystal_relay: Object.freeze(['south', 'west', 'north', 'east', 'core']),
  core_calibration: Object.freeze(['core']),
  grand_tour: Object.freeze(['core', 'east', 'north', 'west', 'south']),
});

export function getSkyrailRoute(activityId) {
  return SKYRAIL_ROUTES[activityId] || Object.freeze([]);
}

export class SkyrailActivitySession {
  constructor() { this.reset(null); }
  reset(activityId) {
    this.activityId = activityId;
    this.route = getSkyrailRoute(activityId);
    this.index = 0;
    this.dwellSeconds = 0;
    this.completed = false;
    this.justCompleted = false;
  }
  update(activityId, position, dt = 0) {
    if (activityId !== this.activityId) this.reset(activityId);
    this.justCompleted = false;
    if (this.completed || !position || this.route.length === 0) return this.snapshot();
    const checkpoint = SKYRAIL_CHECKPOINTS[this.route[this.index]];
    const dx = Number(position.x) - checkpoint.x;
    const dz = Number(position.z) - checkpoint.z;
    const inside = Number.isFinite(dx) && Number.isFinite(dz) && dx * dx + dz * dz <= checkpoint.radius * checkpoint.radius;
    if (activityId === 'core_calibration') {
      this.dwellSeconds = inside ? Math.min(15, this.dwellSeconds + Math.max(0, Number(dt) || 0)) : 0;
      if (this.dwellSeconds >= 15) this._complete();
    } else if (inside) {
      this.index += 1;
      if (this.index >= this.route.length) this._complete();
    }
    return this.snapshot();
  }
  _complete() { this.completed = true; this.justCompleted = true; }
  snapshot() {
    const nextId = this.completed ? null : this.route[this.index];
    return {
      activityId: this.activityId, completed: this.completed, justCompleted: this.justCompleted,
      current: Math.min(this.index, this.route.length), total: this.route.length,
      dwellSeconds: this.dwellSeconds, dwellTarget: this.activityId === 'core_calibration' ? 15 : 0,
      nextCheckpoint: nextId ? SKYRAIL_CHECKPOINTS[nextId] : null,
    };
  }
}

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
