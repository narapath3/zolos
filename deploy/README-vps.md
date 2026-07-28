# ย้าย Zolos Map Server มา VPS (ReadyIDC · Linux AMD)

คู่มือย้าย realtime Socket.io server จาก Railway มา VPS ที่ `game.zolos.online`
สถาปัตยกรรมหลังย้าย:

```
เบราว์เซอร์ ──https──▶ Vercel (หน้าเว็บ zolos.online)
        │
        └──wss──▶ nginx (game.zolos.online, SSL) ──▶ Node :3001 (pm2)
                                                          │
                                                          ▼
                                                  Supabase (DB / auth)
```

---

## 0) เตรียม DNS ก่อน (สำคัญที่สุด)
ที่ผู้ให้บริการโดเมน `zolos.online` เพิ่ม **A record**:

| Type | Name | Value |
|------|------|-------|
| A | `game` | `<IP สาธารณะของ VPS>` |

> ถ้าใช้ Cloudflare ให้ตั้งเป็น **DNS only (เมฆสีเทา)** ตอนขอ SSL ครั้งแรก
> (ถ้าเปิด proxy สีส้ม certbot แบบ `--nginx` จะไม่ผ่าน) เปิด proxy ทีหลังได้

รอ DNS resolve จริงก่อน (เช็ค: `ping game.zolos.online` ต้องได้ IP ของ VPS)

---

## 1) SSH เข้า VPS แล้วรันสคริปต์เดียวจบ
เอา IP + รหัส root จากหน้า ReadyIDC มา แล้ว:

```bash
ssh root@<IP-VPS>

# ดึงสคริปต์มาไว้ในเครื่อง (หรือ git clone ทั้ง repo ก่อน)
curl -fsSL https://raw.githubusercontent.com/narapath3/zolos/main/deploy/setup-vps.sh -o setup-vps.sh
sudo bash setup-vps.sh
```

> repo เป็น **private** — ถ้า `git clone` ในสคริปต์ถาม user/pass ให้ทำอย่างใดอย่างหนึ่ง:
> - ใช้ Personal Access Token: แก้ `REPO_URL` เป็น `https://<TOKEN>@github.com/narapath3/zolos.git`
> - หรือสร้าง **Deploy key** (SSH) ให้ VPS
> - หรือ `scp` โฟลเดอร์โปรเจกต์ขึ้นไปที่ `/opt/zolos` เอง

รอบแรกสคริปต์จะสร้าง `server/.env` จากตัวอย่างแล้ว **หยุด** ให้คุณกรอกคีย์:

```bash
nano /opt/zolos/server/.env
```
กรอกให้ครบ:
```
PORT=3001
CORS_ORIGINS=https://zolos.online,https://www.zolos.online
CORS_ALLOW_ALL=false
SUPABASE_URL=https://hxvxifghgqwgjbcliqjx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key จาก Supabase → Project Settings → API>
```
> ⚠️ ใช้ **service_role** key (ฝั่ง server เท่านั้น ห้ามหลุดขึ้นหน้าเว็บ)
> `CORS_ORIGINS` = โดเมน **หน้าเว็บ** (ไม่ใช่ game.zolos.online) เพราะเบราว์เซอร์
> ส่ง Origin เป็น zolos.online มาหา server

แล้วรันสคริปต์อีกรอบให้จบ:
```bash
sudo bash setup-vps.sh
```

---

## 2) ตรวจว่าใช้งานได้
```bash
curl -s https://game.zolos.online/
# ควรได้ {"status":"ok","server":"zolos-map-server","players":0,...}

pm2 status          # zolos-server = online
pm2 logs zolos-server
```

---

## 3) ฝั่ง Vercel (หน้าเว็บ)
โค้ดตั้ง fallback เป็น `https://game.zolos.online` ให้แล้ว — deploy หน้าเว็บ (merge เข้า `main`) ก็ต่อ server ใหม่อัตโนมัติ

ถ้าอยากบังคับ URL ชัดๆ ไปที่ Vercel → Project → Settings → Environment Variables:
```
VITE_SOCKET_URL = https://game.zolos.online
```
แล้ว redeploy

---

## คำสั่งดูแลประจำ
```bash
pm2 restart zolos-server     # รีสตาร์ท
pm2 logs zolos-server        # ดู log สด
pm2 monit                    # ดู CPU/RAM
cd /opt/zolos && git pull && cd server && npm ci --omit=dev && pm2 restart zolos-server   # อัปเดตโค้ด
sudo certbot renew --dry-run # ทดสอบต่ออายุ SSL (auto อยู่แล้ว)
```

## ปิด Railway
หลังยืนยันว่า VPS ทำงานปกติ (คนเล่นเข้าได้, ไม่มี OFFLINE mode) แล้วค่อยลบ/ปิด service บน Railway เพื่อเลิกจ่ายเงิน
