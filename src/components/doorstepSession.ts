import { dogDisplayName } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId } from '../economy/personalStats';
import { calendarDayGap } from '../utils/manualWalkLog';
import { evaluateSomewhereWild, EvaluateSomewhereWildDeps } from './SomewhereWildCard';
import { formatNumber, t, tPlural } from '../i18n';

// The "Doorstep" launch logic (docs/decisions/home-dashboard.md): which session state applies (same-day reopen vs
// fresh open), the away-strip lines, and the greeting copy. Pure functions, no React; the old DoorstepScreen
// component is gone (the world scene is the home screen), these stayed. They are called once per app launch from
// useLaunchEffects and their results are handed to the WorldScene as props.

export type SessionKind = 'same-day-reopen' | 'fresh-open';
export type GreetingFlavor = 'first-open' | 'long-absence';

export interface DoorstepSession {
  kind: SessionKind;
  /** Only meaningful for a 'fresh-open' — null on a 'same-day-reopen' (that state renders no greeting, just the dozing art). */
  greetingFlavor: GreetingFlavor | null;
}

// design.md Decision 3: a first-pass, easily-retuned threshold, reusing the
// "today/yesterday is recent" boundary already established twice elsewhere
// in this codebase (the manual-log look-back window, and New Ground's 48h
// card window) rather than inventing a third arbitrary number.
const LONG_ABSENCE_MIN_DAY_GAP = 2;

/**
 * Resolves which of the Doorstep's three session states applies, from
 * `DenEconomyState.lastTickAt`'s *previous* value (captured by the caller
 * before it's overwritten — see App.tsx's merged mount effect) — no new
 * "last opened" field needed.
 *
 * HARD GUARDRAIL (design.md Decision 3, the anti-guilt structural
 * enforcement): the day-gap number computed here to pick `greetingFlavor` is
 * never returned — `DoorstepSession`'s shape has no numeric field a caller
 * could interpolate into a user-facing string. Don't add one.
 */
export function resolveDoorstepSession(previousLastTickAt: number, now: number): DoorstepSession {
  const dayGap = calendarDayGap(previousLastTickAt, now);
  if (dayGap <= 0) {
    return { kind: 'same-day-reopen', greetingFlavor: null };
  }
  return {
    kind: 'fresh-open',
    greetingFlavor: dayGap >= LONG_ABSENCE_MIN_DAY_GAP ? 'long-absence' : 'first-open',
  };
}

export interface AwayStripDeps {
  somewhereWildDeps: EvaluateSomewhereWildDeps;
  /** From App.tsx, not re-derived here — see design.md Decision 7 (re-running the accrual/unlock check a second time would see lastTickAt already advanced and silently compute a near-zero delta). */
  pendingDenAchievements: AchievementId[];
  accruedDelta: number;
  /** Household news (multiplayer-sync Decision 10), already worded; resolved upstream by App's launch routine. Optional so existing callers/tests are unchanged. */
  householdLines?: string[];
  /** Already resolved (and, if true, already claimed via NotificationRepository) by App.tsx's merged mount effect — design.md Decision 6. This function must not re-derive it. */
  showOverflowLine: boolean;
  treats: number;
  /**
   * True only on the one app-open where App.tsx's own applyPassiveAccrual
   * call flipped DenEconomyState.territoryIncomeRevealed from false to true
   * this session (docs/decisions/territories.md Decision 6's
   * one-off discovery beat) — never re-derived here, same "already resolved
   * upstream" convention as showOverflowLine. False on every other open,
   * including every one after the reveal (the permanent line lives
   * elsewhere — see the WorldScene footer).
   */
  justRevealedTerritoryIncome?: boolean;
  /** The current global territoryRate, treats/hour — only meaningful (and only read) when justRevealedTerritoryIncome is true. */
  territoryIncomeRate?: number;
}

// The Collect-tap animation (design.md's "Collect-tap scoping") only ever
// applies to the treats-economy line — Somewhere Wild and achievement lines
// aren't a "collect a resource" moment and render as plain static text
// (the WorldScene renders them).
export type AwayStripLineKind = 'somewhere-wild' | 'achievement' | 'household' | 'treats' | 'territory-income' | 'anchor';

export interface AwayStripLine {
  text: string;
  kind: AwayStripLineKind;
}

// design.md Decision 4: flavor-only, zero mechanical consequence — plain
// Math.random() is fine here (unlike the wild-cluster copy's variant
// rotation, which needs determinism to avoid "does the marker jump around").
const ANCHOR_LINE_CHANCE = 0.25;

/**
 * Resolves the away-strip's 0-3 (fresh-open) or 0-1 (same-day-reopen) lines,
 * per design.md Decision 4's exact priority order: Somewhere Wild, then an
 * idle-accrued achievement, then the treats economy (storage-at-cap beats
 * plain accrual when both are true), then — only on a fresh-open, and only
 * if nothing else resolved — a 25%-chance flavor-only anchor line.
 */
export async function resolveAwayStripLines(deps: AwayStripDeps, sessionKind: SessionKind): Promise<AwayStripLine[]> {
  const candidates: AwayStripLine[] = [];

  const wildResult = await evaluateSomewhereWild(deps.somewhereWildDeps);
  if (wildResult.card) {
    candidates.push({ text: wildResult.card.text, kind: 'somewhere-wild' });
  }

  if (deps.pendingDenAchievements.length > 0) {
    candidates.push({ text: t('doorstep.earned', { name: ACHIEVEMENTS[deps.pendingDenAchievements[0]].name }), kind: 'achievement' });
  }

  for (const text of deps.householdLines ?? []) {
    candidates.push({ text, kind: 'household' });
  }

  if (deps.showOverflowLine) {
    candidates.push({ text: tPlural('doorstep.overflow', Math.floor(deps.treats)), kind: 'treats' });
  } else if (deps.accruedDelta > 0) {
    candidates.push({
      text:
        sessionKind === 'same-day-reopen'
          ? t('doorstep.bowl', { count: formatNumber(Math.floor(deps.accruedDelta)) })
          : tPlural('doorstep.bakerBaked', Math.floor(deps.accruedDelta)),
      kind: 'treats',
    });
  }

  // docs/decisions/territories.md Decision 6 — the one-off
  // territory-income discovery beat, reusing this exact away-strip
  // mechanism as its lowest-priority-but-still-real-fact source (lower than
  // Somewhere Wild/achievements/treats, but always shown over the
  // flavor-only anchor line below when it fires — this is a genuine
  // one-time event, not filler).
  if (deps.justRevealedTerritoryIncome) {
    candidates.push({
      text: t('doorstep.territoryIncomeBuddy', { rate: formatNumber(Math.round(deps.territoryIncomeRate ?? 0)) }),
      kind: 'territory-income',
    });
  }

  if (sessionKind === 'same-day-reopen') {
    return candidates.slice(0, 1);
  }

  const lines = candidates.slice(0, 3);
  if (lines.length === 0 && Math.random() < ANCHOR_LINE_CHANCE) {
    lines.push({ text: t('doorstep.anchorLine'), kind: 'anchor' });
  }
  return lines;
}

// Game-master-authored greeting copy (not invented here) — the exact lines
// provided for this pass, now in src/i18n under `doorstep.greeting.<flavor>.<n>`.
// "{dog}" substitutes dogDisplayName(dogName), matching every other templated
// line in this codebase. Each flavor must have exactly this many numbered
// keys in every dictionary (the key-parity test guards the dictionaries).
const FIRST_OPEN_GREETING_COUNT = 2;
const LONG_ABSENCE_GREETING_COUNT = 1;

export function pickGreeting(flavor: GreetingFlavor, dogName: string | null): string {
  const count = flavor === 'first-open' ? FIRST_OPEN_GREETING_COUNT : LONG_ABSENCE_GREETING_COUNT;
  const flavorKey = flavor === 'first-open' ? 'firstOpen' : 'longAbsence';
  const n = Math.floor(Math.random() * count) + 1;
  return t(`doorstep.greeting.${flavorKey}.${n}`, { dog: dogDisplayName(dogName) });
}
