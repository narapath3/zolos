# Zolos — Idle RPG Online (Ragnarok Online Inspired)

เกมแนว Idle RPG 3D สไตล์ Ragnarok Online ที่มีระบบ Auto-Farm, เก็บเลเวล, ตีมอนสเตอร์, เก็บไอเทมลงกระเป๋า, และระบบจัดอันดับ & ออนไลน์แบบ Realtime ตกแต่งสไตล์ Dark Fantasy สุดพรีเมียมด้วย Three.js และระบบรักษาข้อมูลออนไลน์โดย Supabase

---

## ⚡ วิธีเริ่มเกมระบบ Offline / Fallback (ทันทีไม่ต้องตั้งค่า)

ตัวเกมมีระบบ **Offline Fallback** อัจฉริยะที่จำลองฐานข้อมูลในตัวเครื่อง (LocalStorage) และจำลองผู้เล่นคนอื่นให้โดยอัตโนมัติ ทำให้สามารถทดสอบและเล่นได้ทันทีหลังจากเปิดโปรเจกต์:

1. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
2. รันแอปพลิเคชัน:
   ```bash
   npm run dev
   ```
3. เปิดบราวเซอร์ไปที่ `http://localhost:3000`
4. คลิกปุ่ม **🎮 Play as Guest** เพื่อเข้าสู่ฐานข้อมูลท้องถิ่นและเริ่มต้นเก็บเลเวลได้เลย!

---

## 🌐 วิธีเชื่อมต่อ Supabase Realtime Database

หากต้องการทำระบบออนไลน์เต็มรูปแบบและบันทึกประวัติการเล่นขึ้นคลาวด์ ให้ทำตามขั้นตอนดังนี้:

### 1. การสร้างตารางใน Supabase Dashboard

เปิด **SQL Editor** ในแดชบอร์ด Supabase ของคุณแล้วนำ SQL ด้านล่างนี้ไปรัน:

```sql
-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters table
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INT DEFAULT 1,
  exp INT DEFAULT 0,
  hp INT DEFAULT 100,
  max_hp INT DEFAULT 100,
  sp INT DEFAULT 50,
  max_sp INT DEFAULT 50,
  atk INT DEFAULT 10,
  def INT DEFAULT 5,
  gold INT DEFAULT 0,
  total_kills INT DEFAULT 0,
  play_time INT DEFAULT 0,
  last_map TEXT DEFAULT 'prontera_field',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory table
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  quantity INT DEFAULT 1,
  stats JSONB DEFAULT '{}'
);

-- RLS Policies (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own characters" ON characters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own characters" ON characters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own characters" ON characters FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own inventory" ON inventory FOR ALL
  USING (character_id IN (SELECT id FROM characters WHERE user_id = auth.uid()));

-- Marketplace table
CREATE TABLE marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  seller_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  quantity INT DEFAULT 1,
  price INT NOT NULL,
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market History table (for price calculation)
CREATE TABLE market_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  quantity INT NOT NULL,
  price INT NOT NULL,
  sold_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Marketplace
ALTER TABLE marketplace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all listings" ON marketplace FOR SELECT USING (true);
CREATE POLICY "Users can manage own listings" ON marketplace FOR ALL 
  USING (seller_id IN (SELECT id FROM characters WHERE user_id = auth.uid()));

-- RLS for Market History
ALTER TABLE market_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read history" ON market_history FOR SELECT USING (true);
CREATE POLICY "System can insert history" ON market_history FOR INSERT WITH CHECK (true);
```

### 2. การสร้างไฟล์ Config (.env)

สร้างไฟล์ชื่อ `.env` ไว้ในโฟลเดอร์หลักของโปรเจกต์ (Root) แล้วใส่ข้อมูลของคุณ:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-URL.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-API-KEY
```

เมื่อคุณเปิดรันแอปใหม่อีกครั้ง ระบบจะเชื่อมข้อมูลการเข้าสู่ระบบ, การเก็บไอเทม, และความเคลื่อนไหวของผู้เล่นคนอื่นแบบ realtime โดยอัตโนมัติ!

---

## 🚀 การ Deploy บน Vercel

ตัวแอปมีการตั้งค่าหน้า Single Page App (SPA) ผ่านไฟล์ `vercel.json` เรียบร้อยแล้ว ทำให้ Deploy ได้อย่างราบรื่น:

1. ติดตั้ง Vercel CLI (ทางเลือก):
   ```bash
   npm install -g vercel
   ```
2. สั่งเดปลอย:
   ```bash
   vercel
   ```
3. อย่าลืมตั้งค่า **Environment Variables** ในแดชบอร์ดของ Vercel ด้วย `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` เพื่อเชื่อม Supabase
