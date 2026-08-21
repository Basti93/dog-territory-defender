#!/usr/bin/env node
/**
 * Buddy Levels Up — standalone progression validation prototype.
 *
 * NOT part of the app. Nothing here is imported by src/. This is the
 * game-economist's scratch calculator: it re-implements the *currently
 * implemented* formulas from src/economy/{balanceConfig,formulas,denEconomy}.ts
 * verbatim, layers the proposed "Buddy's level pays out" curve on top, and
 * proves (or disproves) the design constraints by running them.
 *
 * Run:  node openspec/changes/virtual-dog-companion/progression-prototype.mjs
 * Opt:  --full   print all 100 levels instead of the sampled table
 */

const FULL = process.argv.includes('--full');

/* ------------------------------------------------------------------ *
 * 1. AS IMPLEMENTED TODAY  (mirrors src/economy/*.ts, do not "improve") *
 * ------------------------------------------------------------------ */

const BALANCE = {
  treatsPerWalk: 50,
  startingTreats: 50,
  storage: { base: 100, perDoghouseLevel: 100 },
  passive: { treatsPerHourPerBakeryLevel: 1 },
  buildings: {
    doghouse: { costBase: 40, costMult: 1.5 },
    bakery: { costBase: 60, costMult: 1.6 },
    sniffGarden: { costBase: 50, costMult: 1.45 },
  },
  softCap: { level: 50, maxBonusPercent: 50, curveRate: 25 },
  maxBuildingLevel: 100,
  xp: { perWalkBase: 20, perKm: 15, per1000m2: 5, areaCapM2: 20000 },
  leveling: { xpBase: 100, xpGrowth: 1.13, maxLevel: 100, treatsPerLevelUp: 25 },
};

const upgradeCost = (b, lvl) =>
  Math.floor(BALANCE.buildings[b].costBase * Math.pow(BALANCE.buildings[b].costMult, lvl - 1));

const xpAwardForWalk = (m, area) =>
  BALANCE.xp.perWalkBase +
  BALANCE.xp.perKm * (m / 1000) +
  BALANCE.xp.per1000m2 * (Math.min(area, BALANCE.xp.areaCapM2) / 1000);

const xpForNextLevel = (l) =>
  Math.floor(BALANCE.leveling.xpBase * Math.pow(BALANCE.leveling.xpGrowth, l - 1));

const cumulativeXpForLevel = (l) =>
  Math.floor(
    (BALANCE.leveling.xpBase / (BALANCE.leveling.xpGrowth - 1)) *
      (Math.pow(BALANCE.leveling.xpGrowth, l - 1) - 1)
  );

const levelForXp = (xp) => {
  let level = 1;
  while (level < BALANCE.leveling.maxLevel && cumulativeXpForLevel(level + 1) <= xp) level++;
  return level;
};

const softCapBonusPercent = (l) =>
  BALANCE.softCap.maxBonusPercent * (1 - Math.exp(-l / BALANCE.softCap.curveRate));

/* ------------------------------------------------------------------ *
 * 2. PROPOSED  (the thing being validated)                            *
 * ------------------------------------------------------------------ */

const PROPOSED = {
  payoutBase: 50, // === BALANCE.treatsPerWalk, so Level 1 is unchanged from today
  payoutGrowth: 1.055,
  milestoneFirstLevel: 2,
  milestoneMaxGap: 8,
  // Per-walk POWER budget, in percentage points of the +30% anti-snowball cap.
  powerBudgetPct: {
    buddyLevel: 0, // income only — never a power source
    sniffGarden: 8,
    trainingYard: 6, // Phase 4, reserved
    watchTower: 6, // Phase 4, reserved
    springGarden: 3, // Phase 4, reserved
    trophyHall: 3, // Phase 4, reserved
    pack: 4, // Phase 4, reserved
  },
  dailyFullValueWalks: 3,
  dailyDecay: [1, 1, 1, 0.5, 0.25, 0.1], // index = walk number that day - 1; beyond -> 0.1
};

/** The displayed number: "Buddy brings home N treats a walk." */
const buddyPayout = (level) =>
  Math.round(PROPOSED.payoutBase * Math.pow(PROPOSED.payoutGrowth, level - 1));

/**
 * Storage denominated in WALKS OF INCOME and growing at the same geometric rate
 * as the most expensive building cost curve (1.6), so the bank can always hold
 * more than the next thing you want to buy. Identical to today at Level 1 / DH 1.
 */
const STORAGE_GROWTH = 1.5; // == doghouse costMult
const NEVER_SOFTLOCK = 1.25; // bank must always be able to hold 1.25x the cheapest upgrade
const cheapestUpgrade = (s) =>
  Math.min(
    ...['doghouse', 'bakery', 'sniffGarden']
      .filter((b) => s[b] < BALANCE.maxBuildingLevel)
      .map((b) => upgradeCost(b, s[b] + 1))
  );
const storageCap = (doghouseLevel, buddyLevel, s = null) => {
  const base = buddyPayout(buddyLevel) * 4 * Math.pow(STORAGE_GROWTH, doghouseLevel - 1);
  const floor = s ? NEVER_SOFTLOCK * cheapestUpgrade(s) : 0;
  return Math.round(Math.max(base, floor));
};

/** Passive income tracks the same yardstick. Identical to today at Level 1. */
const passiveTreatsPerHour = (bakeryLevel, buddyLevel) =>
  bakeryLevel * BALANCE.passive.treatsPerHourPerBakeryLevel * (buddyPayout(buddyLevel) / PROPOSED.payoutBase);

/** Sniff Garden: a capped PERCENT, reusing the already-coded soft-cap shape. */
const sniffGardenPct = (bl) =>
  (PROPOSED.powerBudgetPct.sniffGarden * (1 - Math.exp(-bl / BALANCE.softCap.curveRate))) /
  (1 - Math.exp(-BALANCE.maxBuildingLevel / BALANCE.softCap.curveRate));

const milestoneLevels = (upTo) => {
  const out = [];
  let lvl = PROPOSED.milestoneFirstLevel;
  let k = 2;
  while (lvl <= upTo) {
    out.push(lvl);
    lvl += Math.min(k, PROPOSED.milestoneMaxGap);
    k++;
  }
  return out;
};

const dayMultiplier = (nthWalkToday) =>
  PROPOSED.dailyDecay[Math.min(nthWalkToday - 1, PROPOSED.dailyDecay.length - 1)];

/* ------------------------------------------------------------------ *
 * 3. WALK PROFILES                                                    *
 * ------------------------------------------------------------------ */

const PROFILES = {
  short: { m: 800, area: 3000 },
  typical: { m: 1500, area: 8000 },
  long: { m: 3000, area: 15000 },
  tinyLoop: { m: 100, area: 200 }, // the exploit shape: round the parked cars
  manualLog: { m: 0, area: 0 }, // "Log a walk we missed" — one tap, no GPS
};
const xpOf = (p) => xpAwardForWalk(PROFILES[p].m, PROFILES[p].area);

/* ------------------------------------------------------------------ *
 * helpers                                                             *
 * ------------------------------------------------------------------ */
const n = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pad = (s, w) => String(s).padStart(w);
const padr = (s, w) => String(s).padEnd(w);
const rule = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

/** Walks (at a given profile) needed to reach `level` from scratch. */
const walksToLevel = (level, profile = 'typical') =>
  Math.ceil(cumulativeXpForLevel(level) / xpOf(profile));

/* ================================================================== *
 * REPORT 1 — the level ladder                                        *
 * ================================================================== */
rule('1. LEVEL LADDER — payout, step, fun-floor check, milestone titles');

const ms = new Set(milestoneLevels(100));
const rows = [];
for (let L = 1; L <= 100; L++) {
  const pay = buddyPayout(L);
  const prev = L === 1 ? null : buddyPayout(L - 1);
  rows.push({
    L,
    pay,
    step: prev === null ? null : pay - prev,
    stepPct: prev === null ? null : ((pay - prev) / prev) * 100,
    walks: walksToLevel(L),
    days: walksToLevel(L) / 2,
    milestone: ms.has(L),
  });
}

const show = FULL ? rows : rows.filter((r) => r.L <= 12 || r.L % 5 === 0 || r.milestone || r.L === 100);
console.log(
  `${padr('Lv', 4)}${pad('treats/walk', 12)}${pad('step', 7)}${pad('step%', 8)}${pad('walks', 9)}${pad('~days@2/day', 13)}  title`
);
for (const r of show) {
  console.log(
    padr(r.L, 4) +
      pad(n(r.pay), 12) +
      pad(r.step === null ? '-' : `+${r.step}`, 7) +
      pad(r.stepPct === null ? '-' : `${r.stepPct.toFixed(1)}%`, 8) +
      pad(n(r.walks), 9) +
      pad(r.days < 400 ? n(r.days) : n(r.days / 365, 1) + 'y', 13) +
      (r.milestone ? '  <- MILESTONE TITLE' : '')
  );
}

const steps = rows.slice(1).map((r) => r.step);
const zero = rows.slice(1).filter((r) => r.step < 1);
console.log(
  `\nFUN FLOOR  min step=+${Math.min(...steps)}  max step=+${n(Math.max(...steps))}  ` +
    `levels with step < 1: ${zero.length}  => ${zero.length === 0 ? 'PASS' : 'FAIL'}`
);
console.log(
  `           relative step is constant ${((PROPOSED.payoutGrowth - 1) * 100).toFixed(1)}% at every level ` +
    `(never crawls, never a dead level)`
);

/* ================================================================== *
 * REPORT 2 — why a CAPPED number cannot do this (impossibility proof) *
 * ================================================================== */
rule('2. IMPOSSIBILITY PROOF — a cap-bound number cannot step visibly every level');

const LEVELUPS = 99;
console.log(`Anti-snowball hard cap: L100 advantage over L1 <= +30%  =>  total multiplier 1.30`);
console.log(`Level-ups from 1 to 100: ${LEVELUPS}`);
const maxUniform = Math.pow(1.3, 1 / LEVELUPS) - 1;
console.log(`Max UNIFORM relative step of a capped quantity: 1.30^(1/${LEVELUPS}) - 1 = ${(maxUniform * 100).toFixed(3)}% per level`);
for (const s of [0.01, 0.02, 0.03, 0.05]) {
  console.log(
    `  a "chunky" ${(s * 100).toFixed(0)}%/level curve reaches ${n(Math.pow(1 + s, LEVELUPS), 1)}x at L100 ` +
      `-> ${Math.pow(1 + s, LEVELUPS) > 1.3 ? 'BREAKS the cap by ' + n(((Math.pow(1 + s, LEVELUPS) - 1.3) / 1.3) * 100) + '%' : 'ok'}`
  );
}
console.log(`\nTo get a whole-digit (+1) step at every one of ${LEVELUPS} level-ups from a 30% budget,`);
console.log(`the level-1 displayed value must be at least ${LEVELUPS} / 0.30 = ${Math.ceil(LEVELUPS / 0.3)} treats,`);
console.log(`and each step is then worth ${(100 / Math.ceil(LEVELUPS / 0.3)).toFixed(2)}% — a digit that changes but does not read as a jump.`);
console.log(`CONCLUSION: the displayed number cannot be a capped POWER quantity. It must be INCOME.`);

/* ================================================================== *
 * REPORT 3 — cap compliance of the actual power sources               *
 * ================================================================== */
rule('3. CAP COMPLIANCE — per-walk power budget (income excluded by design)');

const budget = PROPOSED.powerBudgetPct;
const total = Object.values(budget).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(budget)) {
  console.log(`  ${padr(k, 16)}${pad(`+${v}%`, 6)}  ${k === 'buddyLevel' ? '(income-only stat — contributes no power)' : k === 'sniffGarden' ? '(Phase 1)' : '(Phase 4, reserved)'}`);
}
console.log(`  ${padr('TOTAL', 16)}${pad(`+${total}%`, 6)}  cap is +30%  => ${total <= 30 ? 'PASS' : 'FAIL'}`);

console.log(`\nSniff Garden realised bonus (soft-capped, reuses coded curveRate=25):`);
console.log(`${padr('bldg lvl', 10)}${pad('bonus%', 9)}${pad('marginal/lvl', 14)}`);
for (const bl of [1, 5, 10, 25, 40, 49, 50, 51, 60, 75, 100]) {
  console.log(
    padr(bl, 10) + pad(sniffGardenPct(bl).toFixed(3), 9) + pad((sniffGardenPct(bl) - sniffGardenPct(bl - 1)).toFixed(4), 14)
  );
}
const below = sniffGardenPct(50) - sniffGardenPct(49);
const above = sniffGardenPct(51) - sniffGardenPct(50);
console.log(`den-economy "diminishing above L50": marginal@50=${below.toFixed(4)} > marginal@51=${above.toFixed(4)} => ${above < below ? 'PASS' : 'FAIL'}`);

const l1 = { pay: buddyPayout(1), pct: sniffGardenPct(1) };
const l100 = { pay: buddyPayout(100), pct: sniffGardenPct(100) + 4 + 6 + 6 + 3 + 3 };
console.log(
  `\nEquivalent-walk POWER advantage, L100 vet vs L1 newbie: ` +
    `(1+${l100.pct.toFixed(1)}%) / (1+${l1.pct.toFixed(2)}%) - 1 = ` +
    `${(((1 + l100.pct / 100) / (1 + l1.pct / 100) - 1) * 100).toFixed(2)}%  => ` +
    `${(1 + l100.pct / 100) / (1 + l1.pct / 100) - 1 <= 0.3 ? 'PASS' : 'FAIL'}`
);
console.log(
  `(Income advantage is ${n(buddyPayout(100) / buddyPayout(1))}x, deliberately outside the cap — see report 5 for why it buys no power.)`
);

/* ================================================================== *
 * REPORT 4 — milestone spacing                                        *
 * ================================================================== */
rule('4. MILESTONE TITLE SPACING — front-loaded, validated against the real XP curve');

console.log(`${padr('#', 4)}${pad('level', 7)}${pad('gap(lvls)', 11)}${pad('walks', 9)}${pad('gap(walks)', 12)}${pad('~elapsed@2/day', 16)}`);
const mls = milestoneLevels(60);
let prevW = 0,
  prevL = 1;
for (let i = 0; i < mls.length; i++) {
  const L = mls[i];
  const w = walksToLevel(L);
  const days = w / 2;
  console.log(
    padr(i + 1, 4) +
      pad(L, 7) +
      pad(L - prevL, 11) +
      pad(n(w), 9) +
      pad(n(w - prevW), 12) +
      pad(days < 60 ? `${n(days)} d` : days < 730 ? `${n(days / 30, 1)} mo` : `${n(days / 365, 1)} y`, 16)
  );
  prevW = w;
  prevL = L;
}
console.log(`\nDEAD-ZONE CHECK (payout clock, not title clock):`);
for (const L of [1, 5, 10, 15, 20, 25, 30, 35, 40]) {
  const w = walksToLevel(L + 1) - walksToLevel(L);
  console.log(`  L${padr(L, 3)} -> L${padr(L + 1, 3)}: ${pad(n(w), 5)} walks (~${n(w / 2, 1)} days) for +${buddyPayout(L + 1) - buddyPayout(L)} treats/walk`);
}

/* ================================================================== *
 * REPORT 5 — full economy simulation                                  *
 * ================================================================== */
rule('5. LIVE SIMULATION — 2 typical walks/day, greedy Den upgrades, 3 years');

function simulate({ walksPerDay = 2, profile = 'typical', days = 1095, useDailyDecay = false, buy = true } = {}) {
  const s = {
    treats: BALANCE.startingTreats,
    doghouse: 1,
    bakery: 1,
    sniffGarden: 1,
    xp: 0,
    level: 1,
  };
  const hoursBetween = 24 / walksPerDay;
  const log = [];
  let overflowWalks = 0;
  let totalWalks = 0;
  const purchases = [];

  for (let d = 0; d < days; d++) {
    for (let k = 1; k <= walksPerDay; k++) {
      totalWalks++;
      // passive accrual since last walk
      const cap = storageCap(s.doghouse, s.level, s);
      s.treats = Math.min(cap, s.treats + hoursBetween * passiveTreatsPerHour(s.bakery, s.level));

      const mult = useDailyDecay ? dayMultiplier(k) : 1;
      const gross = buddyPayout(s.level) * (1 + sniffGardenPct(s.sniffGarden) / 100) * mult;
      const before = s.treats;
      s.treats = Math.min(cap, s.treats + gross);
      if (before + gross > cap) overflowWalks++;

      s.xp += xpAwardForWalk(PROFILES[profile].m, PROFILES[profile].area) * mult;
      s.level = levelForXp(s.xp);

      if (buy) {
        // greedy: buy the cheapest affordable upgrade, repeat while affordable
        for (;;) {
          const opts = ['doghouse', 'bakery', 'sniffGarden']
            .filter((b) => s[b] < BALANCE.maxBuildingLevel)
            .map((b) => ({ b, c: upgradeCost(b, s[b] + 1) }))
            .sort((a, z) => a.c - z.c);
          if (!opts.length || s.treats < opts[0].c) break;
          s.treats -= opts[0].c;
          s[opts[0].b]++;
          purchases.push({ walk: totalWalks, b: opts[0].b, lvl: s[opts[0].b], cost: opts[0].c });
        }
      }

      if ([1, 7, 14, 30, 60, 90, 180, 270, 365, 547, 730, 1095].includes(d + 1) && k === walksPerDay) {
        const nextCost = ['doghouse', 'bakery', 'sniffGarden']
          .map((b) => upgradeCost(b, s[b] + 1))
          .sort((a, z) => a - z)[0];
        log.push({
          day: d + 1,
          walks: totalWalks,
          level: s.level,
          payout: buddyPayout(s.level),
          treats: Math.round(s.treats),
          cap: Math.round(storageCap(s.doghouse, s.level, s)),
          dh: s.doghouse,
          bk: s.bakery,
          sg: s.sniffGarden,
          nextCost: Math.round(nextCost),
          walksForNext: nextCost / (buddyPayout(s.level) * (1 + sniffGardenPct(s.sniffGarden) / 100)),
        });
      }
    }
  }
  return { s, log, overflowWalks, totalWalks, purchases };
}

const sim = simulate();
console.log(
  `${padr('day', 6)}${pad('walks', 7)}${pad('Lv', 4)}${pad('treats/walk', 13)}${pad('bank', 10)}${pad('cap', 10)}${pad('DH/BK/SG', 11)}${pad('next cost', 11)}${pad('walks->next', 13)}`
);
for (const r of sim.log) {
  console.log(
    padr(r.day, 6) +
      pad(n(r.walks), 7) +
      pad(r.level, 4) +
      pad(n(r.payout), 13) +
      pad(n(r.treats), 10) +
      pad(n(r.cap), 10) +
      pad(`${r.dh}/${r.bk}/${r.sg}`, 11) +
      pad(n(r.nextCost), 11) +
      pad(n(r.walksForNext, 1), 13)
  );
}
console.log(`\nDen upgrades bought in 3 years: ${sim.purchases.length}`);
const band = sim.log.map((r) => r.walksForNext);
console.log(`"walks until next affordable upgrade" across 3 years: min ${n(Math.min(...band), 1)}, max ${n(Math.max(...band), 1)} => target band 1-15`);
console.log(`Walks that hit the storage ceiling: ${sim.overflowWalks} / ${sim.totalWalks}`);

console.log(`\nCounterfactual — SAME sim with today's flat 50/walk and today's flat storage:`);
{
  const flatPayout = () => 50;
  const s = { treats: 50, doghouse: 1, bakery: 1, sniffGarden: 1, xp: 0, level: 1 };
  let walks = 0;
  for (let d = 0; d < 1095; d++)
    for (let k = 0; k < 2; k++) {
      walks++;
      const cap = BALANCE.storage.base + s.doghouse * BALANCE.storage.perDoghouseLevel;
      s.treats = Math.min(cap, s.treats + 12 * s.bakery);
      s.treats = Math.min(cap, s.treats + flatPayout());
      s.xp += xpOf('typical');
      s.level = levelForXp(s.xp);
      for (;;) {
        const opts = ['doghouse', 'bakery', 'sniffGarden']
          .map((b) => ({ b, c: upgradeCost(b, s[b] + 1) }))
          .sort((a, z) => a.c - z.c);
        if (s.treats < opts[0].c) break;
        s.treats -= opts[0].c;
        s[opts[0].b]++;
      }
    }
  const nextCost = ['doghouse', 'bakery', 'sniffGarden'].map((b) => upgradeCost(b, s[b] + 1)).sort((a, z) => a - z)[0];
  console.log(
    `  after ${n(walks)} walks: Level ${s.level}, buildings ${s.doghouse}/${s.bakery}/${s.sniffGarden}, ` +
      `next upgrade ${n(nextCost)} treats = ${n(nextCost / 50, 1)} walks of income`
  );
}

/* ================================================================== *
 * REPORT 6 — exploits                                                 *
 * ================================================================== */
rule('6. EXPLOIT CHECK — is there a cheaper loop than actually walking the dog?');

const HOUR_BUDGET = 60; // minutes of player time
const COSTS = { typical: 30, long: 60, tinyLoop: 3, manualLog: 0.2 };
console.log(`Per 60 minutes of player time, at Level 1 (payout ${buddyPayout(1)}):`);
console.log(`${padr('strategy', 14)}${pad('reps/hr', 9)}${pad('XP/hr', 9)}${pad('treats/hr', 11)}${pad('vs typical', 12)}`);
const baseline = {};
for (const p of ['typical', 'long', 'tinyLoop', 'manualLog']) {
  const reps = Math.floor(HOUR_BUDGET / COSTS[p]);
  const xp = reps * xpOf(p);
  const tr = reps * buddyPayout(1);
  if (p === 'typical') Object.assign(baseline, { xp, tr });
  console.log(
    padr(p, 14) + pad(n(reps), 9) + pad(n(xp), 9) + pad(n(tr), 12) + '  ' + pad(`${n(xp / baseline.xp, 1)}x XP / ${n(tr / baseline.tr, 1)}x treats`, 12)
  );
}
console.log(`\n(manualLog reps/hr is capped above by the today+yesterday window, NOT by any per-day limit — `);
console.log(` App.tsx logMissedWalk has no rate limit, so treats/hr there is effectively unbounded.)`);

console.log(`\nWith the proposed per-day full-value allowance ${JSON.stringify(PROPOSED.dailyDecay)}:`);
console.log(`${padr('walks/day', 11)}${pad('XP/day', 9)}${pad('treats/day', 12)}${pad('vs 2 honest walks', 20)}`);
const honest = 2 * xpOf('typical');
const honestT = 2 * buddyPayout(1);
for (const w of [1, 2, 3, 4, 6, 10, 20, 50]) {
  let xp = 0,
    tr = 0;
  for (let i = 1; i <= w; i++) {
    xp += xpOf('tinyLoop') * dayMultiplier(i);
    tr += buddyPayout(1) * dayMultiplier(i);
  }
  console.log(padr(w, 11) + pad(n(xp), 9) + pad(n(tr), 12) + '  ' + pad(`${n(xp / honest, 2)}x XP / ${n(tr / honestT, 2)}x treats`, 20));
}
let unbounded = 0;
for (let i = 1; i <= 50; i++) unbounded += buddyPayout(1);
console.log(`\nWithout the allowance, 50 tiny loops/day = ${n(unbounded)} treats = ${n(unbounded / honestT, 1)}x an honest day.`);
let boundedT = 0;
for (let i = 1; i <= 50; i++) boundedT += buddyPayout(1) * dayMultiplier(i);
console.log(`With    the allowance, 50 tiny loops/day = ${n(boundedT)} treats = ${n(boundedT / honestT, 1)}x an honest day (asymptote ~${n(3 + 0.5 + 0.25, 2)}x + 0.1/walk).`);
console.log(`Honest 3-walks-a-day owner is untouched: multiplier ${dayMultiplier(3)} on walk 3.`);

/* ================================================================== *
 * REPORT 7 — edges                                                    *
 * ================================================================== */
rule('7. EDGE BEHAVIOUR');

console.log(`Level 1 parity with what is coded today:`);
console.log(`  payout        ${buddyPayout(1)} vs BALANCE.treatsPerWalk ${BALANCE.treatsPerWalk}  => ${buddyPayout(1) === BALANCE.treatsPerWalk ? 'IDENTICAL' : 'DIFFERS'}`);
for (const dh of [1, 2, 3, 5, 10, 15]) {
  const now = BALANCE.storage.base + dh * BALANCE.storage.perDoghouseLevel;
  const prop = storageCap(dh, 1);
  const nextDh = upgradeCost('doghouse', dh + 1);
  const nextBk = upgradeCost('bakery', dh + 1);
  console.log(
    `  storage dh=${padr(dh, 3)} today ${pad(n(now), 9)} vs proposed ${pad(n(prop), 11)}  ` +
      `| cheapest next upgrade at that tier ${pad(n(Math.min(nextDh, nextBk)), 9)} -> today ${now >= Math.min(nextDh, nextBk) ? 'ok  ' : 'STUCK'} / proposed ${prop >= Math.min(nextDh, nextBk) ? 'ok' : 'STUCK'}`
  );
}
console.log(`  passive bk=5  today ${passiveTreatsPerHour(5, 1)}/hr vs coded ${5 * BALANCE.passive.treatsPerHourPerBakeryLevel}/hr => ${passiveTreatsPerHour(5, 1) === 5 ? 'IDENTICAL' : 'DIFFERS'}`);

console.log(`\nStorage ceiling without the walks-denominated fix (today's flat formula):`);
for (const L of [1, 20, 40, 60, 80, 100]) {
  const flat = BALANCE.storage.base + BALANCE.maxBuildingLevel * BALANCE.storage.perDoghouseLevel;
  console.log(
    `  L${padr(L, 4)} payout ${pad(n(buddyPayout(L)), 7)}  MAX flat storage ${n(flat)} = ${pad(n(flat / buddyPayout(L), 1), 7)} walks of income ` +
      (flat / buddyPayout(L) < 4 ? ' <- ceiling collapses' : '')
  );
}

console.log(`\nMax level and unreachability:`);
console.log(`  cumulative XP for L50  = ${n(cumulativeXpForLevel(50))} = ${n(walksToLevel(50))} typical walks (~${n(walksToLevel(50) / 2 / 365, 1)} y at 2/day)`);
console.log(`  cumulative XP for L100 = ${n(cumulativeXpForLevel(100))} = ${n(walksToLevel(100))} typical walks (~${n(walksToLevel(100) / 2 / 365, 0)} y at 2/day)`);
console.log(`  => L100 is a horizon, not a destination; the "no final stage" guardrail holds in practice.`);

console.log(`\nCliffhanger trigger frequency (fires when xpToNext <= trailing avg XP AND next level is a milestone):`);
{
  let xp = 0,
    lvl = 1,
    fires = 0,
    walks = 0;
  const avg = xpOf('typical');
  const msSet = new Set(milestoneLevels(100));
  while (walks < 2000) {
    walks++;
    const toNext = cumulativeXpForLevel(lvl + 1) - xp;
    if (msSet.has(lvl + 1) && toNext <= avg && toNext > 0) fires++;
    xp += avg;
    lvl = levelForXp(xp);
  }
  console.log(`  over 2,000 walks (~2.7 y): ${fires} cliffhanger lines total, i.e. one per ${n(2000 / fires)} walks. Never spammy.`);
}

console.log('');

/* ================================================================== *
 * REPORT 8 — Den upgrade cadence + the XP-growth lever                *
 * ================================================================== */
rule('8. THE XP-GROWTH LEVER — how often does a level-up actually land?');

function levelCurve(growth) {
  const cum = (l) => Math.floor((BALANCE.leveling.xpBase / (growth - 1)) * (Math.pow(growth, l - 1) - 1));
  return { cum, walksTo: (l) => Math.ceil(cum(l) / xpOf('typical')) };
}
const GROWTHS = [1.13, 1.11, 1.1, 1.08];
console.log(`Walks between consecutive level-ups (typical 1.5 km / 8,000 m2 walk, 2 walks/day):`);
console.log(padr('xpGrowth', 10) + ['L5->6', 'L10->11', 'L20->21', 'L30->31', 'L40->41', 'L50->51'].map((h) => pad(h, 10)).join(''));
for (const g of GROWTHS) {
  const c = levelCurve(g);
  console.log(
    padr(g, 10) +
      [5, 10, 20, 30, 40, 50].map((L) => pad(n(c.walksTo(L + 1) - c.walksTo(L)), 10)).join('')
  );
}
console.log(`\nTotal walks to reach a level (and elapsed time at 2 walks/day):`);
console.log(padr('xpGrowth', 10) + ['L10', 'L20', 'L30', 'L40', 'L50'].map((h) => pad(h, 14)).join(''));
for (const g of GROWTHS) {
  const c = levelCurve(g);
  console.log(
    padr(g, 10) +
      [10, 20, 30, 40, 50]
        .map((L) => {
          const w = c.walksTo(L);
          const d = w / 2;
          return pad(`${n(w)}w/${d < 60 ? n(d) + 'd' : d < 730 ? n(d / 30) + 'mo' : n(d / 365, 1) + 'y'}`, 14);
        })
        .join('')
  );
}
console.log(`\n1.13 is what is CODED today. It was chosen when Level paid out nothing.`);
console.log(`Now that every level moves the displayed payout, the gap between level-ups IS the reward cadence.`);

rule('9. DEN UPGRADE CADENCE — with the proposed payout curve vs. today');
for (const label of ['proposed', 'today']) {
  const sim2 = label === 'proposed' ? simulate({ days: 730 }) : null;
  if (label === 'proposed') {
    console.log(`proposed: ${sim2.purchases.length} upgrades in 2 years; last 5 purchases at walks ` +
      sim2.purchases.slice(-5).map((p) => `${p.walk}(${p.b}->${p.lvl})`).join(', '));
  }
}

/* ================================================================== *
 * REPORT 10 — keepsake drop rate (third clock, zero mechanical bonus) *
 * ================================================================== */
rule('10. KEEPSAKE CLOCK — flat rate + pity timer, no power, no snowball');

const KEEPSAKE = { p: 0.18, pity: 12, cooldown: 2 };
function keepsakeSim(walks = 200000) {
  let since = 0, found = 0, gaps = [], cd = 0;
  let rng = 123456789;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let w = 1; w <= walks; w++) {
    since++;
    if (cd > 0) { cd--; continue; }
    if (since >= KEEPSAKE.pity || rand() < KEEPSAKE.p) {
      found++; gaps.push(since); since = 0; cd = KEEPSAKE.cooldown;
    }
  }
  gaps.sort((a, b) => a - b);
  return {
    found,
    mean: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    p50: gaps[Math.floor(gaps.length * 0.5)],
    p90: gaps[Math.floor(gaps.length * 0.9)],
    max: gaps[gaps.length - 1],
  };
}
const k = keepsakeSim();
console.log(`p=${KEEPSAKE.p} per qualifying walk, hard pity at ${KEEPSAKE.pity} walks, ${KEEPSAKE.cooldown}-walk cooldown after a find`);
console.log(`  over 200,000 walks: ${n(k.found)} keepsakes`);
console.log(`  gap between keepsakes (walks): mean ${n(k.mean, 1)}  median ${k.p50}  p90 ${k.p90}  worst ${k.max}`);
console.log(`  at 2 walks/day: mean ~${n(k.mean / 2, 1)} days, worst-case ~${n(k.max / 2, 1)} days => no dead zone`);
console.log(`  rate is flat for every player at every level => contributes 0% to the power cap by construction`);
console.log('');
