// Counters for dog photo analysis: per household (day + month) and one global monthly cost estimate.
// In memory on purpose (single API instance, no photo or personal data in here): a server restart resets them,
// which is acceptable for a courtesy limit. Calendar = UTC.
export type Reservation = 'ok' | 'household_limit' | 'budget';

interface UsageLimits {
  perHouseholdPerDay: number;
  perHouseholdPerMonth: number;
  monthlyCapUsd: number;
  /** Reserved before a call; replaced by the real cost once known. */
  flatCostUsd: number;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

export class AnalysisUsage {
  private perHousehold = new Map<string, number>(); // key: `${householdId}|d|YYYY-MM-DD` and `${householdId}|m|YYYY-MM`
  private globalMonth = { key: '', spentUsd: 0 };

  constructor(private readonly limits: UsageLimits) {}

  /** Counts one analysis if every limit allows it. Call `release` when the provider failed (nothing was spent). */
  reserve(householdId: string, now: number): Reservation {
    const d = `${householdId}|d|${dayKey(now)}`;
    const m = `${householdId}|m|${monthKey(now)}`;
    this.rollGlobal(now);
    if ((this.perHousehold.get(d) ?? 0) >= this.limits.perHouseholdPerDay) return 'household_limit';
    if ((this.perHousehold.get(m) ?? 0) >= this.limits.perHouseholdPerMonth) return 'household_limit';
    if (this.globalMonth.spentUsd + this.limits.flatCostUsd > this.limits.monthlyCapUsd) return 'budget';
    this.perHousehold.set(d, (this.perHousehold.get(d) ?? 0) + 1);
    this.perHousehold.set(m, (this.perHousehold.get(m) ?? 0) + 1);
    this.globalMonth.spentUsd += this.limits.flatCostUsd;
    this.sweep(now);
    return 'ok';
  }

  release(householdId: string, now: number): void {
    for (const key of [`${householdId}|d|${dayKey(now)}`, `${householdId}|m|${monthKey(now)}`]) {
      const n = this.perHousehold.get(key);
      if (n) this.perHousehold.set(key, n - 1);
    }
    this.rollGlobal(now);
    this.globalMonth.spentUsd = Math.max(0, this.globalMonth.spentUsd - this.limits.flatCostUsd);
  }

  /** The call finished: swap the reserved flat estimate for the real cost (from token usage). */
  settle(now: number, actualUsd: number): void {
    this.rollGlobal(now);
    this.globalMonth.spentUsd = Math.max(0, this.globalMonth.spentUsd - this.limits.flatCostUsd + actualUsd);
  }

  private rollGlobal(now: number) {
    const key = monthKey(now);
    if (this.globalMonth.key !== key) this.globalMonth = { key, spentUsd: 0 };
  }

  /** Drop counters of past days/months so the map cannot grow without bound. */
  private sweep(now: number) {
    if (this.perHousehold.size < 2000) return;
    const d = dayKey(now);
    const m = monthKey(now);
    for (const key of this.perHousehold.keys()) {
      if (!key.endsWith(`|d|${d}`) && !key.endsWith(`|m|${m}`)) this.perHousehold.delete(key);
    }
  }
}
