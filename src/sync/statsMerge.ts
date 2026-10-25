// Merge of personal stats (multiplayer-sync: "stats on the server"). PURE and structural on purpose: the server imports
// this file by path, so it must not touch i18n, storage or React Native (it does not even import personalStats.ts).
//
// Rules: every number takes the max, `firstWalkAt` (EARLIEST_KEYS) takes the earliest non-null, achievements are a union by
// id with the earliest date. Commutative, associative and idempotent, and it never lowers a value, so retries, two phones
// and out-of-order requests all converge on one result.
// One exception, on purpose: `statsBasis` (the walk-statistics rule set the figures were corrected for). For the two distance
// figures (BASIS_CORRECTED_KEYS) the side with the HIGHER basis wins, because a correction (an idle tail taken out of a distance)
// has to be able to lower them. Every other figure (walk count, treats, area, ...) keeps the max rule, so a device that is
// behind on the basis never loses a walk it counted. Equal basis = the max rules above. Still commutative, associative and
// idempotent (basis is a total order).

/** Stat keys whose merge is "earliest" instead of "highest". */
const EARLIEST_KEYS: ReadonlySet<string> = new Set(['firstWalkAt']);

export interface StatsAchievement {
  id: string;
  unlockedAt: number;
}

export interface StatsDoc<S extends { [K in keyof S]: number | null }> {
  stats: S;
  achievements: StatsAchievement[];
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function mergeValue(key: string, a: number | null | undefined, b: number | null | undefined): number | null {
  const x = isNumber(a) ? a : null;
  const y = isNumber(b) ? b : null;
  if (x === null) return y;
  if (y === null) return x;
  return EARLIEST_KEYS.has(key) ? Math.min(x, y) : Math.max(x, y);
}

/** The only figures a walk-statistics correction can lower: lifetime distance and the longest-walk record. */
export const BASIS_CORRECTED_KEYS: ReadonlySet<string> = new Set(['lifetimeDistanceMeters', 'longestWalkDistanceM']);

const basisOf = (stats: object): number => {
  const v = (stats as Record<string, unknown>).statsBasis;
  return isNumber(v) ? v : 0;
};

/** Keys only one side knows are kept as they are (a newer app may carry stats this one has never heard of). */
export function mergeStatValues<S extends { [K in keyof S]: number | null }>(a: S, b: S): S {
  const basisA = basisOf(a);
  const basisB = basisOf(b);
  const out: Record<string, number | null> = { ...(a as Record<string, number | null>) };
  for (const key of Object.keys(b)) {
    out[key] = mergeValue(key, out[key], (b as Record<string, number | null>)[key]);
  }
  if (basisA !== basisB) {
    const higher = (basisA > basisB ? a : b) as Record<string, number | null>;
    for (const key of BASIS_CORRECTED_KEYS) if (key in higher) out[key] = higher[key];
  }
  return out as S;
}

/** Union by id, earliest date per id, sorted by (unlockedAt, id) so the result does not depend on argument order. */
export function mergeAchievements(a: readonly StatsAchievement[], b: readonly StatsAchievement[]): StatsAchievement[] {
  const byId = new Map<string, number>();
  for (const item of [...a, ...b]) {
    const known = byId.get(item.id);
    byId.set(item.id, known === undefined ? item.unlockedAt : Math.min(known, item.unlockedAt));
  }
  return [...byId].map(([id, unlockedAt]) => ({ id, unlockedAt })).sort((x, y) => x.unlockedAt - y.unlockedAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export function mergeStats<S extends { [K in keyof S]: number | null }>(a: StatsDoc<S>, b: StatsDoc<S>): StatsDoc<S> {
  return { stats: mergeStatValues(a.stats, b.stats), achievements: mergeAchievements(a.achievements, b.achievements) };
}
