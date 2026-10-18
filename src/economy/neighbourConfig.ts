// Tunables for the Nachbarhunde (simulated neighbour dogs, multiplayer-sync Track B).
// PURE: no imports. Shared by the server (planner, gifts, co-op) and the app. These are balance numbers
// (CLAUDE.md: tunables live in src/economy); the sprinkle fraction and co-op sizes are new Tier A numbers
// logged in docs/decisions/multiplayer-sync.md (Decisions 20, 21) and still to be confirmed by game-master.

export const NEIGHBOUR_CONFIG = {
  /** Escalation: weeks since the neighbours were introduced (week index 0 = W1). */
  escalation: {
    invitationsFromWeek: 2, // W2
    coopFromWeek: 3, // W3
    weirdFromWeek: 4, // W4 (Nebel's first weird event)
  },

  /** Caps, checked at plan time against everything already planned or emitted for the household. */
  caps: {
    eventsPerDay: 2,
    giftsPerDay: 1,
    invitationsPerWeek: 1,
    reactionsPerWeek: 3,
    /** A given line is not repeated within this many days. */
    lineRepeatDays: 10,
    /** The sock line is the "once a month" weird event. */
    sockRepeatDays: 30,
    /** Chance (out of 100) of 0, 1 or 2 planned events on a normal day. Average ~0.95/day. */
    eventCountWeights: [25, 55, 20],
  },

  /** About 1 in N accepted walks with new ground gets a reaction walk (hash of the walk id). */
  reactionOneInN: 3,
  /** A reaction walk finishes between these many hours after the triggering walk. */
  reactionDelayHours: { min: 3, max: 20 },
  /** Paw-print cells listed in a reaction event. */
  maxPawCells: 12,

  /** Gifts (anti-snowball: outside the 30% power budget, no Beginner's Luck). */
  gifts: {
    sprinkleFraction: 0.05,
    sprinkleWalkWindow: 14,
    /** Distinct days an archetype must have been "met" before its exclusive cosmetic is queued. */
    metCountForExclusive: 3,
  },

  /** Geography. */
  geo: {
    homeBlockRadiusM: 150,
    loopMinM: 500,
    loopMaxM: 3000,
    /** Bot home sits this far from the host anchor / Range edge. */
    botHomeMinM: 500,
    botHomeMaxM: 3000,
    /** Accepted loop length is within +-this of the slot target. */
    lengthTolerance: 0.2,
    routeSpacingM: 10,
    startJitterMin: 20,
    weekendShiftMin: 60,
    /** Fallback generator: translate a host route by this much. */
    offsetMinM: 300,
    offsetMaxM: 1500,
    /** Fallback generator: shortest contiguous remainder that still counts as a walk. */
    offsetMinRemainingM: 500,
  },

  /** Scheduler. */
  scheduler: {
    plannerLocalHour: 6,
    plannerLocalMinute: 15,
    tickMs: 15 * 60 * 1000,
    catchUpDays: 2,
    /** Tile fetching never runs in this local-hour window (SERVER.md rule 5). */
    quietFetchHours: { from: 2, to: 6 },
    maxTilesPerTick: 3,
    tileRetryAfterMs: 6 * 60 * 60 * 1000,
    tileRefreshAfterMs: 90 * 24 * 60 * 60 * 1000,
  },

  /** Viertel-Runde (weekly co-op). */
  coop: {
    /** Player share P of the goal, km. */
    minPlayerKm: 4,
    maxPlayerKm: 12,
    /** P = this x median weekly human km of the last 4 weeks, clamped to [min, max]. */
    paceFraction: 0.6,
    paceWeeks: 4,
    /** Bots never count for more than this share of the goal. */
    botShareCap: 0.6,
    /** Head start carried into the next week: at most this fraction of next week's P. */
    carryFraction: 0.5,
  },

  /** /v1/nearby */
  nearby: {
    defaultRadiusM: 5000,
    maxRadiusM: 10000,
    maxCellsPerBot: 600,
  },
} as const;

/** Sprinkle = fraction of the mean treats of the last walks; at least 1 when the mean is positive, none without walks. */
export function sprinkleTreats(recentTreats: number[]): number | null {
  const window = recentTreats.slice(0, NEIGHBOUR_CONFIG.gifts.sprinkleWalkWindow);
  if (window.length === 0) return null;
  const mean = window.reduce((s, n) => s + n, 0) / window.length;
  if (mean <= 0) return null;
  return Math.max(1, Math.round(mean * NEIGHBOUR_CONFIG.gifts.sprinkleFraction));
}

/** Player share P (km) of a weekly goal from the household's recent weekly human km (newest first or any order). */
export function coopPlayerShareKm(recentWeeklyKm: number[]): number {
  const { minPlayerKm, maxPlayerKm, paceFraction, paceWeeks } = NEIGHBOUR_CONFIG.coop;
  const weeks = recentWeeklyKm.slice(0, paceWeeks).sort((a, b) => a - b);
  let median = 0;
  if (weeks.length > 0) {
    const mid = Math.floor(weeks.length / 2);
    median = weeks.length % 2 ? weeks[mid] : (weeks[mid - 1] + weeks[mid]) / 2;
  }
  return Math.min(maxPlayerKm, Math.max(minPlayerKm, paceFraction * median));
}

/** Weekly goal G = B + P where the bots' planned km B is capped so it is at most botShareCap of G (B <= cap/(1-cap) x P). */
export function coopGoalKm(plannedBotKm: number, playerShareKm: number): { goalKm: number; botKm: number } {
  const { botShareCap } = NEIGHBOUR_CONFIG.coop;
  const botKm = Math.min(Math.max(0, plannedBotKm), (botShareCap / (1 - botShareCap)) * playerShareKm);
  return { goalKm: botKm + playerShareKm, botKm };
}
