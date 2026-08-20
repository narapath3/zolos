# ZOLOS First 30 Minutes & Adventure Notebook Design

## Product goal

สร้างเส้นทางนำผู้เล่นใหม่ผ่าน 30 นาทีแรกด้วยสมุดบันทึกนักผจญภัยที่เป็นทั้งคู่มือ, checklist, map navigator และ progression tracker โดยแต่ละขั้นต้องสอนจาก gameplay จริง ไม่ขโมยการควบคุมจากผู้เล่น และสามารถข้าม/กลับมาทำต่อได้หลัง reload หรือ reconnect

## Journey chapters

| Step | เวลาโดยประมาณ | Objective | Trigger สำเร็จ | Destination / UI focus | Reward |
|---|---:|---|---|---|---|
| 1 | 0–3 นาที | รู้จัก HUD และการเดิน | ผู้เล่นแตะสมุดครั้งแรกและเดินไปยังจุดแนะนำ | ชี้ Adventure Journal, joystick/ground tap และ minimap | starter guidance badge |
| 2 | 3–7 นาที | เดินทางถึง NPC แนะนำ | player เข้า radius ของ NPC/landmark ใน Prontera | world waypoint + minimap marker | small Zeny/EXP |
| 3 | 7–12 นาที | ต่อสู้ครั้งแรก | server/local monster defeat event หนึ่งครั้ง | spotlight attack/skill/target button | combat tutorial reward |
| 4 | 12–16 นาที | เปิดกระเป๋าและสวมอุปกรณ์ | inventory panel เปิดและ equip state เปลี่ยน | ชี้ BAG และ equipment slot | starter gear progression |
| 5 | 16–20 นาที | พบแหล่งน้ำและตกปลา | fishing session ได้ server receipt หรือ local catch | route hint ไปยัง fishing zone + fishing button | fishing log discovery |
| 6 | 20–24 นาที | สำรวจ Map objective | เข้า Map contract ที่ปลดล็อก เช่น Payon | warp button หรือ world route | map contract unlock |
| 7 | 24–28 นาที | อ่าน Adventure Journal | เปิด journal และดู entry/codex | ชี้ Journal tab, monster/fish entry | collection progress |
| 8 | 28–30 นาที | เลือกเป้าหมายถัดไป | เปิด journey summary แล้วเลือก path | journal home card: Combat/Fishing/Explore | title/next-goal marker |

## State model

```text
locked → active → completed
active → skipped (only when the player explicitly skips)
skipped → active (resume from journal)
completed → completed (idempotent)
```

Persist only a small allowlisted state object per character:

```js
{
  version: 1,
  activeStep: 'reach_guide_npc',
  completed: ['open_journal'],
  skipped: [],
  firstStartedAt: 'ISO timestamp',
  lastUpdatedAt: 'ISO timestamp',
  rewardReceipts: []
}
```

Do not accept reward values or completion state from the client as authoritative. The first implementation should use non-economic guidance rewards or existing server-approved receipt paths. If a Zeny/item reward is added, it must use a dedicated server receipt/idempotency contract.

## Notebook UI

The existing Adventure Journal panel remains the home. Add a first tab named `Journey` or a hero card above the current Journal tab. The home should show:

- current chapter number and progress ring;
- current objective in one sentence;
- a primary `นำทาง` button;
- `เปิดรายละเอียด` button for the step guide;
- a compact map source/destination row;
- a vertical timeline of completed, active and locked chapters;
- a `ข้ามบทนี้` action only after the player opens an explanation;
- next-goal cards after completion.

Use semantic buttons and `data-testid` selectors. Do not locate elements by localized text in tests.

## Navigation contract

A guide objective can expose one of three navigation modes:

1. `ui`: spotlight an existing button and position a callout around its measured DOMRect.
2. `world`: show a 3D world marker/beam and minimap marker at a canonical map coordinate; clicking `นำทาง` sets a guidance target, not an uncontrolled auto-warp.
3. `map`: open the warp panel with the target map selected, but require the player to confirm the warp.

World guidance must be map-aware. If the current map differs from the target map, route mode becomes `map`; if it is the same map, route mode becomes `world`. Coordinates must be stored in world units, not screen pixels, and converted through the current camera/minimap projection at render time.

## Responsive contract

Desktop: side panel or anchored card with a 2-column guide/detail layout.  
Mobile portrait: bottom sheet or centered modal below the browser safe-area, one column, native vertical scroll.  
Mobile landscape/iPad: compact anchored card that avoids the joystick, skill buttons, minimap and system gesture area.  
All sizes: use `100dvh`, `env(safe-area-inset-*)`, `clamp()`, `ResizeObserver`, `visualViewport` when available, and never assume a fixed HUD coordinate.

The spotlight must measure the target element after layout and clamp the callout inside the viewport. If a target is hidden or too close to an edge, use a non-blocking pulse around the target plus a bottom-sheet explanation instead of placing a tooltip off-screen.

## Verification criteria

- A new player can complete the first three steps without reading external documentation.
- Reloading after any step restores the same active step without duplicate completion or reward.
- Changing viewport from desktop to portrait mobile to landscape iPad does not create horizontal overflow or hide the primary action.
- `นำทาง` never fires an unintended attack, joystick movement, or duplicate warp request.
- A step can be completed from the actual gameplay event, not only by clicking a tutorial button.
- Every objective has a visible reason, destination, progress state and next action.
