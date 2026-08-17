# ZOLOS Login UX Survey Notes

วันที่ตรวจสอบ: 2026-08-17

## หลักฐานที่ตรวจสอบ

ตรวจสอบ local preview ของหน้า Splash, Login และ Register รวมถึงภาพหน้าจอมือถือแนวตั้งที่ผู้ใช้ส่งมา

## ข้อค้นพบหลัก

1. Splash มี artwork สดใสและ mascot ที่เหมาะกับเด็ก แต่ focal point ยังแยกเป็นชิ้น ๆ: mascot, wordmark, subtitle และปุ่ม Start อยู่ในแกนเดียวกันแต่มีพื้นที่ว่างมากด้านล่างบนมือถือ
2. Wordmark image ใหม่มีความน่ารักและเข้าธีมมากกว่า wordmark CSS เดิม แต่ขนาดบนมือถือยังควรใหญ่พออ่านได้โดยไม่ทำให้ mascot และ Start Game แย่งกัน
3. Login panel บนมือถือจัดลำดับได้ดีในภาพรวม: username, password, forgot password, login, register, guest แต่ panel สูงและเกือบเต็มจอ จึงควรใช้ bottom-sheet หรือ card ที่จัดกลุ่มชัดเจน
4. Register mode มีข้อมูลมากกว่าที่เหมาะกับ first screen: username, password, character name, class 4 ตัวเลือก, gender, back, create, guest และ status message ทำให้เกิดความหนาแน่นและเกิดการ scroll
5. Register mode มีความเสี่ยงเชิงความเข้าใจ: ปุ่ม `PLAY AS GUEST` อยู่ร่วมกับ flow สร้างบัญชี และ status message `Choose your character name & starter class!` อยู่ท้าย flow ทำให้ผู้ใช้ไม่แน่ใจว่าต้องทำอะไรให้ครบก่อน
6. การใช้ English labels ผสม Thai labels ในหน้าเดียวกันทำให้โทน product ยังไม่เป็นหนึ่งเดียว ควรเลือก primary language เดียวและใช้ secondary language เฉพาะคำอธิบายสั้น ๆ
7. ตัวเลือก class เป็นการ์ด 2x2 เหมาะกับเกม แต่ควรมี selected state ที่ชัดกว่านี้และลดข้อความให้เหลือชื่อ + one-line trait บนมือถือ
8. ข้อมูล server chip และ BGM มีประโยชน์รอง แต่ไม่ควรมี visual weight ใกล้เคียงกับ logo หรือ CTA

## แนวทางที่ควรเป็น

แนะนำให้ใช้ 3 states ที่แยกชัดเจน: Title/Splash, Login และ Create Character โดยแต่ละ state มี CTA หลักเพียงหนึ่งปุ่มและมี secondary actions จำกัดไม่เกินสองรายการ

สำหรับมือถือ แนะนำให้ใช้ title area สูงประมาณ 34–40% ของ viewport, แล้วใช้ auth panel เป็น bottom sheet สูงประมาณ 42–52% ของ viewportเมื่อเปิด Login. Register ควรใช้ full-height scroll sheet แยกจาก Login และซ่อน Guest action ออกจาก Register เพื่อไม่ให้เกิดทางเลือกที่ไม่เกี่ยวข้อง

ควรใช้ visual system เดียว: sky-blue surface, navy text, warm gold primary CTA, pink guest CTA และ white/blue border. หลีกเลี่ยง dark class cards ที่ตัดกับ panel สีขาวมากเกินไป และลด glow/blur ที่ทำให้ภาพดูไม่คม

## ลำดับการแก้ที่แนะนำ

P0: แยก Login และ Register เป็น state ที่ชัดเจน, เอา Guest ออกจาก Register, วาง status message ใต้ field ที่เกี่ยวข้อง และแก้ overflow/scroll

P1: ปรับ mobile composition เป็น bottom-sheet, ลด logo/vertical gaps, จัด CTA หลักหนึ่งปุ่มต่อ state

P2: ปรับ class card ให้เป็น pastel card ที่ยังมีสีประจำอาชีพ แต่ไม่เป็น dark block, เพิ่ม selected state ที่ชัด

P3: ปรับ copy และ language policy ให้เป็นภาษาเดียวกันทั้งหน้า

## เกณฑ์ยอมรับ

- ผู้ใช้ใหม่รู้ทันทีว่าต้องกด Start Game ก่อน
- Login มี input 2 ช่องและ CTA หลัก 1 ปุ่มใน viewport เดียวบนมือถือทั่วไป
- Register แสดงขั้นตอนสร้างตัวละครโดยไม่แสดง Guest action
- ไม่มีข้อความลอยออกนอก panel หรือปุ่มซ้อนกัน
- Logo, panel และ CTA อยู่ใน hierarchy เดียวกันและอ่านได้ชัดบนฉากสว่าง

## UX10 implementation verification

หลัง patch UX10 ตรวจสอบ preview แล้วพบว่า Title แสดงเฉพาะ mascot, wordmark และ Start Game; Start Game เปิด Login โดยมี input สองช่องและ CTA หลักชัดเจน; Register แสดง character name, class, gender และ CTA สร้างตัวละคร/กลับเข้าสู่ระบบ โดย Guest และ divider ถูกซ่อนแล้ว

Copy หลักของ Login/Register ถูกปรับให้เป็นภาษาไทยมากขึ้น ได้แก่ เข้าสู่โลก ZOLOS, สร้างบัญชีใหม่, สร้างตัวละคร และ กลับเข้าสู่ระบบ ส่วน server/BGM ยังเป็น utility ที่มีน้ำหนักต่ำกว่า CTA

ผล automated tests: 433 ผ่าน, 0 ล้มเหลว. Build ผ่าน.

## Fit-to-frame verification

ปรับ Login mobile ให้ไม่ใช้ overflow scroll ในโหมด Login และลดความสูงของ input, forgot password, CTA และ divider. Register ยังคงใช้ scroll เฉพาะเมื่อจำเป็น. Preview หลัง patch แสดง input, Login, Register และ Guest เป็นองค์ประกอบครบใน panel เดียว โดยไม่ตัด Guest จาก flow Login.

ผล automated tests: 433 ผ่าน, 0 ล้มเหลว. Build ผ่าน.
