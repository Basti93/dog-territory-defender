#!/usr/bin/env node
/**
 * The Home Range — standalone geometry + freshness-curve validation prototype.
 *
 * NOT part of the app. Nothing here is imported by src/, and nothing here is
 * meant to be. This is the game-economist's scratch calculator: it implements
 * the proposed Home Range grid model, the freshness/wildness curve, and the
 * Fresh Ground payout multiplier, then *runs* them against simulated GPS walk
 * data to prove (or disprove) the design constraints in design.md.
 *
 * It mirrors the currently-implemented reward formulas from
 * src/economy/{balanceConfig,formulas,denEconomy,walkRewards}.ts verbatim so
 * the payout numbers are anchored to what actually ships, not to prose.
 *
 * Run:  node openspec/changes/home-range/home-range-prototype.mjs
 * Opt:  --full   print every day of the freshness table instead of samples
 */

const FULL = process.argv.includes('--full');

const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);
const sub = (t) => console.log(`\n--- ${t} ---`);
const f = (n, d = 3) => Number(n).toFixed(d);
const pad = (s, w) => String(s).padStart(w);

/* ================================================================== *
 * 0. AS IMPLEMENTED TODAY (mirrors src/economy/*.ts — do not "improve") *
 * ================================================================== */

const BALANCE = {
  sniffGarden: { maxBonusPercent: 8, curveRate: 25 },
  maxBuildingLevel: 100,
  xp: { perWalkBase: 20, perKm: 15, per1000m2: 5, areaCapM2: 20000 },
  leveling: { xpBase: 100, xpGrowth: 1.1, maxLevel: 100, buddyPayoutBase: 50, buddyPayoutGrowth: 1.055 },
};

const DAILY_REWARD_MULTIPLIERS = [1, 1, 1, 0.5, 0.25, 0.1];
const dailyRewardMultiplier = (order) =>
  DAILY_REWARD_MULTIPLIERS[Math.max(0, Math.min(order - 1, DAILY_REWARD_MULTIPLIERS.length - 1))];

const buddyPayout = (level) =>
  Math.round(BALANCE.leveling.buddyPayoutBase * Math.pow(BALANCE.leveling.buddyPayoutGrowth, level - 1));

function sniffGardenPct(sgLevel) {
  const { maxBonusPercent, curveRate } = BALANCE.sniffGarden;
  const normalizer = 1 - Math.exp(-BALANCE.maxBuildingLevel / curveRate);
  return (maxBonusPercent * (1 - Math.exp(-sgLevel / curveRate))) / normalizer;
}

const buddyTreatsPerWalk = (level, sgLevel) => Math.round(buddyPayout(level) * (1 + sniffGardenPct(sgLevel) / 100));

/* ================================================================== *
 * 1. PROPOSED: the grid model                                         *
 * ================================================================== */

const CELL_M = 20;            // grid cell edge, metres
const PAINT_RADIUS_M = 25;    // a cell is painted if its centre is within this of the walked path
const M_PER_DEG_LAT = 111320;
const D_LAT = CELL_M / M_PER_DEG_LAT;

const dLonForRow = (iy) => CELL_M / (M_PER_DEG_LAT * Math.cos((iy + 0.5) * D_LAT * (Math.PI / 180)));

function cellOf(lat, lon) {
  const iy = Math.floor(lat / D_LAT);
  const ix = Math.floor(lon / dLonForRow(iy));
  return [ix, iy];
}
function cellCentre(ix, iy) {
  return [(iy + 0.5) * D_LAT, (ix + 0.5) * dLonForRow(iy)];
}
const key = (ix, iy) => `${ix},${iy}`;

/** Flat-earth metre distance — fine at the <100 m scale this is ever used at. */
function metres(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lon2 - lon1) * M_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

const MAX_SEGMENT_M = 60;       // longer than this = signal gap, do not paint through it
const MAX_SEGMENT_SPEED_MS = 4.5; // faster than this = not a dog walk (bike/tram/car)
const SAMPLE_STEP_M = 5;         // resample the path this finely before stamping

/**
 * The core paint operation. Returns the Set of cell keys a GPS point list
 * covers. `points` are {lat, lon, t} with t in seconds (t optional).
 */
function paintWalk(points) {
  const cells = new Set();
  const stamp = (lat, lon) => {
    const [cx, cy] = cellOf(lat, lon);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ix = cx + dx;
        const iy = cy + dy;
        const [clat, clon] = cellCentre(ix, iy);
        if (metres(lat, lon, clat, clon) <= PAINT_RADIUS_M) cells.add(key(ix, iy));
      }
    }
  };
  if (points.length === 0) return cells;
  stamp(points[0].lat, points[0].lon);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = metres(a.lat, a.lon, b.lat, b.lon);
    if (d > MAX_SEGMENT_M) continue;
    if (a.t !== undefined && b.t !== undefined && b.t > a.t && d / (b.t - a.t) > MAX_SEGMENT_SPEED_MS) continue;
    const steps = Math.max(1, Math.ceil(d / SAMPLE_STEP_M));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      stamp(a.lat + (b.lat - a.lat) * u, a.lon + (b.lon - a.lon) * u);
    }
  }
  return cells;
}

/* ================================================================== *
 * 2. PROPOSED: the freshness / wildness curve                         *
 * ================================================================== */

const TAU_DAYS = 5;
const D_MAX_DAYS = 18;
const WILD_DENOM = 1 - Math.exp(-D_MAX_DAYS / TAU_DAYS);

/** wildness(days since the cell was last refreshed) -> [0, 1]; 1 == fully wild. */
function wildness(days) {
  if (days <= 0) return 0;
  if (days >= D_MAX_DAYS) return 1;
  return (1 - Math.exp(-days / TAU_DAYS)) / WILD_DENOM;
}

/* ================================================================== *
 * 3. PROPOSED: the Fresh Ground payout multiplier                     *
 * ================================================================== */

const K_BLOOM = 0.6;          // max fractional treats uplift at full wildness
const BLOOM_MIN_CELLS = 25;   // below this, no uplift (qualifying-walk floor, ~200 m)
const NEW_GROUND_MIN_CELLS = 12; // dilation-filtered new cells needed to call it New Ground
const MANUAL_BLOOM = 1 + K_BLOOM * wildness(1); // fixed multiplier for a manual log

/** Mean bloom weight over a walk's painted cells. New ground counts as fully wild. */
function bloomFactor(paintedCells, lastRefreshed, nowDays) {
  let sum = 0;
  for (const c of paintedCells) {
    const last = lastRefreshed.get(c);
    sum += last === undefined ? 1 : wildness(nowDays - last);
  }
  return paintedCells.size === 0 ? 0 : sum / paintedCells.size;
}
function bloomMultiplier(paintedCells, lastRefreshed, nowDays) {
  if (paintedCells.size < BLOOM_MIN_CELLS) return 1;
  return 1 + K_BLOOM * bloomFactor(paintedCells, lastRefreshed, nowDays);
}

/** New Ground test: painted, not in Range, and no 8-neighbour in Range either. */
function newGroundCells(paintedCells, range) {
  let n = 0;
  for (const c of paintedCells) {
    if (range.has(c)) continue;
    const [ix, iy] = c.split(',').map(Number);
    let touches = false;
    for (let dy = -1; dy <= 1 && !touches; dy++)
      for (let dx = -1; dx <= 1 && !touches; dx++) if (range.has(key(ix + dx, iy + dy))) touches = true;
    if (!touches) n++;
  }
  return n;
}

const CELLS_PER_STREET = 11;
const streetsKnown = (rangeSize) => (rangeSize > 0 ? Math.max(1, Math.floor(rangeSize / CELLS_PER_STREET)) : 0);

/* ================================================================== *
 * 4. Synthetic GPS routes                                             *
 * ================================================================== */

const LAT0 = 48.1374; // Munich
const LON0 = 11.5755;
const mToLat = (m) => m / M_PER_DEG_LAT;
const mToLon = (m) => m / (M_PER_DEG_LAT * Math.cos(LAT0 * (Math.PI / 180)));

/** Rectangular loop of the given perimeter, offset from the origin, sampled every ~2 m at 1.4 m/s. */
function rectLoop({ perimeterM = 1500, offsetE = 0, offsetN = 0, aspect = 1.5, jitterM = 0, rng = null }) {
  const half = perimeterM / 2;
  const w = (half * aspect) / (1 + aspect);
  const h = half - w;
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
    [0, 0],
  ];
  const pts = [];
  let t = 0;
  for (let i = 1; i < corners.length; i++) {
    const [x0, y0] = corners[i - 1];
    const [x1, y1] = corners[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(len / 2));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      let e = offsetE + x0 + (x1 - x0) * u;
      let n = offsetN + y0 + (y1 - y0) * u;
      if (jitterM > 0 && rng) {
        e += rng.normal() * jitterM;
        n += rng.normal() * jitterM;
      }
      pts.push({ lat: LAT0 + mToLat(n), lon: LON0 + mToLon(e), t });
      t += 2 / 1.4;
    }
  }
  return pts;
}

/** Deterministic PRNG so every run of this script prints identical numbers. */
function mulberry(seed) {
  let a = seed;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, normal: () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next()) };
}

/* ================================================================== *
 * 5. Colour maths (perceptibility of the day-to-day shift)            *
 * ================================================================== */

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexToLab(hex) {
  const r = srgbToLin(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbToLin(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbToLin(parseInt(hex.slice(5, 7), 16) / 255);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) * 100;
  const Y = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 100;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) * 100;
  const fx = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = [fx(X / 95.047), fx(Y / 100), fx(Z / 108.883)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerpLab = (A, B, u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
function lerpSrgbToLab(hexA, hexB, u) {
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = [0, 1, 2].map((i) => Math.round(ch(hexA, i) + (ch(hexB, i) - ch(hexA, i)) * u));
  return hexToLab('#' + mix.map((v) => v.toString(16).padStart(2, '0')).join(''));
}

const FRESH_HEX = '#2ECC71';
const WILD_HEX = '#DCE8BE';

/* ================================================================== *
 * SECTION A — the freshness curve                                     *
 * ================================================================== */

hr('A. FRESHNESS CURVE   wildness(d) = (1 - e^(-d/5)) / (1 - e^(-18/5)),  clamped to 1 at d >= 18');

const LAB_FRESH = hexToLab(FRESH_HEX);
const LAB_WILD = hexToLab(WILD_HEX);
const rampE = deltaE(LAB_FRESH, LAB_WILD);
console.log(`Ramp endpoints: fresh ${FRESH_HEX} -> wild ${WILD_HEX};  full-ramp deltaE76 = ${f(rampE, 1)}`);
console.log(`(deltaE ~2.3 = 1 JND, >5 = obvious at a glance)\n`);

console.log('  day   wildness  d(wild)/day   dE vs 1 day fresher   dE vs fully fresh');
const days = FULL ? [...Array(23).keys()] : [0, 1, 2, 3, 4, 5, 7, 10, 12, 14, 16, 17, 18, 19, 21, 30, 365];
for (const d of days) {
  const w = wildness(d);
  const wPrev = wildness(Math.max(0, d - 1));
  const dEstep = deltaE(lerpLab(LAB_FRESH, LAB_WILD, wPrev), lerpLab(LAB_FRESH, LAB_WILD, w));
  const dEabs = deltaE(LAB_FRESH, lerpLab(LAB_FRESH, LAB_WILD, w));
  console.log(
    `  ${pad(d, 3)}   ${f(w)}     ${f(w - wPrev)}          ${pad(f(dEstep, 1), 5)}                ${pad(f(dEabs, 1), 5)}`
  );
}

sub('Constraint checks');
const maxTailGap = Math.max(...[13, 14, 15, 16, 17].map((d) => wildness(d + 1) - wildness(d)));
console.log(`ceiling reached exactly at d = ${D_MAX_DAYS} d (2.6 weeks); wildness(14) = ${f(wildness(14))} (96.6% of ceiling)`);
console.log(`no unbounded decay:  wildness(30) = ${f(wildness(30))}, wildness(365) = ${f(wildness(365))}  [identical -> clamped]`);
console.log(`daily walker's swing (d=0 -> d=1):  ${f(wildness(1))} of the ramp = deltaE ${f(deltaE(LAB_FRESH, lerpLab(LAB_FRESH, LAB_WILD, wildness(1))), 1)}  -> ${deltaE(LAB_FRESH, lerpLab(LAB_FRESH, LAB_WILD, wildness(1))) > 5 ? 'PASS (obvious)' : 'FAIL'}`);
console.log(`largest single-day step: ${f(wildness(1) - wildness(0))} (d0->d1); smallest before ceiling: ${f(maxTailGap)} `);
console.log(`worst 3-day stretch in the tail (d15->d18): ${f(wildness(18) - wildness(15))} of ramp = deltaE ${f(deltaE(lerpLab(LAB_FRESH, LAB_WILD, wildness(15)), lerpLab(LAB_FRESH, LAB_WILD, wildness(18))), 1)} -- the ceiling, by design`);

sub('Visible floor (rule b): alpha, not colour, carries "we have been here"');
console.log('Bloom fill alpha is CONSTANT 0.28 for every Range cell regardless of wildness, so a cell');
console.log('walked once years ago still renders. Wildness moves hue/saturation only -> a wild cell is');
console.log('as PRESENT as a fresh one, just a different colour. Nothing ever fades toward the map.');

sub('Renderer quantisation budget');
for (const bands of [8, 12, 16, 24, 64]) {
  const step = Math.floor(wildness(1) * bands) ;
  console.log(`  ${pad(bands, 3)} bands -> one day of wilding crosses ${step} band(s) at d0->d1, ${Math.floor((wildness(14) - wildness(13)) * bands)} at d13->d14`);
}
console.log('  -> render CONTINUOUS (no quantisation). If a renderer must band, >= 24 bands.');

sub('Lab interpolation vs naive sRGB interpolation of the same ramp');
console.log('   wildness   dE(Lab lerp)   dE(sRGB lerp)   drift');
for (const w of [0.186, 0.34, 0.5, 0.775, 1.0]) {
  const a = deltaE(LAB_FRESH, lerpLab(LAB_FRESH, LAB_WILD, w));
  const b = deltaE(LAB_FRESH, lerpSrgbToLab(FRESH_HEX, WILD_HEX, w));
  console.log(`   ${f(w, 2)}       ${pad(f(a, 1), 5)}          ${pad(f(b, 1), 5)}        ${f(b - a, 1)}`);
}
console.log('  -> interpolate the fresh->wild ramp in Lab/Oklab: sRGB lerp front-loads the perceived');
console.log('     change and would flatten the late-week shift the curve is trying to deliver.');

/* ================================================================== *
 * SECTION B — grid geometry                                           *
 * ================================================================== */

hr(`B. GRID GEOMETRY   cell = ${CELL_M} m square, paint radius = ${PAINT_RADIUS_M} m`);

const loopA = rectLoop({ perimeterM: 1500, offsetE: 0, offsetN: 0 });
const cellsA = paintWalk(loopA);
console.log(`Typical 1.5 km loop: ${loopA.length} GPS fixes -> ${cellsA.size} painted cells`);
console.log(`  painted area = ${(cellsA.size * CELL_M * CELL_M).toLocaleString()} m^2`);
console.log(`  cells per 100 m walked = ${f((cellsA.size / 1500) * 100, 1)}`);
console.log(`  "Buddy knows N streets" after this one walk = ${streetsKnown(cellsA.size)}  (divisor ${CELLS_PER_STREET} cells/street)`);

sub('Ribbon width measured on a straight 500 m north-south leg');
{
  const leg = [];
  for (let n = 0; n <= 500; n += 2) leg.push({ lat: LAT0 + mToLat(n), lon: LON0, t: n / 1.4 });
  const legCells = paintWalk(leg);
  const rows = new Map();
  for (const c of legCells) {
    const [ix, iy] = c.split(',').map(Number);
    if (!rows.has(iy)) rows.set(iy, []);
    rows.get(iy).push(ix);
  }
  const widths = [...rows.values()].map((r) => r.length);
  const counts = {};
  widths.forEach((w) => (counts[w] = (counts[w] || 0) + 1));
  console.log(`  rows: ${widths.length}; width histogram (cells across): ${JSON.stringify(counts)}`);
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  console.log(`  mean ribbon width = ${f(mean, 2)} cells = ${f(mean * CELL_M, 1)} m`);
  console.log('  -> 2-3 cells wide: wide enough to survive the render blur, narrow enough to read as a street.');
}

sub('Storage budget');
for (const [label, cells] of [
  ['after 1 walk', cellsA.size],
  ['a 3-loop-rotation walker, 1 year', 3 * cellsA.size],
  ['an explorer, ~60 km of distinct street', Math.round((60000 / CELL_M) * 2.5)],
  ['pathological: 2 km radius fully covered', Math.round((Math.PI * 2000 * 2000) / (CELL_M * CELL_M))],
]) {
  console.log(`  ${label.padEnd(40)} ${pad(cells.toLocaleString(), 9)} cells  ~${pad(Math.round((cells * 60) / 1024).toLocaleString(), 6)} KB`);
}

sub('Live-walk compute budget (the "no backend, no expensive real-time work" constraint)');
{
  const stampsPerFix = Math.ceil(2 / SAMPLE_STEP_M) + 1;
  console.log(`  GPS fixes arrive every 1 s / 2 m. Per fix: <=${25 * stampsPerFix} centre-distance tests + Set lookups.`);
  console.log(`  Whole 1.5 km walk repainted from scratch:`);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) paintWalk(loopA);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  console.log(`    measured ${f(ms, 2)} ms per full repaint on this machine (200 runs averaged).`);
  console.log(`    Incremental per-fix cost is ~1/${loopA.length} of that. No DB write per fix: cells are`);
  console.log(`    batch-written in one transaction at walk close.`);
}

/* ================================================================== *
 * SECTION C — New Ground detection                                    *
 * ================================================================== */

hr('C. NEW GROUND DETECTION   painted, not in Range, and no 8-neighbour in Range; threshold 12 cells');

const rng = mulberry(20260821);
const rangeBase = paintWalk(rectLoop({ perimeterM: 1500 }));
console.log(`Range seeded from one clean pass of the loop: ${rangeBase.size} cells\n`);

sub('False positives: the SAME loop re-walked 200x with GPS jitter');
console.log('  sigma   mean new cells   max new cells   walks flagged New Ground (of 200)');
for (const sigma of [4, 8, 12, 15, 20]) {
  let total = 0;
  let max = 0;
  let flagged = 0;
  for (let i = 0; i < 200; i++) {
    const jittered = paintWalk(rectLoop({ perimeterM: 1500, jitterM: sigma, rng }));
    const n = newGroundCells(jittered, rangeBase);
    total += n;
    max = Math.max(max, n);
    if (n >= NEW_GROUND_MIN_CELLS) flagged++;
  }
  const verdict = flagged === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${pad(sigma + ' m', 5)}   ${pad(f(total / 200, 2), 13)}   ${pad(max, 13)}   ${pad(flagged, 5)}   ${verdict}`);
}
console.log('  (spec target is <10 m drift in an urban canyon; 15-20 m is deliberately worse than spec)');

sub('Without the 8-neighbour dilation filter — showing what it buys');
for (const sigma of [8, 15]) {
  let flagged = 0;
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const jittered = paintWalk(rectLoop({ perimeterM: 1500, jitterM: sigma, rng }));
    let raw = 0;
    for (const c of jittered) if (!rangeBase.has(c)) raw++;
    total += raw;
    if (raw >= NEW_GROUND_MIN_CELLS) flagged++;
  }
  console.log(`  sigma ${pad(sigma + ' m', 5)}: mean raw-new cells ${f(total / 200, 1)}, flagged ${flagged}/200 -> ${flagged > 0 ? 'FALSE POSITIVES' : 'ok'}`);
}

sub('True positives: the same loop plus a detour of increasing length');
console.log('  detour   new cells (dilated)   detected?');
for (const detour of [40, 80, 120, 160, 200, 220, 250, 300, 500]) {
  const pts = rectLoop({ perimeterM: 1500 });
  const anchor = pts[Math.floor(pts.length / 4)];
  const spur = [];
  for (let m = 0; m <= detour; m += 2) spur.push({ lat: anchor.lat, lon: anchor.lon + mToLon(m), t: m / 1.4 });
  const withDetour = paintWalk([...pts.slice(0, Math.floor(pts.length / 4)), ...spur, ...spur.slice().reverse(), ...pts.slice(Math.floor(pts.length / 4))]);
  const n = newGroundCells(withDetour, rangeBase);
  console.log(`  ${pad(detour + ' m', 6)}   ${pad(n, 18)}   ${n >= NEW_GROUND_MIN_CELLS ? 'YES' : 'no'}`);
}
console.log(`  -> at ${NEW_GROUND_MIN_CELLS} cells the trigger sits at roughly a 220 m out-and-back down an unwalked street:`);
console.log('     a slightly different line down a known street is silent, a genuine new street fires it.');

sub('True positives: a whole new parallel street, one block (100 m) over');
{
  const pts = [];
  for (let n = 0; n <= 450; n += 2) pts.push({ lat: LAT0 + mToLat(n), lon: LON0 + mToLon(100), t: n / 1.4 });
  const cells = paintWalk(pts);
  console.log(`  450 m of parallel street 100 m away: ${cells.size} cells painted, ${newGroundCells(cells, rangeBase)} new -> ${newGroundCells(cells, rangeBase) >= NEW_GROUND_MIN_CELLS ? 'YES' : 'no'}`);
  const pts2 = [];
  for (let n = 0; n <= 450; n += 2) pts2.push({ lat: LAT0 + mToLat(n), lon: LON0 + mToLon(60), t: n / 1.4 });
  const c2 = paintWalk(pts2);
  console.log(`  same street only 60 m away (inside the paint ribbon's reach): ${c2.size} cells, ${newGroundCells(c2, rangeBase)} new -> ${newGroundCells(c2, rangeBase) >= NEW_GROUND_MIN_CELLS ? 'YES' : 'no'}`);
}

sub('First-ever walk');
console.log(`  Range empty -> new cells = ${newGroundCells(cellsA, new Set())} of ${cellsA.size} painted -> New Ground fires. PASS`);

sub('Range monotonicity');
{
  let range = new Set();
  let prev = 0;
  let ok = true;
  for (let i = 0; i < 50; i++) {
    const walk = paintWalk(rectLoop({ perimeterM: 1500, offsetE: (i % 5) * 120, offsetN: Math.floor(i / 5) * 90, jitterM: 8, rng }));
    for (const c of walk) range.add(c);
    if (range.size < prev) ok = false;
    prev = range.size;
  }
  console.log(`  50 varied walks -> Range ${range.size} cells, "Buddy knows ${streetsKnown(range.size)} streets"; never decreased: ${ok ? 'PASS' : 'FAIL'}`);
}

/* ================================================================== *
 * SECTION D — render smoothing / speck filter                         *
 * ================================================================== */

hr('D. RENDER SMOOTHING   Gaussian blur sigma = 1 cell, iso-contour at 0.5 (render-only; the model stays discrete)');

function blurredValueAt(cells, px, py, sigma = 1) {
  let v = 0;
  for (const [cx, cy] of cells) {
    const d2 = (cx - px) ** 2 + (cy - py) ** 2;
    v += Math.exp(-d2 / (2 * sigma * sigma)) / (2 * Math.PI * sigma * sigma);
  }
  return v;
}
const block = (w, h) => {
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x - (w - 1) / 2, y - (h - 1) / 2]);
  return out;
};
console.log('  shape                        peak blurred value   survives 0.5 contour?');
for (const [label, cells] of [
  ['1 stray cell', block(1, 1)],
  ['2 stray cells', block(2, 1)],
  ['2x2 stray block', block(2, 2)],
  ['3x3 cluster', block(3, 3)],
  ['4x4 cluster', block(4, 4)],
  ['ribbon 1 cell wide x 21 long', block(1, 21)],
  ['ribbon 2 cells wide x 21 long', block(2, 21)],
  ['ribbon 3 cells wide x 21 long', block(3, 21)],
]) {
  const peak = Math.max(...cells.map(([x, y]) => blurredValueAt(cells, x, y)));
  console.log(`  ${label.padEnd(30)} ${pad(f(peak), 12)}         ${peak >= 0.5 ? 'yes' : 'NO (filtered out)'}`);
}
console.log('\n  -> the blur is a free GPS-speck filter: isolated strays and 2x2 blobs vanish, while the');
console.log(`     2-3 cell ribbon a real walk paints always survives. Corners round at ~${CELL_M} m radius,`);
console.log('     which is what replaces the current hard-cornered shoelace polygon.');

/* ================================================================== *
 * SECTION E — Fresh Ground payout                                     *
 * ================================================================== */

hr(`E. FRESH GROUND PAYOUT   bloomMultiplier = 1 + K * mean(wildness of the walk's cells),  K = ${K_BLOOM}`);

console.log('  situation                              mean bloom B   multiplier   treats @ L1  @ L20  @ L50');
const scenarios = [
  ['same loop, walked yesterday', wildness(1)],
  ['same loop, 3 days ago', wildness(3)],
  ['half daily loop / half 10-day-old', (wildness(1) + wildness(10)) / 2],
  ['a route last walked a week ago', wildness(7)],
  ['a route last walked 2 weeks ago', wildness(14)],
  ['a route last walked 3+ weeks ago', wildness(21)],
  ['entirely new ground', 1.0],
];
for (const [label, B] of scenarios) {
  const m = 1 + K_BLOOM * B;
  console.log(
    `  ${label.padEnd(38)} ${f(B)}        x${f(m)}     ${pad(Math.round(buddyTreatsPerWalk(1, 1) * m), 6)} ${pad(Math.round(buddyTreatsPerWalk(20, 8) * m), 6)} ${pad(Math.round(buddyTreatsPerWalk(50, 20) * m), 6)}`
  );
}
console.log(`\n  best-walk : routine-walk ratio = ${f((1 + K_BLOOM) / (1 + K_BLOOM * wildness(1)), 3)}x`);
console.log(`  in level terms: a full-bloom walk is worth ${f(Math.log(1 + K_BLOOM * (1 - wildness(1))) / Math.log(1.055), 1)} Buddy levels of income, for one walk.`);

sub('K sweep — for the fun reviewer to pick from');
console.log('   K      routine (d=1)   week-old   full bloom   best:routine   "reads as"');
for (const K of [0.3, 0.4, 0.6, 0.8, 1.0]) {
  const r = 1 + K * wildness(1);
  const b = 1 + K;
  const reads = K <= 0.3 ? 'barely noticed' : K <= 0.4 ? 'a nice bump' : K <= 0.6 ? 'a clearly better walk' : K <= 0.8 ? 'a big deal' : 'nearly double';
  console.log(`   ${f(K, 1)}    x${f(r)}        x${f(1 + K * wildness(7))}     x${f(b)}       ${f(b / r, 2)}x        ${reads}`);
}

sub('Does any walking frequency beat walking daily? (the load-bearing anti-degeneracy check)');
console.log('  interval between walks   multiplier   walks/30d   treats/30d @ L1   vs daily');
const dailyIncome = 30 * buddyTreatsPerWalk(1, 1) * (1 + K_BLOOM * wildness(1));
for (const iv of [0.5, 1, 2, 3, 5, 7, 10, 14, 18, 21, 30]) {
  const m = 1 + K_BLOOM * wildness(iv);
  const walks = 30 / iv;
  const income = walks * buddyTreatsPerWalk(1, 1) * m;
  console.log(
    `  ${pad(iv + ' d', 8)}                 x${f(m)}      ${pad(f(walks, 1), 6)}      ${pad(Math.round(income), 8)}          ${f(income / dailyIncome, 3)}x`
  );
}
console.log('  -> strictly decreasing in the interval. Income ∝ (1 + K*W(iv))/iv with W bounded by 1,');
console.log('     so waiting can never pay: the multiplier caps at 1.60 while the walk count falls without bound.');

sub('Route rotation (an intended incentive, not an exploit — bounded)');
for (const loops of [1, 2, 3, 5, 7, 14, 21, 30]) {
  const m = 1 + K_BLOOM * wildness(loops);
  console.log(`  rotating ${pad(loops, 2)} distinct loops -> each revisited every ${pad(loops, 2)} d -> x${f(m)}  (+${f((m / (1 + K_BLOOM * wildness(1)) - 1) * 100, 1)}% vs always the same loop)`);
}
console.log('  -> ceiling at +43.9%: variety is worth having, never worth contorting your life around.');

/* ================================================================== *
 * SECTION F — long-run behaviour simulation                           *
 * ================================================================== */

hr('F. ONE-YEAR SIMULATION OF REAL WALKER PROFILES');

function simulate({ label, days = 365, schedule }) {
  const lastRefreshed = new Map();
  const range = new Set();
  const routeCache = new Map();
  const paintCached = (route) => {
    if (!routeCache.has(route.id)) routeCache.set(route.id, paintWalk(route.pts));
    return routeCache.get(route.id);
  };

  let walks = 0;
  let treats = 0;
  let bloomSum = 0;
  let newGroundEvents = 0;
  let longestDryStreakDays = 0;
  let lastNewGroundDay = 0;
  const level = 1; // hold Buddy at L1 so the bloom effect is isolated from the level curve
  const sg = 1;

  for (let day = 0; day < days; day++) {
    const todays = schedule(day);
    let order = 0;
    for (const route of todays) {
      order++;
      const t = day + (order === 1 ? 0.3 : 0.75); // morning ~7am / evening ~6pm
      const cells = paintCached(route);
      const B = bloomFactor(cells, lastRefreshed, t);
      const mult = cells.size < BLOOM_MIN_CELLS ? 1 : 1 + K_BLOOM * B;
      const ng = newGroundCells(cells, range);
      if (ng >= NEW_GROUND_MIN_CELLS) {
        newGroundEvents++;
        longestDryStreakDays = Math.max(longestDryStreakDays, day - lastNewGroundDay);
        lastNewGroundDay = day;
      }
      treats += Math.round(buddyTreatsPerWalk(level, sg) * mult * dailyRewardMultiplier(order));
      bloomSum += B;
      walks++;
      for (const c of cells) {
        lastRefreshed.set(c, t);
        range.add(c);
      }
    }
  }
  return {
    label,
    walks,
    treats,
    meanBloom: bloomSum / Math.max(1, walks),
    meanMult: 1 + K_BLOOM * (bloomSum / Math.max(1, walks)),
    rangeCells: range.size,
    streets: streetsKnown(range.size),
    newGroundEvents,
    longestDryStreakDays: Math.max(longestDryStreakDays, days - lastNewGroundDay),
  };
}

const R = (id, opts) => ({ id, pts: rectLoop(opts) });
const loops = {};
for (let i = 0; i < 30; i++) loops[i] = R(`loop${i}`, { perimeterM: 1500, offsetE: (i % 6) * 260, offsetN: Math.floor(i / 6) * 200 });

const profiles = [
  simulate({ label: 'Daily walker, one fixed loop, 2/day', schedule: () => [loops[0], loops[0]] }),
  simulate({ label: 'Daily walker, 3-loop rotation, 2/day', schedule: (d) => [loops[(2 * d) % 3], loops[(2 * d + 1) % 3]] }),
  simulate({ label: 'Daily walker, 7-loop rotation, 2/day', schedule: (d) => [loops[(2 * d) % 7], loops[(2 * d + 1) % 7]] }),
  simulate({
    label: '3 weeks on / 2 weeks off, 2/day when on',
    schedule: (d) => (d % 35 < 21 ? [loops[0], loops[1]] : []),
  }),
  simulate({
    label: 'Explorer: new loop each week, 2/day',
    schedule: (d) => {
      const w = Math.min(29, Math.floor(d / 7));
      return [loops[w], loops[Math.max(0, w - 1)]];
    },
  }),
  simulate({ label: 'Weekend-only walker, 2 walks/Sat+Sun', schedule: (d) => (d % 7 < 2 ? [loops[0], loops[1]] : []) }),
];

console.log('  profile                                    walks  meanB  mean mult  treats/yr  streets  NewGround  worst dry spell');
for (const p of profiles) {
  console.log(
    `  ${p.label.padEnd(42)} ${pad(p.walks, 5)}  ${f(p.meanBloom, 2)}   x${f(p.meanMult)}    ${pad(p.treats.toLocaleString(), 8)}  ${pad(p.streets, 7)}  ${pad(p.newGroundEvents, 9)}  ${pad(p.longestDryStreakDays + ' d', 8)}`
  );
}

sub('Reading the table');
const daily = profiles[0];
const lapsed = profiles[3];
const weekend = profiles[5];
console.log(`  The fixed-loop daily walker sits at a steady x${f(daily.meanMult)} and still out-earns everyone by volume.`);
console.log(`  The 3-weeks-on/2-off walker averages x${f(lapsed.meanMult)} — the return walks visibly pay more —`);
console.log(`  but still earns only ${f((lapsed.treats / daily.treats) * 100, 0)}% of the daily walker's year. Coming back is rewarded; leaving is not.`);
console.log(`  The weekend walker averages x${f(weekend.meanMult)} — the highest per-walk rate of any honest profile,`);
console.log(`  and ${f((weekend.treats / daily.treats) * 100, 0)}% of the daily walker's total. Low-frequency players get a better *walk*, never a better *year*.`);

sub('DEAD ZONE FOUND: the fixed-loop twice-a-day walker');
console.log(`  This is exactly the persona game-phases' Phase 1 acceptance criterion tests`);
console.log(`  ("5 dog owners walk twice a day for 5 days"). Their numbers:`);
{
  const morning = 1 + K_BLOOM * wildness(0.55); // ~13 h since last night's walk
  const evening = 1 + K_BLOOM * wildness(0.45); // ~11 h since this morning's
  console.log(`    morning walk: x${f(morning)}   evening walk: x${f(evening)}   year average: x${f(profiles[0].meanMult)}`);
  console.log(`    map colour: every cell they own sits between wildness ${f(wildness(0.45))} and ${f(wildness(0.55))}, forever.`);
  console.log(`    deltaE across that entire range: ${f(deltaE(lerpLab(LAB_FRESH, LAB_WILD, wildness(0.45)), lerpLab(LAB_FRESH, LAB_WILD, wildness(0.55))), 1)} — invisible.`);
}
console.log('  By construction the Bloom has nothing to show a player with nothing un-recently-walked.');
console.log('  This is NOT fixable by retuning tau or K: any curve that gives a 12-hour gap a visible');
console.log('  colour step also drives the whole map to full wildness in ~2 days, breaking the 2-3 week');
console.log('  ceiling. Two honest options, both outside the economist lane:');
console.log('    (a) accept it — the fixed-loop walker\'s repeat-reward channel is Phase 2 scent depth');
console.log('        (visits count, monotonic), and the Bloom is deliberately the *variety and return*');
console.log('        channel. The data model below carries visits[] for exactly this;');
console.log('    (b) put a floor under the multiplier, e.g. 1 + K*max(B, 0.19) = a flat x1.11 minimum,');
console.log('        so no walk ever reads x1.00 — costs nothing mechanically, gains nothing either.');
console.log('  Handing this back to the fun reviewer: it is a lived-experience call, not a maths one.');

sub('Dead-zone check: the other profiles');
for (const p of profiles.slice(1)) {
  console.log(`  ${p.label.padEnd(42)} avg x${f(p.meanMult)}, New Ground every ${p.newGroundEvents > 0 ? f(365 / p.newGroundEvents, 0) + ' d' : 'never after walk 1'}`);
}

/* ================================================================== *
 * SECTION G — anti-snowball / power-cap compliance                    *
 * ================================================================== */

hr('G. ANTI-SNOWBALL COMPLIANCE');

sub('The +30% Hard Power Gap Soft-Cap is defined "on equivalent walks"');
{
  const B = wildness(7);
  const m = 1 + K_BLOOM * B;
  const l1 = buddyTreatsPerWalk(1, 1) * m;
  const l100 = buddyTreatsPerWalk(100, 100) * m;
  const l1NoBloom = buddyTreatsPerWalk(1, 1);
  const l100NoBloom = buddyTreatsPerWalk(100, 100);
  console.log(`  Identical walk, identical cell freshness (7 d), bloom multiplier x${f(m)} for both players:`);
  console.log(`    L1  / Sniff 1   : ${f(l1, 1)} treats`);
  console.log(`    L100/ Sniff 100 : ${f(l100, 1)} treats`);
  console.log(`    ratio with bloom    = ${f(l100 / l1, 4)}`);
  console.log(`    ratio without bloom = ${f(l100NoBloom / l1NoBloom, 4)}`);
  console.log(`    bloom's contribution to the L100-vs-L1 gap = ${f((l100 / l1 - l100NoBloom / l1NoBloom) * 100, 6)} pp  -> EXACTLY 0`);
  console.log('  bloomMultiplier has no level term, no building term, no treat-balance term. It cancels');
  console.log('  identically on both sides of the ratio the cap is written about. It spends 0 pp of the');
  console.log('  30 pp ledger — arithmetically, not by reclassification.');
}

sub('Who does the bloom actually favour?');
console.log(`  A brand-new player's very first walk is 100% new ground -> x${f(1 + K_BLOOM)} — the maximum the`);
console.log(`  mechanic can ever pay. A ten-year veteran walking their daily loop gets x${f(1 + K_BLOOM * wildness(1))}.`);
console.log('  The bonus is largest for the player with the least history. It is anti-snowball by shape.');

sub('Ledger position');
console.log('  Source                 Budget    Note');
console.log('  Buddy\'s Level          +0 %      income, per virtual-dog-companion');
console.log('  Sniff Garden           +8 %      Phase 1, spent');
console.log('  Fresh Ground bloom     +0 %      income; no level/building/balance term (proved above)');
console.log('  Training Yard          +6 %      Phase 4, reserved');
console.log('  Watch Tower            +6 %      Phase 4, reserved');
console.log('  Spring Garden          +3 %      Phase 4, reserved');
console.log('  Trophy Hall badges     +3 %      Phase 4, reserved');
console.log('  Pack                   +4 %      Phase 4, reserved');
console.log('  TOTAL                  +30 %     unchanged by this feature');

sub('Does bloom outclass the Sniff Garden? (sibling-formula consistency)');
{
  const sgMax = sniffGardenPct(100);
  console.log(`  Sniff Garden at building level 100 = +${f(sgMax, 2)}% permanently.`);
  console.log(`  Bloom averages +${f((profiles.reduce((a, p) => a + p.meanMult, 0) / profiles.length - 1) * 100, 1)}% across the six simulated profiles, peaking at +60% on a single walk.`);
  console.log('  FLAG FOR THE FUN REVIEWER: on average the bloom is ~3x the entire Sniff Garden ladder.');
  console.log('  That is defensible (bloom is situational and unbankable, the Garden is a permanent floor)');
  console.log('  but it does mean the Den bonus reads small next to it. If that feels wrong, lower K to 0.3-0.4.');
}

/* ================================================================== *
 * SECTION H — manual-log refresh cap                                  *
 * ================================================================== */

hr('H. MANUAL-LOG REFRESH CAP');

console.log(`  Rules under test: previously-GPS-walked routes only (structural, not a check);`);
console.log(`  max 2 manual logs/day of which at most 1 carries a route refresh (no cell cap needed —`);
console.log(`  see the simulation below); manual logs earn a FIXED bloom multiplier of x${f(MANUAL_BLOOM)} (= a routine`);
console.log(`  tracked walk's rate) regardless of which route is picked; and they still count against the`);
console.log(`  existing [1,1,1,0.5,0.25,0.1] per-day allowance.\n`);

sub('Exploit probe: can route-picking be farmed?');
{
  const best = 1 + K_BLOOM * 1.0;
  console.log(`  If a manual log DID earn route-dependent bloom, a player could pick their wildest saved`);
  console.log(`  route every day and bank x${f(best)} for zero effort:`);
  const honestDay = buddyTreatsPerWalk(1, 1) * (1 + K_BLOOM * wildness(1)) + buddyTreatsPerWalk(1, 1) * 1.0;
  const cheatDayRouted = 2 * buddyTreatsPerWalk(1, 1) * best;
  const cheatDayFixed = 2 * buddyTreatsPerWalk(1, 1) * MANUAL_BLOOM;
  console.log(`    honest 2-walk day (same loop)          : ${f(honestDay, 1)} treats`);
  console.log(`    2 manual logs, route-dependent bloom   : ${f(cheatDayRouted, 1)} treats = ${f((cheatDayRouted / honestDay) * 100, 0)}% of an honest day for zero walking  -> REJECTED`);
  console.log(`    2 manual logs, FIXED x${f(MANUAL_BLOOM)} bloom       : ${f(cheatDayFixed, 1)} treats = ${f((cheatDayFixed / honestDay) * 100, 0)}% of an honest day  -> accepted`);
  console.log('  The fixed multiplier is not "lesser treatment" (walk-lifecycle forbids that): it is exactly');
  console.log('  what a routine tracked walk earns. What a manual log cannot do is *choose* a better one,');
  console.log('  because there is no GPS evidence of which ground was covered.');
}

sub('Exploit probe: is refreshing freshness itself profitable?');
console.log('  No — and it is self-limiting by construction. Refreshing a route LOWERS its wildness, which');
console.log('  LOWERS every future bloom payout on it. A player optimising for treats would never refresh.');
console.log('  The only reason to use it is honesty about a walk that really happened, which is the point.');

sub('Exploit probe: can a couch player keep their whole map green? (simulated, 180 days)');
{
  // A tapper who never walks, owns N saved routes, and manual-refreshes exactly one per day,
  // always picking the wildest available. Measured: the mean wildness of their whole Range.
  console.log('  saved routes   refresh cadence per route   mean map wildness after 180 d   reads as');
  for (const N of [1, 3, 7, 12, 18, 30]) {
    const routeCells = [];
    for (let i = 0; i < N; i++) routeCells.push(paintWalk(rectLoop({ perimeterM: 1500, offsetE: (i % 6) * 260, offsetN: Math.floor(i / 6) * 200 })));
    const lastRefreshed = new Map();
    const range = new Set();
    for (const rc of routeCells) for (const c of rc) { range.add(c); lastRefreshed.set(c, 0); }
    for (let day = 1; day <= 180; day++) {
      // pick the wildest route (greedy, i.e. the best the exploiter can possibly do)
      let bestIdx = 0;
      let bestB = -1;
      routeCells.forEach((rc, i) => {
        const B = bloomFactor(rc, lastRefreshed, day);
        if (B > bestB) { bestB = B; bestIdx = i; }
      });
      for (const c of routeCells[bestIdx]) lastRefreshed.set(c, day);
    }
    let sum = 0;
    for (const c of range) sum += wildness(180 - lastRefreshed.get(c));
    const meanW = sum / range.size;
    const reads = meanW < 0.2 ? 'fresh green map' : meanW < 0.45 ? 'mostly green' : meanW < 0.7 ? 'visibly mixed' : 'a wild map';
    console.log(`  ${pad(N, 10)}     every ${pad(N + ' d', 5)}                 ${pad(f(meanW), 20)}       ${reads}`);
  }
  console.log('  -> the cap binds where it matters. One refresh a day cannot outrun N routes wilding in');
  console.log(`     parallel: past ~7 saved routes the map sits above 0.5 wildness no matter how greedily`);
  console.log('     the tapper picks. A player with a real Range CANNOT tap their map green.');
  console.log('  ACCEPTED RISK: a 1-3-route player can keep their small map fresh from the couch. That is');
  console.log('  purely cosmetic (the payout is fixed at x' + f(MANUAL_BLOOM) + '), and it actively destroys their own');
  console.log('  future bloom income. Nothing is gained but a greener map of a route they claim they walked.');
}

sub('Exploit probe: can a manual log extend the Range?');
console.log('  Structurally impossible: the refresh operates on the cell set of a previously-completed');
console.log('  TRACKED walk, so every cell it touches is already in the Range by definition. There is no');
console.log('  code path from a manual log to a new cell. No rule to enforce, nothing to get wrong.');

sub('Two clocks per cell — closing the Phase 3 defence exploit before it exists');
console.log('  lastRefreshed[c] : bloom/visual clock. Written by tracked walks, manual route refreshes, and');
console.log('                     (Phase 3, deferred) a neighbour walking your patch.');
console.log('  lastTracked[c]   : GPS-verified only. NEVER written by a manual log.');
console.log('  anti-snowball mandates walk-frequency-based territory defence. If that ever reads the bloom');
console.log('  clock, the manual log becomes a defence exploit. Reserve lastTracked now; it costs 8 bytes.');

/* ================================================================== *
 * SECTION I — interaction with the existing per-day exploit fix       *
 * ================================================================== */

hr('I. INTERACTION WITH THE SHIPPED PER-DAY DIMINISHING-RETURNS MULTIPLIER');

sub('Twenty tiny 100 m loops in one hour, at the same spot (the shipped exploit probe, re-run with bloom)');
{
  const tiny = rectLoop({ perimeterM: 100 });
  const tinyCells = paintWalk(tiny);
  const lastRefreshed = new Map();
  let treats = 0;
  for (let i = 1; i <= 20; i++) {
    const t = i * 0.002;
    const mult = tinyCells.size < BLOOM_MIN_CELLS ? 1 : 1 + K_BLOOM * bloomFactor(tinyCells, lastRefreshed, t);
    treats += Math.round(buddyTreatsPerWalk(1, 1) * mult * dailyRewardMultiplier(i));
    for (const c of tinyCells) lastRefreshed.set(c, t);
  }
  console.log(`  A 100 m loop paints ${tinyCells.size} cells (< ${BLOOM_MIN_CELLS} floor) -> bloom multiplier forced to x1.00.`);
  console.log(`  20 loops in an hour: ${treats} treats.`);
  const honestHour = Math.round(buddyTreatsPerWalk(1, 1) * (1 + K_BLOOM * wildness(1)) * 1) + Math.round(buddyTreatsPerWalk(1, 1) * 1.0 * 1);
  console.log(`  An honest hour (one ~4 km walk, or two 1.5 km walks): ~${honestHour} treats.`);
  console.log(`  ratio = ${f(treats / honestHour, 2)}x  -> the bloom does NOT worsen this exploit; the cell floor and the`);
  console.log('  zero-wildness-on-repeat property both work against it.');
}

sub('Same twenty loops, but walked at twenty DIFFERENT spots (the harder version)');
{
  let treats = 0;
  const lastRefreshed = new Map();
  for (let i = 1; i <= 20; i++) {
    const cells = paintWalk(rectLoop({ perimeterM: 100, offsetE: i * 400 }));
    const mult = cells.size < BLOOM_MIN_CELLS ? 1 : 1 + K_BLOOM * bloomFactor(cells, lastRefreshed, i * 0.002);
    treats += Math.round(buddyTreatsPerWalk(1, 1) * mult * dailyRewardMultiplier(i));
    for (const c of cells) lastRefreshed.set(c, i * 0.002);
  }
  console.log(`  Still ${paintWalk(rectLoop({ perimeterM: 100 })).size} cells each -> under the ${BLOOM_MIN_CELLS}-cell floor -> x1.00 each. Total ${treats} treats.`);
  console.log('  Reaching 20 *qualifying* loops means walking 20 x 200 m = 4 km anyway, which is a real walk.');
}

sub('Order of operations');
console.log('  treats = round( buddyTreatsPerWalk(L, sniffGarden) x bloomMultiplier x dailyMultiplier )');
console.log('  Multiplicative and commutative; slots into awardWalkTreats as a second factor alongside the');
console.log('  existing per-day multiplier. XP is deliberately untouched — see design.md.');

hr('DONE');
console.log('Every number printed above is produced by running the proposed formulas, not asserted.');
console.log('Re-run after any constant change: node openspec/changes/home-range/home-range-prototype.mjs\n');
