// Writes the synthetic GPX fixtures in testing/ (node scripts/generateSampleRoutes.mjs). Deterministic: perfect
// axis-aligned rectangles centred on Marienplatz with a fixed step and clock, not derived from any real walk.
// Never commit a real track here: a GPX file reveals where its walker lives. grid.test.ts pins the cell counts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CENTRE = { lat: 48.137, lon: 11.575 };
const M_PER_DEG_LAT = 111320;
const STEP_M = 5;
const STEP_S = 4; // 1.25 m/s, walking pace
const START = Date.UTC(2000, 0, 1);

const ROUTES = [
  { file: 'sample-route-short.gpx', name: 'Synthetic 20 x 10 m rectangle', width: 20, height: 10 },
  { file: 'sample-route.gpx', name: 'Synthetic 40 x 20 m rectangle', width: 40, height: 20 },
  { file: 'sample-route-long.gpx', name: 'Synthetic 175 x 175 m square', width: 175, height: 175 },
];

function rectangle(width, height) {
  const corners = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]];
  const points = [];
  corners.forEach(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % corners.length];
    const steps = Math.round((Math.abs(x1 - x0) + Math.abs(y1 - y0)) / STEP_M);
    for (let s = 0; s < steps; s++) points.push([x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps]);
  });
  points.push(corners[0]); // closes the loop
  return points;
}

function toGpx({ name, width, height }) {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((CENTRE.lat * Math.PI) / 180);
  const trkpts = rectangle(width, height).map(([x, y], i) => {
    const lat = (CENTRE.lat + y / M_PER_DEG_LAT).toFixed(6);
    const lon = (CENTRE.lon + x / mPerDegLon).toFixed(6);
    const time = new Date(START + i * STEP_S * 1000).toISOString();
    return `      <trkpt lat="${lat}" lon="${lon}"><time>${time}</time></trkpt>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Synthetic fixture, written by scripts/generateSampleRoutes.mjs. -->',
    '<gpx version="1.1" creator="generateSampleRoutes" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
    `    <name>${name}</name>`,
    '    <trkseg>',
    ...trkpts,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'testing');
mkdirSync(outDir, { recursive: true });
for (const route of ROUTES) writeFileSync(join(outDir, route.file), toGpx(route));
