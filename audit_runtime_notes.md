# ZOLOS Runtime Audit Notes

## Login screen — 2026-08-18

The local game loaded successfully at `http://127.0.0.1:3001/`. The landing screen rendered the bright mascot-themed ZOLOS.ONLINE artwork, a BGM toggle, and a Start Game button. Clicking Start Game opened the authentication panel without a page navigation.

The authentication panel exposes email/username and password fields, a Forgot Password action, a Login action, a Register action, and a Guest action. The panel fitted within the visible 893×768 viewport in this run; no scroll was required. This is a visual/runtime observation only; authentication and game persistence still require interaction tests.

The application is currently being audited locally. No production/VPS mutation or payment/account action has been performed.

## Planned coverage

Test login/register/guest paths, character creation, loading/game initialization, profile/settings, inventory/equipment/refine/cards, combat/skills/quests, social/trade/market/mail, persistence/reconnect, and server authority/security boundaries.

## Security boundaries

All discovered security concerns will be categorized as confirmed, likely, or unverified. No destructive or unauthorized action will be attempted against production services.

## Guest login and initial game — 2026-08-18

Guest login succeeded locally and created a temporary guest character (`GUEST_GE0FC`, Lv.1). The game displayed a themed loading overlay with progress and tips, then entered Prontera with the 3D canvas, HUD, minimap, skill slots, music controls, daily reward modal, and job-selection modal active simultaneously.

The first-run state is feature-dense: job selection and daily reward overlays appeared on top of the game. The job selector rendered a 3D preview and class data for Swordsman, Mage, Archer, and Acolyte. The daily reward dialog exposed a Day 1 claim action. This path is functional at the rendering level; interaction and persistence still need to be exercised.

Observed runtime state after loading: HP 100/100, SP 50/50, EXP 0/100, 0 gold, 0 ZOL, and no online players. The Socket status showed OFFLINE in this local run, which is expected unless the configured realtime server is available; this is a deployment/integration risk to verify separately.

## First-run interaction findings

Selecting Swordsman succeeded and updated the skill bar from two slots to Bash, Magnum Break, and Endure. The HUD immediately showed `100/130` HP and `50/35` SP before claiming the daily reward, which is an internally inconsistent resource state because current SP exceeded maximum SP. After claiming Day 1, the HUD showed `102/130` HP and `35/35` SP, gold increased from 0 to 500, and the daily modal closed. The game log reported that the class starter Sword was granted and auto-equipped.

This is a confirmed UX/state consistency issue to investigate: job selection or initial resource restoration appears to leave current HP/SP values out of sync with their job-adjusted maxima until a later update clamps them.

## Session/navigation finding

A click attempt on Inventory failed to produce a usable screenshot and the browser ended at `about:blank`. Navigating back to the local app restored the splash screen with the same `Guest_GE0FC` session and a Start Game button. This suggests the client session persisted locally, but the abrupt return to splash/blank needs regression verification because it may indicate a browser/tool timing issue, a runtime exception, or a game-screen lifecycle edge case.

## Repeatable navigation finding

After returning to the splash screen with the persisted guest session, clicking Start Game again reproduced the same behavior: the browser interaction reported no visible elements and the subsequent browser view was `about:blank`. This is now a repeatable observation in the sandbox browser and should be treated as a high-priority lifecycle/runtime issue until console/network evidence proves it is an automation artifact.

## Guest direct-flow finding

The `เล่นเป็น Guest` action from the persisted splash successfully entered the game, but it created a new guest identity (`Guest_6HM8B`) rather than returning to `Guest_GE0FC`. The new guest started at Lv.1 with 0 gold and the first-run job/daily overlays again. This may be intended for “new guest” semantics, but the UI label and account/session behavior should be clarified because users may expect it to resume the current guest or explicitly start a fresh guest.

## Runtime smoke — 2026-08-18 remediation pass

หลัง security hardening รอบล่าสุด กด START GAME จาก persisted Guest session แล้วเข้าสู่ game screen ได้จริง ไม่กลับ about:blank ในรอบนี้ เกมแสดง HUD, canvas, minimap, skill bar และสถานะ OFFLINE ตามคาด พร้อม modal เลือกอาชีพและ Daily Reward Day 1 ที่ยังทำงานอยู่ จึงถือว่า Login → Loading → Game transition ผ่าน smoke test รอบนี้

ข้อสังเกตที่ยังต้องทดสอบต่อคือการเลือกอาชีพ/claim reward หลัง generic inventory guard และการเปิด Inventory/Profile/Settings ว่ายัง save system snapshots และ combat state ได้ถูกต้อง โดยเฉพาะ flow ที่ต้องใช้ authenticated self-host RPC migrations บน VPS จริง

การเลือก Swordsman หลัง Start Game ยังเปลี่ยน skill bar เป็น Bash/Magnum Break/Endure และ HUD clamp เป็น `100/130 HP`, `35/35 SP` ได้ถูกต้อง ไม่พบค่า SP เกิน max ในรอบนี้ การกดรับ Daily Reward Day 1 สำเร็จ, gold เพิ่มเป็น 500, modal ปิด และ combat log แสดงว่าได้รับ Sword starter พร้อม auto-equip จึงผ่าน runtime compatibility smoke ของ job/reward path หลัง generic inventory restrictions

การทดสอบต่อจาก game screen: กด Inventory แล้ว browser กลับ `about:blank` อีกครั้ง โดย click screenshot upload ล้มเหลวและ browser_view ยืนยัน URL เป็น about:blank ไม่มี DOM จึงเป็น repeatable lifecycle/runtime finding ไม่ใช่แค่ visual mismatch ต้องตรวจ console/runtime stack และ event handler ของ Inventory ต่อ

รอบ smoke ใหม่หลังเริ่ม phase Inventory/Profile: browser_navigate แสดง splash ปกติพร้อม Guest_6HM8B แต่ click START GAME รายงาน screenshot upload ล้มเหลว และ browser_view ทันทีหลังจากนั้นยืนยัน URL `about:blank` ไม่มี DOM อีกครั้ง จึงพบอาการหลุด blank ซ้ำทั้งที่มีบางรอบก่อนหน้านี้เข้า game ได้ ต้องถือเป็น runtime blocker ที่ยังไม่ผ่าน ไม่ควรแก้ Inventory โดยสันนิษฐานว่า panel handler เป็นสาเหตุจนกว่าจะตรวจ lifecycle/console ของ start-game


## Responsive HUD smoke — 2026-08-18

Local app ที่ `127.0.0.1:3001` ตอบ HTTP 200 และหน้า splash แสดงปุ่ม `Guest ใหม่` ตาม implementation ล่าสุด กด START GAME แล้วเข้าสู่ loading/game initialization ได้ โดย extracted DOM แสดง HUD ใหม่ครบ ได้แก่ Bag, My Card, ผจญภัย, สังคม, ระบบ, AUTO และ skill keys 1/2/3

Browser screenshot รอบ game หลัง loading ไม่อัปโหลด จึงยังไม่มี visual confirmation จาก sandbox สำหรับ iPad-sized viewport การยืนยัน iPad จริงต้องทดสอบบน Safari/iPad ภายนอก รอบนี้ไม่พบหลักฐานว่า responsive CSS ทำให้ transition crash แต่ยังไม่ถือเป็น acceptance ของ iPad portrait/landscape


Console smoke รอบ responsive: browser context รายงาน viewport 1280×1100, landscape, DPR 1 แต่ query ณ เวลาตรวจไม่พบ `#hud-bottom`, `#mobile-actions`, `#auto-farm-container` หรือ `#stall-modal` จึงน่าจะอยู่ระหว่าง loading/คนละ document lifecycle ไม่ใช่หลักฐานว่ากฎ CSS ไม่ทำงาน และยังไม่ใช้แทนการทดสอบบน iPad Safari จริง


## Deployment mismatch finding — 2026-08-18

ตรวจ `https://zolos.online/` หลังผู้ใช้แจ้งว่ายังเห็น layout เดิม พบว่า Vercel live HTML ยังอ้าง asset เก่า `index-CsT5Y7BY.js` และ `index-Cpzu_E93.css` ซึ่งไม่มี markers ของ responsive batch (`zolos-action-bottom`, iPad market rules, high-DPI stall text helpers)

GitHub deployment record ของ commit `acd0bda` มีสถานะ `failure` และ target preview เป็น Vercel URL ที่ต้อง login จึงยังดึง build log จาก sandbox ไม่ได้ การ push GitHub สำเร็จแล้ว แต่ Vercel production ยังไม่ได้ deploy commit นี้ ดังนั้นผู้ใช้จึงเห็น layout เดิมจริง ไม่ใช่เพียง cache ของ iPad
