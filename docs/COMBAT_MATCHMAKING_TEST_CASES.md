# ZOLOS Combat & Matchmaking Test Cases

## ขอบเขตและข้อสังเกตจากระบบปัจจุบัน

เอกสารนี้ออกแบบ test cases สำหรับระบบ Combat และ Matchmaking ของ ZOLOS โดยครอบคลุมทั้ง combat ปกติ, duel/PvP, server authority, network interruption, queue lifecycle, fairness และ security

จากโครงสร้างปัจจุบันของโปรเจกต์ พบว่าระบบมี **duel lifecycle และ duel request/response** เป็นแกนหลักแล้ว เช่น duel ID, hit packet, result, MMR settlement, range validation และ disconnect cleanup ส่วน automated matchmaking queue แบบเต็มรูปแบบอาจยังไม่ได้เป็น subsystem แยกชัดเจนในโค้ดปัจจุบัน ดังนั้น test cases หมวด Matchmaking จะแบ่งเป็นสองชั้น:

1. **Current Duel Flow** สำหรับระบบที่มีอยู่แล้ว เช่น request, accept, start, hit, end และ settlement
2. **Future Queue Flow** สำหรับ queue-based matchmaking ที่อาจพัฒนาต่อ เช่น enqueue, cancel, match found, ready check และ timeout

> หลักการสำคัญ: client ส่ง intent ได้ แต่ server ต้องเป็นผู้ตัดสินผลของ damage, hit validity, target identity, duel lifecycle, winner, loser และ MMR settlement

## เป้าหมายคุณภาพ

Combat จะถือว่าผ่านเมื่อ damage และผลการต่อสู้ถูกคำนวณอย่างถูกต้อง ป้องกัน packet ปลอมและ packet เก่าได้ ไม่เกิดการรายงาน defeat ซ้ำ และการตัดสิน MMR เป็น atomic operation เพียงครั้งเดียว

Matchmaking จะถือว่าผ่านเมื่อผู้เล่นเข้าและออก queue ได้ถูกต้อง ไม่ถูกจับคู่ซ้ำ ไม่ถูกจับคู่กับผู้เล่นที่ไม่เข้าเงื่อนไข มี timeout/reconnect ที่ชัดเจน และสามารถตรวจสอบได้ว่าทุก match มี participant, match ID และ lifecycle state ที่สอดคล้องกัน

# Test architecture

## ชั้นการทดสอบ

| Layer | หน้าที่ | ตัวอย่าง |
|---|---|---|
| Combat unit | ตรวจสูตร damage, critical, card effect, cooldown | `CharacterManager`, `CombatSystem`, `CardEffects` |
| Server handler | ตรวจ packet validation และ authority | `duel_hit`, `duel_end`, `skill_cast`, `attack_hit` |
| Duel integration | ตรวจ lifecycle ของผู้เล่นสองคน | request → accept → start → hit → result |
| Matchmaking integration | ตรวจ queue และ match assignment | enqueue → match found → ready → start |
| E2E browser | ตรวจ UI, loading, overlay, reconnect และ player-facing state | arena UI, queue UI, result overlay |
| Load/fairness | ตรวจจำนวนผู้เล่นและการขยาย search window | many queue entries, MMR bands, timeout |

## Test fixtures

### ผู้เล่นและ character

ควรมี fixture แบบ deterministic อย่างน้อย 6 ตัว:

| Fixture | สถานะ | จุดประสงค์ |
|---|---|---|
| `attacker` | HP เต็ม, weapon valid, skill valid | โจมตีปกติและ skill |
| `defender` | HP คงที่, position known | ตรวจ damage และ death |
| `highMmr` | MMR สูง | fairness และ MMR range |
| `lowMmr` | MMR ต่ำ | fairness และ search widening |
| `offlinePlayer` | socket disconnect | reconnect/forfeit |
| `maliciousClient` | ส่ง payload ปลอม | authority/security |

ทุก character ควรมี `userId`, `characterId`, `mapId`, `position`, `level`, `mmr`, `hp`, `maxHp`, weapon class และ card state ที่กำหนดไว้ล่วงหน้า

### Deterministic clock และ RNG

Combat และ matchmaking test ต้องควบคุมเวลา ไม่ควรพึ่ง `Date.now()` จริง เพราะจะทำให้ cooldown, rate limit, queue timeout และ MMR search widening ทดสอบไม่เสถียร ควรมี `FakeClock` ที่ควบคุมได้ เช่น:

```js
clock.set(0);
clock.advance(500);      // cooldown / rate limit window
clock.advance(10_000);   // queue timeout
clock.advance(30_000);   // search range widening
```

Random critical, spawn position และ tie-breaker ควรใช้ seeded RNG เพื่อให้ผลรันซ้ำได้

### Network profiles

| Profile | Latency | Packet loss | ใช้ทดสอบ |
|---|---:|---:|---|
| `local` | 0–5 ms | 0% | baseline |
| `mobile-good` | 40–80 ms | 0–1% | mobile normal |
| `mobile-poor` | 150–300 ms | 2–5% | latency/retry |
| `unstable` | 300–1000 ms | 10–20% | reconnect/duplicate |
| `offline` | unavailable | 100% | disconnect/timeout |

# Combat Test Cases

## Combat correctness และ server authority

### CMB-001: Normal hit applies valid damage once

**Precondition:** `attacker` และ `defender` อยู่ใน duel เดียวกัน, map เดียวกัน, อยู่ในระยะที่อนุญาต และใช้ duel ID ปัจจุบัน

**Steps:** ส่ง normal hit ด้วย damage ที่ finite และมากกว่า zero แล้วรอ server broadcast/result

**Expected:** defender HP ลดลงหนึ่งครั้ง, packet ถูกส่งไปยัง target ที่ระบุ, attacker ไม่สามารถกำหนด target user อื่นได้ และ combat log มี event เดียว

**Assertions:**

```text
serverDamage === expectedDamage
hpAfter === hpBefore - serverDamage
acceptedHitCount === 1
broadcastTarget === defender.userId
```

### CMB-002: Reject non-finite or invalid damage

ส่ง `NaN`, `Infinity`, `-1`, `0`, string และค่าที่เกิน maximum damage

**Expected:** server reject packet, HP ไม่เปลี่ยน, ไม่มี broadcast และไม่มี MMR side effect

### CMB-003: Validate active duel ID

ส่ง hit ด้วย duel ID เก่า, duel ID ของ match อื่น, duel ID ว่าง และ duel ID ของผู้เล่นที่จบไปแล้ว

**Expected:** packet ถูกทิ้งทั้งหมด และ client ต้องไม่แสดง damage หรือ hit effect จาก stale round

### CMB-004: Validate target identity

ส่ง packet ที่เปลี่ยน `targetUserId` เป็น attacker เอง, ผู้เล่นคนที่สาม หรือผู้เล่นที่ไม่อยู่ใน duel

**Expected:** server ใช้ target จาก active duel state ไม่เชื่อค่าที่ client เปลี่ยน และไม่ทำ damage ต่อผู้เล่นที่ไม่ใช่คู่ต่อสู้

### CMB-005: Validate same map and trusted position

ย้าย attacker หรือ defender ไปคนละ map แล้วส่ง hit ต่อ จากนั้นส่ง position ที่เป็น `NaN`, `Infinity` หรืออยู่นอก bounds

**Expected:** hit ถูกปฏิเสธ, ไม่มี damage, ไม่มี combat broadcast และ movement state ที่ผิดไม่ถูกนำไปคำนวณ range

### CMB-006: Validate maximum hit range

ทดสอบระยะใกล้กว่าขอบเขต, เท่ากับขอบเขต และไกลกว่าขอบเขตเล็กน้อย

**Expected:** hit ที่อยู่ในระยะที่ policy อนุญาตผ่านได้ ส่วน hit ที่ไกลเกินถูก reject โดยคำนวณจาก trusted server position ไม่ใช่ client-provided target position

### CMB-007: Validate skill allowlist

ส่ง skill ที่อยู่ใน catalog, skill ที่ไม่มีอยู่, skill ที่สะกดผิด, skill ที่ถูก disable และ skill ID ที่มี payload ยาวผิดปกติ

**Expected:** เฉพาะ skill ที่อยู่ใน allowlist และอยู่ใน state ที่ใช้ได้เท่านั้นที่ถูก relay หรือ apply ผลลัพธ์

### CMB-008: Validate weapon class and attack type

ส่ง weapon class ที่ไม่ตรงกับอาวุธจริง เช่นส่ง ranged packet จาก melee character หรือส่งค่า weapon class ที่ไม่มีใน allowlist

**Expected:** server normalize/reject ตาม policy, ไม่สร้าง animation หรือ damage effect ที่ปลอมประเภทอาวุธได้

### CMB-009: Enforce combat event rate limit

ส่ง `skill_cast`, `attack_hit`, `duel_hit` ต่อเนื่องเกิน threshold ภายใน time window เดียวกัน

**Expected:** event ที่เกิน rate limit ถูกทิ้งหรือ throttle, server ยังตอบสนองได้, ผู้เล่นอื่นไม่ถูก broadcast packet จำนวนมาก และ legitimate event หลัง window ใหม่ยังทำงานได้

### CMB-010: Duplicate attack sequence is idempotent

ส่ง packet เดิมซ้ำด้วย attack sequence เดิมและ timestamp เดิมหลายครั้ง รวมถึงส่ง packet เก่าหลัง packet ใหม่

**Expected:** server apply damage สูงสุดหนึ่งครั้งต่อ sequence, packet เก่าถูกทิ้ง และ defender HP ไม่ติดลบจาก replay

## Damage, skill และ state transitions

### CMB-011: Critical damage uses server-approved rule

ทดสอบ critical true, false, missing, string และ critical rate ที่เกินช่วง

**Expected:** client ไม่สามารถบังคับ critical ได้เอง ผล critical ต้องมาจาก server-approved calculation และ combat log บันทึกค่าที่ server ตัดสิน

### CMB-012: Card effects apply exactly once

ใช้ character ที่มี damage bonus หรือ reduction จาก card แล้วทำ normal hit และ skill hit

**Expected:** card effect ถูก apply ตาม policy เพียงครั้งเดียว ไม่ถูกคูณซ้ำจาก client และ damage ที่ไม่มี card effect ยังต้องไม่เปลี่ยนโดยไม่จำเป็น

### CMB-013: Defense and mitigation order is deterministic

ทดสอบ defense, damage reduction, card reduction และ critical ในชุดค่าเดียวกันหลายครั้ง

**Expected:** ผลลัพธ์เหมือนกันทุกครั้ง และ order ของ mitigation ตรงกับ combat contract

### CMB-014: HP never becomes invalid

ทำ hit ที่ damage เท่ากับ HP, มากกว่า HP, 0 damage และทำ hit หลัง target ตายแล้ว

**Expected:** HP ไม่ติดลบ, death transition เกิดครั้งเดียว, hit หลังตายไม่สร้าง reward หรือ defeat ซ้ำ

### CMB-015: Defeat is reported once

ส่ง lethal hit หลาย packet พร้อมกัน หรือให้ client ประมวลผล queued hit หลัง HP ถึงศูนย์แล้ว

**Expected:** มี defeat report เพียงหนึ่งครั้ง, ไม่มี duplicate settlement, opponent เห็นผลลัพธ์เดียว และ UI ไม่แสดง death overlay ซ้ำ

### CMB-016: Cooldown and resource validation

ถ้าระบบ skill มี cooldown หรือ resource cost ให้ส่ง skill ก่อน cooldown หมด, หลัง cooldown หมด, resource ไม่พอ และส่งค่า cost ปลอม

**Expected:** server เป็นผู้ตรวจ cooldown/resource, skill ที่ไม่ผ่านไม่เกิด damage และ resource ถูกหักเพียงครั้งเดียวเมื่อ skill สำเร็จ

### CMB-017: Client prediction cannot override authoritative state

ทำให้ client แสดง local hit ก่อน แล้ว server reject packet เพราะ range หรือ duel ID ผิด

**Expected:** client reconcile กลับตาม server state, ไม่คง damage effect หรือ HP ที่ผิดไว้ถาวร และมี sync/error signal ที่เหมาะสม

### CMB-018: Normal duel and skill duel use current encounter ID

เริ่ม duel ใหม่หลัง duel เก่าจบ แล้วส่ง hit จาก code path ทั้ง normal attack และ skill

**Expected:** ทุก packet ใช้ duel ID ปัจจุบัน ไม่ใช้ค่าเก่าจาก closure หรือ cached state

## Duel lifecycle, settlement และ disconnect

### CMB-019: Same-map duel request

ส่ง duel request กับผู้เล่นคนเดียวกันบน map เดียวกัน แล้วตอบรับ

**Expected:** duel เริ่มได้, encounter ID ถูกสร้างหนึ่งค่า, participant slots ถูก freeze และทั้งสองฝั่งเห็น opponent คนเดียวกัน

### CMB-020: Different-map duel request is rejected

ผู้เล่นอยู่คนละ map แล้วส่ง request/accept

**Expected:** server reject ด้วย reason ที่กำหนด, ไม่มี active duel, ไม่มีการสร้าง settlement record

### CMB-021: Duplicate accept/request is idempotent

ส่ง duel request หรือ accept ซ้ำก่อน server response และหลัง duel start แล้ว

**Expected:** มี duel เดียว, ไม่มี duplicate start event และ participant ไม่ถูกเขียนทับ

### CMB-022: Duel settlement freezes character slots

เริ่ม duel แล้วเปลี่ยนอุปกรณ์หรือ character ID ที่ client payload ก่อนจบ duel

**Expected:** settlement ใช้ character slots ที่ถูกบันทึกตอน start ไม่ใช้ค่าที่ attacker ส่งมาทีหลัง

### CMB-023: Atomic MMR settlement

ให้ผล duel สำเร็จ แล้วจำลอง retry ของ settlement RPC, concurrent settlement และ server timeout หลัง database commit

**Expected:** winner/loser MMR ถูกอัปเดตครั้งเดียว, ไม่มี double gain/loss และผลลัพธ์หลัง retry อ่านได้อย่างสอดคล้องกัน

### CMB-024: Only registered loser can report defeat

ให้ winner, ผู้เล่นที่สาม และ attacker ปลอมส่ง `duel_end` โดยระบุ loser เป็นคนอื่น

**Expected:** server รับเฉพาะ reporter ที่ตรงกับ registered loser และ reject packet อื่นทั้งหมดโดยไม่มี settlement side effect

### CMB-025: Disconnect during active duel

ตัด socket ของ attacker, defender และทั้งสองฝั่งในช่วงก่อน hit, หลัง lethal hit และระหว่าง settlement

**Expected:** lifecycle จบตาม policy เดียว, ไม่เกิด ghost duel, pending request ถูก cleanup, reconnect ไม่สร้าง participant ซ้ำ และ MMR settlement ไม่ซ้ำ

# Matchmaking Test Cases

## Current Duel Queue / Request Flow

### MM-001: Create duel request once

ผู้เล่น A ส่ง request ให้ผู้เล่น B หนึ่งครั้ง

**Expected:** B ได้รับ request หนึ่งรายการที่มี requester identity, expiry และ request ID ถูกต้อง

### MM-002: Duplicate duel request is deduplicated

ผู้เล่น A ส่ง request เดิมหลายครั้งภายในช่วงเวลาเดียวกัน

**Expected:** B เห็นรายการเดียว, server ไม่สร้าง pending records ซ้ำ และ request ล่าสุดไม่ทำให้ expiry ถูกยืดโดยพลการ

### MM-003: Accept valid request

ผู้เล่น B accept request ที่ยังไม่หมดอายุและยังไม่มี active match

**Expected:** match ถูกสร้างหนึ่งรายการ, participant set `{A,B}` ถูกต้อง และทั้งสองฝั่งได้รับ match start event เดียว

### MM-004: Reject expired request

advance fake clock ให้ request หมดอายุแล้วกด accept

**Expected:** accept ถูกปฏิเสธ, pending request ถูก cleanup และไม่มี match ถูกสร้าง

### MM-005: Reject request when participant is busy

ให้ผู้เล่นอยู่ใน duel หรือ queue อื่น แล้วรับ request ใหม่

**Expected:** request ไม่สามารถสร้าง match ซ้อน, requester ได้ reason ที่ชัดเจน และ active match เดิมไม่ถูกกระทบ

### MM-006: Cancel pending request

ผู้เล่น A ยกเลิก request ก่อน B accept

**Expected:** B ไม่สามารถ accept ได้อีก, UI ของทั้งสองฝั่ง sync ว่า request ถูกยกเลิก และไม่มี orphan pending record

## Future Queue-Based Matchmaking

### MM-007: Enqueue once

ผู้เล่นเข้า queue ด้วย mode, region, party size และ MMR ที่ถูกต้อง

**Expected:** queue entry มี queue ID หนึ่งค่า, status `queued`, timestamp และ search constraints ถูกต้อง

### MM-008: Duplicate enqueue is idempotent

ผู้เล่นกด Find Match หลายครั้งหรือส่ง enqueue packet ซ้ำ

**Expected:** มี queue entry เดียว, ไม่มี match ซ้ำ และ UI ปุ่มเปลี่ยนเป็น cancel/queued state เพียงครั้งเดียว

### MM-009: Cancel queue

ผู้เล่นกด cancel ก่อน match found และระหว่าง search widening

**Expected:** queue entry ถูกลบ/เปลี่ยนเป็น cancelled, ไม่ถูก match ในรอบถัดไป และ cancel ซ้ำไม่ทำให้ error state เสีย

### MM-010: Match only compatible players

สร้างผู้เล่นหลายกลุ่มที่ต่างกันด้วย mode, region, platform, party size และ MMR

**Expected:** ระบบจับคู่เฉพาะผู้เล่นที่ compatible ตาม policy ห้ามจับ solo กับ party ที่เกินข้อกำหนดหรือจับคนละ mode โดยไม่ตั้งใจ

### MM-011: MMR search window widens deterministically

ใช้ fake clock ให้ queue wait เพิ่มขึ้นตามช่วงที่กำหนด

**Expected:** search range ขยายตาม policy แบบ monotonic, ไม่ขยายเร็วเกิน, ไม่ reset เมื่อ client reconnect และไม่ข้ามข้อจำกัด region/mode ที่เป็น hard constraint

### MM-012: Match found creates unique match ID

ผู้เล่นสองคนที่ compatible อยู่ใน queue พร้อมกัน

**Expected:** server สร้าง match ID หนึ่งค่า participant สองคน และ remove/lock queue entries อย่าง atomic

### MM-013: Third player cannot join locked match

หลัง match ถูก lock ให้ผู้เล่นที่สามส่ง join ด้วย match ID เดิม

**Expected:** reject, participant list ไม่เปลี่ยน และผู้เล่นที่สามยังมีสถานะ queue/idle ที่ถูกต้อง

### MM-014: Ready check success

ผู้เล่นทั้งสองฝั่งกด ready ภายใน timeout

**Expected:** match state เปลี่ยนจาก `ready_check` เป็น `starting` เพียงครั้งเดียว และทั้งสอง client ได้ opponent snapshot เดียวกัน

### MM-015: Ready check timeout

ผู้เล่นหนึ่งฝั่งไม่กด ready จนหมดเวลา

**Expected:** match ถูกยกเลิก, queue slot ถูกคืนตาม policy, ผู้เล่นที่ ready ไม่ถูกลงโทษเกินที่กำหนด และไม่เริ่ม combat

### MM-016: Decline match

ผู้เล่น decline หลัง match found แต่ก่อน start

**Expected:** match ไม่เริ่ม, opponent ได้รับ reason, queue cleanup ทำครบ และไม่มี MMR change

### MM-017: Duplicate ready/decline is idempotent

ส่ง ready หรือ decline ซ้ำทั้งก่อนและหลัง state transition

**Expected:** state machine ไม่ย้อนกลับ, ไม่สร้าง start event ซ้ำ และไม่ทำ penalty/reward ซ้ำ

### MM-018: Queue disconnect before match found

ตัด socket ขณะ status เป็น `queued`

**Expected:** entry ถูก cleanup ภายใน TTL, ไม่ถูก match ต่อหลังผู้เล่นออก และ reconnect ใหม่ต้อง enqueue ใหม่หรือ restore ตาม policy ที่ประกาศไว้

### MM-019: Disconnect after match found

ตัด socket หลัง match lock แต่ก่อน ready และหลัง ready ทั้งสองฝั่ง

**Expected:** state เปลี่ยนตาม disconnect policy, ไม่เกิด match ที่รอค้างไม่สิ้นสุด และ reconnect ใช้ match ID เดิมได้เฉพาะช่วง grace period ที่กำหนด

### MM-020: Reconnect does not duplicate participant

ผู้เล่น reconnect หลายครั้งหรือเปิดสอง tabs

**Expected:** participant identity หนึ่งคนต่อ match หนึ่ง slot, socket ใหม่แทน socket เก่าตาม policy และไม่สร้าง duplicate player ใน arena

### MM-021: Queue fairness under load

สร้างผู้เล่นจำนวนมากในหลาย MMR bands และ enqueue พร้อมกัน

**Expected:** ไม่มีผู้เล่นที่ compatible ค้างนานโดยไม่มีเหตุผล, search widening ทำงาน, queue matching ไม่ลำเอียงตามลำดับ packet ที่ผิดปกติ และ metrics บันทึก wait time/pairing band

### MM-022: MMR boundary cases

ทดสอบ MMR ต่างกันที่ต่ำกว่าขอบเขต, เท่ากับขอบเขต และสูงกว่าขอบเขตหนึ่งหน่วย

**Expected:** ผลการจับคู่ตรงตาม inclusive/exclusive policy ที่ระบุและผลลัพธ์ deterministic

### MM-023: Party atomicity

สร้าง party แล้วให้สมาชิกหนึ่งคน disconnect, cancel หรือออก party ระหว่าง queue

**Expected:** party ไม่ถูกจับคู่บางส่วนโดยไม่ได้รับอนุญาต, queue entry ของสมาชิกถูก cleanup อย่างถูกต้อง และไม่เกิด match ที่มีสมาชิกไม่ครบ

### MM-024: Match identity spoofing

ส่ง ready, cancel, leave หรือ hit โดยใช้ match ID ของผู้เล่นอื่นหรือ participant ID ปลอม

**Expected:** server reject ทุก packet ที่ไม่ตรงกับ authenticated participant และไม่มี state change ต่อ match จริง

### MM-025: Queue cleanup and TTL

ปล่อย queue entry และ match state ค้างเกิน TTL พร้อมจำลอง server restart

**Expected:** cleanup job ลบ/ปิด state ค้าง, ไม่จับคู่ entry ที่หมดอายุ และ metrics แสดงจำนวน stale entry เป็นศูนย์หลัง cleanup

# Network และ concurrency matrix

ทุก critical flow ควรรันอย่างน้อยกับ network profiles ต่อไปนี้:

| Flow | Local | 150 ms | 500 ms | Packet loss | Disconnect |
|---|---:|---:|---:|---:|---:|
| Normal hit | ✓ | ✓ | ✓ | ✓ | ✓ |
| Skill cast | ✓ | ✓ | ✓ | ✓ | ✓ |
| Duel accept | ✓ | ✓ | ✓ |  | ✓ |
| Match enqueue | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ready check | ✓ | ✓ | ✓ | ✓ | ✓ |
| MMR settlement | ✓ | ✓ | ✓ | ✓ | ✓ |

Concurrency ที่ต้องตรวจเป็นพิเศษคือ two hits พร้อมกัน, lethal hit สองฝั่งใน tick เดียวกัน, accept/cancel พร้อมกัน, ready/decline พร้อมกัน, duplicate reconnect และ settlement retry หลัง database commit

# Coverage matrix และ priority

## Smoke suite

รันทุก pull request ที่แก้ Combat, Socket.io, GameSync, CharacterManager หรือ Matchmaking:

| ID | Case |
|---|---|
| CMB-001 | normal hit |
| CMB-002 | invalid damage rejection |
| CMB-003 | stale duel ID |
| CMB-006 | range validation |
| CMB-009 | rate limit |
| CMB-015 | defeat once |
| CMB-019 | valid duel start |
| CMB-020 | different-map rejection |
| MM-001 | create request |
| MM-003 | accept request |
| MM-007 | enqueue once |
| MM-009 | cancel queue |
| MM-012 | unique match ID |

## Critical suite

รันก่อน merge และทุก staging deploy โดยเพิ่ม duplicate sequence, card effects, disconnect, atomic settlement, ready timeout, cross-user spoofing และ MMR boundary cases

## Extended suite

รัน nightly หรือก่อน production release โดยเพิ่ม load/fairness, party atomicity, two-tab reconnect, server restart cleanup, packet loss, long queue, malformed payload และ concurrent state transition ทุกชุด

| Category | Smoke | Critical | Extended |
|---|---:|---:|---:|
| Damage correctness | 2 | 6 | 10+ |
| Server authority | 3 | 8 | 12+ |
| Duel lifecycle | 4 | 8 | 12+ |
| Queue lifecycle | 4 | 8 | 14+ |
| Network/reconnect | 0 | 6 | 12+ |
| Fairness/load | 0 | 2 | 8+ |
| Security/abuse | 2 | 8 | 14+ |

# Acceptance contract ที่ควรเพิ่มในระบบ

เพื่อให้ test cases เหล่านี้ implement ได้ง่าย ควรทำให้ระบบมี contract ที่สังเกตได้ดังนี้:

```text
combat event: { duelId, sequence, attackerUserId, targetUserId, serverTick }
duel state: { duelId, status, aUserId, bUserId, aCharacterId, bCharacterId }
match state: { matchId, mode, status, participants, createdAt, expiresAt }
queue state: { queueId, userId, mode, mmr, region, status, enqueuedAt }
settlement: { duelId, winnerCharacterId, loserCharacterId, appliedAt, idempotencyKey }
```

ทุก state transition ควรมี allowed transition table เช่น:

```text
queued → matched → ready_check → starting → active → completed
queued → cancelled
matched → expired
ready_check → timeout
active → forfeited
active → completed
```

ไม่ควรอนุญาตให้ state ย้อนกลับ เช่น `completed → active` หรือ `cancelled → starting`

# Observability assertions

Test ไม่ควรตรวจแค่ UI หรือ response เท่านั้น ควรตรวจ event และ metrics ที่ช่วยอธิบาย production failure ด้วย:

| Metric/event | สิ่งที่ควรบันทึก |
|---|---|
| `combat_hit_accepted` | duel ID, sequence, server tick, damage result |
| `combat_hit_rejected` | reason code โดยไม่เปิดเผยข้อมูลเกินจำเป็น |
| `duel_started` | duel ID, participant IDs, map |
| `duel_settled` | duel ID, winner/loser, idempotency result |
| `queue_entered` | queue ID, mode, MMR band |
| `match_found` | match ID, wait time, MMR gap |
| `match_cancelled` | reason, actor, elapsed time |
| `reconnect_reconciled` | match/duel ID, state restored |

ทุก test ที่ทำให้ flow fail ควรเก็บ `correlationId` หรือ `matchId/duelId` เพื่อ trace ตั้งแต่ client event ถึง server/database

# Definition of Done

ชุด Combat และ Matchmaking นี้ถือว่าพร้อมใช้เมื่อ:

1. ทุก hit ที่ผ่านมี duel ID, target identity และ sequence ที่ตรวจสอบได้
2. stale, duplicate, malformed และ out-of-range packets ไม่ทำให้เกิด damage หรือ state mutation
3. death และ MMR settlement เกิดครั้งเดียวแม้มี retry หรือ concurrent packet
4. duel ต่าง map และ participant ที่ไม่ถูกต้องถูก reject
5. queue enqueue/cancel/match/ready/decline/timeout มี state transition ที่ deterministic
6. ผู้เล่นหนึ่งคนไม่ถูกจับคู่หรืออยู่ใน active match ซ้ำโดยไม่ตั้งใจ
7. disconnect/reconnect ไม่สร้าง ghost participant หรือ match ค้างถาวร
8. MMR search widening และ boundary policy มี test ที่ตรวจได้อย่างชัดเจน
9. security test เปลี่ยน match ID, user ID, target ID และ payload สำคัญแล้วไม่มี side effect
10. Smoke suite ผ่านได้เร็วใน CI และ Critical/Extended suite มี trace เพียงพอเมื่อ fail

# ลำดับ implement ที่แนะนำ

เริ่มจากทำ CMB-001, CMB-002, CMB-003, CMB-006, CMB-009, CMB-015 และ CMB-023 เป็น server-side critical tests ก่อน เพราะเป็นแกนของความถูกต้องและความปลอดภัยของ duel ที่มีอยู่แล้ว จากนั้นเพิ่ม MM-001 ถึง MM-006 สำหรับ current duel request flow

เมื่อ queue-based matchmaking ถูกแยกเป็น subsystem แล้ว ให้เริ่ม MM-007, MM-008, MM-009, MM-012, MM-014, MM-015 และ MM-020 ก่อน แล้วจึงเพิ่ม fairness/load และ party cases ใน Extended suite

ไม่ควรเริ่มจาก visual animation test หรือ load test จำนวนมากก่อนที่ state machine, idempotency key, server authority และ settlement contract จะชัดเจน เพราะจะทำให้ผลทดสอบอ่านยากและไม่สามารถแยกได้ว่าปัญหาเกิดจาก gameplay หรือ lifecycle ของระบบ
