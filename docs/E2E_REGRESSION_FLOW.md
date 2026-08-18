# ZOLOS E2E Regression Flow

## วัตถุประสงค์

เอกสารนี้ออกแบบเส้นทางทดสอบแบบ End-to-End สำหรับ ZOLOS ให้ครอบคลุมการใช้งานจริงของผู้เล่นตั้งแต่เปิดเกม เข้าสู่ระบบ สมัครบัญชี สร้างตัวละคร เข้าเกม ได้รับไอเทม โหลด inventory ใหม่ ออกจากระบบ และเชื่อมต่อกลับหลัง network interruption

เป้าหมายสำคัญไม่ใช่เพียงการตรวจว่าปุ่มทำงาน แต่ต้องยืนยันว่า **สถานะที่ผู้เล่นเห็นบนหน้าจอ ตรงกับข้อมูล authoritative ที่ถูกบันทึกใน backend** และต้องไม่เกิดข้อมูลหาย ข้อมูลซ้ำ การได้รับรางวัลซ้ำ หรือการเข้าถึงข้อมูลของผู้เล่นคนอื่น

> หลักการสำคัญ: UI อาจแสดงผลสำเร็จได้ แต่ flow จะถือว่า pass ก็ต่อเมื่อ client state, server state และ database state สอดคล้องกันหลัง reload หรือ reconnect

## สถานะปัจจุบันของ test system

โปรเจกต์มีชุดทดสอบ `node:test` สำหรับ unit, integration และ source-level regression อยู่แล้ว โดยคำสั่งหลักคือ `npm test` และปัจจุบันมีการทดสอบผ่าน 433 รายการ อย่างไรก็ตาม E2E browser runner สำหรับจำลองผู้เล่นจริงควรถูกเพิ่มเป็น suite แยก ไม่ควรนำ browser lifecycle ไปปนกับ unit tests เดิม

| ชั้นการทดสอบ | หน้าที่ | ความเร็ว | ตัวอย่าง |
|---|---|---:|---|
| Unit | ตรวจ function และกฎ business logic | เร็วมาก | inventory queue, card fusion, damage calculation |
| Integration | ตรวจ client/server หรือ database boundary | ปานกลาง | atomic reward, persistence, migration |
| E2E Smoke | ตรวจเส้นทางหลักที่ต้องผ่านทุก deploy | ปานกลาง | login, register, first inventory load |
| E2E Critical | ตรวจข้อมูลไม่หายและ state transition สำคัญ | ช้ากว่า | loot → reload → reconnect, duplicate reward |
| E2E Extended | ตรวจ edge cases, responsive และ security abuse | ช้าที่สุด | invalid input, duplicate request, disconnect timing |

## สถาปัตยกรรมการทดสอบที่แนะนำ

ควรแบ่งระบบออกเป็นสามส่วน ได้แก่ browser driver, test API/database helper และ test data lifecycle โดย browser driver ทำหน้าที่กด UI และอ่านผลที่ผู้เล่นเห็น ส่วน API/database helper ใช้เตรียมข้อมูลและตรวจ authoritative state เท่านั้น ไม่ควรใช้ database helper เพื่อข้ามขั้นตอนที่ flow ต้องการทดสอบผ่าน UI

```text
E2E Test
  ├── Browser page: เปิดเกม / กรอกข้อมูล / กดปุ่ม / อ่าน UI
  ├── API helper: สร้าง test user / reset test character / seed item
  ├── Database verifier: ตรวจ inventory, character, reward transaction
  └── Network controller: จำลอง disconnect, delay, retry และ reconnect
```

การตรวจ database ต้องใช้ test project หรือ staging database แยกจาก production เสมอ และ test user ทุกตัวต้องมี prefix ที่ชัดเจน เช่น `e2e_login_<runId>` เพื่อให้สามารถลบข้อมูลได้โดยไม่กระทบผู้เล่นจริง

## Test environment และข้อมูลทดสอบ

### Environment แยกตามวัตถุประสงค์

| Environment | ใช้ทำอะไร | เงื่อนไข |
|---|---|---|
| Local | พัฒนา test และ debug selector | ใช้ seed data แบบ deterministic |
| Staging | รัน smoke/critical ก่อน deploy | ใช้ backend และ migration ใกล้ production |
| Production | ไม่ควรรัน destructive E2E | อนุญาตเฉพาะ read-only health check หรือ synthetic account ที่ควบคุมเข้มงวด |

### Test identities

ควรมี test identity อย่างน้อย 5 แบบ โดยแต่ละ run ต้องสร้างชื่อใหม่ด้วย `runId` เพื่อให้รันซ้ำหรือรัน parallel ได้โดยไม่ชนกัน

| Identity | จุดประสงค์ |
|---|---|
| `newUser` | ทดสอบ register และ character creation |
| `existingUser` | ทดสอบ login และ returning player |
| `inventoryUser` | ทดสอบ loot, equip, quantity และ persistence |
| `reconnectUser` | ทดสอบ reconnect และ duplicate request |
| `attackerUser` | ทดสอบการเข้าถึง character/inventory ของผู้อื่น |

ข้อมูลที่ควร seed ให้ `inventoryUser` ได้แก่ potion 3 ชิ้น, equipment 1 ชิ้น, card 2 ใบ และ item ที่มี stats สำหรับตรวจว่าข้อมูล nested JSON ไม่ถูกลบระหว่าง save

### State reset strategy

ทุก test ต้องเลือกวิธี reset อย่างใดอย่างหนึ่งอย่างชัดเจน:

1. **Fresh identity** ใช้ user และ character ใหม่ เหมาะกับ register และ first-login flow
2. **Transactional reset** reset inventory, character และ reward ledger ก่อนเริ่ม test เหมาะกับ inventory flow ที่ต้องตรวจค่าปริมาณแน่นอน
3. **Snapshot/restore** เก็บ state ก่อนทดสอบแล้ว restore หลังจบ เหมาะกับ test ที่ต้องสร้างหลาย mutation
4. **Read-only verifier** ไม่แก้ข้อมูล เหมาะกับ smoke check หลัง deploy

ไม่ควรใช้การลบข้อมูลแบบกว้าง เช่นลบ inventory ตาม item name อย่างเดียว ต้อง filter ด้วย `testRunId`, `user_id` และ `character_id` ทุกครั้ง

## Selector contract

E2E ไม่ควรพึ่งพา class CSS ที่เปลี่ยนตาม visual redesign ควรเพิ่ม `data-testid` หรือใช้ id ที่มีอยู่แล้วเป็น contract ระหว่าง UI กับ test

| หน้าจอ | Selector ที่ควรมี |
|---|---|
| Auth screen | `#auth-screen`, `#auth-splash`, `#auth-form-wrapper` |
| Login | `#btn-start-game`, `#auth-username`, `#auth-password`, `#btn-login`, `#btn-register`, `#btn-guest` |
| Register | `#auth-charname`, `#auth-class-selector`, `.class-badge[data-class="swordman"]`, `#auth-gender-male`, `#auth-gender-female` |
| Game ready | `[data-testid="game-ready"]`, `[data-testid="player-name"]` |
| Inventory | `#btn-inventory`, `[data-testid="inventory-panel"]`, `[data-testid="inventory-item"]` |
| Quantity | `[data-testid="item-quantity"]`, `[data-testid="item-stats"]` |
| Error/loading | `[data-testid="auth-error"]`, `[data-testid="sync-status"]`, `[data-testid="reconnect-banner"]` |

ถ้า UI มีข้อความหลายภาษา ควรใช้ `data-testid` เป็นหลัก ไม่ควรหา element ด้วยข้อความภาษาไทยหรือภาษาอังกฤษเพียงอย่างเดียว

# Regression flows

## E2E-001: Auth boot และ title screen

**วัตถุประสงค์:** ยืนยันว่าเกมเริ่มต้นใน state ที่ถูกต้องและไม่แสดง login form ก่อนผู้เล่นกดเริ่มเกม

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | เปิดหน้าเกมใน clean browser context | `#auth-screen` แสดงและ background โหลดสำเร็จ |
| 2 | รอ loading timeout ที่กำหนด | ไม่เกิด blank screen หรือ uncaught fatal error |
| 3 | ตรวจ `#auth-splash` | splash แสดง `START GAME` |
| 4 | ตรวจ `#auth-form-wrapper` | form ยัง hidden |
| 5 | ตรวจ BGM control | ปุ่มแสดง state ที่อ่านได้และกดซ้ำได้ |

**Acceptance assertions:** หน้าไม่ scroll ใน title state, ปุ่ม Start Game มี accessible name, และไม่ควรมี network error ที่ทำให้ auth boot ล้มเหลว

## E2E-002: Login สำเร็จ

**Precondition:** มี `existingUser` และ password ที่ถูกต้อง

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | เปิด title screen | เห็น Start Game |
| 2 | กด Start Game | splash หายและ login form แสดง |
| 3 | กรอก email/username และ password | field มีค่าถูกต้องและไม่เกิด layout shift รุนแรง |
| 4 | กด Login | ปุ่มเข้าสู่ loading/disabled state เพื่อป้องกัน double submit |
| 5 | รอ auth success | form หายหรือเข้าสู่ game loading state |
| 6 | รอ game ready | player name และ character state ถูกโหลด |
| 7 | ตรวจ backend | session active และ character เป็นของ user เดิม |

**Acceptance assertions:** login สำเร็จเพียงครั้งเดียว, ไม่มี duplicate character load, inventory load ผูกกับ `character_id` ที่ถูกต้อง และ refresh หลังเข้าเกมไม่ทำให้ session หรือ inventory หาย

## E2E-003: Login ล้มเหลวและ retry

ทดสอบ password ผิด, username ไม่พบ, field ว่าง, input ที่มี whitespace และการกด Enter ซ้ำหลายครั้ง

| กรณี | Expected result |
|---|---|
| Password ผิด | แสดง error ที่อ่านได้โดยไม่เปิดเผยว่าบัญชีมีอยู่หรือไม่เกินจำเป็น |
| Field ว่าง | ไม่ส่ง request หรือแสดง validation ทันที |
| กด Login ซ้ำ | มี request เดียวหรือผลลัพธ์ถูก deduplicate |
| Login สำเร็จหลัง retry | state เปลี่ยนเป็น game พร้อม session เดียว |
| Network timeout | มี retry/error state และไม่ค้าง spinner ตลอดไป |

## E2E-004: Register และสร้าง character

**Precondition:** ใช้ `newUser` ที่ไม่เคยมีอยู่ใน environment นี้

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | เปิด title และกด Start Game | login form แสดง |
| 2 | กด Register | register mode แสดง และ field ที่จำเป็นเปิด |
| 3 | กรอก email/username, password, character name | ค่าถูก validate ตาม rule |
| 4 | เลือก class | badge ที่เลือกมี active state เพียงหนึ่งรายการ |
| 5 | เลือก gender | state เปลี่ยนชัดเจนและไม่ reset class |
| 6 | Submit register | ปุ่ม disabled ระหว่าง request |
| 7 | รอ success | character ถูกสร้างหนึ่งตัวและ session ถูกผูกกับ user ใหม่ |
| 8 | เข้าเกม | player name, class และ gender ตรงกับค่าที่เลือก |
| 9 | ตรวจ database | มี user/character/inventory starter state ตาม contract |

**Acceptance assertions:** การกด submit ซ้ำไม่สร้าง character ซ้ำ, character name ที่ซ้ำถูกปฏิเสธอย่างปลอดภัย, email ที่ไม่ถูกต้องไม่สร้าง partial account และถ้า character creation สำเร็จแต่ client timeout ต้องสามารถ recover state ได้โดยไม่สร้างตัวละครซ้ำ

## E2E-005: Register validation matrix

ควรแยกเป็น parameterized cases เพื่อให้ตรวจได้เร็วและอ่านผลได้ชัด

| Input case | Expected result |
|---|---|
| Email ว่าง | validation error |
| Email format ผิด | validation error |
| Password สั้นกว่ากำหนด | validation error |
| Character name ว่าง | validation error |
| Character name ยาวเกินกำหนด | validation error |
| Character name มีอักขระต้องห้าม | validation error |
| Character name ซ้ำ | server rejection และไม่สร้าง duplicate |
| Class ไม่อยู่ใน allowlist | server rejection |
| Gender ไม่อยู่ใน allowlist | server rejection |
| Double submit | สร้างได้มากที่สุดหนึ่ง character |

## E2E-006: Login → inventory initial load

**วัตถุประสงค์:** ยืนยันว่า inventory ที่เห็นหลัง login เป็นของ character ที่ถูกต้องและมีข้อมูลครบ

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | Login ด้วย `inventoryUser` | เข้า game ready |
| 2 | เปิด inventory | panel แสดง loading state แล้วเปลี่ยนเป็น ready |
| 3 | ตรวจ item list | potion, equipment และ card ที่ seed ไว้ปรากฏ |
| 4 | ตรวจ quantity | ปริมาณตรงกับ authoritative fixture |
| 5 | ตรวจ stats | nested stats เช่น refine, card state และ equip flags ไม่หาย |
| 6 | ปิด/เปิด panel ใหม่ | state ตรงกันและไม่เพิ่ม duplicate rows |

**Acceptance assertions:** inventory query filter ด้วย character id, item ที่ไม่มีสิทธิ์ไม่ปรากฏ, loading ที่ช้าไม่ทำให้ panel แสดงข้อมูลเก่าปะปนกับ character ใหม่ และการเปิด panel หลายครั้งไม่สร้าง listener ซ้ำ

## E2E-007: Loot → inventory mutation → UI refresh

**Precondition:** `inventoryUser` อยู่ในพื้นที่ที่สามารถได้รับ deterministic reward หรือใช้ test-only reward endpoint ที่จำกัดเฉพาะ staging

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | บันทึก quantity ก่อน loot | `beforeQuantity` ถูกเก็บใน test report |
| 2 | ทำ action ที่ให้ reward | combat/quest result สำเร็จ |
| 3 | รอ reward confirmation | มี reward event หรือ response หนึ่งครั้ง |
| 4 | เปิด inventory | quantity ใหม่เท่ากับ `beforeQuantity + rewardQuantity` |
| 5 | reload page/game state | quantity ยังคงเท่าเดิม |
| 6 | ตรวจ database | มี inventory row เดียวต่อ character/item และ quantity ถูกต้อง |

**Acceptance assertions:** reward เดียวไม่ถูก apply สองครั้ง, UI ไม่ optimistic เกิน authoritative response, และถ้า request retry ต้องไม่เพิ่ม quantity ซ้ำ

## E2E-008: Equip/unequip และ persistence

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | เปิด inventory | item ที่ equip ได้แสดง action |
| 2 | Equip equipment/card/pet | UI เปลี่ยน active state และ character visual/stat เปลี่ยน |
| 3 | ปิดและเปิด inventory | equip state ยังตรงกัน |
| 4 | reload | equip state และ stats ยังอยู่ |
| 5 | unequip | item กลับสู่ inventory state และ slot ว่าง |
| 6 | ตรวจ database | `armor`, `shield`, gear และ stats ไม่ถูก clobber |

**Acceptance assertions:** equip mutation ถูก serialize ต่อ character/item, การกดเร็วหลายครั้งไม่ทำให้ state สลับผิด, และอุปกรณ์คนละ slot ไม่เขียนทับกัน

## E2E-009: Duplicate inventory consolidation

**วัตถุประสงค์:** ตรวจ migration/repair path สำหรับ duplicate rows ที่เคยเป็นความเสี่ยงของระบบ

**Fixture:** สร้าง duplicate rows ของ item เดียวกันภายใต้ character เดียวกัน เช่น quantity 2 และ 3

| ขั้นตอน | Expected result |
|---|---|
| Seed duplicate rows | ทำได้เฉพาะ staging helper และบันทึก row ids |
| Run migration/repair | เหลือ row เดียว |
| Verify quantity | quantity เท่ากับผลรวมเดิม |
| Reload inventory | UI แสดง item เพียงหนึ่งรายการ |
| Repeat repair | ผลลัพธ์ไม่เปลี่ยนอีก หรือ idempotent |
| Insert duplicate ใหม่ | database constraint/RPC ปฏิเสธหรือรวมอย่างปลอดภัย |

**Acceptance assertions:** quantity ไม่หาย, stats ที่เลือกตาม policy ไม่ถูกลบทิ้ง, row ที่ quantity <= 0 ถูกกำจัด และ operation transaction ไม่ทิ้งข้อมูลค้างกลางทาง

## E2E-010: Logout/login persistence

| ขั้นตอน | Action | Expected result |
|---:|---|---|
| 1 | Login และบันทึก inventory snapshot | snapshot มี item, quantity, stats และ equipped state |
| 2 | Logout | session ถูกล้างและ protected UI หาย |
| 3 | เปิดหน้าใหม่ | ไม่เห็น inventory ของ user เดิมก่อน login |
| 4 | Login กลับ | เห็น character เดิม |
| 5 | เปิด inventory | snapshot ตรงทุก field |

**Acceptance assertions:** logout ไม่ลบข้อมูล, login user ใหม่ไม่เห็นข้อมูล user เก่า, local cache ไม่ทำให้ inventory ผิด character และ session transition ไม่สร้าง stale UI

## E2E-011: Reconnect และ interrupted mutation

ควรจำลองอย่างน้อยสามสถานการณ์ ได้แก่ disconnect ก่อนส่ง mutation, disconnect หลัง server commit แต่ก่อน client ได้ response และ disconnect ระหว่าง initial inventory load

| สถานการณ์ | Expected behavior |
|---|---|
| ก่อน commit | retry ได้และ reward เกิดไม่เกินหนึ่งครั้ง |
| หลัง commit ก่อน response | client reconcile จาก authoritative state โดยไม่เพิ่มซ้ำ |
| ระหว่าง load | มี reconnect/loading state และโหลด inventory ใหม่แบบ clean |
| Socket reconnect | session/character เดิมกลับมา ไม่สร้าง ghost player |
| กด action ระหว่าง offline | action ถูก disable หรือ queue ตาม policy ที่ชัดเจน |

**Acceptance assertions:** inventory mutation queue ยังคง serial ต่อ character/item, retry ใช้ idempotency key เดิม และ UI แสดง sync status ที่ผู้เล่นเข้าใจได้

## E2E-012: Cross-user isolation และ security regression

**Precondition:** มี `attackerUser` และ `inventoryUser` คนละ account/character

| Test | Expected result |
|---|---|
| เปลี่ยน character id ใน request | server reject |
| อ่าน inventory ของอีก user | ได้ empty/403 ตาม contract แต่ไม่คืนข้อมูล |
| ส่ง reward ให้ character อื่น | reject |
| ส่ง item id ที่ไม่มีอยู่ | reject |
| ส่ง quantity ติดลบหรือสูงผิดปกติ | reject และไม่มี mutation |
| ส่ง class/gender ที่ไม่อยู่ใน allowlist | reject |
| replay reward request เดิม | ไม่เพิ่มรางวัลซ้ำ |
| เปิด socket event โดยไม่มี auth | connection/event reject |
| แทรก HTML/script ในชื่อ | แสดงเป็น text และไม่ execute |

การทดสอบนี้ควรตรวจทั้ง HTTP/RPC response, database state และ UI ไม่ควรตรวจเพียง error message เพราะบางกรณีอาจตอบ error แต่ mutation เกิดขึ้นไปแล้ว

# Assertions ที่ทุก flow ควรใช้ร่วมกัน

ทุก flow ควรมี helper assertions มาตรฐานดังนี้:

```text
assertAuthState(state)
assertGameReady()
assertInventoryReady()
assertInventorySnapshot(expected)
assertSingleInventoryRow(characterId, itemName)
assertNoDuplicateReward(rewardKey)
assertSessionBelongsTo(userId)
assertNoHorizontalOrVerticalOverflow(viewport)
assertNoUnhandledPageError()
assertNetworkMutationCount(expected)
```

สำหรับ inventory snapshot ควรเปรียบเทียบเฉพาะ field ที่เป็น contract และ normalize JSON ก่อนเทียบ เช่นเรียง item ตาม item name และจัดรูปแบบ stats ให้คงที่

```js
{
  itemName,
  itemType,
  quantity,
  stats: {
    cardId,
    cardStars,
    cardPity,
    equipped,
    slot,
    refineLevel
  }
}
```

ไม่ควรเปรียบเทียบ object ทั้งก้อนแบบ strict หากมี field เช่น updated_at หรือ server timestamp ที่เปลี่ยนตามการรัน

# Test suite tiers

## Smoke suite

รันทุก pull request ที่แก้ frontend, auth, network หรือ inventory ได้แก่ auth boot, login success, login failure, register success, inventory initial load และ logout/login persistence แบบสั้น

## Critical suite

รันก่อน merge และทุก staging deploy ได้แก่ loot persistence, equip persistence, duplicate reward, reconnect after commit, duplicate inventory consolidation และ cross-user isolation

## Extended suite

รันตาม schedule หรือก่อน production release ได้แก่ mobile portrait/landscape, slow network, timeout, double click, malformed input, migration replay, multiple tabs, browser refresh ระหว่าง mutation และ long session cleanup

| Suite | จำนวนโดยประมาณ | เวลาเป้าหมาย | เงื่อนไขรัน |
|---|---:|---:|---|
| Smoke | 6–10 flows | ต่ำกว่า 5 นาที | ทุก PR ที่เกี่ยวข้อง |
| Critical | 12–20 flows | ต่ำกว่า 15 นาที | merge/staging deploy |
| Extended | 25+ scenarios | ตาม budget | nightly/release candidate |

# CI และการเก็บหลักฐาน

ทุก E2E run ควรเก็บ screenshot เมื่อ fail, video หรือ trace สำหรับ critical failure, console error, network failure, testRunId, userId/characterId แบบ masked และ database snapshot ก่อน/หลังเฉพาะ test data

CI ควรทำตามลำดับนี้:

```text
npm test
  → build
  → start local/staging server
  → apply verified migrations
  → seed isolated E2E data
  → run smoke
  → run critical if smoke passes
  → collect artifacts
  → cleanup test identities
```

หาก smoke ล้มเหลว ไม่ควรรัน critical ต่อ เพราะผลลัพธ์จะเต็มไปด้วย cascading failures และทำให้วิเคราะห์สาเหตุยาก

ควรแยก secret ของ E2E ออกจาก production และห้ามใส่ password จริงหรือ service-role key ใน browser context หากต้องตรวจ database ให้ทำผ่าน server-side verifier ที่ไม่ expose credential ให้หน้าเว็บ

# Definition of Done

E2E regression flow ชุดนี้ถือว่าพร้อมใช้งานเมื่อ:

1. Login, register และ inventory มี stable selectors ที่ไม่ผูกกับ visual CSS
2. ทุก test สร้างและล้างข้อมูลของตัวเองได้โดยไม่แตะ production user
3. Register ไม่สร้าง duplicate character เมื่อ submit ซ้ำ
4. Login และ logout ไม่สลับ session หรือข้อมูลข้าม user
5. Loot, equip, unequip และ reward retry ให้ผล idempotent
6. Inventory หลัง reload/reconnect ตรงกับ authoritative database state
7. Duplicate inventory rows ถูก consolidate โดย quantity ไม่หาย
8. Unauthorized character/inventory mutation ถูก reject และไม่มี side effect
9. Smoke suite รันได้ใน CI โดยไม่ต้องมี browser login ด้วยบัญชีจริง
10. Failure artifact เพียงพอให้ทีมระบุได้ว่าเสียที่ UI, network, server หรือ database

# ลำดับการ implement ที่แนะนำ

เริ่มจากเพิ่ม E2E runner และ selector contract ก่อน จากนั้นทำ `E2E-001` ถึง `E2E-004` ให้ผ่านเพื่อยืนยัน auth lifecycle แล้วจึงเพิ่ม `E2E-006` ถึง `E2E-010` สำหรับ inventory persistence ต่อด้วย reconnect และ security flows

ลำดับที่คุ้มค่าที่สุดคือ **Login → Register → Initial Inventory → Loot Persistence → Logout/Login → Reconnect → Cross-user Isolation** เพราะครอบคลุมความเสี่ยงหลักของระบบปัจจุบันโดยไม่ต้องรอให้ content ทั้งเกมเสร็จ
