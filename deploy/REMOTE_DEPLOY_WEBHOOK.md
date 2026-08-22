# ZOLOS Remote Deploy Webhook

ระบบนี้ทำให้ผู้ดูแลสั่งอัปเดต Windows VPS จาก GitHub Actions หรือจาก PowerShell ได้ โดยไม่ต้องเปิด RDP และไม่ต้องไปดับเบิลคลิกไฟล์บน VPS ทุกครั้ง

> การติดตั้งครั้งแรกยังต้องเข้าถึง Windows VPS หนึ่งครั้งเพื่อสร้าง Scheduled Task และเก็บ secret ในเครื่อง หลังจากนั้นการ deploy ใช้คำสั่งภายนอกได้

## สถาปัตยกรรม

GitHub Actions เรียก `POST /api/admin/deploy` ด้วย JSON คงที่ `{ "action": "update", "ref": "main" }` พร้อม timestamp, HMAC-SHA256 signature และ idempotency key. Backend ตรวจ secret และเวลาของคำขอ แล้วสั่ง Windows Scheduled Task `\\ZOLOS-RemoteDeploy` ด้วย `schtasks.exe`. Task เรียก `deploy\\remote-deploy-runner.ps1`, ซึ่งรัน `ZOLOS-Update-Backend-OneClick.bat -NoPause`. Updater เดิมยังเป็นผู้ตรวจ branch, pull แบบ fast-forward เท่านั้น, backup, install, build, restart, health check และ rollback.

Webhook ไม่รับคำสั่ง shell, path, branch หรือ argument จาก request body. จึงไม่มีช่องให้ผู้เรียกส่งคำสั่ง arbitrary ไปยัง VPS. ทุก request ต้องมี secret ที่มีความยาวอย่างน้อย 32 ตัว, timestamp สดภายในค่าเริ่มต้น 5 นาที และ idempotency key ที่เป็นรูปแบบจำกัด. Receipt ถูกเขียนด้วย exclusive file creation เพื่อให้ request เดิมหรือ request พร้อมกันไม่สั่ง task ซ้ำ.

## ติดตั้งครั้งแรกบน Windows VPS

ให้ใช้สิทธิ์ Administrator และทำตามลำดับนี้:

1. รัน `deploy\\ZOLOS-Update-Backend-OneClick.bat` แบบเดิมหนึ่งครั้ง เพื่อดึงไฟล์ Remote Deploy ล่าสุดขึ้น VPS และตรวจว่า backend พร้อมใช้งาน
2. เปิด PowerShell แบบ **Run as Administrator** ที่โฟลเดอร์ repository
3. รัน:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\deploy\install-remote-deploy-webhook.ps1 -RepoPath "C:\Users\Administrator\Desktop\zolos"
```

Installer จะสร้าง secret แบบสุ่ม 32 bytes ที่ `C:\ProgramData\ZOLOS\remote-deploy-webhook.secret`, จำกัดสิทธิ์ไฟล์ให้ SYSTEM และ Administrators, เติมค่า `ZOLOS_DEPLOY_WEBHOOK_SECRET`, `ZOLOS_DEPLOY_REPO_PATH` และ `ZOLOS_DEPLOY_TASK_NAME` ลง `server\\.env` เฉพาะตัวที่ยังไม่มี และสร้าง Scheduled Task ที่รันด้วย SYSTEM โดยไม่เปิดหน้าต่าง.

4. อ่าน secret ครั้งเดียวบน VPS:

```powershell
Get-Content "C:\ProgramData\ZOLOS\remote-deploy-webhook.secret"
```

นำค่าไปเก็บเป็น GitHub Actions secret ชื่อ `ZOLOS_DEPLOY_WEBHOOK_SECRET`. ห้าม commit, screenshot หรือส่ง secret ในแชต

5. เพิ่ม GitHub Actions variable หรือ secret ชื่อ `ZOLOS_DEPLOY_WEBHOOK_URL` เป็น:

```text
https://rt.zolos.online/api/admin/deploy
```

6. รัน updater เดิมอีกครั้งหนึ่ง เพื่อให้ backend โหลดค่า `.env` ใหม่และสร้าง route webhook:

```text
deploy\\ZOLOS-Update-Backend-OneClick.bat
```

ไม่ต้องเปิด port ใหม่ เพราะ webhook ใช้ public API host และ port เดิมของ backend. หาก reverse proxy ใช้ host อื่น ให้ใช้ URL ของ backend ที่เข้าถึงได้จากอินเทอร์เน็ตแทน.

## การสั่งจากมือถือ

หลังติดตั้งแล้ว ให้เปิด repository บน GitHub แล้วไปที่ **Actions → Remote Deploy to Windows VPS → Run workflow → Run workflow**. Workflow จะส่งคำขอไปยัง VPS และแสดงว่า request ถูก `accepted`. จากนั้น VPS จะทำงานต่อเองตามขั้นตอน updater. เปิด workflow run เพื่อดูผลสำเร็จหรือล้มเหลว; ไม่ต้องเปิดหน้า VPS.

การกดซ้ำใน workflow run เดิมจะไม่ทำให้คำสั่งเดิมถูกส่งซ้ำ เพราะใช้ idempotency key จาก `run_id` และ `run_attempt`. การกด Run workflow คนละรอบเป็นคนละ deployment request และ backend จะ serialize ที่ระดับ Scheduled Task/updater ตามกลไกตรวจ process เดิม.

## การสั่งจาก PowerShell ภายนอก

ตั้ง secret ในเครื่องผู้ดูแล แล้วเรียกสคริปต์:

```powershell
$env:ZOLOS_DEPLOY_WEBHOOK_SECRET = '<secret ที่อ่านจาก VPS>'
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\deploy\trigger-remote-deploy.ps1
```

สคริปต์สร้าง timestamp, signature และ request id ให้อัตโนมัติ และจะไม่พิมพ์ secret ออกมา.

## การหมุน secret

เมื่อจำเป็นต้องเปลี่ยน secret ให้รันบน VPS:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\deploy\install-remote-deploy-webhook.ps1 -RepoPath "C:\Users\Administrator\Desktop\zolos" -RotateSecret
```

จากนั้นอ่าน secret ใหม่, เปลี่ยน GitHub secret ให้ตรงกัน และรัน updater เดิมหนึ่งครั้งเพื่อ restart backend. ระหว่างช่วงที่สองฝั่งยังไม่ตรงกัน webhook จะถูกปฏิเสธอย่างปลอดภัย.

## การตรวจสอบและแก้ปัญหา

สถานะระบบตรวจได้โดยไม่สั่ง deploy ด้วย:

```powershell
schtasks.exe /Query /TN "\\ZOLOS-RemoteDeploy" /V /FO LIST
```

Log ของ webhook receipt อยู่ใน `logs\\remote-deploy-receipts`. Log ของ runner อยู่ที่ `logs\\remote-deploy-runner.log`. Log ของ updater อยู่ที่ `logs\\update-*.log` และ log backend อยู่ที่ `logs\\server.err.log`.

ถ้าได้ `401 invalid deploy authentication` ให้ตรวจว่า URL, GitHub secret และเวลาของ VPS ถูกต้อง. ถ้าได้ `503 deploy service unavailable` ให้ตรวจว่า backend โหลด `.env` แล้ว, repository path ถูกต้อง และ Scheduled Task มีชื่อตรงกับ `ZOLOS_DEPLOY_TASK_NAME`. ห้ามเปิด endpoint ให้รับ command หรือเพิ่ม `cmd.exe /c <request body>`.

## ขอบเขตความปลอดภัย

Workflow นี้ใช้ `workflow_dispatch` เท่านั้น ไม่มี trigger จาก pull request และใช้ runner ของ GitHub ไม่ใช่ runner ที่อยู่บน VPS. Repository ปัจจุบันเป็น public ดังนั้นไม่ควรติดตั้ง self-hosted GitHub Actions runner สำหรับ workflow ที่มีสิทธิ์แตะ VPS. Secret ต้องเก็บเฉพาะใน GitHub Actions Secrets และ `.env`/ไฟล์ ProgramData บน VPS.
