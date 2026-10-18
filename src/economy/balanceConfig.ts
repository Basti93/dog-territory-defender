export type BuildingKey = 'doghouse' | 'bakery' | 'sniffGarden';

export const BALANCE = {
  startingTreats: 50,
  passive: {
    treatsPerHourPerBakeryLevel: 1,
  },
  buildings: {
    doghouse: { costBase: 40, costMult: 1.5 },
    bakery: { costBase: 60, costMult: 1.6 },
    sniffGarden: { costBase: 50, costMult: 1.45 },
  } satisfies Record<BuildingKey, { costBase: number; costMult: number }>,
  softCap: {
    level: 50,
    maxBonusPercent: 50,
    curveRate: 25,
  },
  // The Sniff Garden's actual mechanical effect (percent bonus applied to a
  // walk's treats payout) — reuses softCap's curveRate=25 shape but is a
  // separate config block because it's renormalized to its own 8pp
  // anti-snowball budget (see docs/decisions/2026-08-21-virtual-dog-companion.md's
  // "sniffGardenPct" decision), not softCap's 50pp. softCap/softCapBonusPercent
  // above stays display-only dead code (nothing consumes it) — see formulas.ts.
  sniffGarden: {
    maxBonusPercent: 8,
    curveRate: 25,
  },
  maxBuildingLevel: 100,
  xp: {
    perWalkBase: 20,
    perKm: 15,
    per1000m2: 5,
    // Unchanged in magnitude by docs/decisions/2026-08-21-home-range.md, but the input
    // it caps changed: it now caps cellsPainted*400 (the walk's real Home
    // Range footprint, see formulas.ts's xpAwardForWalk) rather than a
    // shoelace polygon's enclosed area. 20000 / 400 = 50, so the cap now
    // binds at 50 painted cells (~450m of walking) — tighter than the old
    // polygon-area cap, which typically needed a much larger enclosed loop
    // to reach 20000 m². Confirmed against real GPX replay: a genuine ~700m
    // walk (testing/munich-route2.gpx) already paints 132 cells (52800 m²,
    // over the cap); the two short synthetic test loops
    // (munich-route.gpx/munich-route-3.gpx) stay well under both this cap
    // and the 25-cell reward-eligibility floor.
    areaCapM2: 20000,
  },
  // The Home Range's Fresh Ground payout — bloomMultiplier = 1 + k*B, treats
  // only, never XP. See docs/decisions/2026-08-21-home-range.md's Decision 3
  // and docs/decisions/2026-08-21-home-range-rewards.md sections 1-2.
  freshGround: {
    // K in `bloomMultiplier = 1 + K·B`. Confirmed by game-master against the
    // sweep in design.md's "K = 0.6 — confirmed by game-master" section —
    // this is a decision record, not a footnote; do not dial it down
    // without a new logged decision (see that section's reasoning for why a
    // lower K would invert anti-snowball's own "the walk itself SHALL
    // dominate outcomes" principle).
    k: 0.6,
    // UI suppression floor (design.md Decision 3's UI rule / FLAG 1's
    // resolution): below this, the walk-close screen shows no Fresh Ground
    // multiplier line at all — not "×1.00," nothing to notice as absent.
    displayThresholdMultiplier: 1.25,
    // Manual-log route-refresh caps — design.md Decision 4's exact rule.
    maxRouteRefreshesPerDay: 1,
    maxManualLogsPerDay: 2,
  },
  leveling: {
    xpBase: 100,
    // 1.10, not the originally-shipped 1.13 — retuned in
    // docs/decisions/2026-08-21-virtual-dog-companion.md so the gap between level-ups
    // (now a real reward cadence, not just a progress-bar speed) never
    // stretches into a multi-month dead zone. See design.md's "xpGrowth
    // should come down to 1.10" decision.
    xpGrowth: 1.1,
    maxLevel: 100,
    // Buddy's per-walk treats payout: round(buddyPayoutBase * buddyPayoutGrowth^(level-1)).
    // buddyPayoutBase=50 matches the flat rate this game shipped with, so a
    // Level-1 player's experience is bit-identical to before this feature.
    // See formulas.ts's buddyPayout and design.md's "buddyPayout(L)" decision.
    buddyPayoutBase: 50,
    buddyPayoutGrowth: 1.055,
    // Fallback trailing-average XP used by the one-away cliffhanger (see
    // economy/milestones.ts) before a player has 5 closed walks to average —
    // design.md's "typical" 1.5km/8000m2 walk's XP award.
    cliffhangerFallbackXp: 82.5,
  },
} as const;
