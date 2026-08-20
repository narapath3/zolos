# ZOLOS One-click Game Update for Windows VPS

ไฟล์ `ZOLOS-Update-Backend-OneClick.bat` ใช้สำหรับอัปเดตเกมจาก GitHub บน Windows 10 VPS โดยไม่ต้องพิมพ์คำสั่งหลายบรรทัด

## ตำแหน่งโปรเจกต์เริ่มต้น

สคริปต์ตั้งค่าเริ่มต้นไว้ที่:

```text
C:\Users\Administrator\Desktop\zolos
```

หากย้ายโฟลเดอร์ ให้แก้ค่า `REPO` ในไฟล์ `.bat` ก่อนใช้งาน

## วิธีใช้งาน

ให้ดับเบิลคลิกไฟล์:

```text
deploy\ZOLOS-Update-Backend-OneClick.bat
```

Windows จะขอสิทธิ์ Administrator จากนั้นสคริปต์จะทำงานตามลำดับต่อไปนี้:

1. ตรวจสอบว่า repository เป็น `narapath3/zolos` และอยู่บน branch `main`
2. ปฏิเสธการทำงานหากมี tracked/staged changes ที่อาจถูกเขียนทับ
3. บันทึก commit เดิมและสำรอง `server/.env` ไว้นอก repository
4. ดึง `origin/main` ด้วย `git pull --ff-only` เท่านั้น
5. ตรวจ syntax ของ backend
6. ติดตั้ง backend dependencies ด้วย `npm.cmd ci --omit=dev`
7. ติดตั้ง frontend dependencies และรัน `npm.cmd run build` เพื่อสร้าง `dist`
8. หยุดและเริ่ม backend `node --env-file=.env server.js`
9. หากพบ frontend static server ที่รันจาก `deploy/static-server.mjs` จะหยุดและเริ่มใหม่ด้วย
10. ตรวจ local RPC และ public RPC ว่า route มีอยู่จริงและตอบกลับด้วย auth rejection แทน `unknown rpc`

> สคริปต์ไม่รัน database migration, ไม่แก้ `.env`, ไม่ลบ untracked files และไม่ใช้ `git reset --hard` ในขั้นตอนปกติ

## กรณีอัปเดตล้มเหลว

ถ้า pull สำเร็จแล้วขั้นตอน build, install, start หรือ health check ล้มเหลว สคริปต์จะพยายาม rollback กลับไปยัง commit เดิมและ start backend ใหม่โดยอัตโนมัติ ส่วน backup ของ commit และ `server/.env` จะอยู่ที่:

```text
C:\Users\Administrator\Desktop\zolos-deploy-backups\YYYYMMDD-HHmmss
```

Log อยู่ใน:

```text
C:\Users\Administrator\Desktop\zolos\logs
```

ไฟล์สำคัญคือ `server.out.log`, `server.err.log`, `frontend.out.log`, `frontend.err.log` และ `update-*.log`

## สิ่งที่ต้องตรวจหลังขึ้นข้อความ OK

เข้าเกมด้วย URL จริงแล้วทำ Hard Refresh หนึ่งครั้ง จากนั้นตรวจ login, map loading, Socket.IO, การโจมตี Monster และระบบที่เพิ่งแก้ไข

ถ้าขึ้นข้อความ STOP ให้ส่งภาพหน้าต่าง PowerShell และไฟล์ `logs\update-*.log` กับ `logs\server.err.log` มาเพื่อวิเคราะห์ต่อ โดยไม่ต้องลบ backup หรือรันคำสั่งสุ่มเพิ่ม

## โหมดตรวจสอบโดยไม่อัปเดต

หากต้องการตรวจ path, Git state, Node/npm และสร้าง backup โดยไม่ pull, install, stop หรือ restart ให้รัน PowerShell:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\deploy\update-backend-one-click.ps1 -RepoPath "C:\Users\Administrator\Desktop\zolos" -DryRun
```

การ deploy frontend บน Vercel ยังคงเกิดจาก GitHub integration ของ Vercel แยกจากการอัปเดต VPS โดยไฟล์ `.bat` นี้ดูแล backend และ direct-IP frontend ที่รันบน VPS เท่านั้น
