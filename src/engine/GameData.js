// Game Data — Monster definitions, items, EXP curve, etc.

import {
    CARD_CATALOG, RARITY_META, getCard, toLegacyItem,
} from '../cards/CardCatalog.js';

// ============ ITEMS REGISTRY ============
// Exactly 100 items distributed across 5 rarity tiers: common, rare, epic, legendary, mythic
export const ITEMS = {
    // ---- 40 COMMON ITEMS ----
    'Jellopy': { emoji: '💎', type: 'material', rarity: 'common', desc: 'เศษอัญมณีสีคริสตัลใสขนาดเล็ก นิยมใช้ทำยาและผลิตของมีค่าพื้นฐาน', price: 5 },
    'Sticky Mucus': { emoji: '💧', type: 'material', rarity: 'common', desc: 'เมือกเหนียวข้นเหนอะหนะ พบได้จากสิ่งมีชีวิตเจลลี่หรือแมลง', price: 10 },
    'Clover': { emoji: '🍀', type: 'material', rarity: 'common', desc: 'ใบโคลเวอร์สี่แฉก สัญลักษณ์แห่งโชคชะตาสำหรับนักจาริกแสวงหาดวง', price: 12 },
    'Feather': { emoji: '🪶', type: 'material', rarity: 'common', desc: 'ขนนกสีขาวหิมะฟูนุ่มละมุน มักนำไปประดับหมวกแฟนชั่น', price: 15 },
    'Worm Peeling': { emoji: '🧬', type: 'material', rarity: 'common', desc: 'เปลือกผิวหนังชั้นนอกลอกคราบของหนอนดิบ มีความยืดหยุ่นปานกลาง', price: 18 },
    'Scell': { emoji: '🪙', type: 'material', rarity: 'common', desc: 'เกล็ดนอกของแมลงชนิดกลมมีลายคล้ายเหรียญ ใช้ตีแลกของสะสม', price: 20 },
    'Tree Root': { emoji: '🪵', type: 'material', rarity: 'common', desc: 'รากไม้โบราณที่แผ่ลึกลงใต้ดิน แข็งตัวจนเกือบกลายเป็นหิน', price: 25 },
    'Sticky Webfoot': { emoji: '🦶', type: 'material', rarity: 'common', desc: 'พังผืดเท้าที่แสนเหนียวแน่น ช่วยให้เกาะกลุ่มดินเปียกชื้นได้วิเศษ', price: 35 },
    'Animal Skin': { emoji: '🥩', type: 'material', rarity: 'common', desc: 'ผืนหนังสัตว์ดิบคุณภาพปกติ ใช้สำหรับงานฝีมือตัดเย็บทั่วไป', price: 30 },
    'Monster Claw': { emoji: '🎯', type: 'material', rarity: 'common', desc: 'กรงเล็บแหลมชิ้นสั้นของสัตว์อสูร มักเป็นส่วนผสมของยาพิษบางชนิด', price: 40 },
    'Poison Spore': { emoji: '☠️', type: 'material', rarity: 'common', desc: 'สปอร์เห็ดสีม่วงเข้ม แฝงฤทธิ์กัดกร่อนผิวอย่างเบาบาง', price: 45 },
    'Spore Powder': { emoji: '💨', type: 'material', rarity: 'common', desc: 'ละอองสปอร์ละเอียดฟุ้งง่าย สามารถนำมากลั่นสมุนไพรฟื้นผิวพรรณ', price: 30 },
    'Squid Ink': { emoji: '🖤', type: 'material', rarity: 'common', desc: 'ถุงหมึกดำสนิทจากก้นแม่น้ำ ใช้เป็นหมึกสีและงานศิลปะโบราณ', price: 50 },
    'Single Horn': { emoji: '🌵', type: 'material', rarity: 'common', desc: 'ชิ้นเขาสัตว์เดียวขนาดสั้น แข็งแรงและแหลมคมทนทานดี', price: 40 },
    'Poring Core': { emoji: '🟢', type: 'material', rarity: 'common', desc: 'แก่นสไลม์เยลลี่สีเขียวมรกต ยืดหยุ่นได้รูปทรงไม่สิ้นสุด', price: 20 },
    'Fluff': { emoji: '☁️', type: 'material', rarity: 'common', desc: 'สำลีปุยนุ่มน้ำหนักเบาหวิว เก็บความร้อนได้ยอดเยี่ยม', price: 15 },
    'Empty Bottle': { emoji: '🫙', type: 'material', rarity: 'common', desc: 'ขวดแก้วเปล่าใสสะอาด เหมาะสำหรับเก็บน้ำโพชั่นแร่ธาตุ', price: 10 },
    'Pointed Scale': { emoji: '🦈', type: 'material', rarity: 'common', desc: 'สะเก็ดแหลมจากปลายหางอสูรน้ำ แหลมคมราวกับใบเลื่อยเล็ก', price: 48 },
    'Hard Shell': { emoji: '🐚', type: 'material', rarity: 'common', desc: 'เปลือกสลักแกร่งหนาของสิ่งมีชีวิตหอยน้ำ ทนรอยขูดขีดสูงสุด', price: 35 },
    'Iron Ore': { emoji: '🪨', type: 'material', rarity: 'common', desc: 'ก้อนสินแร่เหล็กธรรมชาติ แหล่งแร่หลักในการทำอาวุธระดับต้น', price: 75 },
    // ---- Celestial mining (Svarrga / Heaven city) ----
    // Pickaxe ladder: rarer = pricier, higher level, mines more ore per swing,
    // swings faster (mineTime, seconds) and lasts longer (durability = swings
    // before it breaks and must be re-bought). Pickaxes are equippable tools.
    'Stone Pickaxe': { emoji: '⛏️', type: 'tool', rarity: 'uncommon', desc: 'พลั่วหินพื้นฐานสำหรับขุดแร่สวรรค์ ขุดได้ครั้งละ 1 แร่ (เลเวล 25+) · ทน 15 ครั้ง · ขุด 10 วิ/ครั้ง', price: 8000, mineYield: 1, levelReq: 25, durability: 15, mineTime: 10 },
    'Mythril Pickaxe': { emoji: '⛏️', type: 'tool', rarity: 'rare', desc: 'พลั่วมิธริลเนื้อแกร่ง ขุดได้ครั้งละ 2 แร่ (เลเวล 25+) · ทน 30 ครั้ง · ขุด 8 วิ/ครั้ง', price: 30000, mineYield: 2, levelReq: 25, durability: 30, mineTime: 8 },
    'Celestial Pickaxe': { emoji: '⛏️', type: 'tool', rarity: 'epic', desc: 'พลั่วศักดิ์สิทธิ์เปล่งประกาย ขุดได้ครั้งละ 3 แร่ (เลเวล 30+) · ทน 60 ครั้ง · ขุด 6 วิ/ครั้ง', price: 90000, mineYield: 3, levelReq: 30, durability: 60, mineTime: 6 },
    'Divine Pickaxe': { emoji: '⛏️', type: 'tool', rarity: 'legendary', desc: 'พลั่วเทวะระดับตำนาน ขุดได้ครั้งละ 5 แร่ (เลเวล 40+) · ทน 150 ครั้ง · ขุด 4 วิ/ครั้ง', price: 250000, mineYield: 5, levelReq: 40, durability: 150, mineTime: 4 },
    'Celestial Ore': { emoji: '💠', type: 'material', rarity: 'legendary', desc: 'แร่เรืองแสงหายากจากเมืองสวรรค์ มูลค่าสูงมาก นำไปแปลงเป็นเหรียญ ZOL ได้ที่พ่อค้าสวรรค์', price: 0 },
    'Coal': { emoji: '🖤', type: 'material', rarity: 'common', desc: 'ถ่านดำอิ่มตัว ร้อนแรงและเผาไหม้ได้อุณหภูมิสม่ำเสมอยิ่ง', price: 80 },
    'Decay Tooth': { emoji: '🦷', type: 'material', rarity: 'common', desc: 'เศษฟันผุพังมีกลิ่นอับ บดคั้นกลั่นเป็นเครื่องรางเตือนภัย', price: 20 },
    'Rusty Screw': { emoji: '🔩', type: 'material', rarity: 'common', desc: 'สกรูสนิมเขรอะ ค้นพบได้ในซากโบราณและอู่เก็บเครื่องกลเก่า', price: 22 },
    'Zargon': { emoji: '💎', type: 'material', rarity: 'common', desc: 'คริสตัลสังเคราะห์สะท้อนแสงสีส้ม นำไปแปรรูปของตกแต่งเครื่องแต่งกาย', price: 115 },
    'Phracon': { emoji: '⚒️', type: 'material', rarity: 'common', desc: 'แร่อัดขัดพื้นผิวชั้นดี ใช้สำหรับการอัพเกรดและตีบวกของระดับเริ่มต้น', price: 200 },
    'Apple': { emoji: '🍎', type: 'consumable', rarity: 'common', desc: 'แอปเปิ้ลสีแดงรสหวานกรอบ ทานเพื่อฟื้นฟู HP +25 หน่วยทันที', price: 15, healHp: 25 },
    'Carrot': { emoji: '🥕', type: 'consumable', rarity: 'common', desc: 'แครอทสีส้มสด หัวผักกรุบกรอบ ทานเพื่อฟื้นฟู HP +35 หน่วยทันที', price: 20, healHp: 35 },
    'Banana': { emoji: '🍌', type: 'consumable', rarity: 'common', desc: 'กล้วยป่าสีเหลืองสุกหอมหวานเต็มคำ ทานเพื่อฟื้นฟู HP +20 หน่วย', price: 12, healHp: 20 },
    'Red Herb': { emoji: '🌺', type: 'consumable', rarity: 'common', desc: 'สมุนไพรสีแดงเข้มสด ทานเพื่อฟื้นฟู HP +120 หน่วยทันที', price: 100, healHp: 120 },
    'Green Herb': { emoji: '🌿', type: 'consumable', rarity: 'common', desc: 'สมุนไพรสีเขียวตามธรรมชาติ ทานเพื่อฟื้นฟู HP +45 หน่วยทันที', price: 30, healHp: 45 },
    'Yellow Herb': { emoji: '🌾', type: 'consumable', rarity: 'common', desc: 'สมุนไพรโบราณสีเหลืองทอง ทานเพื่อฟื้นฟู HP +75 หน่วยทันที', price: 60, healHp: 75 },
    'Orange Juice': { emoji: '🧃', type: 'consumable', rarity: 'common', desc: 'น้ำส้มคั้นสดกล่อง ฟื้นฟู HP +180 หน่วยทันที', price: 120, healHp: 180 },
    'Sweet Milk': { emoji: '🥛', type: 'consumable', rarity: 'common', desc: 'นมสดอุ่นบรรจุขวด ฟื้นฟู HP +100 หน่วยด้วยความกลมกล่อม', price: 80, healHp: 100 },
    'Fish': { emoji: '🐟', type: 'consumable', rarity: 'common', desc: 'ปลาสดเนื้อชุ่มฉ่ำที่ตกได้จากแม่น้ำ ทานเพื่อฟื้นฟู HP +15 หน่วย', price: 15, healHp: 15 },
    'Novice Potion': { emoji: '🧪', type: 'consumable', rarity: 'common', desc: 'น้ำยาสีแดงสูตรพิเศษของเหล่า Novice ฟื้น HP +65 หน่วยทันที', price: 50, healHp: 65 },
    'Candy': { emoji: '🍬', type: 'consumable', rarity: 'common', desc: 'ลูกอมรสตอเบอรี่สีชมพูหวาน ฟื้นฟู HP +50 หน่วยสะดวกรวดเร็ว', price: 40, healHp: 50 },
    'Cotton Shirt': { emoji: '👕', type: 'armor', rarity: 'common', desc: 'เสื้อทอด้วยใยฝ้ายบางเบา สวมใส่สบายตัว (DEF +2, HP +20)', price: 100, defBonus: 2, hpBonus: 20 },
    'Novice Cutter': { emoji: '🔪', type: 'weapon', rarity: 'common', desc: 'มีดสั้นสำหรับนักผจญภัยมือใหม่ คล่องตัวสูงมาก (ATK +5)', price: 150, atkBonus: 5 },
    'Wooden Buckler': { emoji: '🛡️', type: 'shield', rarity: 'common', desc: 'โล่ไม้กลมฉลุขอบ ด้ามจับเชือกหนังต้านทานดาเมจพื้นๆ (DEF +3)', price: 120, defBonus: 3 },
    'Trash': { emoji: '👞', type: 'material', rarity: 'common', desc: 'ขยะเปียกหรือรองเท้าเก่าๆ ที่ดึงขึ้นมาได้จากแม่น้ำ สามารถดัดแปลงขายต่อ', price: 2 },
    'Copper Coin': { emoji: '🪙', type: 'material', rarity: 'common', desc: 'เหรียญทองแดงเก่าสนิมขึ้นเล็กน้อย พบได้ตามท้องแม่น้ำหรือจากสัตว์น้ำ', price: 25 },

    // ---- 30 RARE ITEMS ----
    'Wooden Heart': { emoji: '❤️‍🔥', type: 'material', rarity: 'rare', desc: 'แกนกลางหัวใจไม้ที่มีพลังเวทมนตร์แฝงอยู่ นำไปทำเป็นยากลั่นหรือเครื่องรางชั้นดี', price: 80 },
    'Crystal Blue': { emoji: '🔵', type: 'material', rarity: 'rare', desc: 'แร่ธาตุน้ำตกผลึกประกายประกายเย็นเยือก นิยมนำไปอัพเกรดหรือบำบัด', price: 250 },
    'Oridecon Stone': { emoji: '🧱', type: 'material', rarity: 'rare', desc: 'เศษแร่โอริเดคอนดั่งเดิม ใช้ผสมควบแน่นหลอมเป็นแร่ตีบวกอาวุธ', price: 400 },
    'Elunium Stone': { emoji: '🌫️', type: 'material', rarity: 'rare', desc: 'เศษแร่อีลูเนียมดิบสีคราม ใช้ร่วมกับการหลอมน้ำยาตีบวกชุดป้องกัน', price: 400 },
    'Silver Ore': { emoji: '🪙', type: 'material', rarity: 'rare', desc: 'สินแร่บริสุทธิ์สีเงินระยิบ มีคุณสมบัติสะท้อนภาพฉายเวทมนตร์อ่อนๆ', price: 150 },
    'Gold Sand': { emoji: '✨', type: 'material', rarity: 'rare', desc: 'ผงทรายทองทอแสงประกายระยับ มักนำมาเจือผสมหล่อเครื่องประดับชั้นสูง', price: 220 },
    'Tough Vine': { emoji: '🪢', type: 'material', rarity: 'rare', desc: 'รากวัลย์เหนียวพิเศษทนทานสูง ไม่ขาดง่ายแม้เจอกรดหรือความร้อนสูง', price: 120 },
    'Tiger Skin': { emoji: '🦓', type: 'material', rarity: 'rare', desc: 'ขนงิ้วลายกล้ามเสือโคร่งผิวนิ้วหนาล้ำค่า เป็นที่รักของนักถักทอเครื่องนุ่งห่มบึกบึน', price: 300 },
    'Big Bigfoot Claw': { emoji: '🐾', type: 'material', rarity: 'rare', desc: 'อุ้งกรงเล็บสีเข้มหนาแข็งของ Bigfoot ทรงกลดอำนาจความดุดันธรรมชาติ', price: 180 },
    'Snake Scale': { emoji: '🐍', type: 'material', rarity: 'rare', desc: 'เกล็ดงูกลางมิติเลื่อมเงา ป้องกันพิษและความอับชื้นได้วิเศษ', price: 160 },
    'Nine Tail Fur': { emoji: '🦊', type: 'material', rarity: 'rare', desc: 'ขุนขนเก้าหางพริ้วเป็นเงาเรียบ นุ่มนวลดั่งสัมผัสผ้าจากปุยสวรรค์', price: 350 },
    'Emperium Condensation': { emoji: '💎', type: 'material', rarity: 'rare', desc: 'ผลึกกึ่งหลอมเหลวอ่อนสีทองจาง บรรจุร่องรอยเวทมนตร์แห่งกิลด์วอร์ส', price: 600 },
    'Blue Herb': { emoji: '💙', type: 'consumable', rarity: 'rare', desc: 'สมุนไพรสีน้ำเงินหายากมาก ทานเพื่อฟื้นฟูพลังเวทมนตร์ SP +25 หน่วยทันที', price: 150, restoreSp: 25 },
    'Grape': { emoji: '🍇', type: 'consumable', rarity: 'rare', desc: 'องุ่นไร้เมล็ด สีม่วงฉ่ำน้ำสวรรค์ ทานเพื่อฟื้นฟู HP +60 หน่วย', price: 50, healHp: 60 },
    'Honey': { emoji: '🍯', type: 'consumable', rarity: 'rare', desc: 'น้ำผึ้งป่าธรรมชาติสีทองอำพัน เหนียวข้นหวานมัน (HP +150, SP +15)', price: 200, healHp: 150, restoreSp: 15 },
    'Royal Jelly': { emoji: '🧪', type: 'consumable', rarity: 'rare', desc: 'นมผึ้งหลวงเข้มข้น ล้างความล้าและฟื้นพลังลึกซึ้ง (HP +300, SP +50)', price: 450, healHp: 300, restoreSp: 50 },
    'Blue Potion': { emoji: '🧪', type: 'consumable', rarity: 'rare', desc: 'ยาน้ำฟื้นมานาสีฟ้าใส ฟื้นพลังธรรมชาติสมาธิเวทมนตร์ SP +40 รวดเร็ว', price: 350, restoreSp: 40 },
    'Red Potion': { emoji: '🧪', type: 'consumable', rarity: 'rare', desc: 'โพชั่นแดงยอดฮิตของนักพจญภัย รักษาฟื้นฟูบาดแผลระเหิด HP +250', price: 250, healHp: 250 },
    'Monster Cookie': { emoji: '🍪', type: 'consumable', rarity: 'rare', desc: 'คุกกี้ช็อคโกรูปหุ่นมอนสเตอร์ อร่อยคลายหิวและช่วยฟื้นเลือด HP +200', price: 180, healHp: 200 },
    'Sword': { emoji: '🗡️', type: 'weapon', rarity: 'rare', desc: 'ดาบเหล็กกล้าคลาสสิกของ Novice เพิ่มพลังโจมตี ATK +15 หน่วยเมื่อสวมใส่', price: 200, atkBonus: 15 },
    'Bow': { emoji: '🏹', type: 'weapon', rarity: 'rare', desc: 'ธนูไม้ดัดที่มีความยืดหยุ่นสูง เพิ่มพลังโจมตี ATK +10 และฟื้นฟู SP +10 หน่วยเมื่อสวมใส่', price: 250, atkBonus: 10, spBonus: 10 },
    'Gun': { emoji: '🔫', type: 'weapon', rarity: 'rare', desc: 'ปืนสั้นกลไกสไตล์กัปตัน เพิ่มพลังโจมตี ATK +22 หน่วยเมื่อสวมใส่', price: 400, atkBonus: 22 },
    'Fishing Rod': { emoji: '🎣', type: 'fishing_rod', rarity: 'common', desc: 'คันเบ็ดไม้ธรรมดาสำหรับผู้เริ่มต้น แจกฟรีให้ผู้เล่นทุกคน ตกปลา Common ได้ที่ริมน้ำ', price: 0, atkBonus: 2, isFishingRod: true, rodTier: 'wood', maxFishRarity: 'common', starterOnly: true },
    'Silver Fishing Rod': { emoji: '🎣', type: 'fishing_rod', rarity: 'epic', desc: 'คันเบ็ดเงินเนื้อแน่นสำหรับนักตกปลาจริงจัง ตกปลา Common, Uncommon และ Rare ได้', price: 15000, atkBonus: 4, isFishingRod: true, rodTier: 'silver', maxFishRarity: 'rare' },
    'Golden Fishing Rod': { emoji: '🎣', type: 'fishing_rod', rarity: 'legendary', desc: 'คันเบ็ดทองคำระดับสูงสุด ปลดล็อกโอกาสตกปลาในตำนานจากแหล่งน้ำอันตราย', price: 75000, atkBonus: 8, isFishingRod: true, rodTier: 'gold', maxFishRarity: 'legendary' },
    'Sunglasses': { emoji: '🕶️', type: 'glasses', rarity: 'rare', desc: 'แว่นกันแดดสีดำสุดคูล ปิดบังดวงตาเสริมคาริสมาแสดงออกให้ดูเท่แบบลับๆ', price: 300 },
    'Classic Glasses': { emoji: '👓', type: 'glasses', rarity: 'rare', desc: 'แว่นตากรอบแดงสไตล์แอคเดมิค เลนส์ใสสบายตา เพิ่มสติปัญญาและรูปลักษณ์ที่ดูเชื่อถือ', price: 350 },
    'Cowboy Hat': { emoji: '🤠', type: 'hat', rarity: 'rare', desc: 'หมวกคาวบอยหนังสีน้ำตาลเข้ม ปีกกว้างกันแดดลม สไตล์ตะวันตกดุดัน', price: 400 },
    'Adventurer Suit': { emoji: '🥋', type: 'armor', rarity: 'rare', desc: 'ชุดนักผจญภัยหนังสลักลาย เดินตะคุยมอนสเตอร์เหนียวแน่นปลอดภัย (DEF +8, HP +80)', price: 800, defBonus: 8, hpBonus: 80 },
    'Iron Shield': { emoji: '🛡️', type: 'shield', rarity: 'rare', desc: 'โล่ทำจากแผ่นเหล็กหนาร่วมตอกหมุด ทนแรงกระแทกจากเขาควายได้ยอด (DEF +12)', price: 750, defBonus: 12 },
    'Mage Staff': { emoji: '🪄', type: 'weapon', rarity: 'rare', desc: 'ไม้เท้าแอปเปิ้ลโอ๊คร่ายเวท ส่งประกายคาถามินิ (ATK +8, SP +30)', price: 600, atkBonus: 8, spBonus: 30 },
    'Holy Rod': { emoji: '🔆', type: 'weapon', rarity: 'rare', desc: 'คทาศักดิ์สิทธิ์ประจำตัวพระ ปลายเรืองแสงสีทอง เสริมพลังฟื้นฟูและเวทแสง (ATK +10, SP +40)', price: 700, atkBonus: 10, spBonus: 40 },
    'Iron Helm': { emoji: '🪖', type: 'armor', rarity: 'rare', desc: 'หมวกเหล็กอัศวิน Novice หนักแน่นและบดบังการฟันหัวได้ดี (DEF +6, HP +50)', price: 50, defBonus: 6, hpBonus: 50 },
    'Silver Ring': { emoji: '💍', type: 'armor', rarity: 'rare', desc: 'แหวนเงินแท้น้ำหนักบางเบา ช่วยรักษาชีพจรหัวใจ (DEF +2, HP +30)', price: 450, defBonus: 2, hpBonus: 30 },
    'Speed Boots': { emoji: '🥾', type: 'armor', rarity: 'rare', desc: 'รองเท้าหนังเสือทอเหนียวทน เดินทางสะดวกเคลื่อนที่ว่องไว (DEF +5, HP +40)', price: 900, defBonus: 5, hpBonus: 40 },
    'Leather Cloak': { emoji: '🧥', type: 'armor', rarity: 'rare', desc: 'ผ้าคลุมไหล่หนังสุนัขป่า เก็บกักอุณภูมิผิวกายป้องกันบาดแผล (DEF +4, HP +60)', price: 650, defBonus: 4, hpBonus: 60 },

    // ---- PANTS (ช่องกางเกง) & WRIST BRACERS (ช่องข้อมือ) ----
    'Leather Pants': { emoji: '👖', type: 'armor', rarity: 'rare', desc: 'กางเกงหนังฟอกเนื้อเหนียว ป้องกันขาและเพิ่มความคล่องตัวในการเดินทาง (DEF +5, HP +60)', price: 550, defBonus: 5, hpBonus: 60 },
    'Plate Legguards': { emoji: '👖', type: 'armor', rarity: 'epic', desc: 'สนับขาเหล็กกล้าแผ่นหนา ครอบต้นขาถึงหน้าแข้ง ทนแรงกระแทกหนักหน่วง (DEF +18, HP +220)', price: 4200, defBonus: 18, hpBonus: 220 },
    'Dragon Greaves': { emoji: '🥾', type: 'armor', rarity: 'legendary', desc: 'รองเท้าเกราะเกล็ดมังกร ปกป้องหน้าแข้งและเท้า แข็งแกร่งดั่งภูผา (DEF +45, HP +700)', price: 20000, defBonus: 45, hpBonus: 700 },
    'Leather Bracer': { emoji: '🧤', type: 'armor', rarity: 'rare', desc: 'สนับข้อมือหนังเย็บมือ กระชับข้อมือเสริมการโจมตีให้มั่นคง (DEF +3, HP +35)', price: 300, defBonus: 3, hpBonus: 35 },
    'Steel Bracer': { emoji: '🧤', type: 'armor', rarity: 'epic', desc: 'สนับข้อมือเหล็กหุ้มหมุด ปัดป้องอาวุธและเสริมพลังแขนขณะปะทะ (DEF +12, HP +140)', price: 3200, defBonus: 12, hpBonus: 140 },
    'Guardian Wristguard': { emoji: '🧤', type: 'armor', rarity: 'legendary', desc: 'สนับข้อมือผู้พิทักษ์ เรืองรัศมีศักดิ์สิทธิ์ ดูดซับดาเมจและเพิ่มพลังชีวิต (DEF +30, HP +500)', price: 16000, defBonus: 30, hpBonus: 500 },

    // ---- PETS (สัตว์เลี้ยงคู่ใจ — เดินตามฮีโร่ ไม่มีผลต่อสเตตัส) ----
    'Poring Pet': { emoji: '🩷', type: 'pet', pet: 'poring', rarity: 'common', desc: 'โพริ่งเจลลี่สีชมพู เด้งดึ๋งตามเจ้าของไปทุกที่ น่ารักที่สุดในแดนราคนารก', price: 2000 },
    'Chick Pet': { emoji: '🐤', type: 'pet', pet: 'chick', rarity: 'common', desc: 'ลูกเจี๊ยบขนปุยสีเหลือง ร้องเจี๊ยบๆ กระพือปีกน้อยเดินตามอย่างร่าเริง', price: 3000 },
    'Kitten Pet': { emoji: '🐱', type: 'pet', pet: 'kitten', rarity: 'rare', desc: 'ลูกแมวขนเทานุ่ม หางชูตั้ง เดินเคียงข้างอย่างสง่างามและอบอุ่น', price: 8000 },
    'Puppy Pet': { emoji: '🐶', type: 'pet', pet: 'puppy', rarity: 'rare', desc: 'ลูกสุนัขแสนซื่อสัตย์ กระดิกหางวิ่งตามเจ้าของไม่ห่าง เพื่อนแท้ผู้ผจญภัย', price: 10000 },
    'Owl Pet': { emoji: '🦉', type: 'pet', pet: 'owl', rarity: 'epic', desc: 'นกฮูกผู้รอบรู้ ลอยตามเงียบๆ ดวงตาโตเป็นประกายในยามค่ำคืน', price: 25000 },
    'Baby Dragon Pet': { emoji: '🐉', type: 'pet', pet: 'baby_dragon', rarity: 'legendary', desc: 'มังกรน้อยกำเนิดใหม่ กระพือปีกลอยเคียงข้าง สง่างามราวจ้าวเวหา', price: 60000 },
    'Sunfox Pet': { emoji: '🦊', type: 'pet', pet: 'sunfox', rarity: 'rare', desc: 'จิ้งจอกสุริยันขนทอง ปลายหางมีแสงอุ่นนำทางนักผจญภัย', price: 18000 },
    'Moss Turtle Pet': { emoji: '🐢', type: 'pet', pet: 'moss_turtle', rarity: 'rare', desc: 'เต่าน้อยผู้แบกสวนจิ๋วบนกระดอง ใจเย็นและซื่อสัตย์', price: 22000 },
    'Cloudling Pet': { emoji: '☁️', type: 'pet', pet: 'cloudling', rarity: 'epic', desc: 'ภูตเมฆตัวกลมลอยฟ่อง ทิ้งประกายฝนดาวไว้เบื้องหลัง', price: 42000 },
    'Moon Hare Pet': { emoji: '🌙', type: 'pet', pet: 'moon_hare', rarity: 'epic', desc: 'กระต่ายจันทราหูยาว ขนสีเงินเปล่งแสงยามค่ำคืน', price: 55000 },
    'Bloom Fairy Pet': { emoji: '🧚', type: 'pet', pet: 'bloom_fairy', rarity: 'legendary', desc: 'ภูตดอกไม้แห่งพงไพร ปีกแก้วสะท้อนสีรุ้งทุกครั้งที่บิน', price: 95000 },
    'Ember Phoenix Pet': { emoji: '🔥', type: 'pet', pet: 'ember_phoenix', rarity: 'mythic', desc: 'วิหคเพลิงเกิดใหม่ เปลวไฟไม่เผาเจ้าของและส่องประกายดั่งอาทิตย์', price: 180000 },

    // One-time onboarding companion. It is granted by the trusted server/local
    // guest fallback, not sold as a free shop item.
    'Starter Poring Pet': { emoji: '🩷', type: 'pet', pet: 'poring', rarity: 'common', desc: 'โพริ่งคู่ใจตัวแรกสำหรับนักผจญภัย ช่วยให้เรียนรู้การเรียกและการเติบโตของสัตว์เลี้ยง', price: 0, starterOnly: true },

    // ---- REFINE ORES (แร่ตีบวก) ----
    'Oridecon': { emoji: '🔩', type: 'material', rarity: 'rare', desc: 'แร่ออริดิคอนแข็งแกร่ง ใช้ตีบวกอาวุธให้ทรงพลังยิ่งขึ้น ยิ่งบวกสูงยิ่งใช้มาก', price: 2500 },
    'Elunium': { emoji: '💠', type: 'material', rarity: 'rare', desc: 'แร่อีลูเนียมเปล่งประกาย ใช้ตีบวกเกราะและโล่ให้ป้องกันเหนือชั้น', price: 2500 },

    // ---- 18 EPIC ITEMS ----
    'Gilding Ingot': { emoji: '🧱', type: 'material', rarity: 'epic', desc: 'แท่งทองคำบริสุทธิ์ผ่านการหลอมสองรอบ ตราสัญลักษณ์ราชกรประทับตรางาม', price: 800 },
    'Wind Element Stone': { emoji: '🌀', type: 'material', rarity: 'epic', desc: 'ก้อนพลังงานธาตุลมสีเขียวครามระยิบ หมุนติ้วปะทะความเร็ววายุ', price: 1000 },
    'Fire Element Stone': { emoji: '🔥', type: 'material', rarity: 'epic', desc: 'ก้อนธาตุไฟสีแสบร้อน แดงรุกโรจไม่มีทางดับสูนสิ้นนำไปตีเกราะไฟ', price: 1000 },
    'Devil Horn': { emoji: '😈', type: 'material', rarity: 'epic', desc: 'เขาปีศาจ Deviruchi ค้างคาวแหลมคมหักมุม นำพาพลังเสนียดและมนต์ดำแฝงกาย', price: 1200 },
    'Ghostly Essence': { emoji: '👻', type: 'material', rarity: 'epic', desc: 'ของวิเศษที่เป็นแก่นจิตเหนียวแน่นเรืองแสงของ Ghostring หาไม่ได้ตามธรรมชาติ', price: 1500 },
    'White Herb': { emoji: '💮', type: 'consumable', rarity: 'epic', desc: 'สมุนไพรขาวสกัดพิเศษหายากยิ่งยวด ฟื้น HP +500 บำบัดพิษโลหิตฉับพลัน', price: 600, healHp: 500 },
    'Yggdrasil Seed': { emoji: '🌱', type: 'consumable', rarity: 'epic', desc: 'เมล็ดต้นไม้โลกอันศักดิ์สิทธิ์ ยาเทวรูปทรงฟื้นฟูเลือดกับมานามหาศาล (HP +800, SP +100)', price: 1200, healHp: 800, restoreSp: 100 },
    'White Potion': { emoji: '🧪', type: 'consumable', rarity: 'epic', desc: 'น้ำยาสกัดเข้มข้นพิเศษปรุงมือโดยอัลเคมิสต์ดัง ฟื้น HP +650 ทันด่วน', price: 800, healHp: 650 },
    'Katana': { emoji: '⚔️', type: 'weapon', rarity: 'epic', desc: 'ดาบซามูไรเรียวยาวจากแดนตะวันออก ฟันแหลกศัตรูฉับไวถล่มทลาย (ATK +45)', price: 3500, atkBonus: 45 },
    'Crossbow': { emoji: '🏹', type: 'weapon', rarity: 'epic', desc: 'หน้าไม้กลไกยิงรัวด้วยสปริงเหล็กทอ ช่วยให้ยิงต่อเนื่องเฉียบคม (ATK +38, SP +20)', price: 4000, atkBonus: 38, spBonus: 20 },
    'Silver Dagger': { emoji: '🗡️', type: 'weapon', rarity: 'epic', desc: 'มีดสั้นตีด้วยแร่เนื้อเงินศักดิ์สิทธิ์ สร้างดาเมจจุดตายมอนสเตอร์รวดเร็ว (ATK +40)', price: 3200, atkBonus: 40 },
    'Heavy Warhammer': { emoji: '🔨', type: 'weapon', rarity: 'epic', desc: 'ค้อนเหล็กยักษ์สำหรับทุบเกราะเหล็กศัตรู สร้างความสะท้านแรงปานบดขยี้ (ATK +55)', price: 5000, atkBonus: 55 },
    'Tear Shield': { emoji: '🛡️', type: 'shield', rarity: 'epic', desc: 'โล่รูปร่างหยดน้ำตาขนาดกลางประดับขอบทองเหลือง ป้องกันกายภาพชั้นเยี่ยม (DEF +28)', price: 3600, defBonus: 28 },
    'Steel Plate Mail': { emoji: '🛡️', type: 'armor', rarity: 'epic', desc: 'ชุดเกราะเหล็กกล้าแผ่นหนาสามชั้น แข็งกระด้างอึดยืนชนกลุ่มใหญ่อยู่สบาย (DEF +35, HP +300)', price: 6000, defBonus: 35, hpBonus: 300 },
    'Ranger Hood': { emoji: '🦹', type: 'armor', rarity: 'epic', desc: 'หมวกนักล่าสีเขียวพรางสายตามีดหน้าหมวก เสริมหลบการเล็งยิงไกล (DEF +10, HP +150)', price: 2500, defBonus: 10, hpBonus: 150 },
    'Gorgon Ring': { emoji: '💍', type: 'armor', rarity: 'epic', desc: 'แหวนดวงตาพิศวง ช่วยสะกดทนของศัตรู ล้อมเขตพลังรอบตัวป้องกัน (DEF +5, HP +200)', price: 4200, defBonus: 5, hpBonus: 200 },
    'Gold Earring': { emoji: '💎', type: 'armor', rarity: 'epic', desc: 'ตุ้มหูทองอัญมณีฟ้าเปล่งประกาย สุขกุมหัวใจและเสริมพลังชีวิต (DEF +3, HP +120)', price: 3500, defBonus: 3, hpBonus: 120 },
    'Shadow Garment': { emoji: '🧥', type: 'armor', rarity: 'epic', desc: 'ผ้าคลุมทอจากด้ายรัตติกาลลี้ลับ ช่วยอำพรางร่องผัดขัดเกลา (DEF +15, HP +180)', price: 4500, defBonus: 15, hpBonus: 180 },
    'Wizard Hat': { emoji: '🧙', type: 'hat', rarity: 'epic', desc: 'หมวกพ่อมดสีม่วงเข้มยอดแหลมพร้อมริบบิ้นทอง แฝงแสงเวทมนตร์อาถรรพ์ เสริมพลังเวทมนตร์', price: 2000 },
    'Crown': { emoji: '👑', type: 'hat', rarity: 'epic', desc: 'มงกุฎทองคำประดับยอดแหลม 6 แฉก สง่างามราวกษัตริย์ผู้ปกครองสรรพสิ่ง', price: 5000 },

    // ---- 9 LEGENDARY ITEMS ----
    'Pure Emperium': { emoji: '🔮', type: 'material', rarity: 'legendary', desc: 'ผลึกทองคำเทวทูตแร่สูงสุดใช้คราฟท์ของเทพ ก่อกำเนิดประกายออร่ากิลด์บึน', price: 5000 },
    'Yggdrasil Berry': { emoji: '🍇', type: 'consumable', rarity: 'legendary', desc: 'ผลเบอร์รี่วิเศษสีม่วงเข้มทองจากต้นไม้โลกคลาสสิก ฟื้น HP/SP 100% เต็มสูบ', price: 8000, healHp: 9999, restoreSp: 999 },
    'Lord Potion': { emoji: '🧪', type: 'consumable', rarity: 'legendary', desc: 'ยารัศมีราชันสัพพากรรม ดื่มเพื่อฟื้นฟูสูงระเบิดและเพิ่มกำลังบัฟ (HP +1500Base, SP +300)', price: 4000, healHp: 1500, restoreSp: 300 },
    'Excalibur': { emoji: '🗡️', type: 'weapon', rarity: 'legendary', desc: 'ดาบกษัตริย์ในปกรณัม อัญเชิญแสงสีทองเจิดจ้าทำลายทุกสิ่งกีดขวาง (ATK +120)', price: 25000, atkBonus: 120 },
    'Rudra Bow': { emoji: '🏹', type: 'weapon', rarity: 'legendary', desc: 'สุดยอดคันธนูศักดิ์สิทธิ์ แผดพสุธา ยิงปล่อยลูกศรได้ว่องไวราบรื่น (ATK +95, SP +120)', price: 28000, atkBonus: 95, spBonus: 120 },
    'Golden Shield': { emoji: '🛡️', type: 'shield', rarity: 'legendary', desc: 'โล่สีทองสลักหนาทองคำจากโบราณ ป้องกันดาเมจกายภาพและเวทเยี่ยมหลุดลอย (DEF +75)', price: 18000, defBonus: 75 },
    'Odin Garment': { emoji: '🧥', type: 'armor', rarity: 'legendary', desc: 'ผ้าคลุมเทพเจ้าโอดิน ปกป้องด้วยรัศมีเวทมนตร์เพิ่มเลือดล้นหลาม (DEF +80, HP +1000)', price: 22000, defBonus: 80, hpBonus: 1000 },
    'Dragon Scale Mail': { emoji: '🥋', type: 'armor', rarity: 'legendary', desc: 'ชุดเกราะเกล็ดมังกรทมิฬกลืนธาตุ ป้องกันแทบไร้ช่องว่างทำลายล้างยากยิ่ง (DEF +95, HP +1200)', price: 26000, defBonus: 95, hpBonus: 1200 },
    'Glow Ring': { emoji: '💍', type: 'armor', rarity: 'legendary', desc: 'แหวนอำนาจเรืองแสงดาวตก อบอวลด้วยออร่าฟื้นความเร็วชีวิต (DEF +20, HP +600)', price: 15000, defBonus: 20, hpBonus: 600 },

    // ---- 3 MYTHIC ITEMS ----
    'Valkyrie Armor': { emoji: '👑', type: 'armor', rarity: 'mythic', desc: 'ชุดศึกสตรีสวรรค์ในตำนานสวมใส่ ป้องกันสัมฤทธิ์เดชระดับจักรวาลและดึงดูดพลัง (DEF +180, HP +3000)', price: 100000, defBonus: 180, hpBonus: 3000 },
    'Ragnarok Blade': { emoji: '🔱', type: 'weapon', rarity: 'mythic', desc: 'อาวุธระดับสูงสุด ดาบฉีกวิญญาณสยบคุกสวรรค์พังพิศดารสร้างดาเมจขีดสุด (ATK +250, SP +300)', price: 120000, atkBonus: 250, spBonus: 300 },
    'Aegis of Olympus': { emoji: '🌌', type: 'shield', rarity: 'mythic', desc: 'โล่เทวทูตอีจิสม่านอวกาศ ดูดซับการปัดเป่าดาเมจทั้งหมดอย่างไร้ขีดจำกัด (DEF +160, HP +1500)', price: 95000, defBonus: 160, hpBonus: 1500 },

    // ---- Rare crafting catalyst (also a World Boss reward) ----
    'Dragon Heart': { emoji: '🐉', type: 'material', rarity: 'legendary', desc: 'หัวใจมังกรที่ยังเต้นด้วยไฟธาตุ ของหายากสุดจาก World Boss ใช้หลอมอาวุธระดับเทพ', price: 8000 },

    // ---- FORGED WEAPONS (crafted at the Weapon Smith) — high ATK + signature effect ----
    'Ember Fang': { emoji: '🔥', type: 'weapon', rarity: 'epic', desc: 'ดาบหลอมแก่นธาตุไฟ ทุกครั้งที่ฟันจะปะทุเปลวเพลิงลุกโชน (ATK +60, เอฟเฟกต์ไฟ)', price: 12000, atkBonus: 60, forgeEffect: 'fire' },
    'Frost Cleaver': { emoji: '❄️', type: 'weapon', rarity: 'epic', desc: 'คาทานะเคลือบน้ำแข็งนิรันดร์ ฟันแล้วระเบิดเกล็ดหิมะเยือกแข็ง (ATK +90, เอฟเฟกต์น้ำแข็ง)', price: 22000, atkBonus: 90, forgeEffect: 'frost' },
    'Stormcaller Bow': { emoji: '⚡', type: 'weapon', rarity: 'epic', desc: 'คันธนูอัญเชิญพายุ ลูกศรทุกดอกพาดสายฟ้าฟาด (ATK +85, ระยะไกล, เอฟเฟกต์สายฟ้า)', price: 24000, atkBonus: 85, forgeEffect: 'storm' },
    'Soulreaper': { emoji: '👻', type: 'weapon', rarity: 'legendary', desc: 'มีดสั้นกลืนวิญญาณ ปลดปล่อยดวงจิตอาฆาตทุกครั้งที่โจมตี (ATK +130, เอฟเฟกต์วิญญาณ)', price: 55000, atkBonus: 130, forgeEffect: 'soul' },
    'Godslayer': { emoji: '🌌', type: 'weapon', rarity: 'mythic', desc: 'ดาบสังหารเทพหลอมจากหัวใจมังกรและเอ็มเพอเรียมบริสุทธิ์ ปลดปล่อยโนวาจักรวาลทุกการโจมตี (ATK +300, เอฟเฟกต์โนวา)', price: 250000, atkBonus: 300, forgeEffect: 'nova' }
};

// ============ FISH SPECIES ============
// 73 fish species inspired by Coral Island, distributed across 4 rarity tiers
export const FISH_SPECIES = {
    // ---- COMMON FISH (30) ----
    'Tilapia': { emoji: '🐟', rarity: 'common', price: 30, desc: 'ปลานิลน้ำจืดตัวเล็กเนื้อขาว ตกได้ง่ายจากบ่อและแม่น้ำทั่วไป' },
    'Catfish': { emoji: '🐟', rarity: 'common', price: 35, desc: 'ปลาดุกหนวดยาวอาศัยอยู่ก้นแม่น้ำ เนื้อมันนุ่มปรุงอาหารอร่อย' },
    'Carp': { emoji: '🐟', rarity: 'common', price: 28, desc: 'ปลาคาร์ปสีทองอ่อนว่ายน้ำช้าๆ พบได้ทั่วไปในทะเลสาบ' },
    'Perch': { emoji: '🐟', rarity: 'common', price: 32, desc: 'ปลาเพิร์ชลายทาง ชอบอาศัยตามก้อนหินใต้น้ำ' },
    'Sardine': { emoji: '🐟', rarity: 'common', price: 20, desc: 'ปลาซาร์ดีนตัวเล็กว่ายเป็นฝูง มักพบบริเวณชายฝั่ง' },
    'Anchovy': { emoji: '🐟', rarity: 'common', price: 18, desc: 'ปลาแอนโชวี่ขนาดจิ๋วรสเค็ม ใช้ทำซอสปลาชั้นดี' },
    'Mackerel': { emoji: '🐟', rarity: 'common', price: 38, desc: 'ปลาทูน้ำเงินเนื้อแน่น นิยมย่างกินกับน้ำจิ้มแจ่ว' },
    'Herring': { emoji: '🐟', rarity: 'common', price: 25, desc: 'ปลาเฮอร์ริงสีเงินแวววาว ว่ายน้ำเร็วมากทั้งฝูง' },
    'Shad': { emoji: '🐟', rarity: 'common', price: 30, desc: 'ปลาแชดหลังเขียวพุงขาว ชอบอยู่ในน้ำตื้นใกล้ท่าเรือ' },
    'Smelt': { emoji: '🐟', rarity: 'common', price: 22, desc: 'ปลาสเมลต์ตัวใสเล็กจิ๋ว ส่งกลิ่นหอมคล้ายแตงกวา' },
    'Goby': { emoji: '🐟', rarity: 'common', price: 20, desc: 'ปลาบู่ตัวกลมป้อมชอบซ่อนตามโขดหิน' },
    'Mullet': { emoji: '🐟', rarity: 'common', price: 28, desc: 'ปลากระบอกริมน้ำกระโดดเล่นบนผิวน้ำยามเช้าตรู่' },
    'Sole': { emoji: '🐟', rarity: 'common', price: 34, desc: 'ปลาลิ้นหมาแบนราบแนบพื้นทราย พรางตัวเก่งมาก' },
    'Crucian Carp': { emoji: '🐟', rarity: 'common', price: 26, desc: 'ปลาตะเพียนทองเงาวับ ตกได้ง่ายจากทุกแหล่งน้ำ' },
    'Bass': { emoji: '🐟', rarity: 'common', price: 40, desc: 'ปลากะพงน้ำจืดตัวอ้วน ชอบกินเหยื่อขนาดใหญ่' },
    'Trout': { emoji: '🐟', rarity: 'common', price: 42, desc: 'ปลาเทราต์ลายจุดแดง พบในลำธารน้ำเย็นใสกระจ่าง' },
    'Pike': { emoji: '🐟', rarity: 'common', price: 45, desc: 'ปลาไพค์ปากแหลมดุร้าย นักล่าแห่งทุ่งกกริมทะเลสาบ' },
    'Bluegill': { emoji: '🐟', rarity: 'common', price: 24, desc: 'ปลาบลูกิลล์ครีบสีฟ้าเข้ม ตกง่ายเหมาะกับมือใหม่' },
    'Minnow': { emoji: '🐟', rarity: 'common', price: 12, desc: 'ปลาซิวจิ๋วสีเงิน ว่ายกันเป็นฝูงนับร้อยตัว' },
    'Sunfish': { emoji: '🐟', rarity: 'common', price: 30, desc: 'ปลาซันฟิชลำตัวแบน สีส้มทองสดใส' },
    'Roach': { emoji: '🐟', rarity: 'common', price: 22, desc: 'ปลาโรชครีบแดง ชอบรวมฝูงในน้ำนิ่ง' },
    'Dace': { emoji: '🐟', rarity: 'common', price: 20, desc: 'ปลาเดซลำตัวเรียวยาว ว่ายทวนกระแสน้ำได้ดี' },
    'Whiting': { emoji: '🐟', rarity: 'common', price: 36, desc: 'ปลาไวท์ติ้งเนื้อขาวละเอียด เป็นที่นิยมในร้านอาหาร' },
    'Flounder': { emoji: '🐟', rarity: 'common', price: 38, desc: 'ปลาลิ้นหมาใหญ่ นอนราบพื้นทรายตาย้ายข้าง' },
    'Snapper': { emoji: '🐟', rarity: 'common', price: 44, desc: 'ปลากะพงแดงปากแหลม เนื้อแน่นหวานอร่อย' },
    'Cod': { emoji: '🐟', rarity: 'common', price: 40, desc: 'ปลาค็อดหนังลื่น นิยมนำมาทำฟิชแอนด์ชิปส์' },
    'Haddock': { emoji: '🐟', rarity: 'common', price: 42, desc: 'ปลาแฮดด็อคมีจุดดำข้างลำตัว เนื้อหนาเหมาะรมควัน' },
    'Pollock': { emoji: '🐟', rarity: 'common', price: 35, desc: 'ปลาพอลล็อคครีบเหลืองอ่อน พบในน้ำลึก' },
    'Butterfish': { emoji: '🐟', rarity: 'common', price: 32, desc: 'ปลาบัตเตอร์ฟิชลื่นเหนียว หลุดมือง่ายเวลาจับ' },
    'Sea Bass': { emoji: '🐟', rarity: 'common', price: 48, desc: 'ปลากะพงทะเลตัวใหญ่ ตีน้ำกระโจนเมื่อติดเบ็ด' },

    // ---- UNCOMMON FISH (22) ----
    'Rainbow Trout': { emoji: '🌈', rarity: 'uncommon', price: 65, desc: 'ปลาเทราต์สายรุ้งลายสีสดใส อาศัยในลำธารเขาน้ำใสเย็น' },
    'Salmon': { emoji: '🐠', rarity: 'uncommon', price: 80, desc: 'ปลาแซลมอนสีชมพูส้ม ว่ายทวนน้ำตกขึ้นไปหลายร้อยกิโลเพื่อวางไข่' },
    'Tuna': { emoji: '🐠', rarity: 'uncommon', price: 90, desc: 'ปลาทูน่าครีบเหลืองขนาดใหญ่ ว่ายเร็วและแข็งแรงมาก' },
    'Swordfish': { emoji: '🗡️', rarity: 'uncommon', price: 110, desc: 'ปลากระโทงจะงอยปากแหลมยาว พุ่งฝ่าน้ำเร็วดั่งสายฟ้า' },
    'Eel': { emoji: '🐍', rarity: 'uncommon', price: 70, desc: 'ปลาไหลตัวยาวลื่นเลื้อย ซ่อนอยู่ในรูโคลนก้นแม่น้ำ' },
    'Barramundi': { emoji: '🐠', rarity: 'uncommon', price: 85, desc: 'ปลากะพงขาวตัวโตเนื้อแน่น มีราคาสูงในตลาด' },
    'Grouper': { emoji: '🐠', rarity: 'uncommon', price: 95, desc: 'ปลาเก๋าปากกว้าง อ้าปากดูดเหยื่อทั้งตัว' },
    'Red Snapper': { emoji: '🐠', rarity: 'uncommon', price: 88, desc: 'ปลากะพงแดงสีสวยสดใส เนื้อนุ่มละมุนลิ้น' },
    'Yellowtail': { emoji: '🐠', rarity: 'uncommon', price: 92, desc: 'ปลาหางเหลืองญี่ปุ่น หรือปลาฮามาจิ ทำซาชิมิรสเด็ด' },
    'Pompano': { emoji: '🐠', rarity: 'uncommon', price: 78, desc: 'ปลาปอมปาโนลำตัวแบนสีเงินแวว ตกได้บริเวณหาดทราย' },
    'Wahoo': { emoji: '🐠', rarity: 'uncommon', price: 100, desc: 'ปลาวาฮูเรียวยาวว่ายเร็วสุด สู้ดิ้นรนอย่างดุเดือดบนสาย' },
    'Mahi-Mahi': { emoji: '🐠', rarity: 'uncommon', price: 105, desc: 'ปลาโดราโด้สีเขียวทองรุ้ง สวยงามเหนือระดับ' },
    'Sailfish': { emoji: '⛵', rarity: 'uncommon', price: 120, desc: 'ปลาเซลฟิชครีบหลังใหญ่คล้ายใบเรือ ว่ายเร็วที่สุดในทะเล' },
    'Sturgeon': { emoji: '🐠', rarity: 'uncommon', price: 130, desc: 'ปลาสเตอร์เจียนโบราณ มีเกล็ดแข็งคล้ายเกราะอัศวิน' },
    'Walleye': { emoji: '🐠', rarity: 'uncommon', price: 72, desc: 'ปลาวอลอายตาโตมองเห็นในที่มืดได้ ล่าเหยื่อกลางคืน' },
    'Striped Bass': { emoji: '🐠', rarity: 'uncommon', price: 82, desc: 'ปลากะพงลาย เส้นดำพาดข้างลำตัวสง่างาม' },
    'King Mackerel': { emoji: '🐠', rarity: 'uncommon', price: 98, desc: 'ปลาอินทรีย์ตัวใหญ่ฟันคม ล่าเหยื่อแบบพุ่งฉกเร็ว' },
    'Dorado': { emoji: '🐠', rarity: 'uncommon', price: 115, desc: 'ปลาโดราโด้ทองอร่าม เปล่งประกายเหนือน้ำยามพระอาทิตย์ตก' },
    'Arapaima': { emoji: '🐠', rarity: 'uncommon', price: 140, desc: 'ปลาช่อนอเมซอนยักษ์ ขนาดใหญ่โตกว่าคนสะดวกแค่ไหน' },
    'Paddlefish': { emoji: '🐠', rarity: 'uncommon', price: 125, desc: 'ปลาพายจมูกยาวแบนคล้ายไม้พาย กรองกินแพลงก์ตอน' },
    'Tarpon': { emoji: '🐠', rarity: 'uncommon', price: 108, desc: 'ปลาตาร์ปอนเกล็ดเงินใหญ่กระโดดขึ้นจากน้ำอย่างสง่า' },
    'Bonefish': { emoji: '🐠', rarity: 'uncommon', price: 75, desc: 'ปลาโบนฟิชว่ายเร็วในน้ำตื้น สีเงินกลมกลืนกับทราย' },

    // ---- RARE FISH (14) ----
    'Golden Koi': { emoji: '✨', rarity: 'rare', price: 250, desc: 'ปลาคาร์ฟทองคำในตำนาน เกล็ดเปล่งประกายสีทองอร่ามตา' },
    'Arowana': { emoji: '🐉', rarity: 'rare', price: 300, desc: 'ปลามังกรทองกระโดดข้ามผิวน้ำ เชื่อกันว่านำโชคลาภมาให้' },
    'Moonfish': { emoji: '🌙', rarity: 'rare', price: 280, desc: 'ปลาพระจันทร์ลำตัวกลมส่องแสงเรืองราตรี พบเฉพาะคืนพระจันทร์เต็มดวง' },
    'Ghost Fish': { emoji: '👻', rarity: 'rare', price: 320, desc: 'ปลาผีโปร่งแสงไร้สีตัวใส มองทะลุเห็นกระดูก หายากสุดขีด' },
    'Crystal Fish': { emoji: '💎', rarity: 'rare', price: 350, desc: 'ปลาคริสตัลเกล็ดใสราวเพชร สะท้อนแสงรุ้งหลากสีอลังการ' },
    'Sunstone Fish': { emoji: '☀️', rarity: 'rare', price: 280, desc: 'ปลาหินแดดสีส้มแดงอุ่นมือ เกล็ดเก็บความร้อนแสงอาทิตย์' },
    'Stargazer': { emoji: '⭐', rarity: 'rare', price: 300, desc: 'ปลาดาวตาชี้ขึ้นฟ้า ฝังตัวในทรายจ้องมองดวงดาว' },
    'Coelacanth': { emoji: '🦕', rarity: 'rare', price: 400, desc: 'ปลาซีลาแคนท์ฟอสซิลที่ยังมีชีวิต อายุเผ่าพันธุ์กว่าล้านปี' },
    'Electric Eel': { emoji: '⚡', rarity: 'rare', price: 350, desc: 'ปลาไหลไฟฟ้าปล่อยกระแสช็อตรุนแรง จับด้วยมือเปล่าอันตราย' },
    'Oarfish': { emoji: '🐉', rarity: 'rare', price: 380, desc: 'ปลาพญานาคตัวยาวหลายเมตร ปรากฏตัวก่อนเกิดแผ่นดินไหว' },
    'Piranha': { emoji: '🦷', rarity: 'rare', price: 220, desc: 'ปลาปิรันย่าฟันคมจัด กัดเหยื่อได้ในพริบตา อันตรายมาก' },
    'Marlin': { emoji: '🗡️', rarity: 'rare', price: 360, desc: 'ปลามาร์ลินจะงอยปากยาวดั่งดาบ นักสู้แห่งท้องทะเลลึก' },
    'Giant Catfish': { emoji: '🐟', rarity: 'rare', price: 340, desc: 'ปลาบึกยักษ์แม่น้ำโขง ตัวใหญ่ยิ่งกว่าคน ใกล้สูญพันธุ์' },
    'Anglerfish': { emoji: '🔦', rarity: 'rare', price: 330, desc: 'ปลาตกเบ็ดน้ำลึกมีไฟส่องหน้าผาก ล่อเหยื่อในความมืดสนิท' },

    // ---- LEGENDARY FISH (7) ----
    'Great White Shark': { emoji: '🦈', rarity: 'legendary', price: 1200, desc: 'ฉลามขาวยักษ์ราชาแห่งท้องทะเล จับได้ต้องใช้ทั้งแรงกายใจ' },
    'Hammerhead': { emoji: '🦈', rarity: 'legendary', price: 1100, desc: 'ฉลามหัวค้อนทรงแปลกตาเปี่ยมพลัง มองเห็นรอบทิศอย่างน่าเกรงขาม' },
    'Raja Ampat Shark': { emoji: '🦈', rarity: 'legendary', price: 1500, desc: 'ฉลามราชาอัมพัตจากน่านน้ำอินโดนีเซีย หายากที่สุดในโลก' },
    'Leviathan': { emoji: '🐲', rarity: 'legendary', price: 2000, desc: 'ปลาปีศาจในตำนานขนาดมหึมา ว่าเป็นสัตว์ร้ายแห่งก้นมหาสมุทร' },
    'Phoenix Fish': { emoji: '🔥', rarity: 'legendary', price: 1800, desc: 'ปลาฟีนิกซ์เปลวเพลิง เกล็ดลุกไหม้สีแดงทองไม่เคยดับ' },
    'Frost Dragon Fish': { emoji: '❄️', rarity: 'legendary', price: 1600, desc: 'ปลามังกรน้ำแข็งจากธารน้ำอาร์กติก แตะตัวแล้วหนาวจนกระดูกสั่น' },
    'Emperor Fish': { emoji: '👑', rarity: 'legendary', price: 2500, desc: 'ปลาจักรพรรดิราชาแห่งสายน้ำทั้งหมด มงกุฎทองบนหัวเปล่งแสงเทวะ' },
};

// Fish rarity catch weights (must sum to 1.0)
export const FISH_RARITY_WEIGHTS = {
    common: 0.55,
    uncommon: 0.28,
    rare: 0.13,
    legendary: 0.04
};

export const FISH_RARITY_ORDER = Object.freeze(['common', 'uncommon', 'rare', 'legendary']);

// Fishing rods are tools, not combat weapons. The server uses this same catalog
// to decide which fish tiers an equipped rod may actually claim.
export const FISHING_ROD_CONFIG = Object.freeze({
    'Fishing Rod': { tier: 'wood', label: 'คันเบ็ดไม้', maxRarity: 'common', maxRarityLabel: 'ปลาธรรมดา', price: 0, starterOnly: true },
    'Silver Fishing Rod': { tier: 'silver', label: 'คันเบ็ดเงิน', maxRarity: 'rare', maxRarityLabel: 'ปลาหายาก', price: 15000 },
    'Golden Fishing Rod': { tier: 'gold', label: 'คันเบ็ดทองคำ', maxRarity: 'legendary', maxRarityLabel: 'ปลาในตำนาน', price: 75000 },
});

export function getFishingRodConfig(itemName) {
    const name = String(itemName || '');
    const config = FISHING_ROD_CONFIG[name];
    return config ? { name, ...config } : null;
}

export function canFishingRodCatchRarity(itemName, rarity) {
    const config = getFishingRodConfig(itemName);
    const rarityIndex = FISH_RARITY_ORDER.indexOf(String(rarity || 'common'));
    const maxIndex = FISH_RARITY_ORDER.indexOf(config?.maxRarity || 'common');
    return Boolean(config && rarityIndex >= 0 && rarityIndex <= maxIndex);
}

// Map-aware fishing progression. The server and offline fallback both use this
// catalog so dangerous maps can offer genuinely better fish without trusting a
// client-supplied rarity or item name.
export const FISHING_MAP_CONFIG = Object.freeze({
    prontera: {
        label: 'Prontera River', tier: 1, danger: 'safe',
        rarityWeights: { common: 0.78, uncommon: 0.18, rare: 0.035, legendary: 0.005 },
        fish: ['Tilapia', 'Catfish', 'Carp', 'Perch', 'Goby', 'Mullet', 'Bass', 'Crucian Carp', 'Bluegill', 'Minnow', 'Rainbow Trout', 'Eel', 'Barramundi', 'Golden Koi'],
    },
    prontera_field: {
        label: 'Prontera Field', tier: 1, danger: 'safe',
        rarityWeights: { common: 0.78, uncommon: 0.18, rare: 0.035, legendary: 0.005 },
        fish: ['Tilapia', 'Catfish', 'Carp', 'Perch', 'Goby', 'Mullet', 'Bass', 'Crucian Carp', 'Bluegill', 'Minnow', 'Rainbow Trout', 'Eel', 'Barramundi', 'Golden Koi'],
    },
    payon: {
        label: 'Payon Forest', tier: 2, danger: 'low',
        rarityWeights: { common: 0.62, uncommon: 0.28, rare: 0.085, legendary: 0.015 },
        fish: ['Trout', 'Pike', 'Sunfish', 'Roach', 'Dace', 'Rainbow Trout', 'Salmon', 'Eel', 'Arapaima', 'Golden Koi', 'Arowana', 'Giant Catfish', 'Moonfish', 'Emperor Fish'],
    },
    glast_heim: {
        label: 'Glast Heim Ruins', tier: 3, danger: 'dangerous',
        rarityWeights: { common: 0.46, uncommon: 0.34, rare: 0.16, legendary: 0.04 },
        fish: ['Catfish', 'Goby', 'Sole', 'Pike', 'Eel', 'Walleye', 'Sturgeon', 'Piranha', 'Ghost Fish', 'Coelacanth', 'Anglerfish', 'Leviathan', 'Frost Dragon Fish'],
    },
    mjolnir: {
        label: 'Mjolnir Highlands', tier: 4, danger: 'very_dangerous',
        rarityWeights: { common: 0.36, uncommon: 0.36, rare: 0.21, legendary: 0.07 },
        fish: ['Perch', 'Trout', 'Dace', 'Mackerel', 'Rainbow Trout', 'Salmon', 'Sturgeon', 'Oarfish', 'Crystal Fish', 'Electric Eel', 'Marlin', 'Frost Dragon Fish', 'Emperor Fish'],
    },
    abyss_lake: {
        label: 'Abyss Lake Depths', tier: 5, danger: 'extreme',
        rarityWeights: { common: 0.22, uncommon: 0.36, rare: 0.28, legendary: 0.14 },
        fish: ['Sea Bass', 'Cod', 'Pollock', 'Tuna', 'Swordfish', 'Grouper', 'Sailfish', 'Marlin', 'Arowana', 'Anglerfish', 'Great White Shark', 'Hammerhead', 'Raja Ampat Shark', 'Leviathan', 'Phoenix Fish', 'Emperor Fish'],
    },
});

export function getFishingMapConfig(mapId = 'prontera') {
    return FISHING_MAP_CONFIG[String(mapId || '').toLowerCase()] || FISHING_MAP_CONFIG.prontera;
}

export function pickFishingCatch(mapId = 'prontera', random = Math.random, options = {}) {
    const config = getFishingMapConfig(mapId);
    const rod = getFishingRodConfig(options.rodName || options.rod || 'Fishing Rod');
    const maxRarity = options.maxRarity || rod?.maxRarity || 'common';
    const maxIndex = Math.max(0, FISH_RARITY_ORDER.indexOf(maxRarity));
    const rarityEntries = Object.entries(config.rarityWeights)
        .filter(([rarity]) => FISH_RARITY_ORDER.indexOf(rarity) <= maxIndex);
    const totalWeight = rarityEntries.reduce((sum, [, weight]) => sum + Math.max(0, Number(weight) || 0), 0) || 1;
    const roll = Math.min(0.999999999, Math.max(0, Number(random()) || 0)) * totalWeight;
    let rarity = rarityEntries[rarityEntries.length - 1]?.[0] || 'common';
    let cumulative = 0;
    for (const [candidate, weight] of rarityEntries) {
        cumulative += Math.max(0, Number(weight) || 0);
        if (roll < cumulative) { rarity = candidate; break; }
    }
    const pool = config.fish.filter(name => FISH_SPECIES[name]?.rarity === rarity);
    const fallback = config.fish.filter(name => FISH_SPECIES[name] && FISH_RARITY_ORDER.indexOf(FISH_SPECIES[name].rarity) <= maxIndex);
    const source = pool.length ? pool : fallback;
    const fishName = source[Math.min(source.length - 1, Math.floor((Number(random()) || 0) * source.length))];
    const fishData = FISH_SPECIES[fishName] || FISH_SPECIES.Tilapia;
    return {
        name: fishName || 'Tilapia',
        ...fishData,
        mapId: String(mapId || 'prontera').toLowerCase(),
        mapName: config.label,
        mapTier: config.tier,
        mapDanger: config.danger,
    };
}

// Auto-register all fish into ITEMS registry
Object.entries(FISH_SPECIES).forEach(([name, data]) => {
    ITEMS[name] = {
        emoji: data.emoji,
        type: 'fish',
        rarity: data.rarity,
        desc: data.desc,
        price: data.price,
    };
});

// ============ MONSTERS ============
// Exactly 20 beautifully designed types distributed by difficulty, color, map, drops
export const MONSTERS = {
    // ---- PRONTERA FIELDS (10 Monsters) ----
    poring: {
        name: 'Poring',
        emoji: '🟢',
        color: 0x80ff80,
        hp: 30,
        atk: 5,
        def: 2,
        exp: 15,
        gold: { min: 2, max: 8 },
        size: 0.6,
        speed: 0.5,
        environment: 'ground',
        loot: [
            { name: 'Jellopy', emoji: '💎', type: 'material', chance: 0.6 },
            { name: 'Sticky Mucus', emoji: '💧', type: 'material', chance: 0.2 },
            { name: 'Apple', emoji: '🍎', type: 'consumable', chance: 0.15 },
        ]
    },
    lunatic: {
        // Keep the internal ID for save/drop compatibility; public name/design is original.
        name: 'Moonhare',
        emoji: '🐰',
        color: 0xffe0f0,
        hp: 40,
        atk: 8,
        def: 3,
        exp: 20,
        gold: { min: 3, max: 12 },
        size: 0.5,
        speed: 0.8,
        environment: 'ground',
        loot: [
            { name: 'Clover', emoji: '🍀', type: 'material', chance: 0.5 },
            { name: 'Feather', emoji: '🪶', type: 'material', chance: 0.3 },
            { name: 'Carrot', emoji: '🥕', type: 'consumable', chance: 0.15 },
            { name: 'Sunglasses', emoji: '🕶️', type: 'glasses', chance: 0.02 },
        ]
    },
    fabre: {
        name: 'Fabre',
        emoji: '🐛',
        color: 0x80c040,
        hp: 50,
        atk: 10,
        def: 4,
        exp: 28,
        gold: { min: 5, max: 15 },
        size: 0.5,
        speed: 0.3,
        environment: 'ground',
        loot: [
            { name: 'Worm Peeling', emoji: '🧬', type: 'material', chance: 0.5 },
            { name: 'Green Herb', emoji: '🌿', type: 'consumable', chance: 0.3 },
            { name: 'Fluff', emoji: '☁️', type: 'material', chance: 0.1 },
        ]
    },
    rocker: {
        name: 'Rocker',
        emoji: '🦗',
        color: 0xc0c040,
        hp: 75,
        atk: 15,
        def: 6,
        exp: 42,
        gold: { min: 8, max: 20 },
        size: 0.7,
        speed: 0.7,
        environment: 'ground',
        loot: [
            { name: 'Scell', emoji: '🪙', type: 'material', chance: 0.5 },
            { name: 'Yellow Herb', emoji: '🌾', type: 'consumable', chance: 0.2 },
            { name: 'Tough Vine', emoji: '🪢', type: 'material', chance: 0.05 },
            { name: 'Classic Glasses', emoji: '👓', type: 'glasses', chance: 0.02 },
        ]
    },
    willow: {
        name: 'Willow',
        emoji: '🌳',
        color: 0x8b5a2b,
        hp: 110,
        atk: 18,
        def: 8,
        exp: 58,
        gold: { min: 10, max: 30 },
        size: 0.9,
        speed: 0.2,
        environment: 'ground',
        loot: [
            { name: 'Tree Root', emoji: '🪵', type: 'material', chance: 0.5 },
            { name: 'Wooden Heart', emoji: '❤️‍🔥', type: 'material', chance: 0.1 },
            { name: 'Red Herb', emoji: '🌺', type: 'consumable', chance: 0.25 },
            { name: 'Cowboy Hat', emoji: '🤠', type: 'hat', chance: 0.03 },
        ]
    },
    poporing: {
        name: 'Poporing',
        emoji: '🟣',
        color: 0xc060ff,
        hp: 160,
        atk: 24,
        def: 10,
        exp: 85,
        gold: { min: 15, max: 40 },
        size: 0.65,
        speed: 0.5,
        environment: 'ground',
        loot: [
            { name: 'Grape', emoji: '🍇', type: 'consumable', chance: 0.4 },
            { name: 'Poison Spore', emoji: '☠️', type: 'material', chance: 0.3 },
            { name: 'Blue Potion', emoji: '🧪', type: 'consumable', chance: 0.08 },
        ]
    },
    drops: {
        name: 'Drops',
        emoji: '🟠',
        color: 0xff8020,
        hp: 220,
        atk: 30,
        def: 12,
        exp: 120,
        gold: { min: 20, max: 50 },
        size: 0.6,
        speed: 0.6,
        environment: 'ground',
        loot: [
            { name: 'Orange Juice', emoji: '🧃', type: 'consumable', chance: 0.3 },
            { name: 'Sticky Webfoot', emoji: '🦶', type: 'material', chance: 0.2 },
            { name: 'Gold Sand', emoji: '✨', type: 'material', chance: 0.06 },
        ]
    },
    deviruchi: {
        name: 'Deviruchi',
        emoji: '😈',
        color: 0x3a005a, // Deep Purple
        hp: 400,
        atk: 55,
        def: 25,
        exp: 280,
        gold: { min: 50, max: 120 },
        size: 0.6,
        speed: 0.9,
        environment: 'cave',
        loot: [
            { name: 'Devil Horn', emoji: '😈', type: 'material', chance: 0.3 },
            { name: 'Coal', emoji: '🖤', type: 'material', chance: 0.4 },
            { name: 'Silver Ring', emoji: '💍', type: 'armor', chance: 0.05 },
            { name: 'Katana', emoji: '⚔️', type: 'weapon', chance: 0.02 },
            { name: 'Wizard Hat', emoji: '🧙', type: 'hat', chance: 0.03 },
        ]
    },
    ghostring: {
        name: 'Ghostring',
        emoji: '👻',
        color: 0xe0e0ff, // Translucent Light Blue
        hp: 1200,
        atk: 90,
        def: 45,
        exp: 990,
        gold: { min: 200, max: 500 },
        size: 0.75,
        speed: 0.4,
        environment: 'cave',
        loot: [
            { name: 'Ghostly Essence', emoji: '👻', type: 'material', chance: 0.4 },
            { name: 'Pure Emperium', emoji: '🔮', type: 'material', chance: 0.08 },
            { name: 'Yggdrasil Berry', emoji: '🍇', type: 'consumable', chance: 0.05 },
            { name: 'Excalibur', emoji: '🗡️', type: 'weapon', chance: 0.01 },
            { name: 'Ragnarok Blade', emoji: '🔱', type: 'weapon', chance: 0.002 }, // Ultra rare mythic
            { name: 'Crown', emoji: '👑', type: 'hat', chance: 0.01 },
        ]
    }
};

// ============ PAYON FOREST MONSTERS ============
export const PAYON_MONSTERS = {
    horn: {
        name: 'Horn',
        emoji: '🪲',
        color: 0x8a6040,
        hp: 130,
        atk: 22,
        def: 14,
        exp: 70,
        gold: { min: 12, max: 35 },
        size: 0.7,
        speed: 0.3,
        environment: 'ground',
        loot: [
            { name: 'Scell', emoji: '🪙', type: 'material', chance: 0.5 },
            { name: 'Single Horn', emoji: '🌵', type: 'material', chance: 0.3 },
            { name: 'Yellow Herb', emoji: '🌾', type: 'consumable', chance: 0.2 },
        ]
    },
    savage: {
        name: 'Savage',
        emoji: '🐗',
        color: 0x8a5030,
        hp: 240,
        atk: 32,
        def: 18,
        exp: 110,
        gold: { min: 20, max: 50 },
        size: 0.9,
        speed: 0.7,
        environment: 'ground',
        loot: [
            { name: 'Animal Skin', emoji: '🥩', type: 'material', chance: 0.45 },
            { name: 'Tough Vine', emoji: '🪢', type: 'material', chance: 0.25 },
            { name: 'Honey', emoji: '🍯', type: 'consumable', chance: 0.15 },
            { name: 'Cowboy Hat', emoji: '🤠', type: 'hat', chance: 0.04 },
        ]
    },
    boa: {
        name: 'Boa',
        emoji: '🐍',
        color: 0x40a040,
        hp: 190,
        atk: 28,
        def: 11,
        exp: 95,
        gold: { min: 15, max: 45 },
        size: 0.6,
        speed: 0.6,
        environment: 'ground',
        loot: [
            { name: 'Poison Spore', emoji: '☠️', type: 'material', chance: 0.4 },
            { name: 'Snake Scale', emoji: '🐍', type: 'material', chance: 0.3 },
            { name: 'Red Herb', emoji: '🌺', type: 'consumable', chance: 0.2 },
        ]
    },
    spore: {
        name: 'Spore',
        emoji: '🍄',
        color: 0xff6666, // Reddish pink fungi
        hp: 90,
        atk: 16,
        def: 7,
        exp: 50,
        gold: { min: 8, max: 22 },
        size: 0.6,
        speed: 0.4,
        environment: 'cave',
        loot: [
            { name: 'Poison Spore', emoji: '☠️', type: 'material', chance: 0.5 },
            { name: 'Spore Powder', emoji: '💨', type: 'material', chance: 0.3 },
            { name: 'Green Herb', emoji: '🌿', type: 'consumable', chance: 0.2 },
        ]
    },
    bigfoot: {
        name: 'Bigfoot',
        emoji: '🐻',
        color: 0x6a4020,
        hp: 360,
        atk: 45,
        def: 22,
        exp: 180,
        gold: { min: 30, max: 70 },
        size: 1.1,
        speed: 0.4,
        environment: 'mountain',
        loot: [
            { name: 'Big Bigfoot Claw', emoji: '🐾', type: 'material', chance: 0.35 },
            { name: 'Royal Jelly', emoji: '🧪', type: 'consumable', chance: 0.1 },
            { name: 'Oridecon Stone', emoji: '🧱', type: 'material', chance: 0.08 },
            { name: 'Iron Shield', emoji: '🛡️', type: 'shield', chance: 0.05 }
        ]
    },
    nine_tail: {
        name: 'Nine Tail',
        emoji: '🦊',
        color: 0xffa500, // Vibrant Orange
        hp: 550,
        atk: 65,
        def: 30,
        exp: 380,
        gold: { min: 80, max: 180 },
        size: 0.85,
        speed: 0.9,
        environment: 'mountain',
        loot: [
            { name: 'Nine Tail Fur', emoji: '🦊', type: 'material', chance: 0.4 },
            { name: 'Gilding Ingot', emoji: '🧱', type: 'material', chance: 0.1 },
            { name: 'Ranger Hood', emoji: '🦹', type: 'armor', chance: 0.04 },
            { name: 'Rudra Bow', emoji: '🏹', type: 'weapon', chance: 0.01 },
            { name: 'Wizard Hat', emoji: '🧙', type: 'hat', chance: 0.02 },
            { name: 'Sunglasses', emoji: '🕶️', type: 'glasses', chance: 0.03 },
        ]
    }
};

// ============ GLAST HEIM MONSTERS ============
export const GLAST_MONSTERS = {
    skeleton: {
        name: 'Skeleton',
        emoji: '💀',
        color: 0xe0e0c0,
        hp: 650,
        atk: 78,
        def: 35,
        exp: 420,
        gold: { min: 60, max: 150 },
        size: 0.8,
        speed: 0.5,
        environment: 'cave',
        loot: [
            { name: 'Decay Tooth', emoji: '🦷', type: 'material', chance: 0.5 },
            { name: 'Rusty Screw', emoji: '🔩', type: 'material', chance: 0.3 },
            { name: 'Red Potion', emoji: '🧪', type: 'consumable', chance: 0.15 },
            { name: 'Iron Helm', emoji: '🪖', type: 'armor', chance: 0.05 },
        ]
    },
    zombie: {
        name: 'Zombie',
        emoji: '🧟',
        color: 0x607050,
        hp: 800,
        atk: 88,
        def: 40,
        exp: 520,
        gold: { min: 70, max: 180 },
        size: 0.85,
        speed: 0.3,
        environment: 'cave',
        loot: [
            { name: 'Animal Skin', emoji: '🥩', type: 'material', chance: 0.4 },
            { name: 'Decay Tooth', emoji: '🦷', type: 'material', chance: 0.35 },
            { name: 'Red Potion', emoji: '🧪', type: 'consumable', chance: 0.12 },
            { name: 'Elunium Stone', emoji: '🌫️', type: 'material', chance: 0.06 },
        ]
    },
    archer_skeleton: {
        name: 'Archer Skeleton',
        emoji: '🏹',
        color: 0xd0c8a0,
        hp: 900,
        atk: 105,
        def: 30,
        exp: 680,
        gold: { min: 90, max: 220 },
        size: 0.8,
        speed: 0.6,
        environment: 'cave',
        loot: [
            { name: 'Decay Tooth', emoji: '🦷', type: 'material', chance: 0.45 },
            { name: 'Oridecon Stone', emoji: '🧱', type: 'material', chance: 0.12 },
            { name: 'Crossbow', emoji: '🏹', type: 'weapon', chance: 0.03 },
            { name: 'Silver Dagger', emoji: '🗡️', type: 'weapon', chance: 0.02 },
        ]
    },
    raydric: {
        name: 'Raydric',
        emoji: '🗡️',
        color: 0x3a2050,
        hp: 1400,
        atk: 140,
        def: 65,
        exp: 1100,
        gold: { min: 150, max: 380 },
        size: 1.0,
        speed: 0.7,
        environment: 'cave',
        loot: [
            { name: 'Zargon', emoji: '💎', type: 'material', chance: 0.4 },
            { name: 'Phracon', emoji: '⚒️', type: 'material', chance: 0.2 },
            { name: 'Steel Plate Mail', emoji: '🛡️', type: 'armor', chance: 0.04 },
            { name: 'Shadow Garment', emoji: '🧥', type: 'armor', chance: 0.03 },
            { name: 'Katana', emoji: '⚔️', type: 'weapon', chance: 0.02 },
        ]
    },
    hunter_fly: {
        name: 'Hunter Fly',
        emoji: '🪰',
        color: 0x204020,
        hp: 1100,
        atk: 125,
        def: 50,
        exp: 880,
        gold: { min: 120, max: 300 },
        size: 0.6,
        speed: 1.2,
        environment: 'cave',
        loot: [
            { name: 'Monster Claw', emoji: '🎯', type: 'material', chance: 0.45 },
            { name: 'Zargon', emoji: '💎', type: 'material', chance: 0.25 },
            { name: 'Wind Element Stone', emoji: '🌀', type: 'material', chance: 0.08 },
            { name: 'Crossbow', emoji: '🏹', type: 'weapon', chance: 0.02 },
        ]
    },
    dullahan: {
        name: 'Dullahan',
        emoji: '🎃',
        color: 0x1a0a2a,
        hp: 4500,
        atk: 220,
        def: 110,
        exp: 4800,
        gold: { min: 500, max: 1200 },
        size: 1.2,
        speed: 0.5,
        environment: 'cave',
        loot: [
            { name: 'Pure Emperium', emoji: '🔮', type: 'material', chance: 0.15 },
            { name: 'Ghostly Essence', emoji: '👻', type: 'material', chance: 0.2 },
            { name: 'Yggdrasil Berry', emoji: '🍇', type: 'consumable', chance: 0.08 },
            { name: 'Excalibur', emoji: '🗡️', type: 'weapon', chance: 0.02 },
            { name: 'Dragon Scale Mail', emoji: '🥋', type: 'armor', chance: 0.01 },
            { name: 'Ragnarok Blade', emoji: '🔱', type: 'weapon', chance: 0.003 },
        ]
    }
};

// ============ MJOLNIR MONSTERS ============
export const MJOLNIR_MONSTERS = {
    golem: {
        name: 'Golem',
        emoji: '🪨',
        color: 0x808070,
        hp: 1200,
        atk: 130,
        def: 80,
        exp: 900,
        gold: { min: 100, max: 260 },
        size: 1.1,
        speed: 0.3,
        environment: 'mountain',
        loot: [
            { name: 'Iron Ore', emoji: '🪨', type: 'material', chance: 0.5 },
            { name: 'Oridecon Stone', emoji: '🧱', type: 'material', chance: 0.2 },
            { name: 'Elunium Stone', emoji: '🌫️', type: 'material', chance: 0.1 },
            { name: 'Iron Shield', emoji: '🛡️', type: 'shield', chance: 0.05 },
        ]
    },
    stone_golem: {
        name: 'Stone Golem',
        emoji: '🗿',
        color: 0x606060,
        hp: 1600,
        atk: 155,
        def: 100,
        exp: 1200,
        gold: { min: 140, max: 340 },
        size: 1.2,
        speed: 0.25,
        environment: 'mountain',
        loot: [
            { name: 'Iron Ore', emoji: '🪨', type: 'material', chance: 0.5 },
            { name: 'Phracon', emoji: '⚒️', type: 'material', chance: 0.25 },
            { name: 'Gilding Ingot', emoji: '🧱', type: 'material', chance: 0.1 },
            { name: 'Tear Shield', emoji: '🛡️', type: 'shield', chance: 0.04 },
        ]
    },
    harpy: {
        name: 'Harpy',
        emoji: '🦅',
        color: 0xa08040,
        hp: 1350,
        atk: 160,
        def: 60,
        exp: 1100,
        gold: { min: 130, max: 320 },
        size: 0.9,
        speed: 1.1,
        environment: 'mountain',
        loot: [
            { name: 'Feather', emoji: '🪶', type: 'material', chance: 0.5 },
            { name: 'Wind Element Stone', emoji: '🌀', type: 'material', chance: 0.15 },
            { name: 'Ranger Hood', emoji: '🦹', type: 'armor', chance: 0.04 },
            { name: 'Rudra Bow', emoji: '🏹', type: 'weapon', chance: 0.02 },
        ]
    },
    gargoyle: {
        name: 'Gargoyle',
        emoji: '🦇',
        color: 0x504060,
        hp: 1800,
        atk: 180,
        def: 75,
        exp: 1500,
        gold: { min: 180, max: 450 },
        size: 1.0,
        speed: 0.9,
        environment: 'mountain',
        loot: [
            { name: 'Monster Claw', emoji: '🎯', type: 'material', chance: 0.4 },
            { name: 'Zargon', emoji: '💎', type: 'material', chance: 0.3 },
            { name: 'Fire Element Stone', emoji: '🔥', type: 'material', chance: 0.1 },
            { name: 'Gorgon Ring', emoji: '💍', type: 'armor', chance: 0.03 },
        ]
    },
    iron_golem: {
        name: 'Iron Golem',
        emoji: '🤖',
        color: 0x405060,
        hp: 2200,
        atk: 200,
        def: 120,
        exp: 1900,
        gold: { min: 220, max: 550 },
        size: 1.3,
        speed: 0.2,
        environment: 'mountain',
        loot: [
            { name: 'Iron Ore', emoji: '🪨', type: 'material', chance: 0.5 },
            { name: 'Phracon', emoji: '⚒️', type: 'material', chance: 0.3 },
            { name: 'Gilding Ingot', emoji: '🧱', type: 'material', chance: 0.15 },
            { name: 'Steel Plate Mail', emoji: '🛡️', type: 'armor', chance: 0.04 },
            { name: 'Heavy Warhammer', emoji: '🔨', type: 'weapon', chance: 0.02 },
        ]
    },
    storm_dragon: {
        name: 'Storm Dragon',
        emoji: '🐉',
        color: 0x2040a0,
        hp: 6000,
        atk: 280,
        def: 150,
        exp: 7500,
        gold: { min: 800, max: 2000 },
        size: 1.5,
        speed: 0.6,
        environment: 'mountain',
        loot: [
            { name: 'Pure Emperium', emoji: '🔮', type: 'material', chance: 0.2 },
            { name: 'Wind Element Stone', emoji: '🌀', type: 'material', chance: 0.3 },
            { name: 'Fire Element Stone', emoji: '🔥', type: 'material', chance: 0.25 },
            { name: 'Dragon Scale Mail', emoji: '🥋', type: 'armor', chance: 0.02 },
            { name: 'Odin Garment', emoji: '🧥', type: 'armor', chance: 0.01 },
            { name: 'Ragnarok Blade', emoji: '🔱', type: 'weapon', chance: 0.005 },
        ]
    }
};

// ============ ABYSS LAKE MONSTERS ============
export const ABYSS_MONSTERS = {
    dragon_egg: {
        name: 'Dragon Egg',
        emoji: '🥚',
        color: 0x4060a0,
        hp: 1800,
        atk: 160,
        def: 90,
        exp: 1400,
        gold: { min: 160, max: 400 },
        size: 0.7,
        speed: 0.2,
        environment: 'water',
        loot: [
            { name: 'Crystal Blue', emoji: '🔵', type: 'material', chance: 0.4 },
            { name: 'Hard Shell', emoji: '🐚', type: 'material', chance: 0.35 },
            { name: 'Yggdrasil Seed', emoji: '🌱', type: 'consumable', chance: 0.08 },
        ]
    },
    sea_dragon: {
        name: 'Sea Dragon',
        emoji: '🐲',
        color: 0x1a4080,
        hp: 2500,
        atk: 210,
        def: 100,
        exp: 2200,
        gold: { min: 250, max: 620 },
        size: 1.2,
        speed: 0.7,
        environment: 'water',
        loot: [
            { name: 'Pointed Scale', emoji: '🦈', type: 'material', chance: 0.45 },
            { name: 'Crystal Blue', emoji: '🔵', type: 'material', chance: 0.2 },
            { name: 'Fire Element Stone', emoji: '🔥', type: 'material', chance: 0.1 },
            { name: 'Golden Shield', emoji: '🛡️', type: 'shield', chance: 0.02 },
        ]
    },
    leib_olmai: {
        name: 'Leib Olmai',
        emoji: '🐻',
        color: 0x203050,
        hp: 3000,
        atk: 240,
        def: 130,
        exp: 2800,
        gold: { min: 320, max: 800 },
        size: 1.3,
        speed: 0.5,
        environment: 'cave',
        loot: [
            { name: 'Animal Skin', emoji: '🥩', type: 'material', chance: 0.4 },
            { name: 'Gilding Ingot', emoji: '🧱', type: 'material', chance: 0.2 },
            { name: 'Lord Potion', emoji: '🧪', type: 'consumable', chance: 0.06 },
            { name: 'Odin Garment', emoji: '🧥', type: 'armor', chance: 0.02 },
        ]
    },
    dark_illusion: {
        name: 'Dark Illusion',
        emoji: '🌑',
        color: 0x0a0a20,
        hp: 3500,
        atk: 270,
        def: 140,
        exp: 3500,
        gold: { min: 400, max: 1000 },
        size: 0.9,
        speed: 1.0,
        environment: 'cave',
        loot: [
            { name: 'Ghostly Essence', emoji: '👻', type: 'material', chance: 0.3 },
            { name: 'Pure Emperium', emoji: '🔮', type: 'material', chance: 0.15 },
            { name: 'Yggdrasil Berry', emoji: '🍇', type: 'consumable', chance: 0.06 },
            { name: 'Glow Ring', emoji: '💍', type: 'armor', chance: 0.02 },
            { name: 'Aegis of Olympus', emoji: '🌌', type: 'shield', chance: 0.005 },
        ]
    },
    abyss_knight: {
        name: 'Abyss Knight',
        emoji: '⚔️',
        color: 0x102040,
        hp: 8000,
        atk: 350,
        def: 200,
        exp: 12000,
        gold: { min: 1200, max: 3000 },
        size: 1.4,
        speed: 0.6,
        environment: 'cave',
        loot: [
            { name: 'Pure Emperium', emoji: '🔮', type: 'material', chance: 0.25 },
            { name: 'Ghostly Essence', emoji: '👻', type: 'material', chance: 0.2 },
            { name: 'Yggdrasil Berry', emoji: '🍇', type: 'consumable', chance: 0.1 },
            { name: 'Valkyrie Armor', emoji: '👑', type: 'armor', chance: 0.01 },
            { name: 'Aegis of Olympus', emoji: '🌌', type: 'shield', chance: 0.008 },
            { name: 'Ragnarok Blade', emoji: '🔱', type: 'weapon', chance: 0.005 },
        ]
    }
};

// ============ AMBIENT AQUATIC ACTORS ============
// These species live in the water as scenery only. They never participate in
// combat, targeting, HP, EXP, gold, or monster loot flows.
export const AMBIENT_WATER_TYPES = Object.freeze(['shrimp', 'clam', 'fish', 'crab', 'marina']);
export const WATER_MONSTERS = {
    shrimp: {
        ambientOnly: true,
        name: 'Shrimp',
        emoji: '🦐',
        color: 0xff6060,
        hp: 35,
        atk: 6,
        def: 2,
        exp: 18,
        gold: { min: 3, max: 10 },
        size: 0.4,
        speed: 0.7,
        waterOnly: true,
        environment: 'water',
        loot: [
            { name: 'Sticky Mucus', emoji: '💧', type: 'material', chance: 0.5 },
            { name: 'Apple', emoji: '🍎', type: 'consumable', chance: 0.2 },
        ]
    },
    clam: {
        // Ambient-only aquatic actor: retained for legacy model/card data but
        // excluded from every combat spawn table and reward path.
        ambientOnly: true,
        name: 'Clam',
        emoji: '🐚',
        color: 0xd0b890,
        hp: 65,
        atk: 5,
        def: 16,
        exp: 28,
        gold: { min: 8, max: 20 },
        size: 0.45,
        speed: 0.1,
        waterOnly: true,
        environment: 'water',
        loot: [
            { name: 'Hard Shell', emoji: '🐚', type: 'material', chance: 0.5 },
            { name: 'Crystal Blue', emoji: '🔵', type: 'material', chance: 0.1 },
        ]
    },
    fish: {
        ambientOnly: true,
        name: 'Fish',
        emoji: '🐟',
        color: 0x4080ff,
        hp: 55,
        atk: 13,
        def: 5,
        exp: 33,
        gold: { min: 5, max: 18 },
        size: 0.5,
        speed: 1.0,
        waterOnly: true,
        environment: 'water',
        loot: [
            { name: 'Sticky Webfoot', emoji: '🦶', type: 'material', chance: 0.4 },
            { name: 'Carrot', emoji: '🥕', type: 'consumable', chance: 0.2 },
        ]
    },
    crab: {
        ambientOnly: true,
        name: 'Crab',
        emoji: '🦀',
        color: 0xe04040,
        hp: 90,
        atk: 18,
        def: 12,
        exp: 48,
        gold: { min: 10, max: 25 },
        size: 0.55,
        speed: 0.4,
        waterOnly: true,
        environment: 'water',
        loot: [
            { name: 'Scell', emoji: '🪙', type: 'material', chance: 0.4 },
            { name: 'Green Herb', emoji: '🌿', type: 'consumable', chance: 0.25 },
            { name: 'Copper Coin', emoji: '🪙', type: 'material', chance: 0.1 },
            { name: 'Classic Glasses', emoji: '👓', type: 'glasses', chance: 0.03 },
        ]
    },
    marina: {
        ambientOnly: true,
        name: 'Marina',
        emoji: '🦑',
        color: 0xadd8e6, // Pale Ice Blue
        hp: 280,
        atk: 36,
        def: 15,
        exp: 150,
        gold: { min: 25, max: 60 },
        size: 0.6,
        speed: 0.8,
        waterOnly: true,
        environment: 'water',
        loot: [
            { name: 'Squid Ink', emoji: '🖤', type: 'material', chance: 0.45 },
            { name: 'Pointed Scale', emoji: '🦈', type: 'material', chance: 0.3 },
            { name: 'Crystal Blue', emoji: '🔵', type: 'material', chance: 0.12 },
            { name: 'Tear Shield', emoji: '🛡️', type: 'shield', chance: 0.03 },
            { name: 'Crown', emoji: '👑', type: 'hat', chance: 0.02 },
        ]
    }
};

// ============ NEW MAP ITEMS (added for Glast Heim, Mjolnir, Abyss Lake) ============
// These items are referenced in loot tables above and need to be in ITEMS for shop/wiki
Object.assign(ITEMS, {
    'Wind Element Stone': { emoji: '🌀', type: 'material', rarity: 'rare', desc: 'หินธาตุลมบริสุทธิ์ สั่นสะเทือนด้วยพลังพายุ ใช้อัพเกรดอาวุธธาตุลม', price: 350 },
    'Fire Element Stone': { emoji: '🔥', type: 'material', rarity: 'rare', desc: 'หินธาตุไฟลุกโชน อุณหภูมิสูงกว่าเตาหลอมทั่วไป ใช้อัพเกรดอาวุธธาตุไฟ', price: 350 },
    'Gilding Ingot': { emoji: '🧱', type: 'material', rarity: 'rare', desc: 'แท่งโลหะชุบทองคำบริสุทธิ์ ใช้สำหรับตีบวกอาวุธและชุดเกราะระดับสูง', price: 500 },
    'Iron Helm': { emoji: '🪖', type: 'armor', rarity: 'rare', desc: 'หมวกเหล็กกล้าหนาแน่น ป้องกันหัวได้ยอดเยี่ยม (DEF +12, HP +80)', price: 600, defBonus: 12, hpBonus: 80 },
    'Steel Plate Mail': { emoji: '🛡️', type: 'armor', rarity: 'epic', desc: 'ชุดเกราะเหล็กกล้าเต็มตัว ทนทานสุดขีดสำหรับนักรบระดับสูง (DEF +28, HP +200)', price: 2500, defBonus: 28, hpBonus: 200 },
    'Shadow Garment': { emoji: '🧥', type: 'armor', rarity: 'epic', desc: 'เสื้อคลุมเงาจากผ้าพิเศษ เพิ่มความเร็วและลดการตรวจจับ (DEF +15, HP +120)', price: 1800, defBonus: 15, hpBonus: 120 },
    'Crossbow': { emoji: '🏹', type: 'weapon', rarity: 'rare', desc: 'หน้าไม้แม่นยำสูง ยิงได้ไกลและแรงกว่าธนูทั่วไป (ATK +35)', price: 1200, atkBonus: 35 },
    'Silver Dagger': { emoji: '🗡️', type: 'weapon', rarity: 'rare', desc: 'มีดสั้นเงินบริสุทธิ์ มีประสิทธิภาพพิเศษต่อสัตว์ผีและอสูร (ATK +28)', price: 900, atkBonus: 28 },
    'Gorgon Ring': { emoji: '💍', type: 'armor', rarity: 'epic', desc: 'แหวนหินกอร์กอน เพิ่มพลังป้องกันและต้านทานสถานะ (DEF +10, HP +150)', price: 2000, defBonus: 10, hpBonus: 150 },
    'Heavy Warhammer': { emoji: '🔨', type: 'weapon', rarity: 'epic', desc: 'ค้อนสงครามหนักมหึมา ทำลายล้างสูงสุดสำหรับนักรบแนวหน้า (ATK +60)', price: 3000, atkBonus: 60 },
    'Glow Ring': { emoji: '💍', type: 'armor', rarity: 'epic', desc: 'แหวนเรืองแสงจากความมืด เพิ่มพลังเวทมนตร์และ SP สูงสุด (DEF +8, HP +100)', price: 2200, defBonus: 8, hpBonus: 100 },
    'Dragon Scale Mail': { emoji: '🦎', type: 'armor', rarity: 'legendary', desc: 'ชุดเกราะเกล็ดมังกรแท้ ป้องกันสูงสุดในโลก (DEF +45, HP +400)', price: 8000, defBonus: 45, hpBonus: 400 },
    'Odin Garment': { emoji: '🧥', type: 'armor', rarity: 'legendary', desc: 'เสื้อคลุมของโอดิน เทพแห่งสงคราม เพิ่มทุก stat อย่างมหาศาล (DEF +35, HP +300)', price: 6000, defBonus: 35, hpBonus: 300 },
    'Valkyrie Armor': { emoji: '👑', type: 'armor', rarity: 'legendary', desc: 'ชุดเกราะวาลคีรีจากสวรรค์ ป้องกันสูงสุดและเพิ่มพลังชีวิตมหาศาล (DEF +50, HP +500)', price: 10000, defBonus: 50, hpBonus: 500 },
    'Aegis of Olympus': { emoji: '🌌', type: 'shield', rarity: 'mythic', desc: 'โล่ศักดิ์สิทธิ์แห่งโอลิมปัส ป้องกันทุกอย่างได้ (DEF +60)', price: 15000, defBonus: 60 },
    'Golden Shield': { emoji: '🛡️', type: 'shield', rarity: 'legendary', desc: 'โล่ทองคำบริสุทธิ์จากใต้ทะเล ป้องกันสูงมาก (DEF +40)', price: 5000, defBonus: 40 },
    'Lord Potion': { emoji: '🧪', type: 'consumable', rarity: 'legendary', desc: 'ยาโพชั่นระดับ Lord ฟื้นฟู HP +1500 และ SP +200 ทันที', price: 3000, healHp: 1500, restoreSp: 200 },
    'Yggdrasil Seed': { emoji: '🌱', type: 'consumable', rarity: 'epic', desc: 'เมล็ดพันธุ์แห่งต้นยักษ์ Yggdrasil ฟื้นฟู HP +800 ทันที', price: 1500, healHp: 800 },

    // ---- CARDS (Socketable items) ----
    'Poring Card': { emoji: '🃏', type: 'card', rarity: 'rare', desc: 'การ์ดโพริ่ง: เพิ่ม HP +50', hpBonus: 50, price: 1000 },
    'Fabre Card': { emoji: '🃏', type: 'card', rarity: 'rare', desc: 'การ์ดฟาเบร: เพิ่ม HP +80', hpBonus: 80, price: 1500 },
    'Rocker Card': { emoji: '🃏', type: 'card', rarity: 'rare', desc: 'การ์ดร็อคเกอร์: เพิ่ม ATK +5', atkBonus: 5, price: 2000 },
    'Willow Card': { emoji: '🃏', type: 'card', rarity: 'rare', desc: 'การ์ดวิลโลว์: เพิ่ม SP +30', spBonus: 30, price: 1800 },
    'Andre Card': { emoji: '🃏', type: 'card', rarity: 'epic', desc: 'การ์ดอังเดร: เพิ่ม ATK +20', atkBonus: 20, price: 5000 },
    'Vitata Card': { emoji: '🃏', type: 'card', rarity: 'epic', desc: 'การ์ดวิตาต้า: เพิ่ม SP +100', spBonus: 100, price: 6000 },
});

// ============ SKILLS ============
export const SKILLS = {
    bash: {
        id: 'bash',
        name: 'Bash',
        emoji: '⚔️',
        desc: 'สกิลโจมตีทางกายภาพพลังแรง ดีลดาเมจ 1.5 เท่าต่อเป้าหมายเดี่ยว',
        type: 'physical',
        target: 'single',
        damageMultiplier: 1.5,
        spCost: 8,
        cooldown: 3,
        hotkey: '1',
        color: 0xff6040,
    },
    heal: {
        id: 'heal',
        name: 'Heal',
        emoji: '💚',
        desc: 'เวทมนตร์ศักดิ์สิทธิ์ฟื้นฟูพลังชีวิต HP ตาม Level x 8 + ATK',
        type: 'heal',
        target: 'self',
        healBase: 8,
        spCost: 15,
        cooldown: 5,
        hotkey: '2',
        color: 0x40ff60,
    },
    magnumBreak: {
        id: 'magnumBreak',
        name: 'Magnum Break',
        emoji: '🔥',
        desc: 'ระเบิดพลังไฟรอบตัว ดีลดาเมจ 2 เท่าแก่มอนสเตอร์รอบ 5 หน่วย พร้อมเอฟเฟกต์ไฟ',
        type: 'physical_aoe',
        target: 'aoe',
        damageMultiplier: 2.0,
        aoeRange: 5,
        spCost: 20,
        cooldown: 8,
        hotkey: '3',
        color: 0xff4000,
    },

    // ---- Swordsman ----
    endure: {
        id: 'endure',
        name: 'Endure',
        emoji: '🛡️',
        desc: 'ตั้งการ์ดรับแรง เพิ่มพลังป้องกัน DEF +60% นาน 12 วินาที',
        type: 'buff',
        target: 'self',
        buffStat: 'def',
        buffPct: 0.6,
        buffDuration: 12,
        spCost: 14,
        cooldown: 20,
        color: 0xc0c0ff,
    },

    // ---- Mage ----
    fireBolt: {
        id: 'fireBolt',
        name: 'Fire Bolt',
        emoji: '🔥',
        desc: 'ยิงลูกไฟใส่เป้าหมายเดี่ยวจากระยะไกล ดีลดาเมจ 2.2 เท่า',
        type: 'magic',
        target: 'single',
        damageMultiplier: 2.2,
        castRange: 9,
        spCost: 12,
        cooldown: 3,
        color: 0xff6020,
    },
    frostNova: {
        id: 'frostNova',
        name: 'Frost Nova',
        emoji: '❄️',
        desc: 'แผ่ความเย็นเยือกรอบตัว ดีลดาเมจ 1.8 เท่าแก่ศัตรูรอบ 6 หน่วย',
        type: 'magic_aoe',
        target: 'aoe',
        damageMultiplier: 1.8,
        aoeRange: 6,
        spCost: 24,
        cooldown: 9,
        color: 0x60d0ff,
    },
    energyCoat: {
        id: 'energyCoat',
        name: 'Energy Coat',
        emoji: '🔮',
        desc: 'ห่อหุ้มร่างด้วยมานา เพิ่มพลังป้องกัน DEF +45% นาน 15 วินาที',
        type: 'buff',
        target: 'self',
        buffStat: 'def',
        buffPct: 0.45,
        buffDuration: 15,
        spCost: 18,
        cooldown: 22,
        color: 0x9060ff,
    },

    // ---- Archer ----
    doubleStrafe: {
        id: 'doubleStrafe',
        name: 'Double Strafe',
        emoji: '🏹',
        desc: 'ยิงธนูสองดอกรวดเดียวจากระยะไกล ดีลดาเมจ 2.4 เท่าต่อเป้าหมายเดี่ยว',
        type: 'physical',
        target: 'single',
        damageMultiplier: 2.4,
        castRange: 10,
        spCost: 14,
        cooldown: 4,
        color: 0x80ff80,
    },
    arrowShower: {
        id: 'arrowShower',
        name: 'Arrow Shower',
        emoji: '🌧️',
        desc: 'ระดมยิงธนูลงมาเป็นวงกว้าง ดีลดาเมจ 1.6 เท่าแก่ศัตรูรอบ 6 หน่วย',
        type: 'physical_aoe',
        target: 'aoe',
        damageMultiplier: 1.6,
        aoeRange: 6,
        spCost: 20,
        cooldown: 7,
        color: 0xa0ff60,
    },
    concentration: {
        id: 'concentration',
        name: 'Concentration',
        emoji: '🎯',
        desc: 'เพ่งสมาธิเล็งเป้า เพิ่มพลังโจมตี ATK +40% นาน 15 วินาที',
        type: 'buff',
        target: 'self',
        buffStat: 'atk',
        buffPct: 0.4,
        buffDuration: 15,
        spCost: 16,
        cooldown: 22,
        color: 0xffd24a,
    },

    // ---- Priest ----
    holyLight: {
        id: 'holyLight',
        name: 'Holy Light',
        emoji: '✨',
        desc: 'สาดลำแสงศักดิ์สิทธิ์ใส่เป้าหมายเดี่ยว ดีลดาเมจ 2 เท่าจากระยะไกล',
        type: 'magic',
        target: 'single',
        damageMultiplier: 2.0,
        castRange: 9,
        spCost: 13,
        cooldown: 4,
        color: 0xffffa0,
    },
    blessing: {
        id: 'blessing',
        name: 'Blessing',
        emoji: '🙏',
        desc: 'สวดอวยพรให้ตนเอง เพิ่มพลังโจมตี ATK +35% นาน 18 วินาที',
        type: 'buff',
        target: 'self',
        buffStat: 'atk',
        buffPct: 0.35,
        buffDuration: 18,
        spCost: 18,
        cooldown: 25,
        color: 0xfff0a0,
    },
};

// ============ JOBS ============
// Four paths that differ purely by their skill set (stats and gear are shared).
// Chosen at JOB_UNLOCK_LEVEL; changeable later for JOB_CHANGE_COST Zeny.
// A character with job = null is still a Novice and uses NOVICE_SKILLS.
export const JOB_UNLOCK_LEVEL = 1; // pick a class from the very start
export const JOB_CHANGE_COST = 50000;
export const NOVICE_SKILLS = ['bash', 'heal'];

// Each job carries an identity stat profile (STR/AGI/INT, 1–10 for display) and
// combat modifiers applied non-destructively over the character's base stats,
// so the four classes actually play differently:
//   Swordsman — STR bruiser: most HP/DEF, low SP.
//   Archer    — AGI marksman: highest ATK, fragile, agile.
//   Mage      — INT nuker: huge SP + spell power, very squishy.
//   Priest    — INT support: big SP, durable, lower ATK.
export const JOBS = {
    swordsman: {
        id: 'swordsman',
        name: 'นักดาบ',
        nameEn: 'Swordsman',
        emoji: '⚔️',
        role: 'แนวหน้า ถึกทน (Tank / Bruiser)',
        desc: 'สายประชิดตัวถึกทน ตีหนักและยืนรับได้นาน เหมาะกับการบุกเข้าไปกลางฝูง',
        skills: ['bash', 'magnumBreak', 'endure'],
        stats: { str: 9, agi: 5, int: 2 },
        mods: { hp: 1.30, sp: 0.70, atk: 1.05, def: 1.30 },
    },
    mage: {
        id: 'mage',
        name: 'จอมเวทย์',
        nameEn: 'Mage',
        emoji: '🔮',
        role: 'เวทกวาดล้าง (Burst Caster)',
        desc: 'สายเวทมนตร์ระยะไกล เก่งการกวาดศัตรูเป็นกลุ่มด้วยเวทพลังสูง แต่ตัวบอบบาง',
        skills: ['fireBolt', 'frostNova', 'energyCoat'],
        stats: { str: 2, agi: 4, int: 10 },
        mods: { hp: 0.75, sp: 1.60, atk: 1.15, def: 0.80 },
    },
    archer: {
        id: 'archer',
        name: 'นักธนู',
        nameEn: 'Archer',
        emoji: '🏹',
        role: 'ยิงไกล ดาเมจสูง (Agile DPS)',
        desc: 'สายยิงระยะไกล ดาเมจต่อเป้าหมายเดี่ยวสูงที่สุด ว่องไว และเสริมพลังโจมตีตัวเองได้',
        skills: ['doubleStrafe', 'arrowShower', 'concentration'],
        stats: { str: 6, agi: 9, int: 3 },
        mods: { hp: 0.90, sp: 0.90, atk: 1.20, def: 0.85 },
    },
    priest: {
        id: 'priest',
        name: 'พระ',
        nameEn: 'Priest',
        emoji: '✨',
        role: 'สายซัพพอร์ต อึด (Support)',
        desc: 'สายสายัณห์ศักดิ์สิทธิ์ ฟื้นฟูพลังชีวิตได้เก่ง มานาเยอะ อยู่รอดได้นานที่สุดในสนาม',
        skills: ['heal', 'holyLight', 'blessing'],
        stats: { str: 3, agi: 5, int: 8 },
        mods: { hp: 1.05, sp: 1.45, atk: 0.85, def: 1.05 },
    },
};

// Normalize legacy/UI job ids to the canonical ids used by JOBS and persistence.
// Older UI payloads used `swordman` and `acolyte`; accepting them on load
// prevents a valid existing class from being treated as a fresh Novice.
export function normalizeJobId(jobId) {
    const aliases = { swordman: 'swordsman', acolyte: 'priest' };
    const raw = String(jobId || '').trim().toLowerCase();
    const normalized = aliases[raw] || raw;
    return JOBS[normalized] ? normalized : null;
}

// The 3 skill ids a character currently has (Novice until they pick a job).
export function getJobSkills(jobId) {
    const job = JOBS[normalizeJobId(jobId)];
    return job ? job.skills : NOVICE_SKILLS;
}

// Per-job combat multipliers ({hp,sp,atk,def}); all 1.0 for a job-less Novice.
export function getJobMods(jobId) {
    const job = JOBS[normalizeJobId(jobId)];
    return (job && job.mods) ? job.mods : { hp: 1, sp: 1, atk: 1, def: 1 };
}

// ============ REFINE / ตีบวกไอเทม ============
// Equipment can be refined +0 → +∞ for growing stats. Refine level is stored
// per inventory item in item.stats.refine, so no schema change is needed.
export const REFINABLE_TYPES = ['weapon', 'armor', 'shield'];

// One-time onboarding supply for the mandatory first weapon refine. The kit
// exactly covers the +0 → +1 Sword cost and is never used for later refines.
export const FIRST_REFINE_KIT = Object.freeze({
    version: 1,
    gold: 620,
    oreName: 'Oridecon',
    oreQuantity: 1,
    receiptId: 'first-refine-kit:v1',
});

// Each refine level adds 12% of the item's base bonus (atk/def/hp/sp).
export function getRefineMult(level) {
    return 1 + Math.max(0, level | 0) * 0.12;
}

// Which ore an item type consumes when refining (RO flavour).
export function refineOreFor(itemType) {
    return itemType === 'weapon' ? 'Oridecon' : 'Elunium';
}

// Success chance + failure behaviour when refining FROM `level` to level+1, plus
// the gold/ore cost. Safe (no downgrade) below +10; forgiving-but-tense design.
export function refineInfo(level) {
    const L = Math.max(0, level | 0);
    let chance;
    if (L < 4) chance = 1;                                  // +0..+3 always succeed
    else if (L < 7) chance = 0.85 - (L - 4) * 0.05;         // 85→75
    else if (L < 10) chance = 0.65 - (L - 7) * 0.06;        // 65→53
    else if (L < 15) chance = 0.47 - (L - 10) * 0.045;      // 47→29
    else chance = 0.24 - (L - 15) * 0.015;                  // 24→…
    chance = Math.max(0.05, chance);
    const downgrade = L >= 10 ? 1 : 0;   // fail below +10 keeps the level; +10+ drops 1
    const gold = 400 + Math.floor(Math.pow(L + 1, 2) * 220);
    const ore = 1 + Math.floor(L / 3);
    return { chance, downgrade, gold, ore };
}

// Colour tier for a refine level — drives the +N label colour and hero glow.
export function refineTierColor(level) {
    const L = level | 0;
    if (L >= 15) return '#ff5a7a';
    if (L >= 10) return '#ffcf4a';
    if (L >= 7) return '#c774ff';
    if (L >= 4) return '#6aa8ff';
    return '#cfe0ff';
}

// STR/AGI/INT attributes for a class, grown with level along the job's focus.
// Novice (no job) gets a balanced spread. Shown on the profile screens.
export function getJobStats(jobId, level = 1) {
    const canonicalJobId = normalizeJobId(jobId);
    const base = (JOBS[canonicalJobId] && JOBS[canonicalJobId].stats) || { str: 4, agi: 4, int: 4 };
    const lvl = Math.max(1, Math.floor(level) || 1);
    const grow = (b) => b + Math.floor((lvl - 1) * b * 0.12);
    return { str: grow(base.str), agi: grow(base.agi), int: grow(base.int) };
}

// The weapon each job is handed free the moment it's chosen, so every class
// starts with an iconic, usable weapon (Priest had none in the game before).
JOBS.swordsman.signatureWeapon = 'Sword';
JOBS.mage.signatureWeapon = 'Mage Staff';
JOBS.archer.signatureWeapon = 'Bow';
JOBS.priest.signatureWeapon = 'Holy Rod';

Object.assign(ITEMS, {
    'Solaris Edge': { emoji: '⚔️', type: 'weapon', rarity: 'mythic', desc: 'ดาบสุริยเทพ ATK +420, HP +900', price: 0, atkBonus: 420, hpBonus: 900, levelReq: 35, forgeEffect: 'divine_solar' },
    'Chronos Bow': { emoji: '🏹', type: 'weapon', rarity: 'mythic', desc: 'ธนูแห่งกาลเวลา ATK +390, HP +700', price: 0, atkBonus: 390, hpBonus: 700, levelReq: 35, forgeEffect: 'divine_chronos' },
    'Genesis Staff': { emoji: '🔮', type: 'weapon', rarity: 'mythic', desc: 'คทากำเนิดโลก ATK +360, SP +1,800', price: 0, atkBonus: 360, spBonus: 1800, levelReq: 35, forgeEffect: 'divine_genesis' },
    'Seraph Rod': { emoji: '✨', type: 'weapon', rarity: 'mythic', desc: 'คทาเซราฟ ATK +330, HP +1,200, SP +1,500', price: 0, atkBonus: 330, hpBonus: 1200, spBonus: 1500, levelReq: 35, forgeEffect: 'divine_seraph' },
    'Empyrean Plate': { emoji: '🛡️', type: 'armor', rarity: 'mythic', desc: 'เกราะจักรวาล DEF +260, HP +6,500', price: 0, defBonus: 260, hpBonus: 6500, levelReq: 45 },
    'Wings of Aeon': { emoji: '🪽', type: 'armor', rarity: 'mythic', desc: 'ผ้าคลุมปีกนิรันดร์ DEF +180, HP +3,800, SP +900', price: 0, defBonus: 180, hpBonus: 3800, spBonus: 900, levelReq: 40 },
    'Aegis Prime': { emoji: '🛡️', type: 'shield', rarity: 'mythic', desc: 'โล่ปฐมเทพ DEF +300, HP +5,000', price: 0, defBonus: 300, hpBonus: 5000, levelReq: 45 },
    'Crown of the First Light': { emoji: '👑', type: 'hat', rarity: 'mythic', desc: 'มงกุฎแสงแรก DEF +120, HP +2,200, SP +1,000', price: 0, defBonus: 120, hpBonus: 2200, spBonus: 1000, levelReq: 32 },
    'Oracle Lens': { emoji: '🔍', type: 'glasses', rarity: 'mythic', desc: 'เลนส์ญาณทิพย์ ATK +150, SP +800', price: 0, atkBonus: 150, spBonus: 800, levelReq: 30 },
    'Titan Bracers': { emoji: '🦾', type: 'armor', rarity: 'mythic', desc: 'ปลอกแขนไททัน ATK +80, DEF +140, HP +2,600', price: 0, atkBonus: 80, defBonus: 140, hpBonus: 2600, levelReq: 32 },
    'Astral Legguards': { emoji: '👖', type: 'armor', rarity: 'mythic', desc: 'เกราะขาดารา DEF +190, HP +4,200', price: 0, defBonus: 190, hpBonus: 4200, levelReq: 38 },
    'Worldwalker Greaves': { emoji: '🥾', type: 'armor', rarity: 'mythic', desc: 'รองเท้าท่องพิภพ DEF +170, HP +3,300', price: 0, defBonus: 170, hpBonus: 3300, levelReq: 35 },
    'Eternity Ring': { emoji: '💍', type: 'armor', rarity: 'mythic', desc: 'แหวนนิรันดร์ ATK +180, DEF +80, HP +1,800, SP +700', price: 0, atkBonus: 180, defBonus: 80, hpBonus: 1800, spBonus: 700, levelReq: 40 },
    'Heart of Cosmos': { emoji: '💠', type: 'armor', rarity: 'mythic', desc: 'หัวใจจักรวาล ATK +220, DEF +120, HP +3,000, SP +1,200', price: 0, atkBonus: 220, defBonus: 120, hpBonus: 3000, spBonus: 1200, levelReq: 45 },
    'Celestial Sovereign Helm': { emoji: '🪖', type: 'armor', rarity: 'mythic', desc: 'หมวกเกราะราชันสวรรค์ DEF +175, HP +3,400, SP +600', price: 0, defBonus: 175, hpBonus: 3400, spBonus: 600, levelReq: 38 },
});

export const DIVINE_ZOL_SHOP = [
    { name: 'Solaris Edge', category: 'weapon', zolPrice: 180000 }, { name: 'Chronos Bow', category: 'weapon', zolPrice: 175000 },
    { name: 'Genesis Staff', category: 'weapon', zolPrice: 185000 }, { name: 'Seraph Rod', category: 'weapon', zolPrice: 185000 },
    { name: 'Crown of the First Light', category: 'hat', zolPrice: 160000 }, { name: 'Oracle Lens', category: 'glasses', zolPrice: 125000 },
    { name: 'Celestial Sovereign Helm', category: 'head', zolPrice: 195000 }, { name: 'Empyrean Plate', category: 'body', zolPrice: 240000 },
    { name: 'Wings of Aeon', category: 'garment', zolPrice: 210000 }, { name: 'Titan Bracers', category: 'wrist', zolPrice: 145000 },
    { name: 'Astral Legguards', category: 'pants', zolPrice: 175000 }, { name: 'Worldwalker Greaves', category: 'feet', zolPrice: 165000 },
    { name: 'Aegis Prime', category: 'shield', zolPrice: 230000 }, { name: 'Eternity Ring', category: 'ring', zolPrice: 200000 },
    { name: 'Heart of Cosmos', category: 'accessory', zolPrice: 260000 },
];

// ============ JOB EQUIP RESTRICTIONS ============
// Every worn item (weapon / hat / glasses) belongs to a job, or is universal.
// A character may equip an item only if it is universal or its job matches the
// character's. Novices (no job yet) may use universal items only. Stat armor is
// intentionally left universal — it's progression gear, not a class identity.
const ITEM_JOB = {
    // --- Weapons ---
    // Swordsman (melee)
    'Sword': 'swordsman', 'Katana': 'swordsman', 'Silver Dagger': 'swordsman',
    'Heavy Warhammer': 'swordsman', 'Excalibur': 'swordsman', 'Ragnarok Blade': 'swordsman',
    'Ember Fang': 'swordsman', 'Frost Cleaver': 'swordsman', 'Soulreaper': 'swordsman',
    'Godslayer': 'swordsman', 'Solaris Edge': 'swordsman',
    // Archer (ranged)
    'Bow': 'archer', 'Gun': 'archer', 'Crossbow': 'archer', 'Rudra Bow': 'archer',
    'Stormcaller Bow': 'archer', 'Chronos Bow': 'archer',
    // Mage
    'Mage Staff': 'mage', 'Genesis Staff': 'mage',
    // Priest
    'Holy Rod': 'priest', 'Seraph Rod': 'priest',
    // 'Novice Cutter' and 'Fishing Rod' stay universal (starter / tool).
    // Hats & glasses are cosmetic accessories — universal, anyone can wear them.
};
for (const [name, job] of Object.entries(ITEM_JOB)) {
    if (ITEMS[name]) ITEMS[name].job = job;
}

// The job an item is locked to, or null if anyone can wear it.
export function itemJob(itemName) {
    const it = ITEMS[itemName];
    return it && it.job ? it.job : null;
}

// Can a character of `jobId` (null = Novice) equip this item?
export function canEquipItem(itemName, jobId) {
    const locked = itemJob(itemName);
    if (!locked) return true;        // universal
    return jobId === locked;         // must be that exact job
}

// ============ EQUIPMENT SLOTS (paper-doll) ============
// The hero can wear one item per body-part slot at once. Weapons/shields/hats/
// glasses keep their own dedicated engine slots; everything of type `armor` is
// split into semantic slots below so a helm, body, cloak, ring and boots can all
// be worn together (each contributes its DEF/HP/SP). Slots with no items yet
// (pants, wrist) still appear on the doll, ready for future gear.
export const EQUIP_SLOTS = [
    { id: 'hat', label: 'หมวก', icon: '🎩', kind: 'hat' },
    { id: 'head', label: 'ศีรษะ', icon: '🪖', kind: 'armor' },
    { id: 'glasses', label: 'แว่นตา', icon: '👓', kind: 'glasses' },
    { id: 'body', label: 'เสื้อเกราะ', icon: '👕', kind: 'armor' },
    { id: 'garment', label: 'ผ้าคลุม', icon: '🧥', kind: 'armor' },
    { id: 'weapon', label: 'อาวุธ', icon: '⚔️', kind: 'weapon' },
    { id: 'shield', label: 'โล่', icon: '🛡️', kind: 'shield' },
    { id: 'ring', label: 'แหวน', icon: '💍', kind: 'armor' },
    { id: 'wrist', label: 'ข้อมือ', icon: '⌚', kind: 'armor' },
    { id: 'pants', label: 'กางเกง', icon: '👖', kind: 'armor' },
    { id: 'feet', label: 'รองเท้า', icon: '🥾', kind: 'armor' },
    { id: 'accessory', label: 'เครื่องประดับ', icon: '💎', kind: 'armor' },
];

// The armor sub-slots the hero tracks as a gear map (see CharacterManager).
export const ARMOR_SLOTS = ['head', 'body', 'garment', 'ring', 'wrist', 'pants', 'feet', 'accessory'];

// Which body-part slot each type:'armor' item occupies. Anything not listed
// falls back to the body slot so new armor is always wearable.
const ARMOR_ITEM_SLOT = {
    'Iron Helm': 'head', 'Ranger Hood': 'head',
    'Cotton Shirt': 'body', 'Adventurer Suit': 'body', 'Steel Plate Mail': 'body',
    'Valkyrie Armor': 'body', 'Dragon Scale Mail': 'body',
    'Leather Cloak': 'garment', 'Shadow Garment': 'garment', 'Odin Garment': 'garment',
    'Silver Ring': 'ring', 'Gorgon Ring': 'ring', 'Glow Ring': 'ring',
    'Speed Boots': 'feet', 'Dragon Greaves': 'feet',
    'Gold Earring': 'accessory',
    'Leather Pants': 'pants', 'Plate Legguards': 'pants',
    'Leather Bracer': 'wrist', 'Steel Bracer': 'wrist', 'Guardian Wristguard': 'wrist',
    'Empyrean Plate': 'body', 'Wings of Aeon': 'garment', 'Titan Bracers': 'wrist',
    'Astral Legguards': 'pants', 'Worldwalker Greaves': 'feet', 'Eternity Ring': 'ring', 'Heart of Cosmos': 'accessory',
    'Celestial Sovereign Helm': 'head',
};

// The paper-doll slot id an item belongs to (weapon/shield/hat/glasses map by
// their item type; armor items map by ARMOR_ITEM_SLOT, default 'body').
export function getEquipSlot(itemName) {
    const it = ITEMS[itemName];
    if (!it) return null;
    if (it.type === 'weapon') return 'weapon';
    if (it.type === 'shield') return 'shield';
    if (it.type === 'hat') return 'hat';
    if (it.type === 'glasses') return 'glasses';
    if (it.type === 'armor') return ARMOR_ITEM_SLOT[itemName] || 'body';
    return null;
}

// ===== CARDS =====
// Reward-only title token. It is intentionally not sold by any shop and has
// zero resale value; admins grant it for approved, useful bug reports.
ITEMS['Bug Hunter Emblem'] = {
    emoji: '🐞', type: 'title', rarity: 'legendary', price: 0,
    desc: 'ตราเกียรติยศสำหรับผู้ช่วยค้นพบบัค กดใช้งานเพื่อเปิดหรือปิดป้าย Bug Hunter สีแดงเรืองแสงเหนือชื่อตัวละคร',
};
ITEMS['Master Angler Trophy'] = {
    emoji: '🏆', type: 'title', rarity: 'legendary', price: 0,
    desc: 'ถ้วยรางวัลสำหรับผู้จับปลาครบทุกชนิด กดใช้งานเพื่อเปิดหรือปิดป้าย Master Angler สีทองเรืองแสงเหนือชื่อตัวละคร',
};

// Which card category a paper-doll slot accepts. A card fits a slot only when
// its `cardSlot` equals this category.
export function cardCategoryForSlot(slotId) {
    if (slotId === 'weapon') return 'weapon';
    if (slotId === 'shield') return 'shield';
    if (slotId === 'ring' || slotId === 'wrist' || slotId === 'accessory') return 'accessory';
    // head / body / garment / pants / feet / hat / glasses
    return 'armor';
}

// True if `cardName` can be socketed into paper-doll slot `slotId`.
export function cardFitsSlot(cardName, slotId) {
    const card = getCard(cardName);
    return Boolean(card && card.slot === cardCategoryForSlot(slotId));
}

// Border/text colour for a rarity (shared by card frames + rarity chips).
for (const card of CARD_CATALOG) {
    const legacyItem = toLegacyItem(card);
    ITEMS[card.itemName] = legacyItem;
    for (const alias of card.legacyAliases) ITEMS[alias] = legacyItem;
}

export const RARITY_COLOR = Object.fromEntries(
    Object.entries(RARITY_META).map(([rarity, meta]) => [rarity, meta.color]),
);

// All card item names, cached once.
export const ALL_CARDS = CARD_CATALOG.map(card => card.itemName);

// Celestial mining pickaxe ladder, cheapest → rarest. The Heaven Merchant sells
// these and mining uses the best one the player owns (ITEMS[name].mineYield).
export const PICKAXES = ['Stone Pickaxe', 'Mythril Pickaxe', 'Celestial Pickaxe', 'Divine Pickaxe'];

// ============ SHOP ITEMS ============
// Update shop to list items in proper categories, for players to view and buy
export const SHOP_ITEMS = [
    { name: 'Apple', price: 15 },
    { name: 'Carrot', price: 20 },
    { name: 'Red Herb', price: 100 },
    { name: 'Green Herb', price: 30 },
    { name: 'Yellow Herb', price: 60 },
    { name: 'Orange Juice', price: 120 },
    { name: 'Blue Herb', price: 150 },
    { name: 'Grape', price: 50 },
    // ---- Weapons (basic → legendary). Buy one and the hero visibly wields it. ----
    { name: 'Novice Cutter', price: 150 },
    { name: 'Sword', price: 200 },
    { name: 'Bow', price: 250 },
    { name: 'Gun', price: 400 },
    { name: 'Mage Staff', price: 600 },
    // Fishing Rod is starter-only and intentionally not sold here.
    { name: 'Silver Fishing Rod', price: 15000 },
    { name: 'Golden Fishing Rod', price: 75000 },
    { name: 'Silver Dagger', price: 3200 },
    { name: 'Katana', price: 3500 },
    { name: 'Crossbow', price: 4000 },
    { name: 'Heavy Warhammer', price: 5000 },
    { name: 'Excalibur', price: 25000 },      // glows gold in hand
    { name: 'Rudra Bow', price: 28000 },      // radiant bow
    { name: 'Ragnarok Blade', price: 120000 },// mythic, crimson glow
    // ---- Armor / shields / accessories ----
    { name: 'Cotton Shirt', price: 100 },
    { name: 'Iron Helm', price: 50 },
    { name: 'Wooden Buckler', price: 120 },
    { name: 'Silver Ring', price: 450 },
    { name: 'Leather Cloak', price: 650 },
    { name: 'Iron Shield', price: 750 },
    { name: 'Adventurer Suit', price: 800 },
    { name: 'Speed Boots', price: 900 },
    { name: 'Ranger Hood', price: 2500 },
    { name: 'Tear Shield', price: 3600 },
    { name: 'Steel Plate Mail', price: 6000 },
    { name: 'Golden Shield', price: 18000 },
    { name: 'Odin Garment', price: 22000 },
    // ---- Pants (กางเกง) & wrist bracers (ข้อมือ) ----
    { name: 'Leather Bracer', price: 300 },
    { name: 'Leather Pants', price: 550 },
    { name: 'Steel Bracer', price: 3200 },
    { name: 'Plate Legguards', price: 4200 },
    { name: 'Guardian Wristguard', price: 16000 },
    { name: 'Dragon Greaves', price: 20000 },
    // ---- Refine ores (แร่ตีบวก) ----
    { name: 'Oridecon', price: 2500 },
    { name: 'Elunium', price: 2500 }
];

// Dedicated Pet Sanctuary catalog. Pets intentionally do not appear in the
// general Kafra item shop, so the boutique owns discovery and presentation.
export const STARTER_PET = Object.freeze({
    itemName: 'Starter Poring Pet',
    petKey: 'poring',
    receiptId: 'starter-pet:v1',
    price: 0,
});

export const PET_SHOP = [
    'Poring Pet', 'Chick Pet', 'Kitten Pet', 'Puppy Pet', 'Sunfox Pet',
    'Moss Turtle Pet', 'Owl Pet', 'Cloudling Pet', 'Moon Hare Pet',
    'Baby Dragon Pet', 'Bloom Fairy Pet', 'Ember Phoenix Pet',
].map(name => ({ name, price: ITEMS[name].price }));

// The pet model key for a pet item (or null). Used to build the follower mesh.
export function petModelOf(itemName) {
    const it = ITEMS[itemName];
    return (it && it.type === 'pet') ? (it.pet || null) : null;
}

// ============ PET COMBAT (สัตว์เลี้ยงมีพลังโจมตี!) ============
// Every companion now fights beside its owner. While the owner has a target in
// range, the pet periodically unleashes its signature elemental strike. Stats
// differ by species/rarity — rarer pets hit harder, faster, with flashier
// elements. `atk` is base power at level 1; it grows `per` points per pet level.
// `color` tints the projectile + damage number; `cd` is seconds between strikes.
export const ELEMENT_INFO = {
    neutral: { th: 'ไร้ธาตุ', color: 0xffd8a0 },
    fire:    { th: 'ไฟ',      color: 0xff6a1e },
    wind:    { th: 'ลม',      color: 0x8ef0a0 },
    water:   { th: 'น้ำ',     color: 0x67c8ff },
    earth:   { th: 'ดิน',     color: 0x9ed86a },
    holy:    { th: 'ศักดิ์สิทธิ์', color: 0xfff2a8 },
    nature:  { th: 'ธรรมชาติ', color: 0x9cf6c0 },
    shadow:  { th: 'เงามืด',   color: 0xb27bff },
};

export const PET_STATS = {
    //             rarity        el       atk  per   cd   range crit  attackName (signature move)                     flavor
    poring:        { rarity: 'common',    element: 'neutral', atk: 6,  per: 1.2, cd: 2.2, range: 6, crit: 0.08, attackName: 'เจลลี่กระแทก',    desc: 'พุ่งตัวเจลลี่เด้งใส่ศัตรูอย่างน่ารักแต่เจ็บ' },
    chick:         { rarity: 'common',    element: 'wind',    atk: 7,  per: 1.3, cd: 2.0, range: 6, crit: 0.09, attackName: 'จิกสายลม',       desc: 'กระพือปีกยิงขนลมคมกริบใส่เป้าหมาย' },
    kitten:        { rarity: 'rare',      element: 'neutral', atk: 10, per: 1.8, cd: 1.8, range: 6, crit: 0.11, attackName: 'ตะปบเงา',        desc: 'กระโจนตะปบด้วยกรงเล็บเงาไวปานสายฟ้า' },
    puppy:         { rarity: 'rare',      element: 'neutral', atk: 11, per: 1.9, cd: 1.9, range: 6, crit: 0.11, attackName: 'งับพลัง',        desc: 'พุ่งเข้างับด้วยพลังซื่อสัตย์เต็มกำลัง' },
    sunfox:        { rarity: 'rare',      element: 'fire',    atk: 13, per: 2.2, cd: 1.9, range: 7, crit: 0.12, attackName: 'เปลวสุริยะ',     desc: 'สะบัดหางเพลิงยิงลูกไฟสุริยันใส่ศัตรู' },
    moss_turtle:   { rarity: 'rare',      element: 'earth',   atk: 14, per: 2.1, cd: 2.4, range: 7, crit: 0.10, attackName: 'ยิงหนามพฤกษา',   desc: 'ยิงหนามจากกระดองสวน โจมตีหนักแต่ช้า' },
    owl:           { rarity: 'epic',      element: 'wind',    atk: 16, per: 2.4, cd: 1.7, range: 7, crit: 0.13, attackName: 'ใบมีดวายุ',      desc: 'กระพือปีกส่งใบมีดลมเฉือนเงียบกริบ' },
    cloudling:     { rarity: 'epic',      element: 'water',   atk: 17, per: 2.5, cd: 1.7, range: 7, crit: 0.13, attackName: 'สายฝนดารา',      desc: 'เรียกสายฝนดาวพราวระยิบถล่มศัตรู' },
    moon_hare:     { rarity: 'epic',      element: 'holy',    atk: 18, per: 2.6, cd: 1.6, range: 7, crit: 0.14, attackName: 'จันทรฉาย',       desc: 'ปล่อยลำแสงจันทราศักดิ์สิทธิ์ทะลุทะลวง' },
    baby_dragon:   { rarity: 'legendary', element: 'fire',    atk: 23, per: 3.2, cd: 1.5, range: 7, crit: 0.15, attackName: 'ลมหายใจมังกร',   desc: 'พ่นลมหายใจเพลิงมังกรเผาผลาญทุกสิ่ง' },
    bloom_fairy:   { rarity: 'legendary', element: 'nature',  atk: 22, per: 3.0, cd: 1.5, range: 7, crit: 0.15, attackName: 'ละอองภูตพฤกษา', desc: 'โปรยละอองเวทมนตร์ธรรมชาติกัดกร่อนศัตรู' },
    ember_phoenix: { rarity: 'mythic',    element: 'fire',    atk: 32, per: 4.2, cd: 1.3, range: 8, crit: 0.20, attackName: 'เปลวหงส์อมตะ',   desc: 'ปลดปล่อยเปลวเพลิงหงส์อมตะแผดเผาล้างผลาญ' },
};

// Resolve a pet's live combat profile at a given level. Returns null for a pet
// with no combat data. `atk` scales with level; `variance` adds a little roll.
export function getPetCombat(petKey, level = 1) {
    const s = PET_STATS[petKey];
    if (!s) return null;
    const lv = Math.max(1, Math.floor(level) || 1);
    const atk = Math.round(s.atk + s.per * (lv - 1));
    const el = ELEMENT_INFO[s.element] || ELEMENT_INFO.neutral;
    return {
        atk,
        level: lv,
        element: s.element,
        elementName: el.th,
        color: el.color,
        cooldown: s.cd,
        range: s.range,
        crit: s.crit,
        attackName: s.attackName,
        desc: s.desc,
        rarity: s.rarity,
        variance: Math.max(2, Math.round(atk * 0.2)),
    };
}

// ============ FORGE RECIPES ============
// Weapon Smith crafting: a base weapon + materials (from your bag) + gold →
// a special forged weapon with high ATK and a signature on-hit effect.
// `base` is consumed (qty 1); every material qty is consumed too.
export const FORGE_RECIPES = [
    { result: 'Ember Fang', base: 'Sword', materials: [{ name: 'Fire Element Stone', qty: 1 }, { name: 'Iron Ore', qty: 5 }], gold: 2000 },
    { result: 'Frost Cleaver', base: 'Katana', materials: [{ name: 'Crystal Blue', qty: 3 }, { name: 'Elunium Stone', qty: 2 }], gold: 8000 },
    { result: 'Stormcaller Bow', base: 'Bow', materials: [{ name: 'Wind Element Stone', qty: 2 }, { name: 'Nine Tail Fur', qty: 3 }], gold: 8000 },
    { result: 'Soulreaper', base: 'Silver Dagger', materials: [{ name: 'Ghostly Essence', qty: 2 }, { name: 'Devil Horn', qty: 2 }], gold: 20000 },
    { result: 'Godslayer', base: 'Excalibur', materials: [{ name: 'Dragon Heart', qty: 3 }, { name: 'Pure Emperium', qty: 1 }], gold: 60000 },
];

// ============ EXP TABLE ============
export function getExpRequired(level) {
    return Math.floor(100 * Math.pow(1.35, level - 1));
}

// ============ STAT GAINS PER LEVEL ============
export function getStatGains(level) {
    return {
        max_hp: 15 + Math.floor(level * 2),
        max_sp: 5 + Math.floor(level * 0.8),
        atk: 2 + Math.floor(level * 0.5),
        def: 1 + Math.floor(level * 0.3),
    };
}

// ============ SPAWN TABLE (by level + map) ============
export function getSpawnTable(playerLevel, mapId = 'prontera') {
    const table = [];

    // Svarrga (Heaven) is a peaceful mining city — no monsters.
    if (mapId === 'svarrga' || mapId === 'skyrail_bazaar') return table;

    if (mapId === 'payon') {
        table.push({ type: 'horn', weight: 30 });
        table.push({ type: 'spore', weight: 35 });
        table.push({ type: 'boa', weight: 25 });
        if (playerLevel >= 3) table.push({ type: 'savage', weight: 20 });
        if (playerLevel >= 5) table.push({ type: 'bigfoot', weight: 15 });
        if (playerLevel >= 8) table.push({ type: 'nine_tail', weight: 8 });
        return table;
    }

    if (mapId === 'glast_heim') {
        table.push({ type: 'skeleton', weight: 35 });
        table.push({ type: 'zombie', weight: 30 });
        if (playerLevel >= 10) table.push({ type: 'archer_skeleton', weight: 25 });
        if (playerLevel >= 14) table.push({ type: 'hunter_fly', weight: 20 });
        if (playerLevel >= 18) table.push({ type: 'raydric', weight: 12 });
        if (playerLevel >= 24) table.push({ type: 'dullahan', weight: 3 }); // Boss rare spawn
        return table;
    }

    if (mapId === 'mjolnir') {
        table.push({ type: 'golem', weight: 35 });
        table.push({ type: 'stone_golem', weight: 28 });
        if (playerLevel >= 20) table.push({ type: 'harpy', weight: 25 });
        if (playerLevel >= 26) table.push({ type: 'gargoyle', weight: 18 });
        if (playerLevel >= 32) table.push({ type: 'iron_golem', weight: 12 });
        if (playerLevel >= 40) table.push({ type: 'storm_dragon', weight: 3 }); // Boss rare spawn
        return table;
    }

    if (mapId === 'abyss_lake') {
        table.push({ type: 'dragon_egg', weight: 30 });
        table.push({ type: 'sea_dragon', weight: 25 });
        if (playerLevel >= 35) table.push({ type: 'leib_olmai', weight: 20 });
        if (playerLevel >= 42) table.push({ type: 'dark_illusion', weight: 15 });
        if (playerLevel >= 50) table.push({ type: 'abyss_knight', weight: 3 }); // Boss rare spawn
        return table;
    }

    // Prontera Field
    table.push({ type: 'poring', weight: Math.max(10, 45 - playerLevel * 3) });
    if (playerLevel >= 1) table.push({ type: 'lunatic', weight: 30 });
    if (playerLevel >= 2) table.push({ type: 'fabre', weight: 25 });
    if (playerLevel >= 3) table.push({ type: 'rocker', weight: 20 });
    if (playerLevel >= 5) table.push({ type: 'willow', weight: 18 });
    if (playerLevel >= 7) table.push({ type: 'poporing', weight: 15 });
    if (playerLevel >= 9) table.push({ type: 'drops', weight: 12 });
    if (playerLevel >= 12) table.push({ type: 'deviruchi', weight: 8 });
    if (playerLevel >= 16) table.push({ type: 'ghostring', weight: 3 }); // Boss rare spawn
    // North-east highland biome: unusual mountain creatures live far beyond
    // the starter field and are positioned there by the environment spawner.
    table.push({ type: 'bigfoot', weight: 10 });
    table.push({ type: 'nine_tail', weight: 7 });
    table.push({ type: 'harpy', weight: 6 });
    table.push({ type: 'gargoyle', weight: 4 });

    return table;
}

// ============ WATER SPAWN TABLE ============
export function getWaterSpawnTable(playerLevel) {
    const table = [];
    // All water species are ambient actors; there are no water combat spawns.
    return table;
}

export function pickRandomMonster(playerLevel, mapId = 'prontera') {
    const table = getSpawnTable(playerLevel, mapId);
    const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of table) {
        roll -= entry.weight;
        if (roll <= 0) return entry.type;
    }
    return table[0].type;
}

export function pickRandomWaterMonster(playerLevel) {
    const table = getWaterSpawnTable(playerLevel);
    const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of table) {
        roll -= entry.weight;
        if (roll <= 0) return entry.type;
    }
    return table[0].type;
}

// Combat-facing metadata is centralized so each spawned record has a stable
// family and map-boss status without making card effects depend on display data.
const MONSTER_COMBAT_META = Object.freeze({
    poring: { family: 'slime' }, lunatic: { family: 'beast' }, fabre: { family: 'insect' },
    rocker: { family: 'insect' }, willow: { family: 'plant' }, poporing: { family: 'slime' },
    drops: { family: 'slime' }, deviruchi: { family: 'demon' }, ghostring: { family: 'undead', isBoss: true, isElite: true },
    horn: { family: 'beast' }, savage: { family: 'beast' }, boa: { family: 'beast' },
    spore: { family: 'plant' }, bigfoot: { family: 'beast' }, nine_tail: { family: 'beast' },
    skeleton: { family: 'undead' }, zombie: { family: 'undead' }, archer_skeleton: { family: 'undead' },
    raydric: { family: 'undead' }, hunter_fly: { family: 'insect' }, dullahan: { family: 'undead', isBoss: true, isElite: true },
    golem: { family: 'construct' }, stone_golem: { family: 'construct' }, harpy: { family: 'beast' },
    gargoyle: { family: 'construct' }, iron_golem: { family: 'construct' }, storm_dragon: { family: 'dragon', isBoss: true, isElite: true },
    dragon_egg: { family: 'dragon' }, sea_dragon: { family: 'dragon' }, leib_olmai: { family: 'beast' },
    dark_illusion: { family: 'undead' }, abyss_knight: { family: 'undead', isBoss: true, isElite: true },
    // Aquatic scenery is intentionally absent from combat metadata.
});

export function getMonsterCombatMeta(type, data = {}) {
    const metadata = MONSTER_COMBAT_META[type] || {};
    return {
        family: data.family || metadata.family || 'unknown',
        isBoss: data.isBoss === true || metadata.isBoss === true,
        isElite: data.isElite === true || metadata.isElite === true,
    };
}

// All monsters combined (for lookup)
export function getAllMonsters() {
    const records = { ...MONSTERS, ...PAYON_MONSTERS, ...GLAST_MONSTERS, ...MJOLNIR_MONSTERS, ...ABYSS_MONSTERS, ...WATER_MONSTERS };
    return Object.fromEntries(Object.entries(records).map(([type, data]) => [
        type,
        { ...data, ...getMonsterCombatMeta(type, data) },
    ]));
}

// ============ TIER SYSTEMS ============
export const TIERS = {
    global: [
        { min: 1, max: 10, name: 'Beginner', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)' },
        { min: 11, max: 20, name: 'Apprentice', color: '#4ade80', glow: 'rgba(74,222,128,0.4)' },
        { min: 21, max: 30, name: 'Bronze', color: '#d97706', glow: 'rgba(217,119,6,0.4)' },
        { min: 31, max: 40, name: 'Iron', color: '#cbd5e1', glow: 'rgba(203,213,225,0.4)' },
        { min: 41, max: 50, name: 'Steel', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
        { min: 51, max: 60, name: 'Knight', color: '#2563eb', glow: 'rgba(37,99,235,0.5)' },
        { min: 61, max: 70, name: 'Elite', color: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
        { min: 71, max: 80, name: 'Royal', color: '#ec4899', glow: 'rgba(236,72,153,0.7)' },
        { min: 81, max: 90, name: 'Dragon', color: '#f97316', glow: 'rgba(249,115,22,0.8)' },
        { min: 91, max: 100, name: 'Ancient', color: '#eab308', glow: 'rgba(234,179,8,0.8)' },
        { min: 101, max: 110, name: 'Celestial', color: '#a5f3fc', glow: 'rgba(6,182,212,0.9)' },
        { min: 111, max: 120, name: 'Mythic', color: '#f43f5e', glow: 'rgba(244,63,94,1.0)' },
    ],
    swordsman: [
        { min: 1, max: 10, name: 'นักดาบฝึกหัด', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)' },
        { min: 11, max: 20, name: 'นักรบฝึกฝน', color: '#4ade80', glow: 'rgba(74,222,128,0.4)' },
        { min: 21, max: 30, name: 'นักรบทองแดง', color: '#d97706', glow: 'rgba(217,119,6,0.4)' },
        { min: 31, max: 40, name: 'นักรบเหล็ก', color: '#cbd5e1', glow: 'rgba(203,213,225,0.4)' },
        { min: 41, max: 50, name: 'นักรบเหล็กกล้า', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
        { min: 51, max: 60, name: 'อัศวินแห่งราชอาณาจักร', color: '#2563eb', glow: 'rgba(37,99,235,0.5)' },
        { min: 61, max: 70, name: 'อัศวินชั้นยอด', color: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
        { min: 71, max: 80, name: 'ราชันนักรบ', color: '#ec4899', glow: 'rgba(236,72,153,0.7)' },
        { min: 81, max: 90, name: 'ผู้ล่ามังกร', color: '#f97316', glow: 'rgba(249,115,22,0.8)' },
        { min: 91, max: 100, name: 'นักรบโบราณ', color: '#eab308', glow: 'rgba(234,179,8,0.8)' },
        { min: 101, max: 110, name: 'ดาบแห่งสวรรค์', color: '#a5f3fc', glow: 'rgba(6,182,212,0.9)' },
        { min: 111, max: 120, name: 'ผู้พิชิตตำนาน', color: '#f43f5e', glow: 'rgba(244,63,94,1.0)' },
    ],
    mage: [
        { min: 1, max: 10, name: 'ผู้ฝึกเวท', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)' },
        { min: 11, max: 20, name: 'ศิษย์เวทมนตร์', color: '#4ade80', glow: 'rgba(74,222,128,0.4)' },
        { min: 21, max: 30, name: 'นักเวททองแดง', color: '#d97706', glow: 'rgba(217,119,6,0.4)' },
        { min: 31, max: 40, name: 'นักเวทเหล็ก', color: '#cbd5e1', glow: 'rgba(203,213,225,0.4)' },
        { min: 41, max: 50, name: 'นักเวทอาคม', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
        { min: 51, max: 60, name: 'จอมเวทย์', color: '#2563eb', glow: 'rgba(37,99,235,0.5)' },
        { min: 61, max: 70, name: 'มหาจอมเวทย์', color: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
        { min: 71, max: 80, name: 'จอมเวทย์ราชัน', color: '#ec4899', glow: 'rgba(236,72,153,0.7)' },
        { min: 81, max: 90, name: 'ผู้ใช้เวทมังกร', color: '#f97316', glow: 'rgba(249,115,22,0.8)' },
        { min: 91, max: 100, name: 'จอมเวทโบราณ', color: '#eab308', glow: 'rgba(234,179,8,0.8)' },
        { min: 101, max: 110, name: 'มหาเวทสวรรค์', color: '#a5f3fc', glow: 'rgba(6,182,212,0.9)' },
        { min: 111, max: 120, name: 'จอมเวทนิรันดร์', color: '#f43f5e', glow: 'rgba(244,63,94,1.0)' },
    ],
    archer: [
        { min: 1, max: 10, name: 'นักยิงฝึกหัด', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)' },
        { min: 11, max: 20, name: 'นักล่าฝึกฝน', color: '#4ade80', glow: 'rgba(74,222,128,0.4)' },
        { min: 21, max: 30, name: 'นักธนูทองแดง', color: '#d97706', glow: 'rgba(217,119,6,0.4)' },
        { min: 31, max: 40, name: 'นักธนูเหล็ก', color: '#cbd5e1', glow: 'rgba(203,213,225,0.4)' },
        { min: 41, max: 50, name: 'นักธนูเหล็กกล้า', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
        { min: 51, max: 60, name: 'นักล่าชั้นสูง', color: '#2563eb', glow: 'rgba(37,99,235,0.5)' },
        { min: 61, max: 70, name: 'นักแม่นธนู', color: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
        { min: 71, max: 80, name: 'นักธนูราชัน', color: '#ec4899', glow: 'rgba(236,72,153,0.7)' },
        { min: 81, max: 90, name: 'นักล่ามังกร', color: '#f97316', glow: 'rgba(249,115,22,0.8)' },
        { min: 91, max: 100, name: 'นักธนูโบราณ', color: '#eab308', glow: 'rgba(234,179,8,0.8)' },
        { min: 101, max: 110, name: 'ธนูแห่งสวรรค์', color: '#a5f3fc', glow: 'rgba(6,182,212,0.9)' },
        { min: 111, max: 120, name: 'ผู้พิทักษ์ตำนาน', color: '#f43f5e', glow: 'rgba(244,63,94,1.0)' },
    ],
    priest: [
        { min: 1, max: 10, name: 'ผู้ศรัทธาฝึกหัด', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)' },
        { min: 11, max: 20, name: 'นักบวชฝึกฝน', color: '#4ade80', glow: 'rgba(74,222,128,0.4)' },
        { min: 21, max: 30, name: 'นักบวชทองแดง', color: '#d97706', glow: 'rgba(217,119,6,0.4)' },
        { min: 31, max: 40, name: 'นักบวชเหล็ก', color: '#cbd5e1', glow: 'rgba(203,213,225,0.4)' },
        { min: 41, max: 50, name: 'นักบวชศักดิ์สิทธิ์', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
        { min: 51, max: 60, name: 'ผู้รักษาแห่งแสง', color: '#2563eb', glow: 'rgba(37,99,235,0.5)' },
        { min: 61, max: 70, name: 'มหานักบวช', color: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
        { min: 71, max: 80, name: 'พระราชันแห่งแสง', color: '#ec4899', glow: 'rgba(236,72,153,0.7)' },
        { min: 81, max: 90, name: 'นักบุญมังกร', color: '#f97316', glow: 'rgba(249,115,22,0.8)' },
        { min: 91, max: 100, name: 'ผู้พิทักษ์โบราณ', color: '#eab308', glow: 'rgba(234,179,8,0.8)' },
        { min: 101, max: 110, name: 'เทวทูตแห่งสวรรค์', color: '#a5f3fc', glow: 'rgba(6,182,212,0.9)' },
        { min: 111, max: 120, name: 'ผู้ถือครองแสงนิรันดร์', color: '#f43f5e', glow: 'rgba(244,63,94,1.0)' },
    ]
};

export function getJobTierInfo(jobId, level = 1) {
    const normalised = (jobId && typeof jobId === 'string') ? jobId.toLowerCase() : 'novice';
    const tierList = TIERS[normalised] || TIERS.global;
    const lv = Math.max(1, Math.floor(level) || 1);
    const tierIdx = Math.min(11, Math.max(0, Math.floor((lv - 1) / 10)));
    const tier = tierList[tierIdx] || tierList[0];
    return {
        tier: tierIdx + 1,
        name: tier.name,
        color: tier.color,
        glow: tier.glow
    };
}
