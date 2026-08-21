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
  // anti-snowball budget (see openspec/changes/virtual-dog-companion/design.md's
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
    areaCapM2: 20000,
  },
  leveling: {
    xpBase: 100,
    // 1.10, not the originally-shipped 1.13 — retuned in
    // openspec/changes/virtual-dog-companion so the gap between level-ups
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
