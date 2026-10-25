import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextEffectLabel, useDen } from '../../app/useDen';
import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyBackPoseSources } from '../../buddy/imageSkinSources';
import { ArtKey, artOr } from '../../art/artAssets';
import { stickDogOf } from '../../economy/sticks';
import { emptyBoxLine, noteLine, type InboxItem } from '../../inbox/inbox';
import { useInbox } from '../../inbox/useInbox';
import { BuildingKey } from '../../economy/balanceConfig';
import { dogDisplayName, getBuildingLevel } from '../../economy/denEconomy';
import { currentTitleForLevel } from '../../economy/milestones';
import { AchievementId } from '../../economy/personalStats';
import * as haptics from '../../feedback/haptics';
import { play } from '../../feedback/sounds';
import { formatNumber, t } from '../../i18n';
import { coopSignText, fillsShelfSlot, giftOpenedLine } from '../../sync/neighbourhood';
import type { NeighbourhoodActions } from '../../sync/neighbourhood';
import { usePartnerWalk } from '../../sync/presenceStore';
import { useNeighbourhood } from '../../sync/useNeighbourhood';
import type { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import type { PersonalStatsRepository } from '../../storage/PersonalStatsRepository';
import type { DenEconomyRepository } from '../../storage/DenEconomyRepository';
import type { SettingsRepository } from '../../storage/SettingsRepository';
import type { TerritoryRepository } from '../../storage/TerritoryRepository';
import type { WalkRepository } from '../../storage/WalkRepository';
import { ArtImage, DecorImage, PaperNote, SpeechBubble, TextLink, TopBar, TOP_BAR_H, TreatPop, WoodSign, material, mix, palette, radii, spacing, stitch, textStyle, tokens } from '../../ui';
import { BuddyLoading } from '../BuddyLoading';
import { BuddyMood } from '../buddy/buddyMood';
import type { AwayStripLine, DoorstepSession } from '../doorstepSession';
import { MapView } from '../MapView';
import { BUILDING_SIZE, BuildingSprite, YardBuildingKey, artTierForLevel, yardWalkGeometry } from '../den/YardScene';
import { YardBuddy } from '../den/YardBuddy';
import { YardButterflies } from '../den/YardButterflies';
import { YardExtras } from '../den/YardExtras';
import { useWildExtra } from '../den/useWildExtra';
import { BowlFill, BowlSignContent, TreatFlights, UpgradeSparkle, useBowlProjection } from './BakeryLife';
import { BURST_FLIGHT_MS, BURST_STAGGER_MS, bowlAtCap, burstSpriteCount, formatRatePerHour } from './bakeryRules';
import { useBackAction } from '../../app/backStack';
import { BENCH_WALK_WINDOW } from '../../postcards/postcards';
import { usePostcards } from '../../postcards/usePostcards';
import { BenchPostcards } from '../postcards/BenchPostcards';
import { BuildingPanel } from './BuildingPanel';
import { FenceBadges } from './FenceBadges';
import { signStrip } from './fencePlan';
import { useFenceBadges } from './useFenceBadges';
import { Homecoming } from './Homecoming';
import { InboxUnwrap, MailboxFlag } from './Mailbox';
import { PILE_H, PILE_W, StickPile } from './StickPile';
import { CornerSheet, type CornerTools } from './CornerSheet';
import { BeatId, HomecomingWalk, homecomingBadgeArrivals } from './homecomingPlan';
import {
  BOTTOM_ROW_H,
  BUDDY_SIZE,
  FENCE_FOOT_PAD,
  FENCE_SEG_H,
  FENCE_SEG_W,
  GATE_BOX,
  GATE_SIGN_H,
  HINT_H,
  PENNANT_H,
  buildingSelectOffset,
  buildingsLayout,
  sceneLayout,
  viertelScrollTarget,
  worldYardLayout,
} from './sceneLayout';
import { MeadowGround, MeadowProps } from './MeadowLayer';
import { diarySpot, hofDecor, meadowLayout } from './meadowDecor';
import { skyTintForDate } from './timeOfDay';
import { useViertelChrome } from './useViertelChrome';

// "Unser Viertel", step 1 of the redesign (handover/redesign/konzept.md): ONE scene with three pages
// replacing the Doorstep and the Den's yard. Start height = the yard (Hof) with the gate at the top; scrolling
// up reveals the Viertel (map portrait) and the sky, scrolling down the buildings page (upgrades). Presentation only: every number comes from the same
// economy code the Den used (via useDen).

/** Share of the scroll distance each layer lags (sky, positive) or leads (yard, negative). */
const SKY_PARALLAX = 0.4;
const VIERTEL_PARALLAX = 0.15;
const YARD_PARALLAX = -0.06;
const GATE_SWING_MS = 600;
const BOWL_ZOOM_HOLD_MS = 2000;
/** The harvest flight lands on the shared top bar's treat chip: this far from the right edge (chip centre). */
const BAR_CHIP_CENTER_FROM_RIGHT = 56;
/** Roughly the body colour of yard-ground-wide.png, shown where the hill edge drops away at the sides; also the buildings page's ground. */
const GRASS_BASE = '#9BC995';
/** The hill's bottom edge (measured on yard-ground-wide.png: ~#B9D7B6) as a mix of the meadow colour, so the buildings page fades out of it with no seam. */
const HILL_EDGE = mix(GRASS_BASE, '#FFFFFF', 0.3);
const MAX_NOTES = 2;
/** Buddy gets this long to reach the stick shelf or the mailbox before a second tap may start a new errand (a re-layout can cancel one). */
const ERRAND_STALE_MS = 6000;
/** Keys of Buddy's stick lines start here so they never collide with App's flash-note keys. */
const STICK_LINE_KEY_BASE = 1_000_000;
/** Same for the mailbox lines; a rising counter keeps every line's key unique (a repeated line must still show). */
const INBOX_LINE_KEY_BASE = 2_000_000;
/** How long the pile-up line stays alone before Buddy pulls the first item. */
const PILE_UP_PAUSE_MS = 1600;
/** Which empty-box line comes next; module-level so the three rotate across visits to the Hof. */
let emptyBoxTurn = 0;
const NO_LOCATIONS: never[] = [];
/** The yard's wooden-sign text is smaller than the 20pt default so long names fit under a building. */
const SMALL_SIGN_TEXT = { fontSize: 15, lineHeight: 18 } as const;
const STATUS_SIGN_TEXT = { fontSize: 13, lineHeight: 16 } as const;
/** The fence layer reaches this far below the fence line so the strip signs and a badge's sign sit inside its bounds (touch). */
const FENCE_LAYER_ROOM = 170;

export interface WorldSceneProps {
  dogName: string | null;
  /** The bank (the pill's number). */
  treats: number;
  /** The unharvested pile at the bowl (App's live value); omitted = the stored one. */
  pile?: number;
  level: number;
  pendingDenAchievements: AchievementId[];
  /** Resolved once per launch by App.tsx; the scene shows its loading view until it is set. */
  session: DoorstepSession | null;
  greeting: string | null;
  awayStripLines: AwayStripLine[];
  denEconomyRepository: DenEconomyRepository;
  personalStatsRepository: PersonalStatsRepository;
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  settingsRepository?: SettingsRepository;
  buddyAppearance: BuddyAppearance;
  buddyAppearanceLoaded?: boolean;
  buddyMood?: BuddyMood;
  playGreeting?: boolean;
  onBuddyGreetingStarted?: () => void;
  onAcknowledgePendingAchievements?: () => void;
  onTreatsChanged: (treats: number) => void;
  onPileChanged?: (pile: number) => void;
  /** Household sync: a harvest was saved locally at this time (ms). */
  onHarvested?: (at: number) => void;
  /** Household sync: one rewarded Buddy tap paid this many treats (App batches them). */
  onBuddyTap?: (treats: number) => void;
  /** Day key for the Buddy tap counter in the household timezone (App passes the synced one). */
  getDayKey?: (now: number) => Promise<string>;
  /** Household sync: called after an upgrade was saved locally. */
  onUpgraded?: (building: BuildingKey) => void;
  onStartWalk: () => void;
  updateCard?: { onApply: () => void; onLater: () => void };
  /** A walk is running: the gate reads "Zur Runde" and opens the live map instead of starting a second walk. */
  walkActive?: boolean;
  /** The small "abbrechen" link under the gate sign while a walk runs (App asks once if the walk has moved). Omitted = no link. */
  onCancelWalk?: () => void;
  /** A one-off Buddy line after a walk was cancelled or discarded; `key` makes every new one show even if the text repeats. */
  flashNote?: { key: number; text: string } | null;
  onOpenMap: () => void;
  onOpenHistory: () => void;
  /** The Stock-Regal (the stick pile). */
  onOpenSticks: () => void;
  /** Buddy's walk diary (the notebook on the stump). */
  onOpenDiary: () => void;
  /** The gear in the top bar. */
  onOpenSettings: () => void;
  /** The dog-name sign under the fence opens Stats & badges. Omitted = the sign is plain decoration. */
  onOpenStats?: () => void;
  /** The `den` screen alias (notification taps): scroll to the buildings page and open the next-upgrade panel. */
  openDenPanel?: boolean;
  onDenPanelHandled?: () => void;
  /** Treats that landed in the pile since the previous app open (App's launch routine; not re-derived). >= 1 plays the soft welcome-back pop and line once per launch. */
  accruedDelta?: number;
  /** Current global territory income, treats/hour (App's launch routine); shown on the fence sign once revealed. */
  territoryIncomeRate?: number;
  /** A walk just ended: the Heimkehr plays over the scene (camera to the Viertel, then the yard) until `onDone`. */
  homecoming?: { walk: HomecomingWalk; onDone: () => void } | null;
  /** The sync engine: neighbour lines, the gift parcel and the Viertel-Runde sign. Omitted (tests, not joined) = no neighbours. */
  neighbourhood?: NeighbourhoodActions;
  /** The Viertel's territory sign (name + title). Omitted (tests) = no territory sign. */
  territoryRepository?: TerritoryRepository;
  /** The "Reviere ›" sign on the Viertel opens the Territories screen. Omitted = no sign. */
  onOpenTerritories?: () => void;
  /** Bump after a walk was finished so the Viertel signs and notes re-read the data. */
  homeRangeRefreshKey?: number;
  /** "Unsere Ecken": the corner store, rename and namer lookup. Omitted (tests) = no corners and no corner prompt. */
  cornerTools?: CornerTools;
}

type NoteKind = 'update' | 'line';
interface Note {
  key: string;
  kind: NoteKind;
  text: string;
}

/**
 * Pure: at most two notes at once. The OTA update card comes first, then the welcome-back line, then the away-strip lines
 * in their given order; the greeting only fills an otherwise empty yard. Neighbour notes arrive in the mailbox, not here.
 */
export function pickSceneNotes(
  awayStripLines: AwayStripLine[],
  greeting: string | null,
  hasUpdateCard: boolean,
  dismissed: ReadonlySet<string>,
  welcomeBack: string | null = null,
  flash: { key: number; text: string } | null = null
): Note[] {
  const all: Note[] = [];
  // Buddy's line about a walk that just ended without a record: first in line for the speech bubble.
  if (flash) all.push({ key: `flash-${flash.key}`, kind: 'line', text: flash.text });
  if (hasUpdateCard) all.push({ key: 'update', kind: 'update', text: t('update.ready') });
  // The welcome-back bubble tells the bakery's treats; the old away-strip treats line would say it twice.
  if (welcomeBack) all.push({ key: 'welcome-back', kind: 'line', text: welcomeBack });
  awayStripLines.forEach((line, i) => {
    if (welcomeBack && line.kind === 'treats') return;
    all.push({ key: `line-${i}`, kind: 'line', text: line.text });
  });
  if (all.length === 0 && greeting) all.push({ key: 'greeting', kind: 'line', text: greeting });
  const visible = all.filter((n) => !dismissed.has(n.key));
  return visible.slice(0, MAX_NOTES);
}

let sleepyYawnPlayed = false;
/** Sessions (one object per app launch, from App.tsx) whose welcome-back burst already played. */
const welcomeBackPlayed = new WeakSet<DoorstepSession>();
const BUDDY_GREETING_MS = 3000;

export function WorldScene(props: WorldSceneProps) {
  const {
    dogName,
    treats,
    pile,
    level,
    pendingDenAchievements,
    session,
    greeting,
    awayStripLines,
    denEconomyRepository,
    personalStatsRepository,
    homeRangeRepository,
    walkRepository,
    settingsRepository,
    buddyAppearance,
    buddyAppearanceLoaded = true,
    buddyMood = 'idle',
    playGreeting = false,
    onBuddyGreetingStarted,
    onAcknowledgePendingAchievements,
    onTreatsChanged,
    onPileChanged,
    onHarvested,
    onBuddyTap,
    getDayKey,
    onUpgraded,
    onStartWalk,
    updateCard,
    walkActive = false,
    onCancelWalk,
    flashNote = null,
    onOpenMap,
    onOpenHistory,
    onOpenSticks,
    onOpenDiary,
    onOpenSettings,
    onOpenStats,
    openDenPanel = false,
    onDenPanelHandled,
    homecoming = null,
    accruedDelta = 0,
    territoryIncomeRate = 0,
    neighbourhood,
    territoryRepository,
    onOpenTerritories,
    homeRangeRefreshKey,
    cornerTools,
  } = props;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Signs and notes for the Viertel band (before any early return: hooks keep their order).
  // A corner named from the homecoming prompt re-reads the signs (the sheet reports it through `cornerEdits`).
  const [cornerSheetId, setCornerSheetId] = useState<string | null>(null);
  const [cornerEdits, setCornerEdits] = useState(0);
  const viertelChrome = useViertelChrome({
    homeRangeRepository,
    walkRepository,
    territoryRepository,
    denEconomyRepository,
    cornerRepository: cornerTools?.repository,
    dogName,
    refreshKey: (homeRangeRefreshKey ?? 0) + cornerEdits,
  });

  // The shared top bar floats over every page: the scene lays out below it (the gate sign, hints and the "back" strip).
  const topInset = insets.top + TOP_BAR_H;
  const layout = useMemo(() => sceneLayout(height, width, topInset, insets.bottom), [height, width, topInset, insets.bottom]);
  const buildings = useMemo(() => buildingsLayout(width, topInset, layout.buildingsPageH), [width, topInset, layout.buildingsPageH]);
  // Static meadow decor: computed once per window size, never per frame.
  const meadow = useMemo(() => meadowLayout(width, layout.buildingsH, buildings), [width, layout.buildingsH, buildings]);
  const diary = useMemo(() => diarySpot(width, worldYardLayout(width, layout.yardH).feetY), [width, layout.yardH]);
  const yardDecor = useMemo(() => hofDecor(width, layout.yardH, worldYardLayout(width, layout.yardH).feetY), [width, layout.yardH]);

  const scrollRef = useRef<{ scrollTo: (o: { x?: number; y?: number; animated?: boolean }) => void } | null>(null);
  const scrollY = useRef(new Animated.Value(layout.startOffset)).current;
  const [isUp, setIsUp] = useState(false);
  const isUpRef = useRef(false);
  const [isDown, setIsDown] = useState(false);
  const isDownRef = useRef(false);
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e: unknown) => {
          const y = (e as { nativeEvent: { contentOffset: { y: number } } }).nativeEvent.contentOffset.y;
          const up = y < layout.startOffset - 140;
          if (up !== isUpRef.current) {
            isUpRef.current = up;
            setIsUp(up);
          }
          const down = y > layout.startOffset + 140;
          if (down !== isDownRef.current) {
            isDownRef.current = down;
            setIsDown(down);
          }
        },
      }),
    [scrollY, layout.startOffset]
  );
  const scrollToYard = () => {
    setSelected(null);
    scrollRef.current?.scrollTo({ y: layout.startOffset, animated: true });
  };
  const scrollToBuildings = () => scrollRef.current?.scrollTo({ y: layout.buildingsOffset, animated: true });
  const scrollToViertel = () => scrollRef.current?.scrollTo({ y: viertelScrollTarget(layout), animated: true });
  useEffect(() => {
    // Android ignores the ScrollView's contentOffset prop until content is measured.
    scrollRef.current?.scrollTo({ y: layout.startOffset, animated: false });
  }, [layout.startOffset]);

  // ---- Den state / upgrades (shared with the legacy DenScreen via useDen) ----
  const getWorldMass = useCallback(() => homeRangeRepository.getWorldMass(), [homeRangeRepository]);
  const wildExtra = useWildExtra({ settingsRepository, sessionKind: session?.kind ?? 'fresh-open' });
  const den = useDen({
    repository: denEconomyRepository,
    personalStatsRepository,
    liveTreats: treats,
    liveLevel: level,
    livePile: pile,
    onTreatsChanged,
    onPileChanged,
    getWorldMass,
    onHarvested,
    onBuddyTap,
    getDayKey,
    onUpgraded,
    onUpgradeApplied: wildExtra.playLevelUp,
  });
  const [selected, setSelected] = useState<YardBuildingKey | null>(null);
  // Android back: close the open building sign first, then bring the Viertel or buildings view back to the yard.
  useBackAction(selected !== null, () => setSelected(null));
  useBackAction((isUp || isDown) && !homecoming, scrollToYard);
  // The docked upgrade sign never follows the player back to the Hof: it closes when the buildings page scrolls out of view.
  const wasDown = useRef(false);
  useEffect(() => {
    if (wasDown.current && !isDown) setSelected(null);
    wasDown.current = isDown;
  }, [isDown]);
  // Opens a building's upgrade sign and shows the buildings page (the next-upgrade tease and the `den` alias use it).
  const scrollToBuilding = (building: YardBuildingKey) => {
    setSelected(building);
    scrollRef.current?.scrollTo({ y: buildingSelectOffset(layout, buildings, building), animated: true });
  };

  // ---- Buddy's greeting / sleepy yawn (once per launch, resolved by App.tsx) ----
  useEffect(() => {
    if (buddyMood === 'sleepy' && !playGreeting && !sleepyYawnPlayed) {
      sleepyYawnPlayed = true;
      play('sleepy');
    }
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [greetingPlaying, setGreetingPlaying] = useState(playGreeting);
  useEffect(() => {
    if (!playGreeting) return;
    setGreetingPlaying(true);
    onBuddyGreetingStarted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playGreeting]);
  const ready = !!den.state && !!session && buddyAppearanceLoaded;
  useEffect(() => {
    if (!greetingPlaying || !ready) return;
    const timer = setTimeout(() => setGreetingPlaying(false), BUDDY_GREETING_MS);
    return () => clearTimeout(timer);
  }, [greetingPlaying, ready]);

  // Claim the pending-achievement queue on the first mount that sees it (the away strip already names the first one).
  useEffect(() => {
    if (pendingDenAchievements.length > 0) onAcknowledgePendingAchievements?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `den` screen alias: open the next-upgrade panel on the buildings page.
  const denPanelHandled = useRef(false);
  useEffect(() => {
    if (!openDenPanel) {
      denPanelHandled.current = false;
      return;
    }
    if (!den.state || denPanelHandled.current) return;
    denPanelHandled.current = true;
    scrollToBuilding(den.tease?.building ?? den.cheapestAffordable?.building ?? 'doghouse');
    onDenPanelHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDenPanel, den.state]);

  // Bench: the newest postcards fanned on it (derived from the walks, nothing stored). Reloads when a walk was finished
  // (range refresh) and again when the homecoming ends, so the new card is there when the player looks at the bench.
  const postcards = usePostcards({ walkRepository, territoryRepository, recentWalks: BENCH_WALK_WINDOW, refreshKey: `${homeRangeRefreshKey ?? 0}:${homecoming ? 'h' : ''}` });

  // Homecoming: walks closed so far (this one included) picks the choreography variant; no new storage.
  const [homecomingCount, setHomecomingCount] = useState<number | null>(null);
  const homecomingActive = !!homecoming;
  useEffect(() => {
    if (!homecomingActive) {
      setHomecomingCount(null);
      return;
    }
    // The partner's mini homecoming plays the same fixed choreography every time: no stats read, no variants.
    if (homecoming?.walk.partnerName) {
      setHomecomingCount(0);
      return;
    }
    let alive = true;
    personalStatsRepository
      .getState()
      .then((s) => alive && setHomecomingCount(s.totalWalksClosed))
      .catch(() => alive && setHomecomingCount(0));
    return () => {
      alive = false;
    };
  }, [homecomingActive, personalStatsRepository]);

  // ---- Fence badges: unlocked achievements read once per mount / stats change (never per frame) ----
  // New badges of a homecoming stay off their pegs until beat 3 and then swing on; everything else just hangs.
  const [homecomingBeat, setHomecomingBeat] = useState<BeatId | null>(null);
  useEffect(() => {
    if (!homecomingActive) setHomecomingBeat(null);
  }, [homecomingActive]);
  const fence = useFenceBadges(
    personalStatsRepository,
    `${homeRangeRefreshKey ?? 0}:${den.achievementNotices.length}:${pendingDenAchievements.length}:${homecomingActive ? 'h' : ''}`
  );
  const badgeArrivals = useMemo(() => (homecoming ? homecomingBadgeArrivals(homecoming.walk) : []), [homecoming]);
  const fenceHiddenIds = homecoming && homecomingBeat !== 'extras' && homecomingBeat !== 'rest' ? badgeArrivals : [];

  // ---- Gate: swing open, Buddy trots through, then the existing walk flow ----
  type GateFrame = 'sit' | 'a' | 'b';
  const [leaving, setLeaving] = useState<GateFrame | null>(null);
  const closeBoxRef = useRef<() => void>(() => undefined);
  const leavingRef = useRef(false);
  const gateTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const walker = useRef(new Animated.Value(0)).current;
  const clearGateTimers = () => {
    gateTimers.current.forEach(clearTimeout);
    gateTimers.current = [];
  };
  useEffect(
    () => () => {
      clearGateTimers();
      walker.stopAnimation();
    },
    [walker]
  );
  const startWalk = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    closeBoxRef.current(); // Buddy is off on the walk: whatever he was fetching from the box stays in it
    setLeaving('sit');
    walker.setValue(0);
    Animated.timing(walker, { toValue: 1, duration: GATE_SWING_MS, useNativeDriver: true }).start();
    const at = (ms: number, fn: () => void) => gateTimers.current.push(setTimeout(fn, ms));
    at(150, () => setLeaving('a'));
    at(300, () => setLeaving('b'));
    at(450, () => setLeaving('a'));
    at(GATE_SWING_MS, () => {
      onStartWalk();
      // If the walk could not start the player is still here: let the gate close and be usable again.
      at(GATE_SWING_MS + 300, () => {
        leavingRef.current = false;
        setLeaving(null);
      });
    });
  };

  // The gate and its sign share one action: start a walk, or (walk already running) go back to its live map.
  // Never start a second walk over the running one. Buddy is not part of it: tapping him only barks (BuddyAvatar).
  // While the Viertel is scrolled into view the gate sign peeks in at the bottom of the map: a tap there only brings the yard back,
  // so looking at the map can never start a walk.
  const gateAction = walkActive ? onOpenMap : isUp ? scrollToYard : startWalk;

  // ---- Bowl: shows the treats sign larger for 2 s ----
  const bowlScale = useRef(new Animated.Value(1)).current;
  useEffect(() => () => bowlScale.stopAnimation(), [bowlScale]);
  const zoomBowl = () => {
    bowlScale.stopAnimation();
    Animated.sequence([
      Animated.timing(bowlScale, { toValue: 1.35, duration: 160, useNativeDriver: true }),
      Animated.delay(BOWL_ZOOM_HOLD_MS),
      Animated.timing(bowlScale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  // ---- Bakery life: the pile at the bowl, the harvest, treats dropping from the top of the Hof into the bowl ----
  // Nothing moves during a walk, the Homecoming, the gate beat or while the Viertel or the buildings are in view.
  const projecting = ready && !walkActive && !homecoming;
  const flightsOn = projecting && !leaving && !isUp && !isDown;
  const projection = useBowlProjection({ state: den.state, extraRate: territoryIncomeRate, active: projecting });
  // First Hof view of the launch: if the bakery baked something while the app was closed, the bowl pops softly once and Buddy says so.
  const [welcome, setWelcome] = useState<{ n: number } | null>(null);
  useLayoutEffect(() => {
    if (!projecting || !session || welcome || welcomeBackPlayed.has(session)) return;
    const n = Math.floor(accruedDelta);
    if (n < 1) return;
    welcomeBackPlayed.add(session);
    setWelcome({ n });
    zoomBowl();
  }, [projecting, session, welcome, accruedDelta]);

  // Harvest juice: treats fly bowl -> pill, the pill's number stays on the old bank until they land, then "+N" pops and the pill bumps.
  const [harvestBurst, setHarvestBurst] = useState<{ key: number; count: number } | null>(null);
  const [heldBank, setHeldBank] = useState<number | null>(null);
  const [landedPop, setLandedPop] = useState<{ n: number; amount: number } | null>(null);
  const harvestedN = den.harvested?.n ?? 0;
  useEffect(() => {
    const h = den.harvested;
    if (!h || h.n === 0) return;
    setHarvestBurst({ key: h.n, count: h.amount });
    play('treat');
    haptics.success();
    if (h.bankBefore !== undefined) setHeldBank(h.bankBefore);
    const flightMs = BURST_FLIGHT_MS + BURST_STAGGER_MS * (burstSpriteCount(h.amount) - 1) + 100;
    const timer = setTimeout(() => {
      setHeldBank(null);
      setLandedPop({ n: h.n, amount: h.amount });
    }, flightMs);
    return () => clearTimeout(timer);
    // One run per harvest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harvestedN]);
  // The bowl tap: collect what is baked; with nothing to collect it just shows the sign larger, as before.
  const harvest = async () => {
    const amount = await den.handleHarvest();
    if (amount < 1) zoomBowl();
  };

  // ---- Notes (away strip, household, OTA card) ----
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key));
  const welcomeText = welcome ? t('world.welcomeBack', { n: formatNumber(welcome.n) }) : null;
  const hood = useNeighbourhood(neighbourhood);
  // The mailbox (Posteingang): stick gifts, neighbour notes and postponed postcards arrive here; Buddy pulls them out one at a time.
  const inbox = useInbox({ settingsRepository, walkRepository, territoryRepository, unopenedGifts: hood.unopenedGifts, lines: hood.lines, cards: postcards.cards });
  const benchCardList = useMemo(() => postcards.cards.filter((c) => !inbox.inBoxIds.has(c.id)), [postcards.cards, inbox.inBoxIds]);
  const [errand, setErrand] = useState<{ key: number; x: number; onArrived: () => void } | null>(null);
  const errandKey = useRef(0);
  const errandSince = useRef(0);
  const lineSeq = useRef(0);
  const pileUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pileUpTimer.current) clearTimeout(pileUpTimer.current);
  }, []);
  /** The items of the current opening (a snapshot taken at the tap) and what is on show now; null = the box is closed. */
  const [unwrap, setUnwrap] = useState<{ item: InboxItem; index: number } | null>(null);
  const [boxOpen, setBoxOpen] = useState(false);
  const queue = useRef<InboxItem[]>([]);
  const pulledIndex = useRef(-1);
  /** True while Buddy stands at the mailbox; a stick he carried to the shelf sends him back before the next pull. */
  const buddyAtBox = useRef(false);
  const [stickLine, setStickLine] = useState<{ key: number; text: string } | null>(null);
  const [stickPop, setStickPop] = useState<{ n: number; amount: number } | null>(null);
  const notes = pickSceneNotes(awayStripLines, greeting, !!updateCard && !walkActive, dismissed, welcomeText, stickLine ?? flashNote);
  const bubbleNote = notes.find((n) => n.kind === 'line');
  const paperNote = notes.find((n) => n !== bubbleNote);
  const coopText = coopSignText(hood.coop);
  // A household partner is out walking: a small sign by the gate, gone again silently when she is back or silent for 3 min.
  const partnerWalk = usePartnerWalk();

  const sky = skyTintForDate(new Date());

  if (!ready || !den.state || !session) {
    return (
      <View style={[styles.root, { backgroundColor: sky.base }]}>
        <BuddyLoading appearance={buddyAppearance} text={t('common.gettingReady')} />
      </View>
    );
  }

  const state = den.state;
  const dog = dogDisplayName(dogName);
  const title = currentTitleForLevel(level);
  const levels = {
    doghouse: getBuildingLevel(state, 'doghouse'),
    bakery: getBuildingLevel(state, 'bakery'),
    sniffGarden: getBuildingLevel(state, 'sniffGarden'),
  };
  const yard = worldYardLayout(width, layout.yardH);
  const geometry = yardWalkGeometry(yard, width);
  const upgradeReady = !!den.cheapestAffordable && !walkActive && !homecoming;
  const buddyMoodNow: BuddyMood = den.excited || greetingPlaying ? 'excited' : buddyMood;
  const gardenStage3 = artTierForLevel(levels.sniffGarden) >= 3;
  const showsTerritorySign = state.territoryIncomeRevealed && Math.round(territoryIncomeRate) >= 1;
  const statusCount = [showsTerritorySign, !!coopText, !!partnerWalk].filter(Boolean).length;
  const strip = signStrip({ width, fenceBottom: layout.fenceBottom, hasTitle: !!title, statusCount });
  const cap = projection.cap;
  const pileShown = projection.pile;
  const bankShown = heldBank ?? state.treats;
  const full = bowlAtCap(state.treats + pileShown, cap);
  const pileCount = formatNumber(Math.floor(pileShown));
  // Ambient cookies drop in from the top of the Hof (behind the fence) into the bowl, off to the side of Buddy.
  const dropPoint = { x: width / 2 + 70, y: -30 };
  const bowlWrapTop = yard.bowlTop - 4; // the bowl group's top in yard coordinates (its art box starts 4 below)
  const bowlPoint = { x: width / 2, y: bowlWrapTop + 54 };
  // The harvest flight lives in the fence layer (it must pass over the Hof and land on the pill): same x, y measured from the fence layer's top.
  const flightFrom = { x: width / 2, y: layout.hofTop + bowlPoint.y };
  // The pile lies right of the doormat, just under Buddy's paws: clear of the bowl, the bench and the mailbox paths.
  const pileLeft = Math.min(width / 2 + 74, width - PILE_W - 6);
  const pileTop = yard.doormat.top + 40 - 30;
  // Mailbox: sits right of the bench row; Buddy trots to its x. The pile (the shelf's entry) is where he carries a stick.
  const mailboxX = width - 14 - 65;
  const pileX = pileLeft + PILE_W / 2;
  const say = (text: string) => setStickLine({ key: INBOX_LINE_KEY_BASE + ++lineSeq.current, text });
  const errandBusy = () => errandSince.current > 0 && Date.now() - errandSince.current < ERRAND_STALE_MS;
  /** Buddy trots to x and does `then` there. */
  const trotTo = (x: number, then: () => void) => {
    errandSince.current = Date.now();
    errandKey.current += 1;
    const myKey = errandKey.current;
    setErrand({
      key: myKey,
      x,
      onArrived: () => {
        if (errandKey.current === myKey) errandSince.current = 0; // a newer errand keeps its own clock
        then();
      },
    });
  };
  const closeBox = () => {
    if (pileUpTimer.current) clearTimeout(pileUpTimer.current);
    pileUpTimer.current = null;
    setUnwrap(null);
    setBoxOpen(false);
    buddyAtBox.current = false;
  };
  closeBoxRef.current = closeBox;
  /** Pulls item `index` out of the box: shows it, says Buddy's one line and does what the item means. */
  const pull = (index: number) => {
    const item = queue.current[index];
    // Never twice for one item (a double tap in one frame would open a gift twice), and never once the gate is swinging.
    if (pulledIndex.current === index) return;
    if (!item || leavingRef.current) return closeBox();
    pulledIndex.current = index;
    buddyAtBox.current = true;
    setUnwrap({ item, index });
    if (item.kind === 'note') {
      say(noteLine(item));
      inbox.markNoteSeen(item.key);
    } else if (item.kind === 'postcard') {
      say(t('inbox.postcardToBench'));
      inbox.release(item.entry.id);
    } else {
      const wasNew = fillsShelfSlot(item.gift, hood.gifts);
      void hood.openGift(item.gift).then((ok) => {
        if (ok === 'gone') return pull(index + 1); // the server no longer knows it: nothing to show
        if (!ok) {
          say(t('neighbours.gift.retry'));
          return closeBox();
        }
        const n = STICK_LINE_KEY_BASE + index;
        say(giftOpenedLine(item.gift, wasNew));
        if (item.gift.sprinkleTreats) {
          setStickPop({ n, amount: item.gift.sprinkleTreats });
          play('treat');
          haptics.success();
        }
        if (stickDogOf(item.gift)) {
          // Unwrapped: Buddy carries the stick over to the shelf.
          buddyAtBox.current = false;
          trotTo(pileX, () => undefined);
        }
      });
    }
  };
  const pullNext = (index: number) => {
    if (index >= queue.current.length) {
      say(t('inbox.done'));
      return closeBox();
    }
    if (!buddyAtBox.current) {
      // Buddy was off carrying a stick to the shelf: back to the box first.
      setUnwrap(null);
      return trotTo(mailboxX, () => pull(index));
    }
    pull(index);
  };
  const openMailbox = () => {
    if (errandBusy() || leaving || homecoming) return;
    if (inbox.items.length === 0) {
      // Empty box: the flag is already down; a short sniff beat and one of three lines.
      buddyAtBox.current = false;
      trotTo(mailboxX, () => say(emptyBoxLine(emptyBoxTurn++)));
      return;
    }
    queue.current = inbox.items;
    pulledIndex.current = -1;
    setBoxOpen(true);
    say(t('inbox.opening'));
    trotTo(mailboxX, () => {
      if (queue.current.length > 1) {
        say(t('inbox.pileUp'));
        pileUpTimer.current = setTimeout(() => pull(0), PILE_UP_PAUSE_MS);
      } else pull(0);
    });
  };
  const extraEl = wildExtra.active ? (
    <YardExtras id={wildExtra.active} layout={yard} width={width} height={layout.yardH} onDone={wildExtra.onDone} />
  ) : null;
  const backPose = buddyBackPoseSources(buddyAppearance);
  const gate = leaving ? artOr('gate-open', null) : artOr('gate-closed', null);
  const startOffset = layout.startOffset;
  // At the top of the scroll the Viertel layer is pushed up by VIERTEL_PARALLAX * startOffset: the map reaches that far
  // below the band so no bare linen shows between it and the fence zone.
  const viertelOverscan = Math.ceil(VIERTEL_PARALLAX * layout.startOffset);
  // What of that overscan is really hidden where the "zum Viertel" hint rests: the layer has moved down again by the parallax share
  // of the scroll distance, so only the rest of the map's bottom sits behind the fence zone. The Range fit keeps clear of just that.
  const viertelHidden = Math.max(0, viertelOverscan - Math.round(VIERTEL_PARALLAX * (layout.startOffset - viertelScrollTarget(layout))));
  // Above the start offset the layers lag/lead; from the Hof down to the buildings page everything scrolls 1:1 (no ground seams).
  const parallax = (k: number) => ({
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, startOffset, layout.buildingsOffset],
          outputRange: [-k * startOffset, 0, 0],
          extrapolateRight: 'clamp',
        }),
      },
    ],
  });
  const fenceTiles = Math.ceil(width / FENCE_SEG_W) + 1;
  const skyShift = SKY_PARALLAX * startOffset;
  const gateBoxLeft = width / 2 - GATE_BOX / 2;
  const gateHitTop = layout.gateBoxTop + GATE_BOX * 0.36;
  // Harvest target: the bar's treat chip (viewport coordinates == tail coordinates at the opening scroll position).
  const pillPoint = { x: width - BAR_CHIP_CENTER_FROM_RIGHT, y: insets.top + TOP_BAR_H / 2 };

  return (
    <View style={[styles.root, { backgroundColor: sky.base }]}>
      <Animated.ScrollView
        testID="world-scroll"
        ref={scrollRef as never}
        style={styles.scroll}
        contentContainerStyle={{ height: layout.contentH }}
        contentOffset={{ x: 0, y: startOffset }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        scrollEnabled={!homecoming}
      >
        {/* Layer order in the tree is the TalkBack order: yard, fence, neighbourhood; zIndex sets what is drawn on top. */}

        {/* ---- HOF ---- */}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.layer, { top: layout.tailTop + layout.hofTop, height: layout.hofH, zIndex: 2 }, parallax(YARD_PARALLAX)]}
        >
          <View pointerEvents="none" style={[styles.grassBase, { backgroundColor: GRASS_BASE, top: -60 - FENCE_FOOT_PAD, height: layout.hofH + 60 + FENCE_FOOT_PAD + 400 }]} />
          {(() => {
            const hill = artOr('yard-ground-wide', null);
            if (!hill) return null;
            const gh = (layout.hofH - 10) / 0.74;
            return (
              <DecorImage
                source={hill}
                resizeMode="contain"
                style={{ position: 'absolute', width: gh * 2, height: gh, left: (width - gh * 2) / 2, top: 10 - 0.26 * gh }}
              />
            );
          })()}

          {/* The yard: buildings, Buddy, extras, signs. `bottom` values are measured from the yard floor. */}
          <View pointerEvents="box-none" style={[styles.yard, { height: layout.yardH }]}>
            <MeadowProps items={yardDecor} />
            {(() => {
              const mat = artOr('doormat', null);
              return mat ? <DecorImage source={mat} resizeMode="contain" style={{ position: 'absolute', ...yard.doormat }} /> : null;
            })()}
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: leaving || homecoming ? 0 : 1 }]}>
              <YardBuddy
                appearance={buddyAppearance}
                name={dog}
                mood={buddyMoodNow}
                replayKey={den.upgrade?.n}
                geometry={geometry}
                onPress={() => void den.handleBuddyTap()}
                errand={errand}
              />
            </View>
            {/* The small bonus pop above Buddy when his tap paid 1-3 treats. */}
            <TreatPop
              amount={den.buddyPop?.amount ?? 0}
              trigger={den.buddyPop?.n}
              emoji={null}
              style={{ position: 'absolute', left: geometry.baseCx - 12, bottom: geometry.bottom + geometry.size * 0.85, zIndex: 7 }}
            />
            {extraEl}

            {/* Buddy's diary: a notebook on a tree stump left of the doormat. */}
            {(() => {
              const art = artOr('meadow-diary', null);
              return art ? (
                <DecorImage source={art} resizeMode="contain" style={{ position: 'absolute', left: diary.left, top: diary.top, width: diary.width, height: diary.height }} />
              ) : null;
            })()}
            <Pressable
              testID="diary-prop"
              accessibilityRole="button"
              accessibilityLabel={t('world.diaryLabel')}
              onPress={onOpenDiary}
              style={[styles.abs, { left: diary.left + 8, top: diary.top + diary.height * 0.15, width: diary.width - 16, height: diary.height * 0.8 }]}
            />

            {/* The stick pile is the one entry to the Stock-Regal; sticks from the mailbox end up on it. */}
            <StickPile
              dogs={hood.shelf.filter((slot) => slot.collected).map((slot) => slot.id)}
              left={pileLeft}
              top={pileTop}
              accessibilityLabel={t('world.sticksLabel')}
              onPress={onOpenSticks}
            />
            <TreatPop
              amount={stickPop?.amount ?? 0}
              trigger={stickPop?.n}
              emoji={null}
              style={{ position: 'absolute', left: pileLeft + PILE_W / 2 - 12, top: pileTop - 6, zIndex: 7 }}
            />

            {/* Buddy trots through the gate: sit (looking back), then two stride frames, rising and shrinking. */}
            {leaving && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.abs,
                  {
                    left: yard.buddy.left,
                    bottom: yard.buddy.bottom,
                    width: BUDDY_SIZE,
                    height: BUDDY_SIZE,
                    zIndex: 6,
                    opacity: walker.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                    transform: [
                      { translateY: walker.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, -yard.gateRise] }) },
                      { scale: walker.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1, 1, 0.6] }) },
                    ],
                  },
                ]}
              >
                <Image
                  source={leaving === 'sit' ? backPose.sitBack : leaving === 'a' ? backPose.walkBackA : backPose.walkBackB}
                  resizeMode="contain"
                  style={{ width: BUDDY_SIZE, height: BUDDY_SIZE }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </Animated.View>
            )}

            {/* Notes: a speech bubble next to Buddy, a small paper note pinned on the left. */}
            {bubbleNote && (
              <Pressable
                onPress={() => dismiss(bubbleNote.key)}
                accessibilityRole="button"
                accessibilityLabel={bubbleNote.text}
                style={[styles.abs, { left: width / 2 + 52, top: strip.rightH, width: width / 2 - 56, zIndex: 7 }]}
              >
                <SpeechBubble tail="left">{bubbleNote.text}</SpeechBubble>
              </Pressable>
            )}
            {paperNote && (
              <View pointerEvents="box-none" style={[styles.abs, { left: 8, top: Math.max(8, strip.leftH), width: Math.max(120, width / 2 - 82), zIndex: 7, transform: [{ rotate: '-3deg' }] }]}>
                {paperNote.kind === 'update' && updateCard ? (
                  <PaperNote>
                    <Text style={[textStyle('small'), styles.noteText]}>{paperNote.text}</Text>
                    <View style={styles.updateButtons}>
                      <WoodSign size="small" onPress={updateCard.onLater} accessibilityLabel={t('update.later')} textStyleOverride={SMALL_SIGN_TEXT}>
                        {t('update.later')}
                      </WoodSign>
                      <WoodSign size="small" onPress={updateCard.onApply} accessibilityLabel={t('update.now')} textStyleOverride={SMALL_SIGN_TEXT}>
                        {t('update.now')}
                      </WoodSign>
                    </View>
                  </PaperNote>
                ) : (
                  <Pressable onPress={() => dismiss(paperNote.key)} accessibilityRole="button" accessibilityLabel={paperNote.text}>
                    <PaperNote>
                      <Text style={[textStyle('small'), styles.noteText]}>{paperNote.text}</Text>
                    </PaperNote>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Bottom row: bench = Album, bowl = treats, mailbox = Post. */}
          <View pointerEvents="box-none" style={[styles.bottomRow, { top: layout.yardH, height: BOTTOM_ROW_H }]}>
            <ArtDecor art="bench-empty" style={[styles.abs, { left: 6, top: 0, width: 140, height: 140 }]} />
            <BenchPostcards cards={benchCardList} favouriteId={postcards.favouriteId} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('world.albumLabel')}
              onPress={onOpenHistory}
              style={[styles.abs, { left: 6, top: 10, width: 140, height: 100 }]}
            />
            <View pointerEvents="box-none" style={[styles.abs, { left: 6, top: 108, width: 140, alignItems: 'center' }]}>
              <WoodSign size="small" onPress={onOpenHistory} accessibilityLabel={t('world.album')} textStyleOverride={SMALL_SIGN_TEXT}>
                {t('world.album')}
              </WoodSign>
            </View>

            <ArtDecor art={'prop-mailbox'} style={[styles.abs, { right: 14, top: -6, width: 130, height: 130 }]} />
            {inbox.items.length > 0 && !boxOpen && <MailboxFlag boxRight={14} boxTop={-6} />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={inbox.items.length > 0 ? t('world.postFlagLabel') : t('world.postLabel')}
              onPress={openMailbox}
              style={[styles.abs, { right: 30, top: 0, width: 98, height: 110 }]}
              testID="mailbox"
            />
            <View pointerEvents="box-none" style={[styles.abs, { right: 14, top: 108, width: 130, alignItems: 'center' }]}>
              <WoodSign size="small" onPress={openMailbox} accessibilityLabel={t('world.post')} textStyleOverride={SMALL_SIGN_TEXT}>
                {t('world.post')}
              </WoodSign>
            </View>
          </View>

          {/* Treat bowl: in the yard just below Buddy's doormat. Tap harvests the pile; the sign shows larger for 2 s after a bowl zoom. */}
          <View pointerEvents="box-none" style={[styles.abs, { left: 0, right: 0, top: bowlWrapTop, height: 150 }]}>
            <BowlFill pile={pileShown} room={projection.room} full={full} boxLeft={width / 2 - 60} boxTop={4} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pileShown >= 1 ? t('world.bowlLabel', { count: pileCount }) : t('world.bowlLabelEmpty')}
              onPress={() => void harvest()}
              style={[styles.abs, { left: width / 2 - 60, top: 30, width: 120, height: 70 }]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.abs, { left: width / 2 - 115, top: 96, width: 230, alignItems: 'center', transform: [{ scale: bowlScale }] }]}
            >
              <WoodSign size="medium" textStyleOverride={SMALL_SIGN_TEXT}>
                <BowlSignContent pile={pileShown} ratePerHour={homecoming ? 0 : projection.ratePerHour} />
              </WoodSign>
            </Animated.View>
          </View>

          {/* Treats dropping from the top of the Hof into the bowl while it still grows. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 6 }]}>
            <TreatFlights active={flightsOn} ratePerHour={projection.ratePerHour} atCap={full} from={dropPoint} to={bowlPoint} burst={null} />
          </View>

          {/* Down to the buildings page; a small pennant and "Upgrade ready" when an upgrade is affordable (bank + pile). */}
          {(() => {
            const pennant = artOr('pennant', null);
            const label = upgradeReady ? `${t('world.toBuildings')} · ${t('world.upgradeReady')}` : t('world.toBuildings');
            return (
              <>
                <Pressable
                  onPress={scrollToBuildings}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={[styles.hint, styles.hintGrass, { top: layout.hintDownTop, height: HINT_H, zIndex: 5 }]}
                >
                  <Text style={[textStyle('hand'), styles.hintText, styles.hintPill]}>{`↓ ${label}\u00A0\u00A0`}</Text>
                </Pressable>
                {upgradeReady && pennant && (
                  <DecorImage
                    source={pennant}
                    resizeMode="contain"
                    style={{ position: 'absolute', right: 14, top: layout.hintDownTop - 26, width: 18, height: 36, zIndex: 5 }}
                  />
                )}
              </>
            );
          })()}
        </Animated.View>

        {/* ---- GEBÄUDE: the buildings page below the Hof; two per row on one ground, the 4th slot is reserved ---- */}
        <View pointerEvents="box-none" style={[styles.layer, { top: layout.buildingsTop, height: layout.buildingsH, zIndex: 3 }]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GRASS_BASE }]} />
          <MeadowGround layout={meadow} width={width} fromColor={HILL_EDGE} toColor={GRASS_BASE} />
          <MeadowProps items={meadow.items} />
          {buildings.slots.map((slot) => {
            const k = slot.key;
            if (!k) return null; // the reserved slot (Friend Lounge) draws nothing
            const w = buildings.world[k];
            const pennantHere = den.cheapestAffordable?.building === k;
            // Every building whose next upgrade is affordable says so on its sign; pennant and sparkle stay on the cheapest.
            const upgradeHere = den.affordable.some((a) => a.building === k);
            const name = t(`den.building.${k}.name`);
            const nextLine = upgradeHere ? nextEffectLabel(k, state) : null;
            const pennant = artOr('pennant', null);
            return (
              <React.Fragment key={k}>
                <BuildingSprite
                  building={{ key: k, level: levels[k] }}
                  size={BUILDING_SIZE}
                  left={w.sprite.left}
                  top={w.sprite.top}
                  bounceN={den.upgrade && den.upgrade.building === k ? den.upgrade.n : 0}
                />
                {k === 'sniffGarden' && gardenStage3 && (
                  <YardButterflies garden={{ left: w.sprite.left, bottom: layout.buildingsH - w.sprite.top - BUILDING_SIZE, size: BUILDING_SIZE }} />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('den.showUpgrade', { name })}
                  style={[styles.abs, { left: w.hit.left, top: w.hit.top, width: w.hit.width, height: w.hit.height, zIndex: 1 }]}
                  onPress={() => scrollToBuilding(k)}
                />
                {/* Pennant on the cheapest upgrade Buddy can afford, with a slow sparkle beside it while the scene is calm. */}
                {pennantHere && pennant && (
                  <DecorImage source={pennant} resizeMode="contain" style={{ position: 'absolute', left: w.pennantLeft, top: w.pennantTop, width: 36, height: PENNANT_H }} />
                )}
                {pennantHere && flightsOn && (
                  <UpgradeSparkle left={w.pennantLeft + 32} bottom={layout.buildingsH - w.pennantTop - PENNANT_H + 4} />
                )}
                {/* A small sign under every building. */}
                <View
                  pointerEvents="box-none"
                  style={[styles.abs, { left: Math.max(4, Math.min(width - 184, w.signCx - 90)), top: w.signTop, width: 180, alignItems: 'center', zIndex: 2 }]}
                >
                  <WoodSign
                    size="small"
                    onPress={() => scrollToBuilding(k)}
                    accessibilityLabel={t('world.buildingLabel', { name, level: levels[k] })}
                    textStyleOverride={SMALL_SIGN_TEXT}
                  >
                    {upgradeHere ? (
                      <View style={styles.upgradeLabel}>
                        <Text style={[textStyle('sign'), styles.upgradeTitle, SMALL_SIGN_TEXT]}>{t('world.upgradePossible')}</Text>
                        {nextLine ? <Text style={[textStyle('small'), styles.upgradeNext]}>{nextLine}</Text> : null}
                      </View>
                    ) : (
                      t('world.buildingSign', { name, level: levels[k] })
                    )}
                  </WoodSign>
                </View>
              </React.Fragment>
            );
          })}
          <Pressable
            onPress={scrollToYard}
            accessibilityRole="button"
            accessibilityLabel={t('world.backToYard')}
            style={[styles.hint, styles.hintGrass, { top: buildings.backTop, height: HINT_H }]}
          >
            <Text style={[textStyle('hand'), styles.hintText, styles.hintPill]}>{`↑ ${t('world.backToYard')}\u00A0\u00A0`}</Text>
          </Pressable>
        </View>

        {/* ---- ZAUN ---- */}
        <View pointerEvents="box-none" style={[styles.layer, { top: layout.tailTop, height: layout.fenceBottom + FENCE_FOOT_PAD + FENCE_LAYER_ROOM, zIndex: 3 }]}>
          {Array.from({ length: fenceTiles }, (_, i) => {
            const seg = artOr('fence-segment', null);
            return seg ? (
              <DecorImage
                key={i}
                source={seg}
                resizeMode="contain"
                style={{ position: 'absolute', left: i * FENCE_SEG_W - 20, top: layout.fenceBottom - FENCE_SEG_H + FENCE_FOOT_PAD + 4, width: FENCE_SEG_W, height: FENCE_SEG_H }}
              />
            ) : null;
          })}
          {(() => {
            const post = artOr('fence-post-end', null);
            if (!post) return null;
            const style = { position: 'absolute' as const, top: layout.fenceBottom - 120 + FENCE_FOOT_PAD + 4, width: 60, height: 120 };
            return (
              <>
                <DecorImage source={post} resizeMode="contain" style={{ ...style, left: -14 }} />
                <DecorImage source={post} resizeMode="contain" style={{ ...style, left: width - 46 }} />
              </>
            );
          })()}
          <FenceBadges
            badges={fence.badges}
            hook={fence.hook}
            hookHidden={walkActive || !!homecoming}
            width={width}
            fenceBottom={layout.fenceBottom}
            hasTitle={!!title}
            statusCount={statusCount}
            hiddenIds={fenceHiddenIds}
            swingIds={badgeArrivals}
          />
          {gate && (
            <DecorImage
              source={gate}
              resizeMode="contain"
              style={{ position: 'absolute', left: gateBoxLeft, top: layout.gateBoxTop, width: GATE_BOX, height: GATE_BOX }}
            />
          )}
          {/* Touch area over the gate itself: same action as the sign, hidden from TalkBack so it is announced once. */}
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={gateAction}
            style={[styles.abs, { left: gateBoxLeft, top: gateHitTop, width: GATE_BOX, height: GATE_BOX * 0.6 }]}
          />
          <View pointerEvents="box-none" style={[styles.abs, { left: 0, right: 0, top: layout.gateSignTop, alignItems: 'center' }]}>
            <WoodSign size="wide" onPress={gateAction} accessibilityLabel={walkActive ? t('walk.gateBackLabel') : t('world.gateLabel')}>
              <View style={styles.gateSignRow}>
                <ArtImage art="icon-paw" size={26} />
                <Text style={[textStyle('signBig'), styles.gateSignText]}>{walkActive ? t('walk.gateBack') : t('world.gate')}</Text>
              </View>
            </WoodSign>
            {walkActive && onCancelWalk && (
              // Secondary and calm: a small link on a cream pill (legible over the fence), never a second sign.
              <View style={styles.cancelLinkPill}>
                <TextLink
                  label={t('walk.cancelLink')}
                  accessibilityLabel={t('walk.cancelLinkLabel')}
                  onPress={onCancelWalk}
                  style={styles.cancelLink}
                  textStyleOverride={styles.cancelLinkText}
                />
              </View>
            )}
          </View>
          {/* The strip of signs under the fence line (the picket band is for the badges): dog name right, status signs left. */}
          <View pointerEvents="box-none" style={[styles.abs, { left: strip.dog.x, top: strip.dog.y, width: strip.signW, transform: [{ rotate: '3deg' }] }]}>
            {title ? (
              // Name on line 1, title on line 2 (shrinks to fit, never breaks inside a word).
              <WoodSign size="small" onPress={onOpenStats} accessibilityLabel={onOpenStats ? t('world.statsLabel') : `${dog} · ${title}`}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[textStyle('sign'), styles.dogSignText, SMALL_SIGN_TEXT]}>{dog}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[textStyle('sign'), styles.dogSignText, SMALL_SIGN_TEXT]}>{title}</Text>
              </WoodSign>
            ) : (
              <WoodSign size="small" onPress={onOpenStats} accessibilityLabel={onOpenStats ? t('world.statsLabel') : undefined} textStyleOverride={SMALL_SIGN_TEXT}>
                {t('doorstep.dogLevel', { dog, level })}
              </WoodSign>
            )}
          </View>
          {statusCount > 0 && (
            // A plain column: each sign takes the height its text needs (German and English wrap differently).
            <View pointerEvents="none" style={[styles.abs, { left: strip.status[0].x, top: strip.status[0].y, width: strip.signW, gap: 4 }]}>
              {showsTerritorySign && (
                <StatusSign text={t('world.territorySign', { n: formatNumber(Math.round(territoryIncomeRate)) })} />
              )}
              {coopText && <StatusSign text={coopText} />}
              {partnerWalk && <StatusSign text={t('world.partnerOut', { name: partnerWalk.name, dog })} testID="partner-sign" />}
            </View>
          )}
          {/* Harvest: treats fly from the bowl up to the pill, then "+N" pops on it. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 6 }]}>
            <TreatFlights active={projecting} ratePerHour={0} atCap from={flightFrom} to={pillPoint} burst={harvestBurst} />
            <TreatPop
              amount={landedPop?.amount ?? 0}
              trigger={landedPop?.n}
              emoji={null}
              style={{ position: 'absolute', left: pillPoint.x - 10, top: pillPoint.y + 14 }}
            />
          </View>
          <Pressable
            onPress={scrollToViertel}
            accessibilityRole="button"
            accessibilityLabel={t('world.toNeighbourhood')}
            style={[styles.hint, { top: layout.hintTop, height: HINT_H }]}
          >
            {/* Trailing no-break space: Android clips the handwriting font's last glyph at the measured text width. */}
            <Text style={[textStyle('hand'), styles.hintText]}>{`↑ ${t('world.toNeighbourhood')}\u00A0\u00A0`}</Text>
          </Pressable>
        </View>

        {/* ---- VIERTEL ---- */}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.layer, { top: layout.skyH, height: layout.viertelH + layout.fenceBottom + 120, zIndex: 1 }, parallax(VIERTEL_PARALLAX)]}
        >
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: material.linen }]} />
          {/* The band itself is the cloth: one embedded patchwork map filling its full width and height. Not pannable; a tap opens the full map. */}
          <View style={[styles.abs, { left: 0, right: 0, top: 0, height: layout.viertelH + viertelOverscan }]}>
            <MapView
              embedded
              locations={NO_LOCATIONS}
              homeRangeRepository={homeRangeRepository}
              wildSpot={viertelChrome.wildSpot}
              neighbourhood={neighbourhood}
              chrome={viertelChrome}
              bottomInset={viertelHidden}
              homeRangeRefreshKey={homeRangeRefreshKey}
              onEmbeddedPress={onOpenMap}
              onOpenTerritories={onOpenTerritories}
            />
          </View>
        </Animated.View>

        {/* ---- HORIZONT ---- */}
        <Animated.View
          pointerEvents="none"
          style={[styles.layer, { top: 0, height: layout.skyH + skyShift + 40, zIndex: 0, backgroundColor: sky.base }, parallax(SKY_PARALLAX)]}
        >
          {(() => {
            const art = artOr('doorstep-sky', null);
            return art ? <DecorImage source={art} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null;
          })()}
          {sky.color && <View style={[StyleSheet.absoluteFill, { backgroundColor: sky.color, opacity: sky.opacity }]} />}
          <Cloud left={22} top={skyShift + 54} w={118} night={sky.phase === 'night'} />
          <Cloud left={width - 150} top={skyShift + 112} w={96} night={sky.phase === 'night'} />
        </Animated.View>
      </Animated.ScrollView>

      {/* The shared status bar: fixed over all three pages. The chip shows the bank only (the pile waits in the bowl). */}
      <View pointerEvents="box-none" style={[styles.abs, { left: 0, right: 0, top: 0, zIndex: 4 }]}>
        <TopBar
          treats={bankShown}
          full={full}
          note={walkActive || homecoming || projection.ratePerHour <= 0 ? null : t('world.treatsRate', { rate: formatRatePerHour(projection.ratePerHour) })}
          label={t('world.treatsPillLabel', { count: formatNumber(Math.floor(bankShown)), cap: formatNumber(cap) })}
          onPressTreats={zoomBowl}
          onOpenSettings={onOpenSettings}
        />
      </View>

      {homecoming && homecomingCount !== null && (
        <Homecoming
          walk={homecoming.walk}
          walkCount={homecomingCount}
          dog={dog}
          appearance={buddyAppearance}
          layout={layout}
          yard={yard}
          bowl={{ total: Math.floor(state.treats), cap }}
          level={level}
          levelTitle={title}
          onCamera={(target) => (target === 'viertel' ? scrollToViertel() : scrollToYard())}
          onDone={homecoming.onDone}
          onBeat={setHomecomingBeat}
          onNameCorner={cornerTools ? setCornerSheetId : undefined}
        />
      )}

      {cornerTools && cornerSheetId && (
        <CornerSheet
          cornerId={cornerSheetId}
          cornerRepository={cornerTools.repository}
          walkRepository={walkRepository}
          buddyAppearance={buddyAppearance}
          onRename={cornerTools.rename}
          namedByOther={cornerTools.namedByOther}
          onClose={(changed) => {
            setCornerSheetId(null);
            if (changed) setCornerEdits((n) => n + 1);
          }}
        />
      )}

      {unwrap && (
        <InboxUnwrap
          item={unwrap.item}
          top={insets.top + TOP_BAR_H}
          bottom={insets.bottom}
          onAdvance={() => pullNext(unwrap.index + 1)}
          onLater={closeBox}
        />
      )}

      {/* The upgrade sign docks at the bottom of the screen (the buildings page). */}
      {selected && (
        <View pointerEvents="box-none" style={[styles.abs, { left: spacing.lg, right: spacing.lg, bottom: insets.bottom + spacing.sm, zIndex: 8 }]}>
          <BuildingPanel building={selected} state={state} message={den.message} onUpgrade={den.handleUpgrade} onClose={() => setSelected(null)} />
        </View>
      )}

      {isUp && !homecoming && (
        <View pointerEvents="box-none" style={[styles.backWrap, { bottom: insets.bottom + spacing.lg }]}>
          <WoodSign size="medium" onPress={scrollToYard} accessibilityLabel={t('world.backToYard')} textStyleOverride={SMALL_SIGN_TEXT}>
            {`↓ ${t('world.backToYard')}`}
          </WoodSign>
        </View>
      )}
    </View>
  );
}

/** Decor sprite by key; renders nothing while the PNG is missing. */
function StatusSign({ text, testID }: { text: string; testID?: string }) {
  return (
    <View testID={testID} style={{ alignItems: 'flex-start', transform: [{ rotate: '-2deg' }] }}>
      <WoodSign size="small" textStyleOverride={STATUS_SIGN_TEXT} accessibilityLabel={text}>
        {text}
      </WoodSign>
    </View>
  );
}

function ArtDecor({ art, style }: { art: ArtKey; style: React.ComponentProps<typeof DecorImage>['style'] }) {
  const source = artOr(art, null);
  return source ? <DecorImage source={source} resizeMode="contain" style={style} /> : null;
}

function Cloud({ left, top, w, night }: { left: number; top: number; w: number; night: boolean }) {
  const o = night ? 0.35 : 0.95;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: w, height: 60, opacity: o }}>
      <View style={{ position: 'absolute', left: 0, top: 18, width: w, height: 38, borderRadius: 40, backgroundColor: '#FFFFFF' }} />
      <View style={{ position: 'absolute', left: w * 0.28, top: 0, width: w * 0.6, height: 44, borderRadius: 40, backgroundColor: '#FFFFFF' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  layer: { position: 'absolute', left: 0, right: 0 },
  abs: { position: 'absolute' },
  grassBase: { position: 'absolute', left: 0, right: 0 },
  yard: { position: 'absolute', left: 0, right: 0, top: 0 },
  bottomRow: { position: 'absolute', left: 0, right: 0 },
  gateSignRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gateSignText: { color: material.ink },
  cancelLinkPill: { marginTop: 6, backgroundColor: palette.background + 'F5', borderRadius: radii.pill, paddingHorizontal: spacing.md },
  cancelLink: { alignSelf: 'center' },
  cancelLinkText: { fontSize: 14 },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mix(tokens.blue, '#FFFFFF', 0.7),
  },
  // The two strips on the grass between the Hof and the buildings: no full-width band (that read as a hard cut), just a soft label.
  hintGrass: { backgroundColor: 'transparent' },
  hintPill: { backgroundColor: '#FFFFFF80', borderRadius: radii.pill, overflow: 'hidden' },
  // Right padding: the handwriting font's last glyph overhangs its advance width and was clipped ("Viertei").
  hintText: { color: material.inkGreen, fontSize: 20, lineHeight: 24, paddingHorizontal: 8 },
  dogSignText: { color: material.ink, textAlign: 'center', alignSelf: 'stretch' },
  backWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  noteText: { color: material.ink },
  upgradeLabel: { alignItems: 'center' },
  upgradeTitle: { color: material.ink, textAlign: 'center' },
  upgradeNext: { color: material.muted, textAlign: 'center' },
  updateButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' },
});
