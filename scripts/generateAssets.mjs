// Regenerate app icons: `node scripts/generateAssets.mjs` (pure Node, no deps; outputs in assets/ are checked in).
// A native rebuild is needed for the icon/splash to show: `npx expo prebuild --platform android && npx expo run:android`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encodePng } from './png.mjs'; // shared with generateArt.mjs

const GREEN = [0x2e, 0xcc, 0x71];
const CREAM = [0xfa, 0xfa, 0xf8];
const SS = 4; // subsamples per axis for anti-aliasing

// ---- Raster helpers -------------------------------------------------------

function createImage(w, h, bg) {
  const data = new Uint8Array(w * h * 4);
  if (bg) for (let i = 0; i < w * h; i++) data.set([bg[0], bg[1], bg[2], 255], i * 4);
  return { w, h, data };
}

// Fill every pixel whose subsamples fall inside `inside(x, y)`, alpha-blending "over" the existing pixel.
function fillShape(img, bbox, inside, color) {
  const x0 = Math.max(0, Math.floor(bbox[0]));
  const y0 = Math.max(0, Math.floor(bbox[1]));
  const x1 = Math.min(img.w, Math.ceil(bbox[2]));
  const y1 = Math.min(img.h, Math.ceil(bbox[3]));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++)
          if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
      if (!hits) continue;
      const a = hits / (SS * SS);
      const i = (y * img.w + x) * 4;
      const dstA = img.data[i + 3] / 255;
      const outA = a + dstA * (1 - a);
      for (let c = 0; c < 3; c++)
        img.data[i + c] = Math.round((color[c] * a + img.data[i + c] * dstA * (1 - a)) / outA);
      img.data[i + 3] = Math.round(outA * 255);
    }
  }
}

function ellipse(img, cx, cy, rx, ry, angleDeg, color) {
  const t = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const r = Math.max(rx, ry) + 1;
  fillShape(img, [cx - r, cy - r, cx + r, cy + r], (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = (dx * cos + dy * sin) / rx;
    const v = (-dx * sin + dy * cos) / ry;
    return u * u + v * v <= 1;
  }, color);
}

function roundedRect(img, x, y, w, h, radius, color) {
  fillShape(img, [x, y, x + w, y + h], (px, py) => {
    const qx = Math.max(x + radius - px, 0, px - (x + w - radius));
    const qy = Math.max(y + radius - py, 0, py - (y + h - radius));
    return qx * qx + qy * qy <= radius * radius;
  }, color);
}

// Paw print: one big pad + four toe pads. `size` is roughly the paw's width in px; (cx, cy) is its visual centre.
function paw(img, cx, cy, size, color) {
  const s = size / 1.02;
  const e = (ux, uy, rx, ry, ang) => ellipse(img, cx + ux * s, cy + (uy + 0.055) * s, rx * s, ry * s, ang, color);
  e(0, 0.17, 0.3, 0.24, 0); // big pad
  e(-0.4, -0.08, 0.11, 0.155, -28); // outer toes
  e(0.4, -0.08, 0.11, 0.155, 28);
  e(-0.15, -0.35, 0.115, 0.16, -8); // inner toes
  e(0.15, -0.35, 0.115, 0.16, 8);
}

// ---- Assets ---------------------------------------------------------------

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(outDir, { recursive: true });
const save = (name, img) => writeFileSync(join(outDir, name), encodePng(img));

// icon: opaque green, cream paw (OS applies its own mask)
let img = createImage(1024, 1024, GREEN);
paw(img, 512, 512, 600, CREAM);
save('icon.png', img);

// adaptive foreground: transparent, paw inside the central ~66% safe zone (background colour set in app.json)
img = createImage(1024, 1024, null);
paw(img, 512, 512, 520, CREAM);
save('adaptive-icon.png', img);

// splash: cream background, green paw ~300px wide
img = createImage(1284, 2778, CREAM);
paw(img, 642, 1389, 300, GREEN);
save('splash.png', img);

// favicon: green rounded square, cream paw
img = createImage(48, 48, null);
roundedRect(img, 0, 0, 48, 48, 11, GREEN);
paw(img, 24, 24, 30, CREAM);
save('favicon.png', img);

console.log('Wrote icon.png, adaptive-icon.png, splash.png, favicon.png to', outDir);
