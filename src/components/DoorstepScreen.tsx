import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAvatar } from './buddy';
import { buddyFeetInset } from '../buddy/imageSkin';
import { BuddyLoading } from './BuddyLoading';
import { BuddyMood } from './buddy/buddyMood';
import { ArtImage, Button, Card, FadeSlideIn, ListRow, PressableScale, Screen, palette, radii, shadows, spacing, textStyle } from '../ui';
import { artOr, buildingArt } from '../art/artAssets';
import { artTierForLevel } from './den/YardScene';

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
import { DoorstepMenu } from './DoorstepMenu';

// "The Doorstep" (openspec/changes/home-dashboard) — the app's persistent
// home/overview screen (design.md Decisions 8-13, folded in 2026-08-22 after
// an on-device finding that the original "shown once, never reappears"
// behavior read as a navigation bug): shown at cold start, right after the
// first-launch dog-naming gate, and returned to from every other screen's
// dismiss handler. A pure presentation layer: every number here already
// comes from an already-shipped, already-tested capability (den-economy,
// home-range, personal-stats, the earned-trigger notification) — this
// screen adds no new economy/mechanic logic of its own.
//
// The pure functions below (resolveDoorstepSession, resolveAwayStripLines,
// pickGreeting) are deliberately kept separate from the React component,
// same pattern as SomewhereWildCard.tsx's evaluateSomewhereWild — exercised
// directly in tests with no React renderer needed (see
// __tests__/DoorstepScreen.test.ts). Per design.md Decision 10, they're now
// CALLED from App.tsx's own once-per-launch mount effect, not from this
// component's mount effect — because this component can now be unmounted
// and remounted many times in one app session (every return trip to the
// Doorstep), calling them here again would repeat-fire the same away-strip
// line/greeting on every visit. This module still exports them (App.tsx
// imports from here), it just no longer calls them itself.

const BUDDY_GREETING_MS = 3000;
// Keeps the compact icon-row layout while giving a >= 44px tap target.
const ICON_ROW_HIT_SLOP = { top: 14, bottom: 14, left: 8, right: 8 };

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

export function pickGreeting(flavor: GreetingFlavor, dogName: string | null): string {
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
  /**
   * The Doorstep's session state, greeting copy, and away-strip lines —
   * resolved exactly once per app launch by App.tsx's merged mount effect
   * (design.md Decision 10), never recomputed here. `session`/`greeting` are
   * null until that effect finishes (only on the very first mount of a cold
   * start); on every later remount (a return trip to the Doorstep) they're
   * already resolved, so the same away-strip line/greeting is shown again
   * rather than re-rolled or re-fired.
   */
  session: DoorstepSession | null;
  greeting: string | null;
  awayStripLines: AwayStripLine[];
  denEconomyRepository: DenEconomyRepository;
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  /** Buddy's look, loaded by App.tsx (buddy-comes-alive). */
  buddyAppearance: BuddyAppearance;
  /** False until the stored look has loaded (or the ~1.5s fallback fired); the Doorstep waits so Buddy never flashes the default colour then recolours. */
  buddyAppearanceLoaded?: boolean;
  /** Mood Buddy settles into, resolved once per launch by App.tsx (not per Doorstep mount). */
  buddyMood?: BuddyMood;
  /** True only for the first Doorstep mount of a long-absence launch; App clears it via onBuddyGreetingStarted. */
  playGreeting?: boolean;
  onBuddyGreetingStarted?: () => void;
  /** Optional so existing callers/tests keep working unchanged — when supplied, the wild-cluster away-strip line can name its Territory (openspec/changes/territories) and the territory-income reveal/permanent line below can render. */
  territoryRepository?: TerritoryRepository;
  /** The current global territoryRate, treats/hour — from App.tsx's own applyPassiveAccrual call, not re-derived here. Read whenever `territoryIncomeRevealed` is true (from this screen's own denState fetch), for the permanent footer line. */
  territoryIncomeRate?: number;
  onAcknowledgePendingAchievements?: () => void;
  onStartWalk: () => void;
  onOpenMap: () => void;
  onOpenDen: () => void;
  /** Doorstep direct-access row (design.md Decision 12) — View Past Walks and Stats & Badges only; the Den already has its own entry point (the tease footer below). */
  onOpenHistory: () => void;
  onOpenStats: () => void;
  /** Burger-menu-only actions (design.md Decision 13) — infrequent/secondary, not daily-loop actions. */
  onOpenDebugLog: () => void;
  onOpenLogMissedWalk: () => void;
  /** Settings (openspec/changes/walk-reminder/design.md Decision 1) — third burger-menu row, same infrequent-action tier as the two above. */
  onOpenSettings: () => void;
}

export function DoorstepScreen({
  dogName,
  treats,
  level,
  accruedDelta,
  pendingDenAchievements,
  session,
  greeting,
  awayStripLines,
  denEconomyRepository,
  homeRangeRepository,
  walkRepository,
  buddyAppearance,
  buddyAppearanceLoaded = true,
  buddyMood = 'idle',
  playGreeting = false,
  onBuddyGreetingStarted,
  territoryRepository,
  territoryIncomeRate,
  onAcknowledgePendingAchievements,
  onStartWalk,
  onOpenMap,
  onOpenDen,
  onOpenHistory,
  onOpenStats,
  onOpenDebugLog,
  onOpenLogMissedWalk,
  onOpenSettings,
}: DoorstepScreenProps) {
  const [denState, setDenState] = useState<DenEconomyState | null>(null);
  const [rangeEmpty, setRangeEmpty] = useState(false);
  // The burger menu's own open/closed state (design.md Decision 13) — kept
  // local to this component, not lifted to App.tsx: it's a small transient
  // overlay on top of the Doorstep, not a full-screen destination of its own
  // like every other showX boolean in App.tsx's screen chain.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Measured on screen so the treats away-strip line's collect-tap animation
  // (AwayStripLineView) has a real target to fly toward — design.md's
  // "Collect-tap scoping": "translate + fade... toward the footer counter's
  // position", where "the footer counter" is this Den-tease line (see
  // proposal.md's own "Den tease footer" item 5).
  const footerTreatsRef = useRef<View>(null);

  // Buddy's mood and the long-absence greeting are resolved once per launch
  // in App.tsx (this screen remounts on every return trip). A long-absence
  // open plays one joyful ~3s greeting, then settles into `buddyMood`. Never
  // a guilt signal: coming back is a delight.
  const [greetingPlaying, setGreetingPlaying] = useState(playGreeting);
  useEffect(() => {
    if (!playGreeting) return;
    setGreetingPlaying(true);
    onBuddyGreetingStarted?.(); // App clears the flag so later remounts don't replay it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playGreeting]);
  const ready = !!denState && !!session && buddyAppearanceLoaded;
  useEffect(() => {
    if (!greetingPlaying || !ready) return;
    const t = setTimeout(() => setGreetingPlaying(false), BUDDY_GREETING_MS);
    return () => clearTimeout(t);
  }, [greetingPlaying, ready]);

  // Per-mount live fetch, deliberately (design.md Decision 10's "what stays
  // live" note): building levels (feeding getUpgradeTease/storageCap/
  // buddyTreatsPerWalk) should reflect any Den upgrade made since the last
  // time this screen was shown, even though `session`/`greeting`/
  // `awayStripLines` above are resolved once and passed down unchanged.
  useEffect(() => {
    denEconomyRepository.getState().then(setDenState);

    // Queue-consumption rule (design.md Decision 5): claim the pending-
    // achievement queue on whichever mount sees it non-empty first — in
    // practice, the very first Doorstep mount this launch, since
    // pendingDenAchievements is already cleared to [] by
    // onAcknowledgePendingAchievements before any later remount (design.md
    // Decision 10 — this is the one already-safe-to-recompute value, no
    // change needed there).
    if (pendingDenAchievements.length > 0) {
      onAcknowledgePendingAchievements?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <Screen>
        <BuddyLoading appearance={buddyAppearance} text="Getting things ready…" />
      </Screen>
    );
  }

  // treats/level come from App.tsx's own already-reconciled state (avoids
  // any drift with what the rest of the app is already showing); the
  // building levels this screen also needs (for the Den tease + Sniff
  // Garden's per-walk bonus + the doghouse sprite) aren't passed down
  // separately, so they come from this screen's own fetch.
  const state: DenEconomyState = { ...denState, treats, level };
  const dog = dogDisplayName(dogName);
  const title = currentTitleForLevel(level);
  const tease = getUpgradeTease(state);
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const isDozing = session.kind === 'same-day-reopen';

  // Android WebViews inside an animating-opacity parent can render blank.
  // TerritoryPortrait hosts one, so only the non-portrait groups below fade in;
  // App.tsx must not wrap this screen in FadeSlideIn.
  return (
    <Screen scroll contentStyle={styles.content}>
      {/* The scene: sky, grass strip, Buddy and his doghouse. Start Walk sits
          directly under it so it stays above the fold on a ~640pt phone. */}
      <FadeSlideIn style={styles.fadeGroup}>
        <DoorstepScene
          appearance={buddyAppearance}
          mood={greetingPlaying ? 'excited' : buddyMood}
          dog={dog}
          doghouseLevel={state.doghouseLevel}
          menuButton={
            <PressableScale
              style={styles.menuButton}
              onPress={() => setIsMenuOpen(true)}
              accessibilityLabel="More options"
              hitSlop={6}
            >
              <ArtImage art="icon-settings" size={28} />
            </PressableScale>
          }
        >
          {isDozing ? (
            <Text style={[textStyle('h1'), styles.sceneMuted]}>Zzz…</Text>
          ) : (
            greeting && (
              <Text style={textStyle('h1')} numberOfLines={1} adjustsFontSizeToFit>
                {greeting}
              </Text>
            )
          )}
          <Text style={textStyle('h2')} numberOfLines={1}>
            {dog} · Level {level}
            {title ? ` · ${title}` : ''}
          </Text>
        </DoorstepScene>
      </FadeSlideIn>

      <View style={styles.body}>
        <FadeSlideIn style={styles.fadeGroup}>
          {/* Soft glow only on a fresh open; stops by itself after ~10s or on first touch. */}
          <Button label="Start Walk" icon="icon-paw" onPress={onStartWalk} pulse={session.kind === 'fresh-open'} />
          <Text style={[textStyle('small'), styles.centered]}>
            {dog} brings home {buddyTreatsPerWalk(state.level, state.sniffGardenLevel)} treats a walk.
          </Text>
        </FadeSlideIn>

        {rangeEmpty ? (
          <Card tint="meadow" style={styles.emptyPortrait}>
            <Text style={[textStyle('small'), styles.centered]}>
              {dog} hasn't marked out any ground yet — let's find some.
            </Text>
          </Card>
        ) : (
          <Card style={styles.windowCard}>
            <TerritoryPortrait
              homeRangeRepository={homeRangeRepository}
              onPress={onOpenMap}
              onEmptyChange={setRangeEmpty}
              height={PORTRAIT_HEIGHT}
            />
          </Card>
        )}

        <FadeSlideIn style={styles.fadeGroup}>
          {awayStripLines.length > 0 && (
            <Card tint="warm" style={styles.awayStrip}>
              {awayStripLines.map((line, i) => (
                <AwayStripLineView key={i} line={line} footerTreatsRef={footerTreatsRef} />
              ))}
            </Card>
          )}

          {/* Direct-access rows (design.md Decision 12) — View Past Walks and
              Stats & Badges only. No Den row here: the tease card below is
              already its entry point. */}
          <View>
            <ListRow title="Past Walks" icon="icon-walks" onPress={onOpenHistory} />
            <ListRow title="Stats & Badges" icon="icon-badge" onPress={onOpenStats} />
          </View>

          {tease && (
            <PressableScale onPress={onOpenDen}>
              <Card tint="warm">
                <View ref={footerTreatsRef} collapsable={false}>
                  <View style={styles.denTeaseRow}>
                    <ArtImage art="icon-den" size={40} />
                    <Text style={[textStyle('body'), styles.denTeaseText]}>
                      {Math.floor(state.treats)} / {cap} treats · Upgrade for {tease.cost}
                    </Text>
                  </View>
                </View>
              </Card>
            </PressableScale>
          )}

          {/* Permanent territory-income line (openspec/changes/territories/
              design.md Decision 6) — "once true, always shown," mirroring
              getUpgradeTease's own convention. Gated on denState's own
              territoryIncomeRevealed (not App.tsx's justRevealedTerritoryIncome,
              which is only true on the one reveal-moment open). */}
          {denState.territoryIncomeRevealed && (
            <Text style={[textStyle('small'), styles.centered]}>
              🌍 {dog}'s territories bring home ≈{Math.round(territoryIncomeRate ?? 0)} treats an hour
            </Text>
          )}
        </FadeSlideIn>
      </View>

      <DoorstepMenu
        visible={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpenDebugLog={() => {
          setIsMenuOpen(false);
          onOpenDebugLog();
        }}
        onOpenLogMissedWalk={() => {
          setIsMenuOpen(false);
          onOpenLogMissedWalk();
        }}
        onOpenSettings={() => {
          setIsMenuOpen(false);
          onOpenSettings();
        }}
      />
    </Screen>
  );
}

// Scene content height below the status-bar inset (kept <= 300pt so Start Walk
// stays above the fold on a 640pt phone).
const SCENE_HEIGHT = 300;
// Sized from the screen width so Buddy and the doghouse never overlap on a 320pt phone.
const BUDDY_MAX = 180;
const DOGHOUSE_MAX = 210;
// The doghouse sprite includes its own tile and a transparent margin: its visual base is at this share of its height.
const DOGHOUSE_BASE_FRAC = 0.86;
// Buddy's paws stand this far above the scene bottom (on the grass strip); his box is lowered by the
// empty canvas under his feet. Horizontal centres are shares of the screen width.
const BUDDY_FEET_Y = 36;
const BUDDY_CX = 0.28;
const DOGHOUSE_CX = 0.74;

interface DoorstepSceneProps {
  appearance: BuddyAppearance;
  mood: BuddyMood;
  dog: string;
  doghouseLevel: number;
  menuButton: React.ReactNode;
  /** Greeting + name lines, drawn over the sky. */
  children: React.ReactNode;
}

function DoorstepScene({ appearance, mood, dog, doghouseLevel, menuButton, children }: DoorstepSceneProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sky = artOr('doorstep-sky', null);
  const ground = artOr('yard-ground', null);
  const buddySize = Math.min(BUDDY_MAX, width * 0.5);
  const doghouseSize = Math.min(DOGHOUSE_MAX, width * 0.52);
  const doghouse = buildingArt('doghouse', artTierForLevel(doghouseLevel));
  return (
    <View style={[styles.scene, { height: insets.top + SCENE_HEIGHT }]}>
      {sky && <Image source={sky} resizeMode="cover" style={StyleSheet.absoluteFillObject} />}
      {ground && (
        // Backdrop: cover-fit so the grass bleeds past both edges.
        <Image
          source={ground}
          resizeMode="cover"
          style={[styles.ground, { width: width + 40, height: 140 }]}
        />
      )}
      <View
        style={[
          styles.doghouse,
          // tile base (0.86 of the sprite) lands on the same ground line as Buddy's feet
          { left: width * DOGHOUSE_CX - doghouseSize / 2, bottom: BUDDY_FEET_Y - (1 - DOGHOUSE_BASE_FRAC) * doghouseSize },
        ]} pointerEvents="none">
        <ArtImage art={doghouse} size={doghouseSize} />
      </View>
      <View
        style={[styles.buddy, { left: width * BUDDY_CX - buddySize / 2, bottom: BUDDY_FEET_Y - buddyFeetInset(buddySize) }]}
        pointerEvents="box-none"
      >
        <BuddyAvatar appearance={appearance} size={buddySize} mood={mood} name={dog} showCaption />
      </View>
      <View style={[styles.sceneTop, { paddingTop: insets.top + spacing.md }]} pointerEvents="box-none">
        <View style={styles.sceneText}>{children}</View>
        {menuButton}
      </View>
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
    return <Text style={textStyle('small')}>{line.text}</Text>;
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
        <Animated.Text style={[textStyle('small'), { transform: [{ translateX }, { translateY }], opacity }]}>
          {line.text}
        </Animated.Text>
      </View>
    </TouchableOpacity>
  );
}

// Portrait height inside its window card.
const PORTRAIT_HEIGHT = 140;

const styles = StyleSheet.create({
  // Full-bleed: the scene spans edge to edge, the body below re-adds padding.
  content: { paddingHorizontal: 0, paddingTop: 0 },
  // FadeSlideIn wrappers fill their parent by default; here they only wrap
  // their own content and keep the same rhythm between children.
  fadeGroup: { flex: 0, gap: spacing.md },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  centered: { textAlign: 'center', color: palette.muted },
  scene: {
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: palette.skyTint,
    ...shadows.soft,
  },
  ground: { position: 'absolute', bottom: -24, left: -20 },
  doghouse: { position: 'absolute' },
  buddy: { position: 'absolute' },
  sceneTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  sceneText: { flex: 1, gap: 2 },
  sceneMuted: { color: palette.muted },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  windowCard: { padding: spacing.sm, borderRadius: radii.card },
  emptyPortrait: { minHeight: PORTRAIT_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  awayStrip: { gap: spacing.sm },
  denTeaseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  denTeaseText: { flex: 1 },
});
