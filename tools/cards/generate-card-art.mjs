// Generates the 60 collectible card sprites as 96x96 transparent PNGs.
//
// No AI image tool or image library is available here, so each creature is
// drawn procedurally from a small set of parametric archetypes (slime, beast,
// dragon, undead, golem, demon, bug, sea, plant, ghost, winged...). Every card
// gets an archetype + palette + accents derived from its identity, and a
// per-id seeded RNG adds subtle unique variation. Rerunning is deterministic.
//
// Usage:  node tools/cards/generate-card-art.mjs [--sheet]
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Canvas, hexToRgb, shade, mulberry32, hashSeed } from './pixel.mjs';
import { CARD_CATALOG } from '../../src/cards/CardCatalog.js';

const A = (c, a = 255) => [...(typeof c === 'string' ? hexToRgb(c) : c), a];
const S = (c, f, a = 255) => [...shade(typeof c === 'string' ? hexToRgb(c) : c, f), a];
const OUT = 96, CX = 48;

// Soft two-eye + mouth face used by many round creatures.
function face(c, cx, cy, opt = {}) {
  const es = opt.eyeSize || 5, gap = opt.gap || 10, ey = cy;
  const white = opt.eyeWhite !== false;
  const pupil = opt.pupil || '#1a1a28';
  for (const dx of [-gap, gap]) {
    if (white) c.ellipse(cx + dx, ey, es, es + 1, A('#ffffff'));
    c.ellipse(cx + dx + (opt.look || 0), ey + 1, es * 0.55, es * 0.7, A(pupil));
    if (white) c.px(cx + dx - 1, ey - 1, A('#ffffff'));
  }
  if (opt.mouth !== false) {
    const my = cy + (opt.mouthY || 11);
    c.line(cx - 3, my, cx, my + 2, A('#7a2b3a'));
    c.line(cx, my + 2, cx + 3, my, A('#7a2b3a'));
  }
  if (opt.blush) { c.ellipse(cx - gap - 3, ey + 6, 4, 2, A(opt.blush, 180)); c.ellipse(cx + gap + 3, ey + 6, 4, 2, A(opt.blush, 180)); }
}

function glowEyes(c, cx, cy, color, opt = {}) {
  const gap = opt.gap || 9, es = opt.size || 3.4;
  for (const dx of [-gap, gap]) {
    c.ellipse(cx + dx, cy, es + 1.5, es + 1.5, A(color, 70));
    c.ellipse(cx + dx, cy, es, es, A('#ffffff', 235));
    c.ellipse(cx + dx, cy, es * 0.5, es * 0.5, A(color));
  }
}

// ---------- Archetypes ----------
const arch = {
  slime(c, o) {
    const b = o.body;
    c.ellipse(CX, 62, 30, 25, S(b, 0.82));         // base shadow tone
    c.ellipse(CX, 60, 29, 24, A(b));
    c.ellipse(CX - 8, 52, 15, 11, S(b, 1.18));     // top highlight
    c.ellipse(CX - 12, 48, 6, 4, A('#ffffff', 150));
    if (o.ghost) { for (let i = 0; i < 4; i++) c.ellipse(30 + i * 12, 84 + (i % 2) * 3, 5, 4, A(b, 200)); }
    face(c, CX, 58, { gap: 11, eyeSize: 5, blush: o.blush || (o.ghost ? null : '#ff8fb0'), pupil: o.pupil });
    if (o.halo) { c.ring(CX, 30, 13, 4, 2.2, A('#ffe680')); }
    if (o.crown) { for (const dx of [-10, 0, 10]) c.line(CX + dx, 40, CX + dx, 33, A('#ffd24a')); c.rect(CX - 12, 40, 24, 3, A('#ffd24a')); }
    if (o.wings) { c.ellipse(20, 54, 10, 6, A('#ffffff', 235)); c.ellipse(76, 54, 10, 6, A('#ffffff', 235)); }
  },

  bunny(c, o) {
    const b = o.body;
    for (const dx of [-10, 10]) { c.ellipse(CX + dx, 40, 5, 13, A(b)); c.ellipse(CX + dx, 40, 2.5, 9, A(o.inner || '#ffd6e6')); }
    c.ellipse(CX, 62, 22, 20, S(b, 0.85));
    c.ellipse(CX, 60, 21, 19, A(b));
    c.ellipse(CX - 6, 54, 10, 8, S(b, 1.15));
    face(c, CX, 58, { gap: 8, eyeSize: 4, blush: '#ffb3c7', mouthY: 8 });
    c.ellipse(CX, 65, 2.5, 2, A('#ff9bb5'));
  },

  fox(c, o) {
    const b = o.body;
    // multiple tails behind
    for (let i = 0; i < (o.tails || 3); i++) {
      const ang = (i - (o.tails - 1) / 2) * 0.5;
      c.ellipse(CX + Math.sin(ang) * 26, 60 - Math.cos(ang) * 6, 6, 16, A(b, 220));
      c.ellipse(CX + Math.sin(ang) * 30, 50 - Math.cos(ang) * 6, 5, 6, A(o.tip || '#ffffff'));
    }
    c.ellipse(CX, 60, 18, 16, A(b));
    for (const dx of [-11, 11]) { c.line(CX + dx, 50, CX + dx - Math.sign(dx) * 2, 40, A(b)); c.line(CX + dx, 50, CX + dx + Math.sign(dx) * 6, 44, A(b)); c.ellipse(CX + dx + Math.sign(dx) * 2, 46, 4, 5, A(b)); }
    c.ellipse(CX, 62, 12, 11, S(b, 1.12));
    face(c, CX, 58, { gap: 7, eyeSize: 3.5, mouth: false, pupil: o.eye || '#3a2a1a' });
    c.ellipse(CX, 64, 2, 1.6, A('#2a1a1a'));
  },

  boar(c, o) {
    const b = o.body;
    c.ellipse(CX, 60, 26, 18, A(b));
    c.ellipse(CX - 8, 54, 12, 8, S(b, 1.12));
    c.ellipse(CX, 68, 9, 6, S(b, 0.8));            // snout
    c.ellipse(CX - 3, 68, 1.5, 1.5, A('#2a1a1a')); c.ellipse(CX + 3, 68, 1.5, 1.5, A('#2a1a1a'));
    for (const dx of [-9, 9]) c.line(CX + dx, 66, CX + dx + Math.sign(dx) * 4, 58, A('#fff2d0')); // tusks
    for (const dx of [-14, 14]) { c.line(CX + dx, 50, CX + dx - Math.sign(dx) * 3, 42, A(b)); } // ears
    glowEyes(c, CX, 54, o.eye || '#ff5a3c', { gap: 8, size: 2.6 });
  },

  wolf(c, o) {
    const b = o.body;
    c.ellipse(CX, 60, 22, 18, A(b));
    for (const dx of [-13, 13]) { c.line(CX + dx, 48, CX + dx, 36, A(b)); c.line(CX + dx - Math.sign(dx) * 5, 48, CX + dx, 36, A(b)); c.ellipse(CX + dx, 44, 3.5, 5, A(b)); }
    c.ellipse(CX - 7, 55, 11, 9, S(b, 1.15));
    c.ellipse(CX, 66, 8, 6, S(b, 0.82));           // muzzle
    c.ellipse(CX, 68, 2.5, 2, A('#111'));
    glowEyes(c, CX, 56, o.eye || '#7fe0ff', { gap: 8, size: 3 });
    if (o.mane) for (let i = 0; i < 8; i++) c.line(CX - 20 + i * 5, 46, CX - 22 + i * 5, 40, A(o.mane));
  },

  caterpillar(c, o) {
    const b = o.body;
    for (let i = 0; i < 4; i++) { const x = 26 + i * 15; c.ellipse(x, 60 - (i === 3 ? 4 : 0), 11 - i, 10 - i * 0.5, A(i === 3 ? o.head || b : b)); c.ellipse(x - 2, 56, 4, 3, S(b, 1.15)); }
    if (o.horn) { c.line(71, 52, 74, 42, A(o.horn)); c.ellipse(74, 41, 2.5, 2.5, A(o.horn)); }
    c.ellipse(69, 58, 2, 2, A('#111')); c.ellipse(75, 60, 2, 2, A('#111'));
  },

  mushroom(c, o) {
    c.rect(CX - 7, 58, 14, 24, A(o.stem || '#f2e6c0'));  // stalk
    c.ellipse(CX, 78, 12, 5, S(o.stem || '#f2e6c0', 0.9));
    c.ellipse(CX, 52, 28, 18, A(o.cap));
    c.ellipse(CX - 8, 46, 12, 7, S(o.cap, 1.15));
    for (const [x, y, r] of [[32, 50, 4], [58, 48, 5], [46, 42, 3], [64, 56, 3]]) c.ellipse(x, y, r, r * 0.8, A(o.spot || '#fff4e0'));
    c.ellipse(CX - 6, 66, 1.8, 2.2, A('#3a2a2a')); c.ellipse(CX + 6, 66, 1.8, 2.2, A('#3a2a2a'));
  },

  tree(c, o) {
    c.rect(CX - 5, 58, 10, 26, A(o.trunk || '#7a5230'));
    c.line(CX, 68, CX - 12, 60, A(o.trunk || '#7a5230')); c.line(CX, 64, CX + 12, 56, A(o.trunk || '#7a5230'));
    for (const [x, y, r] of [[CX, 40, 22], [CX - 16, 48, 13], [CX + 16, 48, 13], [CX, 30, 15]]) c.ellipse(x, y, r, r * 0.9, A(o.leaf));
    c.ellipse(CX - 10, 34, 10, 7, S(o.leaf, 1.15));
    if (o.glow) for (let i = 0; i < 10; i++) c.ellipse(28 + (i * 41) % 40, 26 + (i * 29) % 34, 1.5, 1.5, A(o.glow, 230));
    if (o.face) { c.ellipse(CX - 7, 46, 2.2, 3, A('#2a1a10')); c.ellipse(CX + 7, 46, 2.2, 3, A('#2a1a10')); }
  },

  flower(c, o) {
    c.rect(CX - 2, 60, 4, 24, A('#5a8a3a'));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.ellipse(CX + Math.cos(a) * 16, 50 + Math.sin(a) * 16, 8, 6, A(o.petal)); }
    c.ellipse(CX, 50, 11, 11, A(o.center || '#ffe680'));
    face(c, CX, 49, { gap: 5, eyeSize: 2.4, mouth: false, blush: '#ffb0c8' });
    if (o.glow) for (let i = 0; i < 8; i++) c.ellipse(20 + (i * 37) % 56, 24 + (i * 23) % 20, 1.4, 1.4, A(o.glow, 230));
  },

  bug(c, o) {
    if (o.wings) { c.ellipse(CX - 14, 52, 12, 8, A(o.wing || '#cfe8ff', 170)); c.ellipse(CX + 14, 52, 12, 8, A(o.wing || '#cfe8ff', 170)); }
    c.ellipse(CX, 60, 15, 20, A(o.body));
    c.ellipse(CX - 4, 50, 7, 9, S(o.body, 1.15));
    for (let i = 0; i < 3; i++) { c.line(CX - 13, 52 + i * 8, CX - 22, 50 + i * 9, A(S(o.body, 0.7))); c.line(CX + 13, 52 + i * 8, CX + 22, 50 + i * 9, A(S(o.body, 0.7))); }
    c.line(CX - 5, 44, CX - 9, 36, A('#333')); c.line(CX + 5, 44, CX + 9, 36, A('#333'));  // antennae
    glowEyes(c, CX, 50, o.eye || '#ffe680', { gap: 5, size: 2.4 });
    if (o.shell) c.line(CX, 44, CX, 78, A(S(o.body, 0.65)));
  },

  crab(c, o) {
    c.ellipse(CX, 60, 24, 15, A(o.body));
    c.ellipse(CX - 8, 55, 11, 6, S(o.body, 1.15));
    for (const dx of [-24, 24]) { c.ellipse(CX + dx, 52, 7, 6, A(o.body)); c.line(CX + dx - 3, 48, CX + dx + 3, 44, A(S(o.body, 0.8))); }
    for (let i = 0; i < 3; i++) { c.line(CX - 14, 68, CX - 24, 74 + i * 3, A(S(o.body, 0.85))); c.line(CX + 14, 68, CX + 24, 74 + i * 3, A(S(o.body, 0.85))); }
    for (const dx of [-6, 6]) { c.line(CX + dx, 48, CX + dx, 40, A(S(o.body, 0.8))); c.ellipse(CX + dx, 40, 2.5, 2.5, A('#fff')); c.ellipse(CX + dx, 40, 1.2, 1.2, A('#111')); }
  },

  shrimp(c, o) {
    for (let i = 0; i < 6; i++) { const a = -0.5 + i * 0.42; c.ellipse(CX + Math.cos(a) * (10 + i * 2), 56 + Math.sin(a) * (10 + i * 2), 7 - i * 0.6, 6 - i * 0.5, A(o.body)); }
    c.ellipse(38, 50, 8, 7, A(S(o.body, 1.1)));
    c.line(34, 48, 26, 40, A(S(o.body, 0.8))); c.line(36, 46, 30, 38, A(S(o.body, 0.8)));
    c.ellipse(36, 50, 2, 2, A('#111'));
  },

  clam(c, o) {
    c.ellipse(CX, 66, 28, 12, A(o.shell));
    c.ellipse(CX, 54, 28, 14, A(S(o.shell, 1.1)));
    for (let i = 0; i < 6; i++) c.line(CX, 54, 22 + i * 10, 66, A(S(o.shell, 0.8)));
    c.ellipse(CX, 58, 6, 6, A(o.pearl || '#f4f8ff'));
    c.ellipse(CX - 2, 56, 2, 2, A('#fff'));
  },

  fish(c, o) {
    c.ellipse(44, 56, 20, 13, A(o.body));
    c.line(60, 56, 74, 46, A(o.fin || o.body)); c.line(60, 56, 74, 66, A(o.fin || o.body)); c.ellipse(68, 56, 6, 10, A(o.fin || o.body));
    c.ellipse(38, 52, 8, 5, S(o.body, 1.15));
    c.ellipse(36, 54, 3.5, 3.5, A('#fff')); c.ellipse(36, 54, 1.6, 1.6, A('#111'));
    c.line(30, 58, 34, 60, A(S(o.body, 0.7)));
  },

  turtle(c, o) {
    c.ellipse(CX, 58, 26, 20, A(o.shell));
    c.ellipse(CX, 56, 26, 20, A(o.shell)); c.ellipse(CX - 8, 50, 11, 8, S(o.shell, 1.15));
    for (const [x, y] of [[CX, 46], [CX - 12, 56], [CX + 12, 56], [CX, 66]]) c.ring(x, y, 6, 6, 1.5, S(o.shell, 0.7));
    c.ellipse(CX, 40, 8, 7, A(o.skin || '#9ac07a'));   // head
    glowEyes(c, CX, 39, o.eye || '#fff', { gap: 4, size: 2 });
    for (const dx of [-22, 22]) c.ellipse(CX + dx, 66, 6, 4, A(o.skin || '#9ac07a'));
    if (o.crown) { c.rect(CX - 7, 32, 14, 3, A('#ffd24a')); for (const dx of [-6, 0, 6]) c.line(CX + dx, 32, CX + dx, 28, A('#ffd24a')); }
  },

  egg(c, o) {
    c.ellipse(CX, 58, 22, 28, A(o.shell));
    c.ellipse(CX - 7, 44, 9, 12, S(o.shell, 1.15));
    for (const [x, y, r] of [[40, 60, 5], [58, 52, 6], [50, 72, 4], [60, 68, 3]]) c.ellipse(x, y, r, r, A(o.spot));
    if (o.crack) { c.line(CX - 6, 44, CX - 2, 52, A(S(o.shell, 0.5))); c.line(CX - 2, 52, CX + 4, 46, A(S(o.shell, 0.5))); c.line(CX + 4, 46, CX + 8, 54, A(S(o.shell, 0.5))); }
  },

  dragon(c, o) {
    // serpentine neck + head
    c.line(CX, 84, CX - 6, 66, A(S(o.body, 0.85))); c.line(CX - 6, 66, CX + 4, 54, A(S(o.body, 0.85)));
    c.ellipse(CX, 82, 10, 8, A(S(o.body, 0.85)));
    c.ellipse(CX + 2, 46, 17, 15, A(o.body));         // head
    c.ellipse(CX + 12, 50, 9, 7, A(S(o.body, 0.9)));  // snout
    for (const dx of [-6, 8]) { c.line(CX + dx, 34, CX + dx - 3, 24, A(o.horn || '#e8e0c0')); }  // horns
    if (o.frill) { for (const dy of [-8, 0, 8]) c.line(CX - 12, 46 + dy, CX - 20, 42 + dy, A(o.frill)); }
    glowEyes(c, CX + 4, 44, o.eye || '#ffd24a', { gap: 7, size: 3 });
    c.ellipse(CX + 20, 52, 1.6, 1.6, A('#111')); // nostril
    if (o.aura) for (let i = 0; i < 10; i++) c.ellipse(24 + (i * 47) % 48, 26 + (i * 31) % 40, 1.6, 1.6, A(o.aura, 210));
    if (o.wings) { c.ellipse(22, 44, 12, 16, A(o.body, 150)); c.ellipse(74, 44, 12, 16, A(o.body, 150)); }
  },

  skull(c, o) {
    const bone = o.bone || '#eae6d8';
    if (o.helm) { c.ellipse(CX, 42, 20, 18, A(o.helm)); c.rect(CX - 20, 42, 40, 6, A(S(o.helm, 0.8))); }
    c.ellipse(CX, 48, 17, 16, A(bone));
    c.rect(CX - 9, 60, 18, 10, A(bone));               // jaw
    for (let i = 0; i < 4; i++) c.rect(CX - 8 + i * 4, 62, 2, 7, A(S(bone, 0.7)));
    c.ellipse(CX - 8, 48, 5.5, 6, A('#111'));           // sockets
    c.ellipse(CX + 8, 48, 5.5, 6, A('#111'));
    glowEyes(c, CX, 48, o.eye || '#ff5a3c', { gap: 8, size: 2.2 });
    c.ellipse(CX, 56, 2.5, 3, A('#111'));               // nasal
    if (o.hood) { c.ring(CX, 44, 22, 22, 5, A(o.hood)); c.ellipse(CX, 22, 12, 6, A(o.hood)); }
    if (o.zombie) { for (let i = 0; i < 5; i++) c.px(CX - 10 + i * 5, 40 + (i % 2) * 3, A('#6a8a3a')); }
  },

  golem(c, o) {
    const r = o.rock;
    c.rect(CX - 20, 44, 40, 40, A(r));
    c.rect(CX - 20, 44, 40, 6, A(S(r, 1.15)));
    // block seams
    for (const y of [56, 70]) c.line(CX - 20, y, CX + 20, y, A(S(r, 0.75)));
    for (const x of [CX - 6, CX + 8]) c.line(x, 44, x, 84, A(S(r, 0.75)));
    for (const dx of [-26, 26]) c.rect(CX + dx - 3, 52, 6, 20, A(S(r, 0.9)));  // arms
    glowEyes(c, CX, 56, o.eye || '#ffd24a', { gap: 8, size: 3 });
    if (o.crystal) for (const [x, y] of [[CX, 40], [CX - 14, 48]]) { c.ellipse(x, y, 4, 6, A(o.crystal, 230)); }
    if (o.fur) for (let i = 0; i < 14; i++) { c.line(CX - 22 + i * 3, 44, CX - 23 + i * 3, 38, A(o.fur)); }
    if (o.wings) { c.line(CX - 20, 50, CX - 34, 40, A(S(r, 0.8))); c.line(CX - 20, 50, CX - 32, 58, A(S(r, 0.8))); c.line(CX + 20, 50, CX + 34, 40, A(S(r, 0.8))); c.line(CX + 20, 50, CX + 32, 58, A(S(r, 0.8))); }
  },

  demon(c, o) {
    const sk = o.skin;
    for (const dx of [-14, 14]) { c.line(CX + dx, 42, CX + dx + Math.sign(dx) * 8, 26, A(o.horn || '#3a2030')); c.ellipse(CX + dx + Math.sign(dx) * 8, 26, 2.5, 2.5, A(o.horn || '#3a2030')); }
    if (o.hood) c.ellipse(CX, 46, 22, 22, A(o.hood));
    c.ellipse(CX, 52, 17, 17, A(sk));
    c.ellipse(CX - 6, 46, 8, 7, S(sk, 1.12));
    glowEyes(c, CX, 52, o.eye || '#ff3040', { gap: 7, size: 3.2 });
    c.line(CX - 5, 62, CX, 64, A(S(sk, 0.6))); c.line(CX, 64, CX + 5, 62, A(S(sk, 0.6)));
    for (const dx of [-3, 0, 3]) c.line(CX + dx, 64, CX + dx, 68, A('#fff'));  // fangs
    if (o.wings) { c.ellipse(20, 50, 11, 14, A(S(sk, 0.6), 200)); c.ellipse(76, 50, 11, 14, A(S(sk, 0.6), 200)); }
    if (o.aura) for (let i = 0; i < 12; i++) c.ellipse(22 + (i * 43) % 52, 24 + (i * 29) % 46, 1.7, 1.7, A(o.aura, 215));
  },

  ghost(c, o) {
    const b = o.body;
    c.ellipse(CX, 50, 20, 20, A(b, o.alpha || 235));
    for (let i = 0; i < 4; i++) c.ellipse(30 + i * 12, 72 + (i % 2) * 4, 6, 7, A(b, (o.alpha || 235) - 20));
    c.ellipse(CX - 6, 44, 8, 7, A('#ffffff', 120));
    if (o.hood) { c.ring(CX, 46, 22, 22, 5, A(o.hood)); c.ellipse(CX, 26, 12, 7, A(o.hood)); }
    glowEyes(c, CX, 50, o.eye || '#7fe0ff', { gap: 8, size: 3 });
    if (o.crown) { c.rect(CX - 11, 30, 22, 3, A('#ffd24a')); for (const dx of [-9, 0, 9]) c.line(CX + dx, 30, CX + dx, 25, A('#ffd24a')); }
    if (o.mouth) { c.ellipse(CX, 60, 4, 5, A('#111', 180)); }
  },

  winged(c, o) {
    c.ellipse(20, 48, 9, 20, A(o.wing || '#ffffff'));   // wings
    c.ellipse(76, 48, 9, 20, A(o.wing || '#ffffff'));
    c.ellipse(18, 40, 6, 12, A(S(o.wing || '#ffffff', 0.92)));
    c.ellipse(78, 40, 6, 12, A(S(o.wing || '#ffffff', 0.92)));
    c.ellipse(CX, 50, 14, 16, A(o.body));               // torso/head
    c.ellipse(CX, 40, 10, 10, A(o.skin || '#ffe0c0'));  // head
    if (o.helm) { c.ellipse(CX, 37, 11, 9, A(o.helm)); for (const dx of [-11, 11]) { c.line(CX + dx, 40, CX + dx, 30, A('#ffffff')); } }
    glowEyes(c, CX, 40, o.eye || '#7fd0ff', { gap: 4, size: 1.8 });
    if (o.halo) c.ring(CX, 26, 9, 3, 2, A('#ffe680'));
    if (o.aura) for (let i = 0; i < 10; i++) c.ellipse(22 + (i * 41) % 52, 22 + (i * 33) % 20, 1.5, 1.5, A(o.aura, 220));
  },
};

// ---------- Per-card assignment ----------
// arch + palette + accents. Colours chosen to evoke each monster's identity.
const CARD_ART = {
  // Common
  poring: { arch: 'slime', body: '#ff9db4' },
  willow: { arch: 'tree', leaf: '#6db24a', trunk: '#6f4a2a', face: true },
  lunatic: { arch: 'bunny', body: '#f6e7d2' },
  fabre: { arch: 'caterpillar', body: '#d8d84a', head: '#c0c040' },
  rocker: { arch: 'bug', body: '#5aa03a', wings: true, wing: '#cfe8b0' },
  horn: { arch: 'caterpillar', body: '#7ab0d8', head: '#5a90c0', horn: '#f0e6c0' },
  spore: { arch: 'mushroom', cap: '#c85a6a', stem: '#efe3c4' },
  shrimp: { arch: 'shrimp', body: '#ff8a5a' },
  clam: { arch: 'clam', shell: '#e6c8a0', pearl: '#f6faff' },
  fish: { arch: 'fish', body: '#5aa8d8', fin: '#3a80b0' },
  crab: { arch: 'crab', body: '#e06a4a' },
  dragon_egg: { arch: 'egg', shell: '#c9b48a', spot: '#8a6a3a' },

  // Rare
  poporing: { arch: 'slime', body: '#7ec84a', blush: null },
  drops: { arch: 'slime', body: '#ffcf4a' },
  savage: { arch: 'boar', body: '#a8825a', eye: '#ff5a3c' },
  boa: { arch: 'dragon', body: '#8ac04a', horn: '#d8e0a0', eye: '#ffcf4a', frill: '#5a8a2a' },
  bigfoot: { arch: 'golem', rock: '#8a6a4a', fur: '#a88a5a', eye: '#ff5a3c' },
  nine_tail: { arch: 'fox', body: '#e0a03a', tip: '#fff4e0', tails: 5, eye: '#7a4a1a' },
  skeleton: { arch: 'skull', bone: '#e6e0cc', eye: '#ff5a3c' },
  zombie: { arch: 'skull', bone: '#9ab06a', eye: '#a0ff5a', zombie: true },
  hunter_fly: { arch: 'bug', body: '#5a5a6a', wings: true, wing: '#cfd8ff', eye: '#ff4040' },
  golem: { arch: 'golem', rock: '#9a9a9a', eye: '#ffd24a' },
  marina: { arch: 'slime', body: '#5ac8d8', ghost: true, pupil: '#1a3a4a' },
  sea_dragon: { arch: 'dragon', body: '#3a8ac0', horn: '#bfe0f0', eye: '#7fffd0', frill: '#2a6a9a', aura: '#7fe0ff' },

  // Epic
  deviruchi: { arch: 'demon', skin: '#5a3a6a', horn: '#2a1830', eye: '#ffcf4a' },
  ghostring: { arch: 'ghost', body: '#eef2f6', eye: '#3a3a5a', mouth: true },
  archer_skeleton: { arch: 'skull', bone: '#dcd6bc', eye: '#7fe0ff', helm: '#6a5a3a' },
  raydric: { arch: 'ghost', body: '#3a4a6a', hood: '#22283a', eye: '#ff5a3c' },
  harpy: { arch: 'winged', body: '#8a5a3a', wing: '#b88a4a', skin: '#e6c0a0', eye: '#ffcf4a' },
  gargoyle: { arch: 'golem', rock: '#6a6a7a', wings: true, eye: '#ff5a3c' },
  stone_golem: { arch: 'golem', rock: '#8a8272', eye: '#ffd24a' },
  iron_golem: { arch: 'golem', rock: '#7a8290', crystal: '#bfe8ff', eye: '#cfe8ff' },
  leib_olmai: { arch: 'demon', skin: '#b04a2a', horn: '#3a1810', eye: '#ffcf4a', aura: '#ff8a3a' },
  dark_illusion: { arch: 'ghost', body: '#3a2a5a', hood: '#1a1030', eye: '#c07aff', alpha: 210 },
  abyss_knight: { arch: 'demon', skin: '#4a3050', horn: '#1a1020', hood: '#2a1838', eye: '#ff3040', wings: true },
  storm_dragon: { arch: 'dragon', body: '#6a7ad0', horn: '#d0d8ff', eye: '#fff6a0', frill: '#4a5aa0', aura: '#cfe0ff' },

  // Legendary
  dullahan: { arch: 'skull', bone: '#e0dccb', eye: '#7fff9a', helm: '#3a3a4a', hood: '#26202e' },
  ghostring_prime: { arch: 'ghost', body: '#f6f8fb', eye: '#ffcf4a', crown: true, mouth: true },
  angeling: { arch: 'slime', body: '#f4f6fa', halo: true, wings: true, blush: '#ffd0e0' },
  golden_thief_bug: { arch: 'bug', body: '#e0b040', wings: true, wing: '#fff0b0', shell: true, eye: '#3a2a10' },
  doppelganger: { arch: 'ghost', body: '#5a4a7a', hood: '#2a1c40', eye: '#ff5adf', alpha: 200 },
  maya: { arch: 'bug', body: '#c89a3a', wings: true, wing: '#f0e0a0', shell: true, eye: '#5a3a10' },
  baphomet: { arch: 'demon', skin: '#6a2a2a', horn: '#f0e0b0', eye: '#ffcf4a', aura: '#ff5a3c' },
  drake: { arch: 'dragon', body: '#3a5a4a', horn: '#d8c090', eye: '#ffcf4a', frill: '#2a4030', aura: '#7fffb0' },
  moonlight_flower: { arch: 'flower', petal: '#f6c8e0', center: '#fff0a0', glow: '#ffffff' },
  turtle_general: { arch: 'turtle', shell: '#5a7a4a', skin: '#9ac07a', crown: true, eye: '#ffd24a' },
  samurai_specter: { arch: 'skull', bone: '#e0dccb', helm: '#7a2a2a', eye: '#ff5a3c', hood: '#2a1418' },
  valkyrie: { arch: 'winged', body: '#c0c8d8', wing: '#ffffff', helm: '#d8b040', skin: '#ffe0c0', eye: '#7fd0ff', halo: false },

  // Mythic
  valdris: { arch: 'dragon', body: '#7a3ac0', horn: '#e0c8ff', eye: '#ffe680', frill: '#5a2a9a', aura: '#c79fff', wings: true },
  ignarok: { arch: 'dragon', body: '#d84a2a', horn: '#ffcf4a', eye: '#fff2a0', frill: '#a03018', aura: '#ff8a3a', wings: true },
  abyss_golem: { arch: 'golem', rock: '#3a3450', crystal: '#a06aff', eye: '#c79fff' },
  morgath: { arch: 'demon', skin: '#2a3a5a', horn: '#7fe0ff', eye: '#7fffd0', aura: '#7fe0ff', wings: true },
  kaltharu: { arch: 'demon', skin: '#4a7ab0', horn: '#d0f0ff', eye: '#eaffff', aura: '#bfe8ff', hood: '#2a4a6a' },
  zulgaroth: { arch: 'demon', skin: '#5a2a2a', horn: '#1a0a0a', eye: '#ff3a2a', aura: '#ff5a2a', wings: true },
  nidhogg: { arch: 'dragon', body: '#5a3a2a', horn: '#c8a060', eye: '#a0ff5a', frill: '#3a2418', aura: '#a0ff7a', wings: true },
  fenrir: { arch: 'wolf', body: '#8a94b0', eye: '#7fe0ff', mane: '#cfe0ff' },
  jormungandr: { arch: 'dragon', body: '#2a6a5a', horn: '#a0e0c0', eye: '#eaffd0', frill: '#1a4a3a', aura: '#7fffcf' },
  yggdrasil_guardian: { arch: 'tree', leaf: '#5ab06a', trunk: '#5a3a24', face: true, glow: '#d0ffb0' },
  emperium_avatar: { arch: 'golem', rock: '#b8a050', crystal: '#a0f0ff', eye: '#eaffff' },
  odins_echo: { arch: 'winged', body: '#7a8298', wing: '#e8eeff', helm: '#c0c8e0', skin: '#e6d0b0', eye: '#eaffff', aura: '#cfe0ff' },
};

// ---------- Render ----------
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../public/assets/cards');
mkdirSync(outDir, { recursive: true });

function drawCard(card) {
  const spec = CARD_ART[card.id];
  if (!spec) throw new Error(`No art spec for ${card.id}`);
  const c = new Canvas(OUT, OUT);
  const rnd = mulberry32(hashSeed(card.id));
  // tiny deterministic jitter so same-archetype cards aren't pixel-identical
  const jx = Math.floor((rnd() - 0.5) * 2);
  const drawFn = arch[spec.arch];
  const saved = c.px.bind(c);
  c.px = (x, y, col) => saved(x + jx, y, col);
  drawFn(c, spec);
  c.px = saved;
  return c;
}

const missing = CARD_CATALOG.filter(c => !CARD_ART[c.id]);
if (missing.length) { console.error('Missing specs:', missing.map(c => c.id)); process.exit(1); }

let count = 0;
for (const card of CARD_CATALOG) {
  const c = drawCard(card);
  writeFileSync(resolve(outDir, `${card.id}.png`), c.toPNG());
  count++;
}
console.log(`Wrote ${count} card sprites to ${outDir}`);

// Optional contact sheet for visual inspection.
if (process.argv.includes('--sheet')) {
  const cols = 12, cell = 96, pad = 4;
  const rows = Math.ceil(CARD_CATALOG.length / cols);
  const sheet = new Canvas(cols * (cell + pad) + pad, rows * (cell + pad) + pad);
  // dark backdrop so transparent sprites are visible
  sheet.rect(0, 0, sheet.w, sheet.h, A('#20242e'));
  CARD_CATALOG.forEach((card, i) => {
    const cx = pad + (i % cols) * (cell + pad), cy = pad + Math.floor(i / cols) * (cell + pad);
    const c = drawCard(card);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const s = (y * cell + x) * 4;
      if (c.data[s + 3] > 0) sheet.px(cx + x, cy + y, [c.data[s], c.data[s + 1], c.data[s + 2], c.data[s + 3]]);
    }
  });
  const sheetPath = process.argv[process.argv.indexOf('--sheet') + 1] || resolve(here, 'contact-sheet.png');
  writeFileSync(sheetPath, sheet.toPNG());
  console.log('Wrote contact sheet:', sheetPath);
}
