// Minimal pure-Node PNG codec + magenta chroma key. Shared by generateAssets.mjs and generateArt.mjs.
// Images are { w, h, data } with data a Uint8Array/Uint8ClampedArray of RGBA bytes (4 per pixel).
import { deflateSync, inflateSync } from 'node:zlib';

// ---- PNG encoder (RGBA, 8-bit, no filtering) ------------------------------

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h); // filter byte 0 per row
  for (let y = 0; y < h; y++) {
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- PNG decoder (8-bit RGB or RGBA, non-interlaced) ----------------------

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(buf) {
  buf = Buffer.from(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG (bad signature). The API may have returned JPEG/WebP; only PNG is supported.');
  }
  let pos = 8;
  let w = 0, h = 0, colorType = -1;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9];
      if (depth !== 8) throw new Error(`Unsupported PNG bit depth ${depth} (need 8)`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG color type ${colorType} (need RGB or RGBA)`);
      if (body[12] !== 0) throw new Error('Interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (!w || !h) throw new Error('PNG has no IHDR');
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * h) throw new Error('PNG data truncated');

  // Undo the 5 scanline filters in place into `px` (unfiltered rows, no filter bytes).
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0; // left
      const b = y > 0 ? px[dst - stride + i] : 0; // up
      const c = i >= bpp && y > 0 ? px[dst - stride + i - bpp] : 0; // up-left
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Bad PNG filter type ${filter}`);
      }
      px[dst + i] = v & 0xff;
    }
  }
  if (bpp === 4) return { w, h, data: new Uint8Array(px.buffer, px.byteOffset, px.length) };
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = px[i * 3];
    data[i * 4 + 1] = px[i * 3 + 1];
    data[i * 4 + 2] = px[i * 3 + 2];
    data[i * 4 + 3] = 255;
  }
  return { w, h, data };
}

// ---- Magenta (#FF00FF) chroma key -----------------------------------------

const KEY_NEAR = 90; // RGB distance below this: fully transparent
const KEY_FAR = 150; // RGB distance above this: fully opaque; linear ramp between

// Mutates and returns `img`. Keys out #FF00FF, then despills magenta from edge pixels.
export function chromaKeyMagenta(img) {
  const { w, h, data } = img;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const d = Math.hypot(data[o] - 255, data[o + 1], data[o + 2] - 255);
    const keyAlpha = d <= KEY_NEAR ? 0 : d >= KEY_FAR ? 255 : ((d - KEY_NEAR) / (KEY_FAR - KEY_NEAR)) * 255;
    data[o + 3] = Math.round((data[o + 3] * keyAlpha) / 255);
    if (data[o + 3] === 0) {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0; // no magenta halo under fully transparent pixels
    }
  }
  // Despill only edge pixels (partly transparent, or touching a fully transparent pixel),
  // so genuinely pink/purple parts of the art are left alone.
  const transparentAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] === 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = data[o + 3];
      if (a === 0) continue;
      const edge = a < 255 || transparentAt(x - 1, y) || transparentAt(x + 1, y) || transparentAt(x, y - 1) || transparentAt(x, y + 1);
      if (!edge) continue;
      const g = data[o + 1];
      if (data[o] > g && data[o + 2] > g) {
        // Pull R and B toward G by the shared excess, removing the magenta tint.
        const excess = Math.min(data[o] - g, data[o + 2] - g);
        data[o] -= excess;
        data[o + 2] -= excess;
      }
    }
  }
  return img;
}
