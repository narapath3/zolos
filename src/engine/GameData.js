// Game Data — Monster definitions, items, EXP curve, etc.

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
    'Fishing Rod': { emoji: '🎣', type: 'fishing_rod', rarity: 'rare', desc: 'เบ็ดตกปลาไม้ไผ่ ช่วยให้สามารถทำ Auto-Fishing บริเวณริมแม่น้ำได้ (ATK +2)', price: 150, atkBonus: 2, isFishingRod: true },
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
    'Dragon Greaves': { emoji: '👖', type: 'armor', rarity: 'legendary', desc: 'สนับขาเกล็ดมังกร แข็งแกร่งดั่งภูผา ก้าวเดินไม่หวั่นทุกสมรภูมิ (DEF +45, HP +700)', price: 20000, defBonus: 45, hpBonus: 700 },
    'Leather Bracer': { emoji: '🧤', type: 'armor', rarity: 'rare', desc: 'สนับข้อมือหนังเย็บมือ กระชับข้อมือเสริมการโจมตีให้มั่นคง (DEF +3, HP +35)', price: 300, defBonus: 3, hpBonus: 35 },
    'Steel Bracer': { emoji: '🧤', type: 'armor', rarity: 'epic', desc: 'สนับข้อมือเหล็กหุ้มหมุด ปัดป้องอาวุธและเสริมพลังแขนขณะปะทะ (DEF +12, HP +140)', price: 3200, defBonus: 12, hpBonus: 140 },
    'Guardian Wristguard': { emoji: '🧤', type: 'armor', rarity: 'legendary', desc: 'สนับข้อมือผู้พิทักษ์ เรืองรัศมีศักดิ์สิทธิ์ ดูดซับดาเมจและเพิ่มพลังชีวิต (DEF +30, HP +500)', price: 16000, defBonus: 30, hpBonus: 500 },

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
        name: 'Lunatic',
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

// ============ WATER MONSTERS ============
export const WATER_MONSTERS = {
    shrimp: {
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

// The 3 skill ids a character currently has (Novice until they pick a job).
export function getJobSkills(jobId) {
    const job = JOBS[jobId];
    return job ? job.skills : NOVICE_SKILLS;
}

// Per-job combat multipliers ({hp,sp,atk,def}); all 1.0 for a job-less Novice.
export function getJobMods(jobId) {
    const job = JOBS[jobId];
    return (job && job.mods) ? job.mods : { hp: 1, sp: 1, atk: 1, def: 1 };
}

// STR/AGI/INT attributes for a class, grown with level along the job's focus.
// Novice (no job) gets a balanced spread. Shown on the profile screens.
export function getJobStats(jobId, level = 1) {
    const base = (JOBS[jobId] && JOBS[jobId].stats) || { str: 4, agi: 4, int: 4 };
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
    'Godslayer': 'swordsman',
    // Archer (ranged)
    'Bow': 'archer', 'Gun': 'archer', 'Crossbow': 'archer', 'Rudra Bow': 'archer',
    'Stormcaller Bow': 'archer',
    // Mage
    'Mage Staff': 'mage',
    // Priest
    'Holy Rod': 'priest',
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
    'Speed Boots': 'feet',
    'Gold Earring': 'accessory',
    'Leather Pants': 'pants', 'Plate Legguards': 'pants', 'Dragon Greaves': 'pants',
    'Leather Bracer': 'wrist', 'Steel Bracer': 'wrist', 'Guardian Wristguard': 'wrist',
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
    { name: 'Fishing Rod', price: 150 },
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
    { name: 'Dragon Greaves', price: 20000 }
];

// ============ FORGE RECIPES ============
// Weapon Smith crafting: a base weapon + materials (from your bag) + gold →
// a special forged weapon with high ATK and a signature on-hit effect.
// `base` is consumed (qty 1); every material qty is consumed too.
export const FORGE_RECIPES = [
    { result: 'Ember Fang',      base: 'Sword',         materials: [{ name: 'Fire Element Stone', qty: 1 }, { name: 'Iron Ore', qty: 5 }],        gold: 2000 },
    { result: 'Frost Cleaver',   base: 'Katana',        materials: [{ name: 'Crystal Blue', qty: 3 }, { name: 'Elunium Stone', qty: 2 }],         gold: 8000 },
    { result: 'Stormcaller Bow', base: 'Bow',           materials: [{ name: 'Wind Element Stone', qty: 2 }, { name: 'Nine Tail Fur', qty: 3 }],   gold: 8000 },
    { result: 'Soulreaper',      base: 'Silver Dagger', materials: [{ name: 'Ghostly Essence', qty: 2 }, { name: 'Devil Horn', qty: 2 }],         gold: 20000 },
    { result: 'Godslayer',       base: 'Excalibur',     materials: [{ name: 'Dragon Heart', qty: 3 }, { name: 'Pure Emperium', qty: 1 }],         gold: 60000 },
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
    if (mapId === 'svarrga') return table;

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

    return table;
}

// ============ WATER SPAWN TABLE ============
export function getWaterSpawnTable(playerLevel) {
    const table = [];
    table.push({ type: 'shrimp', weight: 30 });
    table.push({ type: 'clam', weight: 20 });
    if (playerLevel >= 2) table.push({ type: 'fish', weight: 25 });
    if (playerLevel >= 4) table.push({ type: 'crab', weight: 20 });
    if (playerLevel >= 7) table.push({ type: 'marina', weight: 12 });
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

// All monsters combined (for lookup)
export function getAllMonsters() {
    return { ...MONSTERS, ...PAYON_MONSTERS, ...GLAST_MONSTERS, ...MJOLNIR_MONSTERS, ...ABYSS_MONSTERS, ...WATER_MONSTERS };
}
