# Pet Shop UX Benchmark Notes

วันที่: 2026-08-20

## แหล่งข้อมูล

1. Apple App Store — IdleOn - Idle RPG: https://apps.apple.com/us/app/idleon-idle-rpg/id1636526901
2. Ragnarok Origin Pet System Guide: https://roo-global.gitbook.io/guide/game-wiki/pet-system (เปิดผ่าน browser ไม่สำเร็จเพราะ timeout จึงยังไม่ใช้เป็นหลักฐานเนื้อหา)

## สิ่งที่อ่านได้จาก IdleOn

หน้า App Store อธิบายระบบที่เชื่อม collection กับ progression หลายชั้น ได้แก่ การปลดคลาส ตัวเลือก specialization/perks การสะสม/อัปเกรด stamps และ statues การทำกิจกรรม รวมถึง pet battles และการเลี้ยง/ผสมพันธุ์ โดยภาพรวมชี้ว่าระบบ companion ที่น่าสนใจไม่ได้จบที่ปุ่มซื้อ แต่ต้องทำให้ผู้เล่นเห็นเส้นทางพัฒนาต่อหลัง acquisition อย่างชัดเจน

## แนวทางที่นำมาปรับกับ ZOLOS

- การ์ดสัตว์เลี้ยงควรแสดงข้อมูลที่ช่วยตัดสินใจทันที: rarity, ราคา, สถานะ owned/equipped และคำอธิบายสั้น
- ควรมีการกรอง/จัดเรียงตาม rarity และราคา เพื่อไม่ให้ผู้เล่นมือถือเลื่อนรายการยาวโดยไม่มีโครงสร้าง
- ควรแยกสถานะ “ซื้อแล้ว”, “กำลังใช้งาน”, และ “ยังไม่ปลดล็อก” ให้เห็นชัด โดยไม่เปลี่ยน authoritative purchase flow เดิม
- หลังซื้อควรมี CTA ที่ต่างกัน เช่น ซื้อ, ใช้งาน, ถอดออก หรือดูรายละเอียด ไม่ใช้ปุ่มเดียวทุกสถานะ
- หน้าร้านควรเชื่อมกับ progression ระยะถัดไป เช่น pet level/bonus/preview แต่ระยะที่หนึ่งต้องเริ่มจากข้อมูลที่มีอยู่แล้ว เพื่อไม่เพิ่ม economy หรือ server state ใหม่โดยไม่จำเป็น

## ข้อจำกัดการวิจัย

แหล่ง Ragnarok Origin GitBook timeout ใน browser จึงไม่นำรายละเอียดจาก snippet มาอ้างเป็นข้อเท็จจริงเชิงลึก และจะใช้เฉพาะหลักการทั่วไปจากแหล่งที่อ่านได้จริงกับการตรวจโค้ด ZOLOS เป็นฐานการ implement

## สิ่งที่อ่านได้จากคู่มือทางการเพิ่มเติม

### Ni no Kuni: Cross Worlds

คู่มือทางการแบ่งระบบ Familiars เป็นหลาย action แยกกัน ได้แก่ Equip, Level Up, Evolve, Enhance, Awaken, Hatch, Release รวมถึง Familiar Codex และ Familiar Collection นอกจากนี้ยังระบุว่า inventory ควรมี filter และ sorting ตาม grade, element, combat power และเวลาได้รับ สิ่งที่เหมาะกับ ZOLOS ในระยะหน้าร้านคือการแยก action ตามสถานะของสัตว์เลี้ยง และเพิ่ม filter/sort ที่อ่านง่ายบนจอมือถือ โดยยังไม่ต้องนำระบบวิวัฒน์หรือการสุ่มใหม่เข้ามาทันที

แหล่งข้อมูล: https://guide.netmarble.com/enngb

### Black Desert Mobile

คู่มือทางการอธิบายว่า pet มีข้อมูลพื้นฐาน เช่น ชื่อ เลเวล และ tier; มีทักษะ; มีการฝึกทักษะ; มีการให้อาหาร; มีสถานะนำออกใช้งานหรือเก็บเข้าบ้าน; และสามารถนำ pet หลายตัวออกใช้งานได้พร้อมกัน โดยระบบนี้ทำให้ผู้เล่นต้องเห็นความแตกต่างระหว่าง pet ที่ซื้อเพื่อสะสมกับ pet ที่กำลังใช้งานจริง รวมถึงประโยชน์หรือ bonus ที่ pet มอบให้

สำหรับ ZOLOS ควรเริ่มจากการแสดง ownership/equipped state และคำอธิบาย bonus ที่มีอยู่แล้วก่อน ส่วน feeding, training และ multi-pet deployment ควรเป็น roadmap ภายหลัง เพราะต้องมี server-authoritative state และ economy design เพิ่ม

แหล่งข้อมูล: https://www.world.blackdesertm.com/Ocean/News/Detail?boardNo=150

## สรุป benchmark ที่ยืนยันร่วมกัน

หน้าร้านที่ดีควรทำหน้าที่เป็นทั้ง discovery และ decision surface: ผู้เล่นเห็นตัวสัตว์และ rarity ได้เร็ว, กรองรายการได้, เปิดรายละเอียดได้, รู้ว่าเป็น owned/equipped หรือยัง, เห็นผลประโยชน์ที่ได้รับ และมี CTA ที่ตรงกับสถานะนั้น การเพิ่มระบบเชิงลึกควรทำหลังจาก UI พื้นฐานและ purchase confirmation มีความชัดเจนแล้ว
