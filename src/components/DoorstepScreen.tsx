import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { currentTitleForLevel } from '../economy/milestones';
import { buddyTreatsPerWalk, storageCap } from '../economy/formulas';
import { DenEconomyState, dogDisplayName, getUpgradeTease } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId } from '../economy/personalStats';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { TerritoryRepository } from '../storage/TerritoryRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { calendarDayGap } from '../utils/manualWalkLog';
import { evaluateSomewhereWild, EvaluateSomewhereWildDeps } from './SomewhereWildCard';
import { TerritoryPortrait } from './TerritoryPortrait';

// "The Doorstep" (openspec/changes/home-dashboard) — the landing screen shown
// once per app cold start, between the first-launch dog-naming gate and the
// map. A pure presentation layer: every number here already comes from an
// already-shipped, already-tested capability (den-economy, home-range,
// personal-stats, the earned-trigger notification) — this screen adds no new
// economy/mechanic logic of its own.
//
// The two pure functions below (resolveDoorstepSession, resolveAwayStripLines)
// are deliberately kept separate from the React component, same pattern as
// SomewhereWildCard.tsx's evaluateSomewhereWild — exercised directly in
// tests with no React renderer needed (see __tests__/DoorstepScreen.test.ts).

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
  /** Already resolved (and, if true, already claimed via NotificationRepository) by App.tsx's merged mount effect — design.md Decision 6. This function must not re-derive it. */
  showOverflowLine: boolean;
  treats: number;
  /**
   * True only on the one app-open where App.tsx's own applyPassiveAccrual
   * call flipped DenEconomyState.territoryIncomeRevealed from false to true
   * this session (openspec/changes/territories/design.md Decision 6's
   * one-off discovery beat) — never re-derived here, same "already resolved
   * upstream" convention as showOverflowLine. False on every other open,
   * including every one after the reveal (the permanent line lives
   * elsewhere — see DoorstepScreen's own footer render below).
   */
  justRevealedTerritoryIncome?: boolean;
  /** The current global territoryRate, treats/hour — only meaningful (and only read) when justRevealedTerritoryIncome is true. */
  territoryIncomeRate?: number;
}

// The Collect-tap animation (design.md's "Collect-tap scoping") only ever
// applies to the treats-economy line — Somewhere Wild and achievement lines
// aren't a "collect a resource" moment and render as plain static text
// (see AwayStripLineView below).
export type AwayStripLineKind = 'somewhere-wild' | 'achievement' | 'treats' | 'territory-income' | 'anchor';

export interface AwayStripLine {
  text: string;
  kind: AwayStripLineKind;
}

// design.md Decision 4: flavor-only, zero mechanical consequence — plain
// Math.random() is fine here (unlike the wild-cluster copy's variant
// rotation, which needs determinism to avoid "does the marker jump around").
const ANCHOR_LINE_CHANCE = 0.25;
const ANCHOR_LINE_TEXT = "Buddy's Bakery bakes faster the more he walks.";

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
    candidates.push({ text: `Earned: ${ACHIEVEMENTS[deps.pendingDenAchievements[0]].name}.`, kind: 'achievement' });
  }

  if (deps.showOverflowLine) {
    candidates.push({ text: `The Doghouse is full — ${Math.floor(deps.treats)} treats waiting.`, kind: 'treats' });
  } else if (deps.accruedDelta > 0) {
    candidates.push({
      text:
        sessionKind === 'same-day-reopen'
          ? `+${Math.floor(deps.accruedDelta)} in the bowl.`
          : `The Treat Bakery baked ${Math.floor(deps.accruedDelta)} treats.`,
      kind: 'treats',
    });
  }

  // openspec/changes/territories/design.md Decision 6 — the one-off
  // territory-income discovery beat, reusing this exact away-strip
  // mechanism as its lowest-priority-but-still-real-fact source (lower than
  // Somewhere Wild/achievements/treats, but always shown over the
  // flavor-only anchor line below when it fires — this is a genuine
  // one-time event, not filler).
  if (deps.justRevealedTerritoryIncome) {
    candidates.push({
      text: `🌍 Buddy's territories bring home ≈${Math.round(deps.territoryIncomeRate ?? 0)} treats an hour`,
      kind: 'territory-income',
    });
  }

  if (sessionKind === 'same-day-reopen') {
    return candidates.slice(0, 1);
  }

  const lines = candidates.slice(0, 3);
  if (lines.length === 0 && Math.random() < ANCHOR_LINE_CHANCE) {
    lines.push({ text: ANCHOR_LINE_TEXT, kind: 'anchor' });
  }
  return lines;
}

// Game-master-authored greeting copy (not invented here) — the exact lines
// provided for this pass. "{dog}" substitutes dogDisplayName(dogName),
// matching every other templated line in this codebase.
const FIRST_OPEN_GREETINGS = ['Morning, {dog}.', '{dog} heard the door.'];
const LONG_ABSENCE_GREETINGS = ["{dog}'s been holding the fort."];

function pickGreeting(flavor: GreetingFlavor, dogName: string | null): string {
  const pool = flavor === 'first-open' ? FIRST_OPEN_GREETINGS : LONG_ABSENCE_GREETINGS;
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template.replace('{dog}', dogDisplayName(dogName));
}

interface DoorstepScreenProps {
  dogName: string | null;
  treats: number;
  level: number;
  /** Since the previous app open — App.tsx's own applyPassiveAccrual delta, already computed and not safe to re-derive here (design.md Decision 7). */
  accruedDelta: number;
  /** From App.tsx's mount effect — see onAcknowledgePendingAchievements below for the queue-consumption rule (design.md Decision 5). */
  pendingDenAchievements: AchievementId[];
  /** Already resolved+claimed by App.tsx's merged mount effect (design.md Decision 6) — never re-derived here. */
  showOverflowLine: boolean;
  /**
   * DenEconomyState.lastTickAt's value from *before* this app open's
   * passive-accrual tick overwrote it — see resolveDoorstepSession's doc
   * comment. Null until App.tsx's own mount effect finishes computing every
   * other Doorstep-facing value (accruedDelta, pendingDenAchievements,
   * showOverflowLine) — this screen deliberately waits for a real value
   * before resolving its session, rather than locking one in from
   * still-default placeholder props.
   */
  previousLastTickAt: number | null;
  denEconomyRepository: DenEconomyRepository;
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  /** Optional so existing callers/tests keep working unchanged — when supplied, the wild-cluster away-strip line can name its Territory (openspec/changes/territories) and the territory-income reveal/permanent line below can render. */
  territoryRepository?: TerritoryRepository;
  /** See AwayStripDeps' own doc comment — true only on the one app-open where the reveal just happened this session. */
  justRevealedTerritoryIncome?: boolean;
  /** The current global territoryRate, treats/hour — from App.tsx's own applyPassiveAccrual call, not re-derived here. Read whenever `territoryIncomeRevealed` is true (from this screen's own denState fetch), for both the one-off reveal line and the permanent footer line. */
  territoryIncomeRate?: number;
  onAcknowledgePendingAchievements?: () => void;
  onStartWalk: () => void;
  onOpenMap: () => void;
  onOpenDen: () => void;
}

export function DoorstepScreen({
  dogName,
  treats,
  level,
  accruedDelta,
  pendingDenAchievements,
  showOverflowLine,
  previousLastTickAt,
  denEconomyRepository,
  homeRangeRepository,
  walkRepository,
  territoryRepository,
  justRevealedTerritoryIncome,
  territoryIncomeRate,
  onAcknowledgePendingAchievements,
  onStartWalk,
  onOpenMap,
  onOpenDen,
}: DoorstepScreenProps) {
  const [denState, setDenState] = useState<DenEconomyState | null>(null);
  const [session, setSession] = useState<DoorstepSession | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [awayStripLines, setAwayStripLines] = useState<AwayStripLine[]>([]);
  const [rangeEmpty, setRangeEmpty] = useState(false);
  // Measured on screen so the treats away-strip line's collect-tap animation
  // (AwayStripLineView) has a real target to fly toward — design.md's
  // "Collect-tap scoping": "translate + fade... toward the footer counter's
  // position", where "the footer counter" is this Den-tease line (see
  // proposal.md's own "Den tease footer" item 5).
  const footerTreatsRef = useRef<View>(null);

  // Waits for a real previousLastTickAt before resolving anything — App.tsx
  // sets that prop last, once every other Doorstep-facing value
  // (accruedDelta, pendingDenAchievements, showOverflowLine) is already
  // final, so this never locks in a session/away-strip computed from
  // still-default placeholder props. `session !== null` guards against
  // re-running a second time (the Doorstep resolves its state exactly once
  // per cold start — design.md's "why the Doorstep doesn't need a
  // foreground listener").
  useEffect(() => {
    if (previousLastTickAt === null || session !== null) return;

    const now = Date.now();
    const resolvedSession = resolveDoorstepSession(previousLastTickAt, now);
    setSession(resolvedSession);
    if (resolvedSession.greetingFlavor) {
      setGreeting(pickGreeting(resolvedSession.greetingFlavor, dogName));
    }

    resolveAwayStripLines(
      {
        somewhereWildDeps: { homeRangeRepository, walkRepository, dogName, now, territoryRepository },
        pendingDenAchievements,
        accruedDelta,
        showOverflowLine,
        treats,
        justRevealedTerritoryIncome,
        territoryIncomeRate,
      },
      resolvedSession.kind
    ).then(setAwayStripLines);

    denEconomyRepository.getState().then(setDenState);

    // Queue-consumption rule (design.md Decision 5): the Doorstep is, by
    // construction, the first screen rendered after the mount effect that
    // populates this queue, so it claims it here rather than waiting for a
    // separate trip into Den to also show it.
    if (pendingDenAchievements.length > 0) {
      onAcknowledgePendingAchievements?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousLastTickAt]);

  if (!denState || !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Getting things ready…</Text>
      </View>
    );
  }

  // treats/level come from App.tsx's own already-reconciled state (avoids
  // any drift with what the rest of the app is already showing); the
  // building levels this screen also needs (for the Den tease + Sniff
  // Garden's per-walk bonus) aren't passed down separately, so they come
  // from this screen's own fetch.
  const state: DenEconomyState = { ...denState, treats, level };
  const dog = dogDisplayName(dogName);
  const title = currentTitleForLevel(level);
  const tease = getUpgradeTease(state);
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const isDozing = session.kind === 'same-day-reopen';

  return (
    <View style={styles.container}>
      <View style={styles.dogArt}>
        <Text style={styles.dogArtEmoji}>{isDozing ? '🐾' : '🐕'}</Text>
        {isDozing ? (
          <Text style={styles.dozingCaption}>Zzz…</Text>
        ) : (
          greeting && <Text style={styles.greeting}>{greeting}</Text>
        )}
      </View>

      <View style={styles.dogRow}>
        <Text style={styles.dogRowName}>
          {dog} · Level {level}
          {title ? ` · ${title}` : ''}
        </Text>
        <Text style={styles.dogRowSub}>
          {dog} brings home {buddyTreatsPerWalk(state.level, state.sniffGardenLevel)} treats a walk.
        </Text>
      </View>

      {rangeEmpty ? (
        <View style={styles.emptyPortrait}>
          <Text style={styles.emptyPortraitText}>{dog} hasn't marked out any ground yet — let's find some.</Text>
        </View>
      ) : (
        <TerritoryPortrait homeRangeRepository={homeRangeRepository} onPress={onOpenMap} onEmptyChange={setRangeEmpty} />
      )}

      {awayStripLines.length > 0 && (
        <View style={styles.awayStrip}>
          {awayStripLines.map((line, i) => (
            <AwayStripLineView key={i} line={line} footerTreatsRef={footerTreatsRef} />
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.startButton} onPress={onStartWalk}>
        <Text style={styles.startButtonText}>Start Walk</Text>
      </TouchableOpacity>

      {tease && (
        <TouchableOpacity style={styles.denTease} onPress={onOpenDen}>
          <View ref={footerTreatsRef} collapsable={false}>
            <Text style={styles.denTeaseText}>
              🦴 {Math.floor(state.treats)} / {cap} treats · Upgrade for {tease.cost}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Permanent territory-income line (openspec/changes/territories/
          design.md Decision 6) — "once true, always shown," mirroring
          getUpgradeTease's own convention. Gated on denState's own
          territoryIncomeRevealed (not App.tsx's justRevealedTerritoryIncome,
          which is only true on the one reveal-moment open). */}
      {denState.territoryIncomeRevealed && (
        <Text style={styles.territoryIncomeLine}>
          🌍 {dog}'s territories bring home ≈{Math.round(territoryIncomeRate ?? 0)} treats an hour
        </Text>
      )}
    </View>
  );
}

/**
 * One away-strip line. Only the treats-economy line (`kind: 'treats'`) is
 * the "collect a resource" moment design.md's "Collect-tap scoping"
 * describes — Somewhere Wild and achievement lines render as plain static
 * text with no tap interaction.
 *
 * Tapping the treats line measures its own on-screen position and the
 * footer Den-tease counter's on-screen position (`footerTreatsRef`, passed
 * down from `DoorstepScreen`), then animates a translate+fade from the
 * former to the latter (RN `Animated`, visual-only — no audio dependency
 * yet, see the TODO below) before removing itself. Purely a satisfying
 * acknowledgment, no economy effect — the treats it describes were already
 * credited earlier (App.tsx's passive-accrual tick); the footer's own
 * count is already reactive to `state.treats` and needs no extra code
 * here to reflect the credited amount.
 */
function AwayStripLineView({ line, footerTreatsRef }: { line: AwayStripLine; footerTreatsRef: React.RefObject<View> }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [collected, setCollected] = useState(false);
  const selfRef = useRef<View>(null);

  if (collected) return null;

  if (line.kind !== 'treats') {
    return <Text style={styles.stripLine}>{line.text}</Text>;
  }

  const flyToFooter = (dx: number, dy: number) => {
    // TODO(home-dashboard fast-follow): pair this with a short "collect"
    // ding once an audio library + sourced asset are approved — see
    // proposal.md's Open Questions (resolved 2026-08-22: visual-only for
    // this change; sound is a deliberate fast-follow, not an oversight).
    Animated.parallel([
      Animated.timing(translateX, { toValue: dx, duration: 400, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: dy, duration: 400, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setCollected(true));
  };

  const handlePress = () => {
    if (!footerTreatsRef.current) {
      // Footer counter isn't currently rendered (no upgrade tease this
      // session, see DoorstepScreen's `{tease && ...}` guard) — fall back
      // to a plain fade-in-place rather than leaving the tap inert.
      flyToFooter(0, 0);
      return;
    }
    selfRef.current?.measureInWindow((selfX, selfY, selfW, selfH) => {
      footerTreatsRef.current?.measureInWindow((footerX, footerY, footerW, footerH) => {
        flyToFooter(footerX + footerW / 2 - (selfX + selfW / 2), footerY + footerH / 2 - (selfY + selfH / 2));
      });
    });
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View ref={selfRef} collapsable={false}>
        <Animated.Text style={[styles.stripLine, { transform: [{ translateX }, { translateY }], opacity }]}>
          {line.text}
        </Animated.Text>
      </View>
    </TouchableOpacity>
  );
}

const COLORS = {
  green: '#2ECC71',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
  warm: '#F39C12',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 20,
    gap: 16,
  },
  loading: {
    padding: 24,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
  },
  dogArt: {
    alignItems: 'center',
    gap: 4,
  },
  dogArtEmoji: {
    fontSize: 40,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  dozingCaption: {
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  dogRow: {
    gap: 2,
  },
  dogRowName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  dogRowSub: {
    fontSize: 13,
    color: COLORS.muted,
  },
  emptyPortrait: {
    borderRadius: 16,
    backgroundColor: '#F0F4EE',
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyPortraitText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
  awayStrip: {
    gap: 6,
  },
  stripLine: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    backgroundColor: '#FFF8E7',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  startButton: {
    backgroundColor: COLORS.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
  denTease: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  denTeaseText: {
    fontSize: 12,
    color: COLORS.warm,
    fontWeight: '600',
  },
  territoryIncomeLine: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
});
