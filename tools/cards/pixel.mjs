// Zero-dependency pixel-art toolkit: a tiny RGBA canvas + a hand-rolled PNG
// encoder (Node's built-in zlib does the deflate). Used to generate the card
// sprite set without pulling in sharp/canvas/PIL, none of which are available
// in this environment.
import { deflateSync } from 'node:zlib';

// ---- CRC32 (PNG chunk checksums) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4); // RGBA, transparent by default
  }

  // Alpha-composite a pixel (src over dst) so soft shading reads cleanly.
  px(x, y, [r, g, b, a = 255]) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255; return; }
    const da = this.data[i + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    const mix = (s, d) => Math.round((s * sa + d * da * (1 - sa)) / oa);
    this.data[i] = mix(r, this.data[i]);
    this.data[i + 1] = mix(g, this.data[i + 1]);
    this.data[i + 2] = mix(b, this.data[i + 2]);
    this.data[i + 3] = Math.round(oa * 255);
  }

  rect(x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, color);
  }

  // Filled ellipse centred at (cx,cy) with radii rx,ry.
  ellipse(cx, cy, rx, ry, color) {
    for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) {
      for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
        const dx = (xx - cx) / rx, dy = (yy - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(xx, yy, color);
      }
    }
  }

  // Ellipse outline of the given thickness (for eyes, rims, sigils).
  ring(cx, cy, rx, ry, thick, color) {
    for (let yy = Math.floor(cy - ry - 1); yy <= Math.ceil(cy + ry + 1); yy++) {
      for (let xx = Math.floor(cx - rx - 1); xx <= Math.ceil(cx + rx + 1); xx++) {
        const dx = (xx - cx) / rx, dy = (yy - cy) / ry, d = dx * dx + dy * dy;
        const inner = (rx - thick) / rx;
        if (d <= 1 && d >= inner * inner) this.px(xx, yy, color);
      }
    }
  }

  line(x0, y0, x1, y1, color) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  // Mirror the left half onto the right for bilaterally symmetric creatures.
  mirrorX() {
    const cx = this.w / 2;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < cx; x++) {
        const src = (y * this.w + x) * 4;
        const dstX = this.w - 1 - x;
        const dst = (y * this.w + dstX) * 4;
        for (let k = 0; k < 4; k++) this.data[dst + k] = this.data[src + k];
      }
    }
  }

  toPNG() {
    const { w, h, data } = this;
    // Filter each scanline with filter type 0 (None).
    const raw = Buffer.alloc(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;
      data.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + i] = v; });
    }
    const idat = deflateSync(raw, { level: 9 });

    const chunk = (type, body) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])), 0);
      return Buffer.concat([len, typeBuf, body, crcBuf]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // colour type: RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// ---- small colour helpers ----
export const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const shade = ([r, g, b], f) => [
  Math.max(0, Math.min(255, Math.round(r * f))),
  Math.max(0, Math.min(255, Math.round(g * f))),
  Math.max(0, Math.min(255, Math.round(b * f))),
];
// Deterministic PRNG so every regeneration is byte-identical.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
