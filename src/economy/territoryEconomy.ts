// Territory passive-income formula — pure functions, no I/O. See
// docs/decisions/territories.md Decision 6, verbatim
// (game-economist-validated; not to be altered without a new validation
// pass). Kept in its own file (mirroring milestones.ts's precedent of
// splitting out a distinct economy concern) rather than folded into
// formulas.ts, since this concern has its own split-invariance correctness
// constraint worth keeping easy to find and test in isolation.

import { buddyPayout } from './formulas';

/** `R_max`'s denominator — territoryRate saturates toward buddyPayout(level)/48 as worldMass grows without bound. Game-economist-validated constant; see design.md Decision 6. */
const R_MAX_DIVISOR = 48;

/** The exponential saturation curve's scale — game-economist-validated constant; see design.md Decision 6. */
const WORLD_MASS_SCALE = 300000;

/** `mass(t) = cells(t) + 2*visits(t)` — game-economist-validated weights; see design.md Decision 6. Exposed so a caller building a per-territory mass (for territoryDisplayRate below) uses the identical formula worldMass is built from. */
export function territoryMass(cellCount: number, visitsSum: number): number {
  return cellCount + 2 * visitsSum;
}

/**
 * The Territory passive-income addition, treats/hour — additive to the
 * existing Treat Bakery passive rate (denEconomy.ts's passiveTreatsPerHour).
 *
 * CORRECTNESS CONSTRAINT (design.md Decision 6's split-invariance
 * guardrail): `worldMass` MUST be `HomeRangeRepository.getWorldMass()`'s
 * single ungrouped `cellCount + 2*visitsSum` over the WHOLE cells table —
 * never a value computed per-territory and then summed. Because `mass(t)` is
 * linear, summing per-territory before applying this function's own
 * exponential would silently break invariance the moment more than one
 * territory exists; this function itself has no way to detect that misuse,
 * so the guarantee lives entirely in never calling it with anything but the
 * one true global worldMass.
 */
export function territoryRate(worldMass: number, buddyLevel: number): number {
  const rMax = buddyPayout(buddyLevel) / R_MAX_DIVISOR;
  return rMax * (1 - Math.exp(-worldMass / WORLD_MASS_SCALE));
}

/**
 * A single Territory's own absolute share of the already-correct global
 * `territoryRate` — an exact proportional split (`territoryRate *
 * mass(t)/worldMass`), so per-territory numbers always sum back to the
 * global total. This is a pure downstream display computation over an
 * already-correct total, never a second independent rate computation — see
 * design.md Decision 6's "absolute rates, never percentages" display rule.
 * Returns 0 when `worldMass` is 0 (nothing to proportion).
 */
export function territoryDisplayRate(territoryMassValue: number, worldMass: number, globalTerritoryRate: number): number {
  if (worldMass <= 0) return 0;
  return globalTerritoryRate * (territoryMassValue / worldMass);
}

/** The display-floor gate (design.md Decision 6) — no territory-income figure anywhere until the global rate crosses this. */
export const TERRITORY_INCOME_DISPLAY_FLOOR = 1;
