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
    'Iron Helm': { emoji: '🪖', type: 'armor', rarity: 'rare', desc: 'หมวกเหล็กอัศวิน Novice หนักแน่นและบดบังการฟันหัวได้ดี (DEF +6, HP +50)', price: 50, defBonus: 6, hpBonus: 50 },
    'Silver Ring': { emoji: '💍', type: 'armor', rarity: 'rare', desc: 'แหวนเงินแท้น้ำหนักบางเบา ช่วยรักษาชีพจรหัวใจ (DEF +2, HP +30)', price: 450, defBonus: 2, hpBonus: 30 },
    'Speed Boots': { emoji: '🥾', type: 'armor', rarity: 'rare', desc: 'รองเท้าหนังเสือทอเหนียวทน เดินทางสะดวกเคลื่อนที่ว่องไว (DEF +5, HP +40)', price: 900, defBonus: 5, hpBonus: 40 },
    'Leather Cloak': { emoji: '🧥', type: 'armor', rarity: 'rare', desc: 'ผ้าคลุมไหล่หนังสุนัขป่า เก็บกักอุณภูมิผิวกายป้องกันบาดแผล (DEF +4, HP +60)', price: 650, defBonus: 4, hpBonus: 60 },

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
    'Aegis of Olympus': { emoji: '🌌', type: 'shield', rarity: 'mythic', desc: 'โล่เทวทูตอีจิสม่านอวกาศ ดูดซับการปัดเป่าดาเมจทั้งหมดอย่างไร้ขีดจำกัด (DEF +160, HP +1500)', price: 95000, defBonus: 160, hpBonus: 1500 }
};

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
};

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
    { name: 'Sword', price: 200 },
    { name: 'Bow', price: 250 },
    { name: 'Gun', price: 400 },
    { name: 'Fishing Rod', price: 150 },
    // Also list some basic defensive armor/shields in the shop
    { name: 'Cotton Shirt', price: 100 },
    { name: 'Wooden Buckler', price: 120 },
    { name: 'Iron Shield', price: 750 },
    { name: 'Adventurer Suit', price: 800 }
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

    if (mapId === 'payon') {
        table.push({ type: 'horn', weight: 30 });
        table.push({ type: 'spore', weight: 35 });
        table.push({ type: 'boa', weight: 25 });
        if (playerLevel >= 5) table.push({ type: 'savage', weight: 20 });
        if (playerLevel >= 8) table.push({ type: 'bigfoot', weight: 15 });
        if (playerLevel >= 12) table.push({ type: 'nine_tail', weight: 8 });
        return table;
    }

    // Prontera Field
    table.push({ type: 'poring', weight: Math.max(10, 45 - playerLevel * 3) });
    if (playerLevel >= 1) table.push({ type: 'lunatic', weight: 30 });
    if (playerLevel >= 3) table.push({ type: 'fabre', weight: 25 });
    if (playerLevel >= 5) table.push({ type: 'rocker', weight: 20 });
    if (playerLevel >= 8) table.push({ type: 'willow', weight: 18 });
    if (playerLevel >= 11) table.push({ type: 'poporing', weight: 15 });
    if (playerLevel >= 14) table.push({ type: 'drops', weight: 12 });
    if (playerLevel >= 18) table.push({ type: 'deviruchi', weight: 8 });
    if (playerLevel >= 22) table.push({ type: 'ghostring', weight: 3 }); // Boss rare spawn

    return table;
}

// ============ WATER SPAWN TABLE ============
export function getWaterSpawnTable(playerLevel) {
    const table = [];
    table.push({ type: 'shrimp', weight: 30 });
    table.push({ type: 'clam', weight: 20 });
    if (playerLevel >= 3) table.push({ type: 'fish', weight: 25 });
    if (playerLevel >= 6) table.push({ type: 'crab', weight: 20 });
    if (playerLevel >= 10) table.push({ type: 'marina', weight: 12 });
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
    return { ...MONSTERS, ...PAYON_MONSTERS, ...WATER_MONSTERS };
}
