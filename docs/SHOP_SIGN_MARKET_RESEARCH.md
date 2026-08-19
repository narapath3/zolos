# ZOLOS Shop Sign Market Research

## Scope
ศึกษาระบบ player vending/player vendor จากเกม MMORPG และแนวคิดการลดความหนาแน่นของตลาด เพื่อใช้กำหนดป้ายร้านที่อ่านง่ายบน Android/iOS

## Source 1: iRO Wiki — Commerce
URL: https://irowiki.org/wiki/Commerce

Key findings:

- Ragnarok Online แยกการค้าหลายชั้น ได้แก่ Vending, Buying Store, Chat Rooms, Catalogues และ Shopping Boards.
- Vending เป็นร้านผู้เล่นในโลกเกม โดยตัวละครเปิดร้านและขายไอเทมจาก inventory/cart.
- Catalogues และ Shopping Boards ช่วยค้นหาร้านและไอเทมจาก interface แทนการพึ่งการเดินอ่านป้ายทุกป้ายในพื้นที่.
- Catalogues สามารถแสดง shop name, item name, price และจำนวนไอเทม; ระบบค้นหายัง highlight ร้านบนหน้าจอและ minimap.
- Shopping Board ช่วยค้นหาเฉพาะแผนที่และคลิกชื่อร้านเพื่อเปิด shop window.

Design implications for ZOLOS:

- ป้ายในโลก 3D ควรทำหน้าที่เป็น identity/wayfinding สั้น ๆ ไม่ควรยัดรายละเอียดสินค้าและเจ้าของหลายแถว.
- รายละเอียดสินค้า/ราคาเหมาะกับ stall modal หรือ market board มากกว่า text บนป้าย.
- ควรมี state ที่ช่วยลดความรกเมื่อร้านอยู่รวมกัน เช่น ย่อ label เมื่อไกล, แสดงเต็มเมื่อเข้าใกล้/เลือก, หรือมี market search highlight.

## Source 2: Project Gorgon Forum — Player Vendor Discussion
URL: https://forum.projectgorgon.com/showthread.php?1328-Player-Vendor-Discussion

Key findings:

- ผู้เล่นพูดถึงปัญหาพื้นที่ร้านจำกัดและร้านหลายประเภทในตลาด.
- แนวคิดหนึ่งคือแยก small shops สำหรับผู้เล่นใหม่/ร้านสินค้าราคาต่ำ และรวมไว้ในห้องเดียว เพื่อให้ผู้ซื้อรู้บริบทและลดความปะปน.
- มีข้อเสนอให้ร้านเลื่อนเข้ามาแทนพื้นที่ว่างหรือใช้ wait-list แทนการเพิ่มสิ่งถาวรในฉาก.
- การมีร้านจำนวนมากในพื้นที่เดียวต้องคุม capacity, ค่าเช่า และอายุร้าน ไม่เช่นนั้นตลาดจะรกหรือแย่งกลุ่มผู้ใช้กัน.

Design implications for ZOLOS:

- จำกัดความหนาแน่นและการซ้อนทับของป้ายเป็นส่วนหนึ่งของ UX ไม่ใช่แก้ด้วย font อย่างเดียว.
- ควรมี priority/occlusion policy: label ของร้านที่ถูกเลือกหรืออยู่ใกล้ผู้เล่นสำคัญกว่าร้านไกล.
- สีป้ายควรสื่อประเภทอย่างน้อยแบบ subtle (ขาย/รับซื้อ/ว่าง) แต่โครงสร้างและ typography ควรเป็นระบบเดียวกัน.

## Preliminary direction

ป้าย ZOLOS ควรเปลี่ยนจากกรอบ Canvas แบนที่ติดลอยเหนือแผง เป็น signboard ขนาดกะทัดรัดที่มี single-line shop name, clear contrast, safe horizontal padding และไม่มี owner row. รายละเอียดสินค้าให้เปิดผ่าน interaction/market modal. บนมือถือควรคุม world-space size และเปิด label เต็มเมื่อร้านอยู่ในระยะอ่านหรือถูกแตะเท่านั้น.

## References

1. iRO Wiki, “Commerce” — https://irowiki.org/wiki/Commerce
2. Project Gorgon Forum, “Player Vendor Discussion” — https://forum.projectgorgon.com/showthread.php?1328-Player-Vendor-Discussion

_Last updated: 2026-08-19_
เหล่านี้เป็นข้อมูลวิจัยเบื้องต้น ยังไม่ใช่ implementation specification สุดท้าย.

---

## Source 3: Massively OP — Project Gorgon vendor-stall experiment
URL: https://massivelyop.com/2026/02/25/project-gorgon-is-adding-a-new-in-game-shopping-area-as-part-of-its-player-vendor-stall-experiment/

Key finding from the result context: a recent vendor-stall experiment uses a dedicated shopping area, reinforcing the separation between world navigation and dense commerce browsing.

---

## Source 4: Ragnarok vending references
URLs:
- https://ragnarok.fandom.com/wiki/Vending_System
- https://forums.warpportal.com/index.php?/topic/55133-vending-marketplace/

Key direction: player vending is a recognizable MMORPG commerce pattern, but search/catalogue/market-board layers are important when the number of shops grows. ZOLOS should not make the floating world label carry the full commerce payload.

## Platform constraints: Apple and Android

### Source 5: Apple Developer — UI Design Dos and Don’ts
URL: https://developer.apple.com/design/tips/

Relevant guidance:

- Primary content should fit the device screen without zooming or horizontal scrolling.
- Controls should be designed for touch gestures.
- Interactive hit targets should be at least 44 x 44 points.
- Text should be at least 11 points at typical viewing distance.
- Text/background contrast should be ample, text should not overlap, assets should be high resolution, and images should preserve intended aspect ratio.

Implications for ZOLOS:

- ป้ายที่เป็นเพียง world label ไม่ควรเป็นปุ่มเล็ก ๆ ที่ต้องแตะตรงตัวอักษร; ใช้พื้นที่แตะของแผงร้านที่ใหญ่กว่า label และให้ label เป็น visual feedback.
- Canvas ต้องคง aspect ratio และใช้ DPR/high-resolution texture เพื่อเลี่ยง blur บน Retina iPhone/iPad.
- ชื่อร้านต้องมี contrast กับพื้นกรอบและไม่ชน border.

### Source 6: Android Developers — Make apps more accessible
URL: https://developer.android.com/guide/topics/ui/accessibility/apps

Relevant guidance:

- Text smaller than 18sp, or bold text smaller than 14sp, should target contrast ratio at least 4.5:1.
- Larger text can use at least 3:1 contrast.
- Interactive touch target should be at least 48dp x 48dp.
- Descriptions should communicate purpose and avoid redundant labels; decorative elements should not add redundant semantics.

Implications for ZOLOS:

- ป้ายชื่อร้านควรเป็น single-line visual identity ที่ไม่ทำซ้ำชื่อเจ้าของหรือข้อความรองในกรอบเดียว.
- ใช้สีตัวอักษรอ่อนบนกรอบเข้ม พร้อม shadow/outline ที่ช่วยกับฉากหลังซับซ้อน และรักษา contrast ที่ตรวจได้.
- พื้นที่ interaction ควรเป็นแผงร้าน/ทั้ง stall และไม่พึ่ง hit target ของข้อความเล็ก ๆ.

## Updated design requirements

1. One concise shop name only on the world sign; product details belong to stall modal/market search.
2. 3D-integrated signboard: the sign should visually belong to the awning/stall, not look like an oversized flat UI card.
3. Stable visual center: text center uses the sign's geometric center, with symmetric safe padding and no side icon.
4. Readability: high-DPI canvas, fixed aspect ratio, high contrast, dark translucent backing, outline/shadow, one-line fit with ellipsis.
5. Density control: distance-based scale/opacity/visibility and selected-stall priority to prevent overlapping signs in crowded markets.
6. Cross-platform interaction: tap/click the stall hit area (minimum 44pt iOS / 48dp Android equivalent), not the text glyph itself.

## References

3. Apple Developer, “UI Design Dos and Don’ts” — https://developer.apple.com/design/tips/
4. Android Developers, “Make apps more accessible” — https://developer.android.com/guide/topics/ui/accessibility/apps

## Technical platform: Three.js billboard labels

### Source 7: Three.js — SpriteMaterial
URL: https://threejs.org/docs/pages/SpriteMaterial.html

Relevant guidance:

- SpriteMaterial is intended for rendering Sprite objects.
- Sprite color maps represent color data and should use the appropriate texture color space, normally sRGB for visible UI artwork.
- `transparent` is enabled for sprite materials, and `sizeAttenuation` controls whether perspective camera depth affects sprite size.

### Source 8: Three.js Manual — Billboards
URL: https://threejs.org/manual/en/billboards.html

Relevant guidance:

- Sprite and SpriteMaterial make a label always face the camera.
- For non-power-of-two CanvasTexture dimensions, set filtering appropriately; the manual example uses LinearFilter and ClampToEdgeWrapping.
- Labels can intersect scene objects from certain camera angles, so label position must be offset from the object and its scale should be derived from canvas width/height rather than arbitrary independent values.

Implications for ZOLOS:

- Keep Sprite as the billboard mechanism, but derive scale from the actual canvas aspect ratio and sign anchor so the sign is not vertically squashed or stretched.
- Set colorSpace to sRGB, LinearFilter, ClampToEdgeWrapping, and no unnecessary mipmaps for CanvasTexture-based signs.
- Add distance/selection policy and a clear world-space offset above the stall to avoid intersecting awnings, characters, or roofs.

## References

5. Three.js, “SpriteMaterial” — https://threejs.org/docs/pages/SpriteMaterial.html
6. Three.js Manual, “Billboards” — https://threejs.org/manual/en/billboards.html

## ZOLOS screenshot analysis (user-provided)

The supplied screenshot shows a row of vivid player stalls, but each sign is a tall rounded rectangle with a strong border and a very small label area. The sign reads as a floating UI panel rather than a physical part of the awning. The signs consume considerable vertical space, sit close to one another, and compete visually with the player character, item effects, and HUD. The text is centered in the box but the overall composition still feels unbalanced because the frame is much taller than the single-line content and because the sign geometry is not visually attached to the stall roof.

The redesign therefore prioritizes a thin horizontal market-board silhouette, a single identity line, balanced left/right decorative rivets, and distance-based receding of distant labels. Color remains tied to the stall awning, but border and typography are shared so the market remains coherent rather than becoming a set of unrelated colored cards.
