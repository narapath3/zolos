# ZOLOS Full Production Audit & Security Report

**ผู้จัดทำ:** Manus AI

**วันที่ตรวจ:** 22 สิงหาคม 2026

**ภาษา:** Thai พร้อม technical identifiers ภาษาอังกฤษ

**Repository:** `narapath3/zolos`

**Branch:** `main`

**Source baseline ก่อนรวม audit bundle:** `3070a696b314095a584df5b0b7f6a3165f063421`

**สถานะขณะจัดทำรายงาน:** source changes ผ่าน local validation แล้ว แต่ยังไม่ได้ apply migration หรือยืนยัน production DB/VPS แบบ live และยังต้อง commit/push หลังตรวจ final diff

## 1. Executive Summary

การตรวจรอบนี้เป็น **Full Production Audit** ของเกม ZOLOS Idle MMORPG ครอบคลุม login, guest/register, character/job selection, tutorial, inventory, pet, shop, fishing, almanac, daily reward, combat, monster rewards, market, NPC sale, card/equipment flows, socket/Socket.IO, generic data API, admin console, asset presentation, persistence lifecycle และ deployment safety โดยเน้นประเด็นที่มีผลต่อความน่าเชื่อถือของ economy และประวัติการเล่นมากกว่าการแก้ visual เพียงอย่างเดียว

ผลลัพธ์สำคัญคือแก้ root cause ของ **pet persistence** และเปลี่ยนเส้นทาง progression/economy ที่เกี่ยวข้องให้ใช้ server-authoritative receipts มากขึ้น การเรียก pet, rename, XP/level จาก monster kill, การขาย pet เป็น instance, pet market listing/cancel/buy และ NPC pet sale ไม่ควรสร้าง UID ลด quantity หรือเพิ่ม XP จาก client เองอีกต่อไป นอกจากนี้ generic inventory mutation ถูกปิดสำหรับ online self-host API และมี hosted Supabase migration สำหรับ revoke direct DML และเปิดเฉพาะ RPC ที่ allowlist ไว้

> ผลการตรวจนี้เป็น **repository/staging-readiness result** ไม่ใช่คำรับรองว่า production database หรือ Windows VPS ปัจจุบัน deploy และทำงานถูกต้องแล้ว เพราะยังไม่ได้รับอนุญาตให้ apply migration, ทำ live write, แก้ environment ของ VPS หรือทำ destructive/two-account E2E บนบริการจริง

| หมวด | ผลตรวจล่าสุด | ความหมาย |
|---|---:|---|
| Full regression | **643/643 ผ่าน** | ทุก automated regression ใน repository ผ่านหลังการแก้ล่าสุด |
| Frontend build | **ผ่าน** | `npm run build` สำเร็จ; เหลือคำเตือน chunk size/ineffective dynamic import ที่ไม่ใช่ build failure |
| Production dependency audit | **0 vulnerabilities** | `npm audit --omit=dev` ไม่พบช่องโหว่ dependency ตามฐานข้อมูลที่ npm ตรวจในรอบนี้ |
| Asset catalog | **298/298 มี authored art, fallback 0** | item/fish/pet catalog มี visual asset หรือ procedural/dynamic art ตาม audit script |
| Fish catalog | **73/73, missing 0** | ไม่มี fish catalog entry ที่ขาดการตรวจ asset mapping |
| Hosted migration | **เขียนและ static-reviewed; ยังไม่ apply** | ต้องให้ผู้มีสิทธิ์รันกับ database ที่ตรง schema ก่อนเปิด hosted authority parity |
| Production DB/VPS E2E | **ยังไม่ได้ทำ** | ไม่ได้อ้างว่า live persistence, deploy workflow หรือ migration production ผ่าน |

## 2. วิธีการตรวจและขอบเขตหลักฐาน

การตรวจใช้ source review, deterministic asset audit, Node regression tests, syntax checks, Vite production build, dependency audit และการตรวจเส้นทาง persistence ที่เกี่ยวข้องกับ Supabase-compatible self-host API โดยรักษา working tree เดิมและไม่ discard uncommitted changes ระหว่างงาน หลักฐานหลักอยู่ใน source paths และ test paths ที่ระบุไว้ในส่วน References

| วิธีตรวจ | Command/ขอบเขต | ผลที่บันทึก |
|---|---|---|
| Static source/security review | `server/api/*`, `server/server.js`, `server/game/*`, `src/network/*`, `src/ui/*`, admin console | พบและแก้ authority, ownership, idempotency, stale optimistic mutation และ visual fallback paths หลายกลุ่ม |
| Regression suite | `npm test` | 643 tests ผ่าน, 0 fail, 0 cancelled, 0 skipped |
| Syntax checks | `node --check server/api/rpc.js`, `src/network/GameSync.js`, `src/ui/GameUI.js` | ผ่านหลังการแก้ล่าสุด |
| Production build | `npm run build` | ผ่าน; warning เป็นเรื่อง chunk/dynamic import และไม่ทำให้ build fail |
| Dependency security | `npm audit --omit=dev` | พบ 0 vulnerabilities |
| Asset audit | `node scripts/audit-assets.mjs` | เขียน `audit-assets.json`; item art 298/298, fish 73/73, pet atlas มีอยู่ |
| Diff hygiene | `git diff --check` | ผ่าน ไม่มี whitespace error |
| Live production mutation | ไม่ทำ | ไม่มีการแก้ player, DB, VPS หรือ apply migration จริง |

## 3. สิ่งที่แก้ไขในรอบนี้

### 3.1 Pet persistence และ pet economy

`save_pet_state` ถูกใช้เป็น boundary เฉพาะสำหรับ pet state แทน generic inventory quantity/stats writer ฝั่ง client จะส่งได้เฉพาะ state ที่จำเป็นต่อการ reconcile ส่วน server ตรวจ ownership, character binding, UID ที่มีอยู่จริง, instance count และ merge progression แบบ monotonic การ summon/rename/unequip จึงไม่ควรสร้าง instance หรือ level จากข้อมูลที่ผู้เล่นแก้ใน DevTools ได้เอง [1] [2]

Monster kill transaction ย้ายการคำนวณ pet XP และ level ไป server และส่ง canonical `payload.pet` กลับมา ส่วน client แสดงผลจาก receipt เท่านั้น การซื้อ pet, ขาย pet รายตัว, cancel/buy pet listing และ NPC sale ใช้ transaction ที่ bind กับ owner/character และมี request correlation หรือ idempotency ตาม path ที่รองรับแล้ว การซื้อ remote pet จึงไม่ควร mint UID ใหม่บน browser หรือหั่น instance array แล้วพยายามเขียนกลับเอง

### 3.2 Inventory และ server-authoritative economy

generic `/api/db` inventory writes ถูกปิดสำหรับ `insert`, `upsert`, `update` และ `delete` รวมถึง legacy starter/system exceptions เพื่อไม่ให้ browser เพิ่ม quantity, เปลี่ยน stats, forge item, ลบ escrow หรือแก้ progression row ด้วย request ทั่วไป การอ่านยังคงถูกจำกัดด้วย policy/ownership ตาม resource [3]

Shop purchase online ใช้ catalog-bound price/type และ server receipt โดย quantity, price, type, gold และ inventory result ไม่ได้มาจากค่าที่ผู้เล่นส่งมาแบบเชื่อถือได้ transaction จะ lock character balance, ตรวจ item อยู่ใน `SHOP_ITEMS`, ป้องกัน request replay/cross-user request conflict และส่ง `inventory_quantity` กับ `gold` ที่ commit แล้วกลับให้ UI

เพิ่มหรือปรับ dedicated authority paths สำหรับ starter loadout, equipped item, consumable use, daily reward, almanac reward, system state และ job change ใน self-host RPC รวมถึง hosted SQL migration โดย starter loadout สามารถ repair แถว Sword/Fishing Rod ที่ quantity เป็นศูนย์ให้กลับมาอย่าง idempotent โดยไม่เพิ่มซ้ำทุกครั้งที่ login

### 3.3 Equipment และ job selection

`save_equipped_item` ไม่รับ slot จาก client แต่คำนวณ canonical slot จาก catalog/server mapping อาวุธกับ fishing rod ใช้ weapon slot เดียวกัน ขณะที่ armor ใช้ paper-doll subslot เช่น `head`, `body`, `garment`, `ring`, `wrist`, `pants`, `feet` และ `accessory` การเปลี่ยน rod จึงไม่ถอด armor ทั้งหมด และการเปลี่ยน armor คนละส่วนไม่ถอดกันเอง

ก่อนหน้านี้ job selection online สามารถเปลี่ยน job และหัก gold ใน local UI โดยไม่ได้มี transaction ที่ทำให้ signature weapon ถูกบันทึกเป็นชุดเดียวกัน รอบนี้เพิ่ม `change_job` ให้ server คำนวณว่าเป็น first selection ที่ฟรีหรือ re-spec ที่มีค่าใช้จ่าย 50,000 Zeny, update job/gold, equip signature weapon และปิดอาวุธ slot เดิมใน transaction เดียว พร้อม request idempotency และ canonical receipt ฝั่ง UI [2] [4]

### 3.4 Consumable, fishing และ progression receipts

`use_consumable` ตรวจ catalog และตรวจ `item_type === 'consumable'` จาก row จริงก่อนลด quantity ใช้ character row lock, คำนวณผลจาก `healHp`/`restoreSp` ที่ trusted จาก GameData, clamp กับ max HP/SP และไม่ลด item เมื่อใช้แล้วไม่มีผล การ replay request เดิมจะคืน receipt เดิม และ request id เดิมที่ถูกใช้โดย user/character อื่นจะถูกปฏิเสธ

Fishing reward transaction atomically บันทึก fish inventory, canonical almanac caught/counts และ discovery gold bonus แล้วส่ง receipt ให้ `main.js`/`GameUI` reconcile การตกปลาซ้ำจึงไม่ควรได้ discovery bonus จาก local prediction หรือเขียน almanac เอง [5]

Daily reward และ almanac reward online ใช้ server RPC และ canonical receipts ส่วน daily quests/roulette ที่ยังไม่มี server-generated lifecycle และ server progression event pipeline ถูกเปลี่ยนเป็น **read-only online**: ไม่ generate client-owned quest set ในกรณีไม่มี server state, ไม่ increment progress, ไม่ claim reward, ไม่ spin roulette และไม่บันทึก client JSON กลับ server จนกว่าจะมี authoritative progression RPC ครบ นี่เป็นการลด feature ชั่วคราวเพื่อป้องกันการ mint gold/EXP/item ไม่ใช่การอ้างว่าระบบ quest secure แล้ว

### 3.5 Legacy mutation paths ที่ fail-closed

ระบบ refine, forge, card socket/unsocket, celestial mining/pickaxe purchase และ divine ZOL shop บางส่วนเดิมยังมี client-side mutation ที่ไม่มี dedicated server transaction ครบถ้วน รอบนี้จึง fail-closed สำหรับ server-backed character แทนการหัก resource หรือเพิ่ม item ใน local UI แล้วปล่อยให้ generic write ถูกปฏิเสธเงียบ ๆ ผู้เล่น online จะเห็นข้อความแจ้งว่า feature รอ server transaction ส่วน offline mode ยังคงใช้ local fallback ที่ประกาศไว้อย่างชัดเจน

แนวทางนี้ป้องกัน economy corruption ได้จริงกว่าการคง optimistic behavior แต่หมายความว่า feature ดังกล่าว **ยังไม่ควรประกาศว่า online production-ready** จนกว่าจะเพิ่ม RPC ที่ lock ownership, validate catalog, ใช้ server randomness, มี idempotency และคืน canonical receipt ครบทุก path

### 3.6 Tutorial, guest identity และ lifecycle persistence

Tutorial online ไม่ grant gold/item จาก client completion อีกต่อไป การผูก email ของ Guest ใช้ identity เดิมใน transaction แทนการสร้าง user ใหม่ และ guest splash แยก resume/new semantics ให้ชัดขึ้น lifecycle save/keepalive ไม่รับ client inventory หรือ progression snapshot ไปเป็น source of truth [6] [7]

Local storage ยังคงอนุญาตเฉพาะสิ่งที่จัดเป็น device/session concern ตามที่ implementation รองรับ เช่น JWT/session hint, audio/graphics preference หรือ explicit offline fallback การยืนยัน account และ gameplay progression ของ server-backed character ไม่ควรพึ่ง localStorage เป็นฐานข้อมูลหลัก

### 3.7 UI asset และ admin console

เพิ่ม `scripts/audit-assets.mjs` และสร้าง `audit-assets.json` เพื่อให้ตรวจซ้ำได้ว่า item catalog 298 รายการมี authored art ครบทั้งหมด โดยแยก `146 png`, `73 dynamic-3d`, `13 pet-atlas` และ `66 card-png`; fish 73 รายการไม่มี missing mapping และ pet sanctuary atlas มีอยู่จริง ตัวเลขนี้เป็น deterministic catalog coverage ไม่ใช่การรับรองว่าทุก viewport สวยเท่ากันในทุก device

เส้นทาง item/fish/pet/admin ที่เป็น visual surface ถูกเปลี่ยนไปใช้ `itemIconMarkup`, item assets, fish art, pet atlas หรือ model renderer มากขึ้น Standalone Admin console มี asset helper สำหรับ item/fish/pet, ลด raw emoji visual path และเพิ่ม Bug Reports tab ที่ list/filter/detail/review/reward confirmation พร้อม escaped report rendering [8] การ scan raw emoji ยังคงรายงาน callsites จำนวนมาก เพราะ emoji ยังถูกใช้ในข้อความ status, rarity, job/skill label, fallback metadata และ log; จึงไม่ควรตีความ raw scan เป็นหลักฐานว่าทุก visual surface เป็น placeholder

## 4. Security findings และสถานะ

| ระดับ | Finding | สถานะหลังแก้ | หมายเหตุการยืนยัน |
|---|---|---|---|
| P0 | Client-controlled monster reward/progression | **Secure default ใน local self-host** | `WORLD_MONSTERS` เปิดเมื่อ `USE_LOCAL_DB=true` เว้นแต่ตั้ง `WORLD_MONSTERS=false` อย่างชัดเจน; ต้องตรวจ env production จริงก่อนเปิด traffic |
| P0 | Generic inventory mutation สร้าง item/quantity/stats | **Blocked ใน self-host policy; hosted ต้อง apply migration** | Dedicated RPC paths ใช้ ownership/locks/receipts; hosted DDL ยังไม่ apply |
| P0 | Pet instance UID/XP/level มาจาก client | **ลดและย้ายหลักไป server transaction** | client reconcile canonical pet receipt; ต้องทำ live two-account verification หลัง deploy |
| P1 | Shop price/type/gold manipulation | **Self-host + hosted function implemented** | catalog-bound allowlist, balance lock, request conflict; hosted functionต้องตรง schema/constraint จริง |
| P1 | NPC/market/pet escrow race และ cross-character ownership | **Dedicated transaction paths** | มี owner/character binding และ row locks ใน paths ที่แก้แล้ว |
| P1 | JWT predictable fallback secret | **Fail-closed ใน production self-host** | secret ต้องมีจริงและยาวอย่างน้อย 32 ตัวอักษร [9] |
| P1 | Public/admin sensitive field exposure | **Allowlist และ authenticated admin path** | public profile ไม่ควรขอ `is_admin`; admin actions ยังต้องใช้ server authorization |
| P1 | Socket client identity/progression spoof | **ตรวจ identity, map, ownership และ rate limits ตาม path** | ไม่ได้ทำ hostile live load test; ต้องทดสอบ staging แบบได้รับอนุญาต |
| P2 | Client daily quest JSON กำหนด current/reward | **Feature online read-only** | ยังไม่มี authoritative quest event lifecycle; ห้ามประกาศ online quest economy ว่าพร้อม |
| P2 | Refine/forge/card/mining/divine legacy writes | **Fail-closed online** | ปลอดภัยกว่า optimistic mutation แต่ feature online ยัง pending dedicated RPC |
| P2 | Hosted Supabase direct DML | **Migration เขียนแล้ว ยังไม่ apply** | ต้อง review schema, grants, function conflicts และรันโดยผู้มีสิทธิ์ |
| P3 | Raw emoji callsites | **Visual placeholder coverage ดีขึ้น; metadata remains** | ต้อง reviewเพิ่มเฉพาะ visual surface ที่ audit พบว่า fallback ถูก render จริง |

การ harden F12 ทำได้ในเชิง architecture ไม่ใช่การปิด DevTools ทาง browser ผู้เล่นยังสามารถเปิด F12, แก้ JavaScript, ส่ง request หรือปลอม socket payload ได้เสมอ เป้าหมายที่ถูกต้องคือทำให้ server ไม่เชื่อค่าที่ client ควบคุมและไม่ให้ request ปลอมสร้าง economy ผลงานส่วนใหญ่ในรอบนี้จึงเน้น server validation, ownership, locks, allowlists, idempotency และ fail-closed แทนการพยายามซ่อน client code

## 5. Hosted migration และ deployment caveats

ไฟล์ [`migrations/20260822_server_authority.sql`](../migrations/20260822_server_authority.sql) มี revoke direct `inventory`/`marketplace` DML และฟังก์ชัน hosted สำหรับ equipment, starter loadout, consumable, shop purchase, job change, system state, daily reward และ almanac reward รวมถึง request tables ที่ใช้ replay protection การตรวจ static รอบนี้พบ dollar-quote blocks 7 คู่และจำนวนวงเล็บเปิด/ปิดสมดุล แต่ไม่มี PostgreSQL server/`psql` ใน sandbox จึงยังไม่ใช่ SQL execution proof

Migration นี้ **ยังไม่ได้รันกับ Supabase production** และต้องตรวจให้ตรงกับ schema จริงโดยเฉพาะชนิด `auth.uid()`, column type ของ `inventory.user_id`/`characters.user_id`, unique constraint ของ `(character_id, item_name)`, existing function signatures และ fish catalog ในฐานข้อมูล Hosted migration ชุดนี้ยังไม่ใช่การเติม hosted equivalents ของ pet-specific market/NPC-sale flows ทุกตัวที่ self-host มีอยู่แล้ว จึงต้องตรวจ migration chain เดิมและเพิ่ม parity ก่อนเปิด hosted mode เต็มรูปแบบ

Self-host production ยังต้องตรวจว่า `server/api/rpc.js`, `server/api/data.js`, `server/api/fishing.js`, `server/api/npcSale.js` และ `server/game/monsterEngine.js` ถูก deploy พร้อม frontend ที่ตรงกัน การ deploy backend ผ่าน remote workflow ไม่ได้แปลว่า migration จะถูก apply อัตโนมัติ และการ deploy Vercel frontend เพียงอย่างเดียวไม่ทำให้ Windows VPS backend เปลี่ยนตาม

| ก่อน production rollout | Required action |
|---|---|
| Self-host auth | ตั้ง random `JWT_SECRET` ยาวอย่างน้อย 32 ตัวอักษร, exact `CORS_ORIGINS`, ไม่ใช้ `CORS_ALLOW_ALL` |
| World mode | ตรวจ `USE_LOCAL_DB=true` และไม่ตั้ง `WORLD_MONSTERS=false` ใน production เว้นแต่เป็น rollback ที่ได้รับอนุญาต |
| Hosted mode | Review และ apply migration โดยเจ้าของ DB; ตรวจ grants/RLS/function signatures และ migration chain |
| Backend deploy | Deploy source ที่รวม RPC/monster/fishing/npc/admin changes แล้ว monitor remote workflow แบบ passive |
| Admin exposure | จำกัด `/admin` ด้วย authentication และควรมี reverse-proxy/IP/VPN policy เพิ่ม; ห้าม expose database port ตรง |
| Observability | ตรวจ log ไม่บันทึก JWT/password, ตั้ง log rotation, monitor socket memory/rate-limit/error rate |

## 6. Validation results แบบ reproducible

ผลด้านล่างเป็นผลจาก command ที่รันใน working tree หลังการแก้ล่าสุด รวม authoritative job change, hosted shop/consumable functions, daily read-only gate และ UI fail-closed paths

```text
node --check server/api/rpc.js       PASS
node --check src/network/GameSync.js PASS
node --check src/ui/GameUI.js        PASS
npm test                              PASS — 643/643
npm run build                         PASS — Vite build completed
npm audit --omit=dev                  PASS — 0 vulnerabilities
node scripts/audit-assets.mjs         PASS — 298/298 art, 73/73 fish, pet atlas exists
git diff --check                     PASS
```

`npm run build` ยังแสดง warning เรื่อง chunk ที่ใหญ่กว่า 500 kB และ `INEFFECTIVE_DYNAMIC_IMPORT` บาง module เนื่องจาก module เดียวกันถูก static import ด้วย Warning เหล่านี้ไม่ทำให้ build fail แต่ควรเป็น performance backlog แยกจาก security release

## 7. Acceptance checklist หลัง authorized deployment

การตรวจต่อไปควรทำใน staging หรือ production ที่ได้รับอนุญาต โดยใช้ account/player ที่ไม่สำคัญและไม่ทำ destructive grant หากข้อใด fail ให้หยุด rollout และตรวจ server receipt/database row โดยตรง ไม่ใช้เฉพาะข้อความบน UI เป็นหลักฐาน

| Flow | Expected acceptance |
|---|---|
| Guest resume/bind | เข้า Guest เดิม, ทำ tutorial, bind email แล้ว logout/login กลับมาใช้ user/character เดิมและประวัติยังอยู่ |
| Pet summon/rename | เรียก pet, rename, reload/reopen แล้ว instance UID, name, equipped state ยังตรงกับ server |
| Pet XP | ฆ่า monster ที่มีสิทธิ์รับ XP, เห็น server pet receipt, reload แล้ว level/xp ไม่หายและไม่เพิ่มสองครั้งจาก duplicate event |
| Pet sale/market | ขายหรือ list ด้วย instance UID เดียว, duplicate click ไม่ขายซ้ำ, buyer/seller character binding ถูกต้อง |
| Fishing | ตกปลา first discovery, inventory/almanac/gold ตรง receipt, replay request ไม่ได้ bonus discovery ซ้ำ |
| Daily reward | claim สำเร็จหนึ่งครั้ง, click ครั้งที่สองถูกปฏิเสธและ gold/item ไม่เพิ่ม |
| Shop | ซื้อ item หลาย quantity, ตรวจ gold/inventory ใน DB, forged price/type/quantity และ request conflict ถูกปฏิเสธ |
| Consumable | ใช้เมื่อ HP/SP ไม่เต็มแล้วลด quantity หนึ่ง, ใช้เมื่อเต็มไม่ควรลด item, replay ไม่ลดซ้ำ |
| Job | first pick ฟรีตาม server, re-spec หัก 50,000 Zeny ตาม server, signature weapon/equip persist หลัง reopen |
| Mobile lifecycle | logout/reopen บน iPhone/iPad/Android แล้ว server-backed inventory, pet, job, fish history ไม่พึ่ง local cache และไม่หาย |
| Admin | เปิด bug reports, filter/detail/review/reward confirmation; ตรวจว่า unauthorized user เรียก admin API ไม่ได้ |

## 8. Unresolved items and release decision

**Release decision: HOLD สำหรับการประกาศว่า production-ready แบบเต็มรูปแบบ จนกว่าจะทำ deployment verification ตามข้อ 5 และ 7** การตรวจใน repository พร้อมระดับที่เหมาะสมต่อการ commit/push source bundle แล้ว แต่ยังไม่ควรบอกผู้เล่นว่า hosted Supabase authority parity, Windows VPS deploy, migration application, daily quests, refine/forge/card/mining/divine online economy หรือ live pet persistence ผ่านทั้งหมดแล้ว

รายการที่เหลือไม่ใช่ข้ออ้างให้เปิดช่อง client mutation: daily quest/roulette และ legacy refine/forge/card/mining/divine ถูกปิดหรือ read-only online อย่างตั้งใจ ส่วนงานต่อไปที่ควรทำตามลำดับคือเพิ่ม authoritative transactions ให้ feature เหล่านั้น, เพิ่ม hosted pet/market parity, รัน migration ใน staging, ทำ two-account concurrency tests และทำ passive health/workflow verification หลัง deploy โดยไม่ใช้ secret หรือทำ player modification ที่ไม่ได้รับอนุญาต

## References

[1]: ../server/api/rpc.js "ZOLOS self-host authoritative RPC dispatcher, pet, shop, job, consumable and equipment transactions"
[2]: ../server/game/monsterEngine.js "ZOLOS server-authoritative monster kill and pet progression transaction"
[3]: ../server/api/data.js "ZOLOS generic data API policy and inventory mutation lockdown"
[4]: ../src/network/GameSync.js "ZOLOS client/server synchronization adapters and canonical receipt reconciliation"
[5]: ../server/api/fishing.js "ZOLOS atomic fishing reward and almanac transaction"
[6]: ../src/ui/TutorialSystem.js "ZOLOS tutorial completion and online reward boundary"
[7]: ../server/server.js "ZOLOS Socket.IO identity, save-state and server authority boundary"
[8]: ../server/admin/index.html "ZOLOS standalone admin console and bug-report moderation UI"
[9]: ../server/api/auth.js "ZOLOS production JWT secret validation and authentication boundary"
[10]: ../scripts/audit-assets.mjs "ZOLOS deterministic item/fish/pet art coverage audit"
[11]: ../test/serverAuthorityProgression.test.js "ZOLOS server-authority progression regression contracts"
[12]: ../test/adminConsole.test.js "ZOLOS admin console and visual asset regression contracts"
