export const FIRST_THIRTY_VERSION = 2;

export const FIRST_THIRTY_STEPS = Object.freeze([
  {
    id: 'open_journal',
    chapter: 1,
    title: 'เปิดสมุดนักผจญภัย',
    titleEn: 'Open your Adventure Journal',
    description: 'สมุดเล่มนี้จะบอกเส้นทางการเล่น เป้าหมาย และสิ่งที่ควรทำต่อไป',
    kind: 'ui',
    target: '#btn-wiki',
    icon: '📔',
    rewardLabel: 'ปลดล็อกเส้นทางนักผจญภัย',
  },
  {
    id: 'reach_guide_npc',
    chapter: 2,
    title: 'ออกเดินทางไปยังจุดแนะนำ',
    titleEn: 'Reach the guide point',
    description: 'แตะปุ่มนำทาง แล้วเดินตามหมุดสีทองบนพื้นและแผนที่ย่อ',
    kind: 'world',
    mapId: 'prontera',
    position: { x: 0, y: 0, z: 6 },
    radius: 3.2,
    icon: '🧭',
    rewardLabel: 'เปิดเส้นทางของเมือง Prontera',
  },
  {
    id: 'defeat_first_monster',
    chapter: 3,
    title: 'เอาชนะ Monster ตัวแรก',
    titleEn: 'Defeat your first Monster',
    description: 'เลือก Monster แล้วใช้ปุ่มโจมตีหรือสกิลเพื่อเริ่มการต่อสู้',
    kind: 'world',
    mapId: 'prontera',
    icon: '⚔️',
    rewardLabel: 'Combat basics complete',
  },
  {
    id: 'open_inventory',
    chapter: 4,
    title: 'ตรวจสอบกระเป๋าและอุปกรณ์',
    titleEn: 'Check your BAG',
    description: 'เปิด BAG เพื่อดูไอเทม อุปกรณ์ และของรางวัลที่ได้รับ',
    kind: 'ui',
    target: '#btn-inventory',
    icon: '🎒',
    rewardLabel: 'ปลดล็อกเส้นทางอุปกรณ์',
  },
  {
    id: 'equip_starter_rod',
    chapter: 5,
    title: 'สวมคันเบ็ดไม้เริ่มต้น',
    titleEn: 'Equip your starter fishing rod',
    description: 'เปิด BAG → แท็บ Equip → แตะ Fishing Rod แล้วกด “ใช้ไอเทม/สวมใส่” ให้คันเบ็ดขึ้นสถานะสวมใส่ก่อน จึงจะผ่านบทนี้ได้',
    kind: 'ui',
    target: '#inventory-grid',
    icon: '🎣',
    rewardLabel: 'พร้อมใช้อุปกรณ์ตกปลา',
  },
  {
    id: 'reach_fishing_spot',
    chapter: 6,
    title: 'เดินไปที่ริมน้ำ',
    titleEn: 'Reach the fishing spot',
    description: 'กดนำทาง แล้วเดินตามหมุดสีทองไปยังขอบน้ำของ Prontera',
    kind: 'world',
    mapId: 'prontera',
    position: { x: -8, y: 0, z: 12 },
    radius: 4.5,
    icon: '📍',
    rewardLabel: 'ค้นพบจุดตกปลาแรก',
  },
  {
    id: 'start_fishing',
    chapter: 7,
    title: 'กดปุ่ม FISH เพื่อตกปลา',
    titleEn: 'Press FISH to cast',
    description: 'แตะปุ่ม FISH ที่แถบควบคุมด้านขวา ระบบจะเดินเข้าจุดยืนและเหวี่ยงเบ็ดให้อัตโนมัติ',
    kind: 'ui',
    target: '#btn-fishing',
    icon: '🪝',
    rewardLabel: 'เริ่มกิจกรรมตกปลา',
  },
  {
    id: 'catch_first_fish',
    chapter: 8,
    title: 'รอรับปลาตัวแรก',
    titleEn: 'Wait for your first fish',
    description: 'เมื่อกด FISH แล้ว ให้ยืนรอจนคันเบ็ดสั่นและระบบยืนยันรางวัลปลาให้คุณ',
    kind: 'fishing',
    icon: '🐟',
    rewardLabel: 'ปลดล็อก Fishing Almanac',
  },
  {
    id: 'visit_new_map',
    chapter: 9,
    title: 'ออกสำรวจ Map ถัดไป',
    titleEn: 'Explore a new Map',
    description: 'ใช้เมนูวาปเพื่อเดินทางไปยัง Map ที่ยังไม่เคยไป',
    kind: 'map',
    targetMap: 'payon',
    icon: '🗺️',
    rewardLabel: 'เปิด Map Contract',
  },
  {
    id: 'read_codex',
    chapter: 10,
    title: 'อ่านบันทึกสิ่งที่ค้นพบ',
    titleEn: 'Read your Codex',
    description: 'กลับมาเปิดสมุดเพื่อดู Monster และปลาที่ค้นพบแล้ว',
    kind: 'ui',
    target: '#btn-wiki',
    icon: '📚',
    rewardLabel: 'Collection path ready',
  },
  {
    id: 'choose_next_goal',
    chapter: 11,
    title: 'เลือกเป้าหมายถัดไป',
    titleEn: 'Choose your next goal',
    description: 'เลือกว่าจะมุ่งหน้าไปทาง Combat, Fishing หรือ Exploration',
    kind: 'summary',
    icon: '✨',
    rewardLabel: 'First 30 Minutes complete',
  },
]);

const STEP_IDS = new Set(FIRST_THIRTY_STEPS.map(step => step.id));
const MAP_IDS = new Set(['prontera', 'prontera_field', 'payon', 'glast_heim', 'mjolnir', 'abyss_lake', 'skyrail_bazaar', 'svarrga']);

export function createFirstThirtyState() {
  return {
    version: FIRST_THIRTY_VERSION,
    activeStep: FIRST_THIRTY_STEPS[0].id,
    completed: [],
    skipped: [],
    firstStartedAt: null,
    lastUpdatedAt: null,
    rewardReceipts: [],
  };
}

function cleanIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(value => STEP_IDS.has(value)))];
}

export function sanitizeFirstThirtyState(raw) {
  const clean = createFirstThirtyState();
  if (!raw || typeof raw !== 'object') return clean;
  const completed = cleanIds(raw.completed);
  const skipped = cleanIds(raw.skipped).filter(id => !completed.includes(id));
  const activeStep = STEP_IDS.has(raw.activeStep) ? raw.activeStep : null;
  clean.completed = completed;
  clean.skipped = skipped;
  clean.activeStep = activeStep || FIRST_THIRTY_STEPS.find(step => !completed.includes(step.id) && !skipped.includes(step.id))?.id || null;
  clean.firstStartedAt = typeof raw.firstStartedAt === 'string' ? raw.firstStartedAt : null;
  clean.lastUpdatedAt = typeof raw.lastUpdatedAt === 'string' ? raw.lastUpdatedAt : null;
  clean.rewardReceipts = [...new Set((Array.isArray(raw.rewardReceipts) ? raw.rewardReceipts : []).filter(value => typeof value === 'string' && value.length <= 160))].slice(0, 64);
  return clean;
}

export function getFirstThirtyStep(stepId) {
  return FIRST_THIRTY_STEPS.find(step => step.id === stepId) || null;
}

export function firstThirtyProgress(state) {
  const clean = sanitizeFirstThirtyState(state);
  const total = FIRST_THIRTY_STEPS.length;
  const completed = clean.completed.length;
  const active = getFirstThirtyStep(clean.activeStep);
  return {
    state: clean,
    total,
    completed,
    percent: Math.round(completed / total * 100),
    active,
    done: completed >= total,
  };
}

export function updateFirstThirtyState(state, action, now = new Date().toISOString()) {
  const clean = sanitizeFirstThirtyState(state);
  const id = typeof action?.stepId === 'string' ? action.stepId : '';
  if (!STEP_IDS.has(id)) return clean;
  if (!clean.firstStartedAt) clean.firstStartedAt = now;
  if (action.type === 'skip') {
    if (!clean.completed.includes(id)) clean.skipped = [...new Set([...clean.skipped, id])];
  } else if (action.type === 'complete') {
    clean.completed = [...new Set([...clean.completed, id])];
    clean.skipped = clean.skipped.filter(value => value !== id);
    if (action.receiptId && typeof action.receiptId === 'string' && action.receiptId.length <= 160) {
      clean.rewardReceipts = [...new Set([...clean.rewardReceipts, action.receiptId])].slice(-64);
    }
  } else if (action.type === 'resume') {
    clean.skipped = clean.skipped.filter(value => value !== id);
  }
  clean.activeStep = FIRST_THIRTY_STEPS.find(step => !clean.completed.includes(step.id) && !clean.skipped.includes(step.id))?.id || null;
  clean.lastUpdatedAt = now;
  return clean;
}

export function isValidJourneyMap(mapId) {
  return MAP_IDS.has(mapId);
}

export function isJourneyStepComplete(state, stepId) {
  return sanitizeFirstThirtyState(state).completed.includes(stepId);
}
