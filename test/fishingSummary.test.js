import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const gameUI = read('../src/ui/GameUI.js');
const main = read('../src/main.js');
const css = read('../src/styles/index.css');

test('fishing session summary waits for pending online claims and renders totals', () => {
  assert.match(gameUI, /beginFishingSession\(\)/);
  assert.match(gameUI, /pendingClaims: 0/);
  assert.match(gameUI, /queueFishingReward\(\)/);
  assert.match(gameUI, /resolveFishingReward\(\)/);
  assert.match(gameUI, /if \(!session \|\| !session\.ended \|\| session\.pendingClaims > 0\) return/);
  assert.match(gameUI, /openFishingSummary\(session\)/);
  assert.match(gameUI, /มูลค่ารวม/);
  assert.match(gameUI, /จำนวนปลาทั้งหมด/);
  assert.match(main, /gameUI\?\.beginFishingSession\?\.\(\)/);
  assert.match(main, /gameUI\?\.endFishingSession\?\.\(\)/);
  assert.match(main, /gameUI\.resolveFishingReward\?\.\(\)/);
});

test('fishing summary is mobile-safe and clearly labels estimated value', () => {
  assert.match(css, /\.fishing-summary-overlay\s*\{[\s\S]*z-index:\s*12000/);
  assert.match(css, /\.fishing-summary__rows\s*\{[\s\S]*flex:\s*1 1 auto/);
  assert.match(css, /\.fishing-summary__rows\s*\{[\s\S]*min-height:\s*0/);
  assert.match(css, /\.fishing-summary__rows\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.fishing-summary__rows\s*\{[\s\S]*touch-action:\s*pan-y/);
  assert.match(css, /\.fishing-summary__totals\s*\{[\s\S]*grid-template-columns:\s*1fr 1fr/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.fishing-summary-card/);
  assert.match(css, /\.fishing-summary__totals\s*\{\s*flex:\s*0 0 auto/s);
  assert.match(css, /\.fishing-summary__done\s*\{\s*flex:\s*0 0 auto/s);
  assert.match(gameUI, /มูลค่านี้เป็นราคาขายโดยประมาณ ยังไม่ได้หักหรือเพิ่มเงินในกระเป๋า/);
});
