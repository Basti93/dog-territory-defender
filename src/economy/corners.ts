// Tunables for "Unsere Ecken" (named favourite corners, docs/specs/home-range.md "Unsere Ecken").
// PURE: no imports. A corner is a place the household keeps coming back to, found by the phones from the walks.
// It is cosmetic (no treats, no rank, no counter beyond the stats sign), so these numbers shape feel, not balance.

export const CORNER_CONFIG = {
  /** A block is 3x3 Home Range cells (60 m): the centre cell plus its eight neighbours absorb GPS jitter on one street corner. */
  blockRadiusCells: 1,
  /** A block counts as a corner once tracked walks passed through it on this many different local days (a walk counts once, however often it passes). */
  minDays: 4,
  /** NEW corners lie at least this far apart (metres, centre to centre), so one street never gets two corners. */
  minSpacingM: 200,
  /**
   * Corners already stored are never hidden by a later rule change: the Viertel only folds two corners into one when they
   * are closer than this (two phones holding different ids for one street). Do not raise it above the smallest spacing any release used (150).
   */
  displayDedupeM: 150,
  /**
   * At most one new corner per this many local days ("favourite places, not every street; one naming moment per week at most").
   * Judged against the walk dates in the oldest-first replay, never the wall clock, so both phones agree.
   */
  minDaysBetweenNewCorners: 7,
  /** No corner within this many metres of home: the front door is not a discovery. Same radius as the neighbours' home block. */
  homeExcludeM: 150,
  /** A walk creates at most one new corner. */
  maxNewPerWalk: 1,
  /** Name length, trimmed. Matches `API_LIMITS.maxCornerNameLength` on the server. */
  nameMaxLength: 24,
  /** Home anchor: the first walk's start, replaced by the median start of the first `homeAnchorWalks` tracked walks once there are `homeAnchorMinWalks` (same rule as the server's host anchor for the neighbours). */
  homeAnchorWalks: 30,
  homeAnchorMinWalks: 5,
} as const;
