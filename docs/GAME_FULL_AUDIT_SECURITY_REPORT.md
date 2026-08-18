# ZOLOS Full Game Audit & Security Review

**ผู้จัดทำ:** Manus AI  
**วันที่ตรวจ:** 18 สิงหาคม 2026  
**ขอบเขต:** local build/runtime ของ ZOLOS, frontend, Node.js Socket.IO server, self-host API, auth, persistence และ static security review

## 1. Executive Summary

การตรวจครั้งนี้ครอบคลุมเส้นทาง Login, Register/Guest entry, loading, character/job selection, daily reward, HUD, game initialization, inventory entry point, profile/settings state, combat architecture, persistence flow, Socket.IO authority, generic data API, admin authorization และ dependency security โดยใช้การเล่นจริงใน local app ร่วมกับ source audit และ regression tests

ผลลัพธ์หลักคือพบประเด็นสำคัญด้าน **server authority** และ **deployment hardening** ซึ่งมีผลต่อความน่าเชื่อถือของเกมมากกว่าปัญหา visual ทั่วไป โดยเฉพาะ legacy monster mode ที่ client สามารถคำนวณ EXP, gold และ loot เองได้เมื่อ authoritative engine ปิดอยู่ การแก้ไขครั้งนี้ได้ทำให้ local Postgres ใช้ server-authoritative monster mode เป็นค่าเริ่มต้น และอนุญาตให้ปิดได้เฉพาะด้วย `WORLD_MONSTERS=false` สำหรับ rollback ที่ตั้งใจเท่านั้น

นอกจากนี้ได้ปิด default JWT secret ใน production, ปิดการอ่าน `profiles.is_admin` ผ่าน public generic data API, เปลี่ยน offline fallback ไม่ให้สร้าง record รหัสผ่านแบบ plaintext, แก้ HP/SP เกิน max หลังเปลี่ยนอาชีพ และเพิ่ม server runtime dependencies ที่ขาดจาก package manifest

> การตรวจนี้ยังไม่ใช่การรับรองความปลอดภัยของ VPS production แบบสมบูรณ์ เพราะยังไม่ได้ทำ destructive test, ไม่ได้ลอง credential จริง, และไม่ได้แก้ environment variables บนเครื่อง VPS ของผู้ใช้

## 2. วิธีการตรวจ

| วิธี | ขอบเขต | ผล |
|---|---|---|
| Browser runtime | เปิด local app ที่ `127.0.0.1:3001`, เปิด auth, Guest, loading, job, daily reward และ game HUD | ทำงานถึงหน้าเกมจริง; พบ resource state mismatch และ navigation anomaly |
| Static source audit | Auth, generic `/api/db`, Socket.IO handlers, save pipeline, combat, admin API, profile rendering | พบและแก้จุดเสี่ยงที่ยืนยันได้หลายรายการ |
| Regression tests | `npm test` | ผ่าน 456/456 |
| Production build | `npm run build` | ผ่าน; เหลือเฉพาะคำเตือน chunk size และ ineffective dynamic import |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities หลังอัปเดต Socket.IO parser |
| Production safety | ไม่ทำ mutation หรือ exploit บน VPS/บริการจริง | ไม่มีการเปลี่ยนแปลง production ระหว่าง audit |

## 3. ผลการทดสอบเส้นทางผู้เล่น

### 3.1 Login และ Loading

หน้า Login โหลดได้และแสดงธีม mascot/soft MMORPG พร้อม wordmark ZOLOS.ONLINE, BGM toggle, Start Game, Login, Register, Forgot Password และ Guest action ใน viewport ที่ทดสอบโดยไม่ต้อง scroll หน้า auth หลัก การเปิด auth จาก splash ไม่ได้ทำ page navigation ในรอบแรก และ loading overlay เข้าธีมเดียวกับ Login

### 3.2 Guest และ Character Creation

Guest login เข้าสู่เกมจริง สร้างตัวละครชั่วคราว และโหลด Prontera พร้อม HUD, minimap, skill bar, daily reward modal และ job selection modal การเลือก Swordsman ทำงานและเปลี่ยน skill bar เป็น Bash, Magnum Break และ Endure รวมถึงได้รับ starter weapon และ auto-equip

พบ state bug ที่ยืนยันได้ระหว่างเปลี่ยนอาชีพ: หลังเลือก Swordsman HUD ชั่วขณะแสดง `100/130 HP` และ `50/35 SP` ซึ่ง current SP มากกว่า max SP จึงเพิ่มการ clamp current HP/SP ตาม max ใหม่ใน `chooseJob()` แล้ว

### 3.3 Inventory, Profile และ Settings

การเปิด Inventory ใน browser audit รอบหนึ่งเกิด session/view anomaly ทำให้ browser กลับ `about:blank` และการกด Start Game ซ้ำจาก splash แสดงอาการเดียวกันอีกครั้ง ขณะเดียวกัน Guest session เดิมยังคงอยู่ใน local storage จึงยังไม่สามารถสรุปได้ว่าเป็น runtime exception ของเกมหรือ timing artifact ของ sandbox browser ประเด็นนี้ควรทดสอบซ้ำใน Chrome ปกติพร้อม Console และ Network log บนเครื่องจริง

จาก code review พบว่า Profile combat summary มี realtime refresh แล้วจากงานก่อนหน้า และ audit ครั้งนี้ไม่พบการแก้ไขที่ทำให้ flow ดังกล่าวถอยหลัง

### 3.4 Guest Semantics

ปุ่มจาก splash ที่มี guest session อยู่แล้วสร้าง guest identity ใหม่และเริ่ม progress ใหม่แทนการ resume identity เดิม พฤติกรรมนี้ยังคงเป็น “เริ่ม Guest ใหม่” ตาม implementation แต่แก้ข้อความเป็น `Guest ใหม่` พร้อม aria-label/title ที่ระบุว่า `START GAME` ใช้สำหรับกลับเข้า session เดิม จึงลดความกำกวมด้าน account expectation แล้ว

## 4. Security Findings และการแก้ไข

| ระดับ | ประเด็น | สถานะ | หลักฐาน/ผลกระทบ |
|---|---|---|---|
| **Critical/P0** | Legacy monster mode ให้ client คุม damage, death, EXP, gold, loot และ kill count | **แก้ secure default แล้ว; ต้อง verify production mode** | หาก `WORLD_MONSTERS` ปิด ผู้เล่นสามารถแก้ client/runtime แล้วส่ง hit หรือเร่ง local kill เพื่อสร้าง progression และ loot เอง |
| **High/P1** | JWT fallback ใช้ secret ที่เดาได้ หาก production ไม่ตั้ง `JWT_SECRET` | **แก้แล้ว** | Production/self-host จะ fail-closed หาก secret หายหรือสั้นกว่า 32 ตัวอักษร |
| **High/P1** | Generic public profile query เปิดโอกาสอ่าน `profiles.is_admin` | **แก้แล้ว** | เพิ่ม public column allowlist และปฏิเสธการขอคอลัมน์ sensitive; AdminUI self-host ใช้ authenticated `/auth/me` |
| **Medium/P2** | Offline fallback เก็บ password plaintext ใน localStorage | **แก้แล้วบางส่วน** | บัญชีใหม่เก็บ SHA-256 digest และบัญชี legacy จะ migrate เมื่อ login; สำหรับระบบ production ควรหลีกเลี่ยง offline password auth หรือใช้ PBKDF2/Argon2 พร้อม salt |
| **Medium/P2** | Server runtime dependencies ไม่อยู่ใน package manifest ครบ | **แก้แล้ว** | เพิ่ม `express`, `socket.io`, `jsonwebtoken`, `bcryptjs`, `cors`, `express-rate-limit` และตรวจ `npm audit` จนเป็น 0 |
| **Medium/P2** | Generic public `characters` response ยังมีข้อมูล gameplay หลายฟิลด์ | **Leaderboard path แก้แล้ว; generic DTO ยังต้องลดต่อ** | Leaderboard ไม่ส่ง `user_id` แล้วและใช้ public character `id` สำหรับ profile lookup; generic authenticated character reads ยังต้องทบทวน economy fields และ internal state |
| **Medium/P2** | Economy หลายส่วนยังมี client fallback | **ลดความเสี่ยงแล้ว; RPC migration ยัง pending** | Fishing loot, quest claim และ roulette ถูก fail-closed เมื่อ socket connected แต่ยังไม่มี `__serverRewards`; NPC sale ใช้ server request สำหรับ account path ส่วน Supabase/VPS RPC migration และ staging receipts ยังต้อง verify |
| **Low/P3** | Guest action สร้าง identity ใหม่โดยไม่มีข้อความชัด | **แก้แล้ว** | ปุ่มแสดง `Guest ใหม่`; `START GAME` คือ resume path และมี aria-label/title อธิบายความแตกต่าง |
| **Low/P3** | Browser กลับ `about:blank` หลัง Start Game ซ้ำ | **ยังไม่สรุป root cause** | ต้อง reproduce ใน browser ปกติและเก็บ console stack/network trace ก่อนแก้ |

## 5. จุดแก้ไขที่ทำใน repository

### 5.1 Server-authoritative monster mode

`server/server.js` เปลี่ยนจากการเปิด authoritative engine เฉพาะเมื่อกำหนด `WORLD_MONSTERS=true` เป็นการเปิดอัตโนมัติเมื่อ `USE_LOCAL_DB=true` และปิดได้เฉพาะเมื่อระบุ `WORLD_MONSTERS=false` อย่างชัดเจน การตั้งค่าบน VPS ที่แนะนำคือ `USE_LOCAL_DB=true`, ไม่ต้องตั้ง `WORLD_MONSTERS` หรือกำหนดเป็น `true`, และไม่ควรใช้ `WORLD_MONSTERS=false` บน production

### 5.2 JWT production hardening

`server/api/auth.js` ไม่อนุญาตให้ production/self-host ใช้ development fallback secret อีกต่อไป หาก `JWT_SECRET` หายหรือสั้นกว่า 32 ตัวอักษร auth module จะหยุดทำงานแทนการเปิดช่องให้ token ถูกปลอมได้

### 5.3 Public profile data allowlist

`server/api/data.js` เพิ่ม allowlist สำหรับ public profile columns เป็น `id`, `username`, `gender` และ `created_at` เท่านั้น การขอ `is_admin` ผ่าน generic data API จะถูกปฏิเสธ ส่วน `AdminUI` ใน self-host mode เปลี่ยนไปอ่านสิทธิ์จาก authenticated `/auth/me`

### 5.4 Offline credential storage

`src/network/SupabaseClient.js` ไม่สร้าง user record ใหม่ด้วย plaintext password อีกต่อไป แต่สร้าง one-way digest และจะ migrate legacy record เมื่อผู้ใช้ login สำเร็จ ทั้งนี้ localStorage ยังไม่ใช่พื้นที่ที่เหมาะสมสำหรับระบบบัญชี production เนื่องจาก script ที่รันได้บน origin เดียวกันยังสามารถอ่านข้อมูลได้

### 5.5 Runtime dependency และ resource consistency

เพิ่ม dependencies ของ Node server ลง manifest และแก้ `GameUI.chooseJob()` ให้ clamp HP/SP หลัง job modifier เปลี่ยน max resource เพื่อไม่ให้ HUD และ combat state ขัดแย้งกัน

## 6. สิ่งที่ควรทำต่อบน VPS ก่อนเปิดให้ผู้เล่นจริง

1. ตรวจ environment variables บน VPS โดยเฉพาะ `JWT_SECRET` ที่ต้องเป็น random secret ยาวอย่างน้อย 32 ตัวอักษร, `USE_LOCAL_DB=true`, `CORS_ORIGINS` เป็น exact allowlist และ `CORS_ALLOW_ALL` ต้องไม่เป็น `true`

2. ตรวจ startup log ให้พบข้อความ server-authoritative monster engine ทำงานจริง และทดสอบ `world_mode.serverMonsters === true` จาก client อย่างน้อยหนึ่งครั้งใน production staging ก่อนเปิด public traffic

3. ตรวจให้ Caddy หรือ firewall ไม่เปิด PostgreSQL, admin API และ Node port ตรงสู่ internet โดยไม่จำเป็น ควรเปิด public เฉพาะ HTTPS reverse proxy และจำกัด `/admin` ด้วย authentication, IP policy หรือ VPN เพิ่มอีกชั้น

4. ทำ two-account staging test สำหรับ market, vending, card mail, duel, matchmaking, reconnect, duplicate request และ simultaneous claim โดยตรวจยอดเงินจริงใน database หลังทุก transaction ไม่ควรใช้เพียงผลลัพธ์จาก UI

5. ย้าย reward ที่ยังใช้ client fallback ไปเป็น server-authoritative atomic RPC ได้แก่ fishing rewards, quest claim, daily reward และ roulette; ใน interim release นี้ fishing/quest/roulette จะ fail-closed ใน connected sessions และ NPC sale account path ใช้ server request แล้ว ส่วน pet purchase/card refine/fusion ต้องตรวจ receipt/idempotency บน production staging ต่อ

6. แยก public DTO ออกจาก database row โดยเฉพาะ characters, profiles, marketplace และ vending stalls เพื่อลดการรั่วของ user IDs, internal state, economy values และ configuration fields

7. ทดสอบ rate limits ด้วย load test ที่ได้รับอนุญาตบน staging พร้อมตรวจ memory growth ของ Socket.IO, chat, announcements และ monster snapshots รวมถึงตรวจ log rotation และการไม่บันทึก token/password ลง log

## 7. Acceptance Criteria สำหรับรอบถัดไป

| หมวด | เงื่อนไขผ่าน |
|---|---|
| Auth | ไม่มี default secret, login/register/guest ทำงาน, token expiry และ logout ถูกบังคับจริง |
| PvE | client แก้ damage/kill/reward ไม่ได้, EXP/gold/drop มาจาก server receipt เท่านั้น |
| Economy | buy/sell/mail/claim/refine/fusion ใช้ transaction/idempotency และยอดไม่ติดลบ |
| Ownership | user A อ่าน/แก้/ลบข้อมูลของ user B ไม่ได้ทุก endpoint รวม generic data และ RPC |
| Client security | user-controlled text ถูก escape ทุกจุด, ไม่มี secret ใน bundle, no plaintext password |
| Reliability | reconnect, duplicate click, reload, mobile viewport และ navigation ไม่ทำให้ session/game state สูญหาย |
| Deployment | `npm ci`, `npm test`, `npm run build`, `npm audit --omit=dev` ผ่านบน clean environment |

## 8. Verification Result

การตรวจรอบนี้เพิ่ม regression tests สำหรับ security hardening และได้ผลดังนี้:

- `npm test`: **456/456 ผ่าน**
- `npm run build`: **ผ่าน**
- `npm audit --omit=dev`: **0 vulnerabilities**
- `node --check`: ไฟล์ที่แก้ใน frontend และ server ผ่าน syntax check
- Production/VPS mutation: **ไม่ได้ทำ**

## References

[1]: ../server/server.js "ZOLOS Socket.IO server and world-mode configuration"
[2]: ../server/game/monsterEngine.js "ZOLOS server-authoritative monster engine"
[3]: ../src/engine/CombatSystem.js "ZOLOS client combat authority split"
[4]: ../server/api/auth.js "ZOLOS self-host authentication and JWT handling"
[5]: ../server/api/data.js "ZOLOS policy-based generic data access"
[6]: ../src/network/SupabaseClient.js "ZOLOS Supabase and offline fallback client"
[7]: ../src/ui/GameUI.js "ZOLOS game UI and job selection flow"
[8]: ../test/securityHardening.test.js "ZOLOS security hardening regression tests"
