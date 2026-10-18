import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextEffectLabel, useDen } from '../../app/useDen';
import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyFeetInset } from '../../buddy/imageSkin';
import { buddyBackPoseSources } from '../../buddy/imageSkinSources';
import { ArtKey, artOr } from '../../art/artAssets';
import { BuildingKey } from '../../economy/balanceConfig';
import { dogDisplayName, getBuildingLevel } from '../../economy/denEconomy';
import { currentTitleForLevel } from '../../economy/milestones';
import { AchievementId } from '../../economy/personalStats';
import { play } from '../../feedback/sounds';
import { formatNumber, t } from '../../i18n';
import type { NeighbourNote } from '../../sync/householdEvents';
import { coopSignText } from '../../sync/neighbourhood';
import type { NeighbourhoodSource } from '../../sync/neighbourhood';
import { useNeighbourhood } from '../../sync/useNeighbourhood';
import type { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import type { PersonalStatsRepository } from '../../storage/PersonalStatsRepository';
import type { DenEconomyRepository } from '../../storage/DenEconomyRepository';
import type { SettingsRepository } from '../../storage/SettingsRepository';
import type { WalkRepository } from '../../storage/WalkRepository';
import { ArtImage, DecorImage, PaperNote, SpeechBubble, WoodSign, material, mix, spacing, stitch, textStyle, tokens } from '../../ui';
import { BuddyLoading } from '../BuddyLoading';
import { BuddyMood } from '../buddy/buddyMood';
import type { AwayStripLine, DoorstepSession } from '../DoorstepScreen';
import { TerritoryPortrait } from '../TerritoryPortrait';
import { BuildingSprite, YARD_ORDER, YardBuildingKey, artTierForLevel, yardWalkGeometry } from '../den/YardScene';
import { YardBuddy } from '../den/YardBuddy';
import { YardButterflies } from '../den/YardButterflies';
import { BEHIND_DOGHOUSE_EXTRAS, YardExtras } from '../den/YardExtras';
import { useWildExtra } from '../den/useWildExtra';
import { BowlFill, BowlSignContent, TreatFlights, UpgradeSparkle, useBowlProjection } from './BakeryLife';
import { bowlAtCap, chimneyAnchor } from './bakeryRules';
import { BuildingPanel } from './BuildingPanel';
import { Homecoming } from './Homecoming';
import { NeighbourCard } from './NeighbourCard';
import type { HomecomingWalk } from './homecomingPlan';
import {
  BOTTOM_ROW_H,
  BUDDY_SIZE,
  FENCE_FOOT_PAD,
  FENCE_SEG_H,
  FENCE_SEG_W,
  GATE_BOX,
  GATE_SIGN_H,
  HINT_H,
  sceneLayout,
  viertelScrollTarget,
  worldYardLayout,
} from './sceneLayout';
import { skyTintForDate } from './timeOfDay';

// "Unser Viertel", step 1 of the redesign (handover/redesign/konzept.md): ONE scene with three heights
// replacing the Doorstep and the Den's yard. Start height = the yard with the gate at the top; scrolling
// up reveals the Viertel (map portrait) and the sky. Presentation only: every number comes from the same
// economy code the Den used (via useDen).

/** Share of the scroll distance each layer lags (sky, positive) or leads (yard, negative). */
const SKY_PARALLAX = 0.4;
const VIERTEL_PARALLAX = 0.15;
const YARD_PARALLAX = -0.06;
const GATE_SWING_MS = 600;
const BOWL_ZOOM_HOLD_MS = 2000;
/** Roughly the body colour of yard-ground-wide.png, shown where the hill edge drops away at the sides. */
const GRASS_BASE = '#9BC995';
const MAX_NOTES = 2;
/** The yard's wooden-sign text is smaller than the 20pt default so long names fit under a building. */
const SMALL_SIGN_TEXT = { fontSize: 15, lineHeight: 18 } as const;

export interface WorldSceneProps {
  dogName: string | null;
  treats: number;
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
  /** Household sync: called after an upgrade was saved locally. */
  onUpgraded?: (building: BuildingKey) => void;
  onStartWalk: () => void;
  updateCard?: { onApply: () => void; onLater: () => void };
  walkActive?: boolean;
  onOpenMap: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  /** The `den` screen alias (notification taps): scroll to the yard and open the next-upgrade panel. */
  openDenPanel?: boolean;
  onDenPanelHandled?: () => void;
  /** Treats the bakery accrued since the previous app open (App's launch routine; not re-derived). > 0 plays the welcome-back burst once per launch. */
  accruedDelta?: number;
  /** Current global territory income, treats/hour (App's launch routine); shown on the fence sign once revealed. */
  territoryIncomeRate?: number;
  /** A walk just ended: the Heimkehr plays over the scene (camera to the Viertel, then the yard) until `onDone`. */
  homecoming?: { walk: HomecomingWalk; onDone: () => void } | null;
  /** The sync engine: neighbour lines, the gift parcel and the Viertel-Runde sign. Omitted (tests, not joined) = no neighbours. */
  neighbourhood?: NeighbourhoodSource;
}

type NoteKind = 'update' | 'line' | 'neighbour';
interface Note {
  key: string;
  kind: NoteKind;
  text: string;
  /** neighbour notes: the dog the line is about (tap opens its card); null for the co-op line. */
  botId?: string | null;
}

/**
 * Pure: at most two notes at once. The OTA update card comes first, then the welcome-back line, then the away-strip lines
 * in their given order; the greeting only fills an otherwise empty yard. A neighbour note (max one) takes the paper
 * slot on the fence unless the OTA card holds it; Buddy's speech bubble always keeps the household/greeting line.
 */
export function pickSceneNotes(
  awayStripLines: AwayStripLine[],
  greeting: string | null,
  hasUpdateCard: boolean,
  dismissed: ReadonlySet<string>,
  welcomeBack: string | null = null,
  neighbour: NeighbourNote | null = null
): Note[] {
  const all: Note[] = [];
  if (hasUpdateCard) all.push({ key: 'update', kind: 'update', text: t('update.ready') });
  // The welcome-back bubble tells the bakery's treats; the old away-strip treats line would say it twice.
  if (welcomeBack) all.push({ key: 'welcome-back', kind: 'line', text: welcomeBack });
  awayStripLines.forEach((line, i) => {
    if (welcomeBack && line.kind === 'treats') return;
    all.push({ key: `line-${i}`, kind: 'line', text: line.text });
  });
  if (all.length === 0 && greeting) all.push({ key: 'greeting', kind: 'line', text: greeting });
  const visible = all.filter((n) => !dismissed.has(n.key));
  if (!neighbour || dismissed.has(neighbour.key)) return visible.slice(0, MAX_NOTES);
  const update = visible.find((n) => n.kind === 'update');
  if (update) return visible.slice(0, MAX_NOTES); // the neighbour waits until the update card is gone
  const bubble = visible.find((n) => n.kind === 'line');
  const note: Note = { key: neighbour.key, kind: 'neighbour', text: neighbour.text, botId: neighbour.botId };
  return bubble ? [bubble, note] : [note];
}

let sleepyYawnPlayed = false;
/** Sessions (one object per app launch, from App.tsx) whose welcome-back burst already played. */
const welcomeBackPlayed = new WeakSet<DoorstepSession>();
const WELCOME_BURST_MS = 1500;
const BUDDY_GREETING_MS = 3000;

export function WorldScene(props: WorldSceneProps) {
  const {
    dogName,
    treats,
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
    onUpgraded,
    onStartWalk,
    updateCard,
    walkActive = false,
    onOpenMap,
    onOpenHistory,
    onOpenSettings,
    openDenPanel = false,
    onDenPanelHandled,
    homecoming = null,
    accruedDelta = 0,
    territoryIncomeRate = 0,
    neighbourhood,
  } = props;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => sceneLayout(height, width, insets.top), [height, width, insets.top]);

  const scrollRef = useRef<{ scrollTo: (o: { x?: number; y?: number; animated?: boolean }) => void } | null>(null);
  const scrollY = useRef(new Animated.Value(layout.startOffset)).current;
  const [isUp, setIsUp] = useState(false);
  const isUpRef = useRef(false);
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
        },
      }),
    [scrollY, layout.startOffset]
  );
  const scrollToYard = () => scrollRef.current?.scrollTo({ y: layout.startOffset, animated: true });
  const scrollToViertel = () => scrollRef.current?.scrollTo({ y: viertelScrollTarget(layout), animated: true });
  useEffect(() => {
    // Android ignores the ScrollView's contentOffset prop until content is measured.
    scrollRef.current?.scrollTo({ y: layout.startOffset, animated: false });
  }, [layout.startOffset]);

  // ---- Den state / upgrades (shared with the legacy DenScreen via useDen) ----
  const wildExtra = useWildExtra({ settingsRepository, sessionKind: session?.kind ?? 'fresh-open' });
  const den = useDen({
    repository: denEconomyRepository,
    personalStatsRepository,
    liveTreats: treats,
    liveLevel: level,
    onTreatsChanged,
    onUpgraded,
    onUpgradeApplied: wildExtra.playLevelUp,
  });
  const [selected, setSelected] = useState<YardBuildingKey | null>(null);
  const [tap, setTap] = useState<{ building: YardBuildingKey; n: number } | null>(null);
  const selectBuilding = (building: YardBuildingKey) => {
    setSelected(building);
    setTap((prev) => ({ building, n: (prev?.n ?? 0) + 1 }));
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

  // `den` screen alias: open the next-upgrade panel on the yard.
  const denPanelHandled = useRef(false);
  useEffect(() => {
    if (!openDenPanel) {
      denPanelHandled.current = false;
      return;
    }
    if (!den.state || denPanelHandled.current) return;
    denPanelHandled.current = true;
    selectBuilding(den.tease?.building ?? den.cheapestAffordable?.building ?? 'doghouse');
    scrollRef.current?.scrollTo({ y: layout.startOffset, animated: true });
    onDenPanelHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDenPanel, den.state]);

  // Bench shows its postcard stack only when there is something in the Album.
  const [hasWalks, setHasWalks] = useState(false);
  useEffect(() => {
    let alive = true;
    walkRepository.getWalks().then((walks) => alive && setHasWalks(walks.length > 0)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [walkRepository]);

  // Homecoming: walks closed so far (this one included) picks the choreography variant; no new storage.
  const [homecomingCount, setHomecomingCount] = useState<number | null>(null);
  const homecomingActive = !!homecoming;
  useEffect(() => {
    if (!homecomingActive) {
      setHomecomingCount(null);
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

  // ---- Gate: swing open, Buddy trots through, then the existing walk flow ----
  type GateFrame = 'sit' | 'a' | 'b';
  const [leaving, setLeaving] = useState<GateFrame | null>(null);
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

  // ---- Bakery life: live bowl number, treats flying chimney -> bowl, welcome-back burst ----
  // Nothing moves during a walk, the Homecoming, the gate beat or while the Viertel is in view.
  const projecting = ready && !walkActive && !homecoming;
  const flightsOn = projecting && !leaving && !isUp;
  const projection = useBowlProjection({ state: den.state, extraRate: territoryIncomeRate, active: projecting });
  // First Hof view of the launch: if the bakery accrued something while the app was closed, roll it in once.
  const [welcome, setWelcome] = useState<{ n: number } | null>(null);
  const [burst, setBurst] = useState<{ key: number; count: number } | null>(null);
  useLayoutEffect(() => {
    if (!projecting || !session || welcome || welcomeBackPlayed.has(session)) return;
    const n = Math.floor(accruedDelta);
    if (n < 1) return;
    welcomeBackPlayed.add(session);
    setWelcome({ n });
    setBurst({ key: 1, count: n });
  }, [projecting, session, welcome, accruedDelta]);
  const burstRunning = !!burst;
  useEffect(() => {
    if (!burstRunning) return;
    const timer = setTimeout(() => setBurst(null), WELCOME_BURST_MS);
    return () => clearTimeout(timer);
  }, [burstRunning]);

  // ---- Notes (away strip, household, OTA card) ----
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key));
  const welcomeText = welcome ? t('world.welcomeBack', { n: formatNumber(welcome.n) }) : null;
  const hood = useNeighbourhood(neighbourhood);
  const [cardBotId, setCardBotId] = useState<string | null>(null);
  const notes = pickSceneNotes(awayStripLines, greeting, !!updateCard && !walkActive, dismissed, welcomeText, hood.note);
  const bubbleNote = notes.find((n) => n.kind === 'line');
  const paperNote = notes.find((n) => n !== bubbleNote);
  const cardItem = cardBotId ? hood.nearby.find((n) => n.id === cardBotId) : undefined;
  const parcelWaiting = hood.unopenedGifts.length > 0;
  const coopText = coopSignText(hood.coop);

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
  const yard = worldYardLayout(width, layout.yardH, levels);
  const geometry = yardWalkGeometry(yard, width);
  const curiousTarget: YardBuildingKey | null = selected ?? den.cheapestAffordable?.building ?? null;
  const buddyMoodNow: BuddyMood = den.excited || greetingPlaying ? 'excited' : curiousTarget ? 'curious' : buddyMood;
  const curiousFacing = curiousTarget === 'doghouse' ? 'left' : 'right';
  const gardenStage3 = artTierForLevel(levels.sniffGarden) >= 3;
  const showsTerritorySign = state.territoryIncomeRevealed && Math.round(territoryIncomeRate) >= 1;
  const cap = projection.cap;
  const shownTreats = projection.projected;
  const treatCount = formatNumber(Math.floor(shownTreats));
  const chimneySprite = yard.sprites.bakery;
  const chimney = chimneyAnchor(artTierForLevel(levels.bakery));
  const chimneyPoint = {
    x: chimneySprite.left + chimneySprite.size * chimney.fx,
    y: layout.yardH - chimneySprite.bottom - chimneySprite.size + chimneySprite.size * chimney.fy,
  };
  const bowlPoint = { x: width / 2, y: layout.yardH + 54 };
  const extraEl = wildExtra.active ? (
    <YardExtras id={wildExtra.active} layout={yard} width={width} height={layout.yardH} onDone={wildExtra.onDone} />
  ) : null;
  const extraBehind = !!wildExtra.active && BEHIND_DOGHOUSE_EXTRAS.includes(wildExtra.active);
  const backPose = buddyBackPoseSources(buddyAppearance);
  const gate = leaving ? artOr('gate-open', null) : artOr('gate-closed', null);
  const startOffset = layout.startOffset;
  const parallax = (k: number) => ({
    transform: [{ translateY: scrollY.interpolate({ inputRange: [0, startOffset], outputRange: [-k * startOffset, 0] }) }],
  });
  const fenceTiles = Math.ceil(width / FENCE_SEG_W) + 1;
  const skyShift = SKY_PARALLAX * startOffset;
  const gateBoxLeft = width / 2 - GATE_BOX / 2;
  const gateHitTop = layout.gateBoxTop + GATE_BOX * 0.36;

  return (
    <View style={[styles.root, { backgroundColor: sky.base }]}>
      <Animated.ScrollView
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
            {(() => {
              const mat = artOr('doormat', null);
              return mat ? <DecorImage source={mat} resizeMode="contain" style={{ position: 'absolute', ...yard.doormat }} /> : null;
            })()}
            {YARD_ORDER.filter((k) => k !== 'doghouse').map((k) => (
              <BuildingSprite
                key={k}
                building={{ key: k, level: levels[k] }}
                size={yard.sprites[k].size}
                left={yard.sprites[k].left}
                bottom={yard.sprites[k].bottom}
                bounceN={den.upgrade && den.upgrade.building === k ? den.upgrade.n : 0}
              />
            ))}
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: leaving || homecoming ? 0 : 1 }]}>
              <YardBuddy
                appearance={buddyAppearance}
                name={dog}
                mood={buddyMoodNow}
                curiousFacing={curiousFacing}
                replayKey={den.upgrade?.n}
                geometry={geometry}
                butterflies={gardenStage3}
                tap={tap}
                onPress={startWalk}
              />
            </View>
            {extraBehind && extraEl}
            <BuildingSprite
              building={{ key: 'doghouse', level: levels.doghouse }}
              size={yard.sprites.doghouse.size}
              left={yard.sprites.doghouse.left}
              bottom={yard.sprites.doghouse.bottom}
              bounceN={den.upgrade && den.upgrade.building === 'doghouse' ? den.upgrade.n : 0}
            />
            {YARD_ORDER.map((k) => {
              const hit = yard.hits[k];
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={t('den.showUpgrade', { name: t(`den.building.${k}.name`) })}
                  style={[styles.abs, { left: hit.left, bottom: hit.bottom, width: hit.width, height: hit.height, zIndex: 1 }]}
                  onPress={() => selectBuilding(k)}
                />
              );
            })}
            {gardenStage3 && <YardButterflies garden={yard.sprites.sniffGarden} />}
            {!extraBehind && extraEl}
            {/* Pennant on the cheapest upgrade Buddy can afford. */}
            {den.cheapestAffordable &&
              (() => {
                const pennant = artOr('pennant', null);
                const w = yard.world[den.cheapestAffordable.building];
                return pennant ? (
                  <DecorImage source={pennant} resizeMode="contain" style={{ position: 'absolute', left: w.pennantLeft, bottom: w.pennantBottom, width: 36, height: 72 }} />
                ) : null;
              })()}
            {/* A slow sparkle beside that pennant: this building could grow. Only the affordable one, and only while the scene is calm. */}
            {den.cheapestAffordable && flightsOn && !burst && (
              <UpgradeSparkle left={yard.world[den.cheapestAffordable.building].pennantLeft + 32} bottom={yard.world[den.cheapestAffordable.building].pennantBottom + 4} />
            )}
            {/* A small sign under every building. */}
            {YARD_ORDER.map((k) => {
              const w = yard.world[k];
              const pennantHere = den.cheapestAffordable?.building === k;
              const name = t(`den.building.${k}.name`);
              const nextLine = pennantHere ? nextEffectLabel(k, state) : null;
              return (
                <View
                  key={k}
                  pointerEvents="box-none"
                  style={[styles.abs, { left: Math.max(4, Math.min(width - 184, w.signCx - 90)), top: w.signTop, width: 180, alignItems: 'center', zIndex: 2 }]}
                >
                  <WoodSign
                    size="small"
                    onPress={() => selectBuilding(k)}
                    accessibilityLabel={t('world.buildingLabel', { name, level: levels[k] })}
                    textStyleOverride={SMALL_SIGN_TEXT}
                  >
                    {pennantHere ? (
                      <View style={styles.upgradeLabel}>
                        <Text style={[textStyle('sign'), styles.upgradeTitle, SMALL_SIGN_TEXT]}>{t('world.upgradePossible')}</Text>
                        {nextLine ? <Text style={[textStyle('small'), styles.upgradeNext]}>{nextLine}</Text> : null}
                      </View>
                    ) : (
                      t('world.buildingSign', { name, level: levels[k] })
                    )}
                  </WoodSign>
                </View>
              );
            })}

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
                      { translateY: walker.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, -(BUDDY_SIZE * 0.9 + buddyFeetInset(BUDDY_SIZE))] }) },
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
                style={[styles.abs, { left: width / 2 + 52, top: 0, width: width / 2 - 56, zIndex: 7 }]}
              >
                <SpeechBubble tail="left">{bubbleNote.text}</SpeechBubble>
              </Pressable>
            )}
            {paperNote && (
              <View pointerEvents="box-none" style={[styles.abs, { left: 8, top: 8, width: Math.max(120, width / 2 - 82), zIndex: 7, transform: [{ rotate: '-3deg' }] }]}>
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
                ) : paperNote.kind === 'neighbour' ? (
                  <Pressable
                    onPress={() => {
                      // A note about a dog opens its card; either way it has been read.
                      if (paperNote.botId && hood.nearby.some((n) => n.id === paperNote.botId)) setCardBotId(paperNote.botId);
                      dismiss(paperNote.key);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={paperNote.text}
                  >
                    <PaperNote>
                      <Text style={[textStyle('small'), styles.noteText]}>{paperNote.text}</Text>
                    </PaperNote>
                  </Pressable>
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
            <ArtDecor art={hasWalks ? 'bench' : 'bench-empty'} style={[styles.abs, { left: 6, top: 0, width: 140, height: 140 }]} />
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

            <BowlFill treats={shownTreats} cap={cap} boxLeft={width / 2 - 60} boxTop={4} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('world.bowlLabel', { count: treatCount, cap: formatNumber(cap) })}
              onPress={zoomBowl}
              style={[styles.abs, { left: width / 2 - 60, top: 30, width: 120, height: 70 }]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.abs, { left: width / 2 - 115, top: 96, width: 230, alignItems: 'center', transform: [{ scale: bowlScale }] }]}
            >
              <WoodSign size="medium" textStyleOverride={SMALL_SIGN_TEXT}>
                <BowlSignContent
                  shown={shownTreats}
                  cap={cap}
                  ratePerHour={homecoming ? 0 : projection.ratePerHour}
                  welcomeFrom={welcome ? Math.max(0, Math.floor(state.treats - welcome.n)) : null}
                />
              </WoodSign>
            </Animated.View>

            <ArtDecor art={'prop-mailbox'} style={[styles.abs, { right: 14, top: -6, width: 130, height: 130 }]} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('world.postLabel')}
              onPress={onOpenSettings}
              style={[styles.abs, { right: 30, top: 0, width: 98, height: 110 }]}
            />
            <View pointerEvents="box-none" style={[styles.abs, { right: 14, top: 108, width: 130, alignItems: 'center' }]}>
              <WoodSign size="small" onPress={onOpenSettings} accessibilityLabel={t('world.post')} textStyleOverride={SMALL_SIGN_TEXT}>
                {t('world.post')}
              </WoodSign>
            </View>
            {/* A gift from a neighbour dog waits by the mailbox; tapping opens the Post list where it is unwrapped. */}
            {parcelWaiting && (
              <View pointerEvents="box-none" style={[styles.abs, { right: 0, top: 14, alignItems: 'center', zIndex: 2, transform: [{ rotate: '4deg' }] }]}>
                <WoodSign size="small" onPress={onOpenSettings} accessibilityLabel={t('neighbours.parcel.label')} textStyleOverride={SMALL_SIGN_TEXT} style={styles.parcelSign}>
                  {t('neighbours.parcel.sign')}
                </WoodSign>
                <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLabel={t('neighbours.parcel.label')}>
                  <Parcel />
                </Pressable>
              </View>
            )}
          </View>

          {/* Treats flying from the bakery chimney into the bowl. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 6 }]}>
            <TreatFlights active={flightsOn} ratePerHour={projection.ratePerHour} atCap={bowlAtCap(shownTreats, cap)} from={chimneyPoint} to={bowlPoint} burst={burst} />
          </View>

          {selected && (
            <View pointerEvents="box-none" style={[styles.abs, { left: spacing.lg, right: spacing.lg, bottom: insets.bottom + spacing.sm, zIndex: 8 }]}>
              <BuildingPanel building={selected} state={state} message={den.message} onUpgrade={den.handleUpgrade} onClose={() => setSelected(null)} />
            </View>
          )}
        </Animated.View>

        {/* ---- ZAUN ---- */}
        <View pointerEvents="box-none" style={[styles.layer, { top: layout.tailTop, height: layout.fenceBottom + FENCE_FOOT_PAD, zIndex: 3 }]}>
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
            onPress={startWalk}
            style={[styles.abs, { left: gateBoxLeft, top: gateHitTop, width: GATE_BOX, height: GATE_BOX * 0.6 }]}
          />
          <View pointerEvents="box-none" style={[styles.abs, { left: 0, right: 0, top: layout.gateSignTop, alignItems: 'center' }]}>
            <WoodSign size="wide" onPress={startWalk} accessibilityLabel={t('world.gateLabel')}>
              <View style={styles.gateSignRow}>
                <ArtImage art="icon-paw" size={26} />
                <Text style={[textStyle('signBig'), styles.gateSignText]}>{t('world.gate')}</Text>
              </View>
            </WoodSign>
          </View>
          <View pointerEvents="box-none" style={[styles.abs, { right: 6, top: layout.gateSignTop + GATE_SIGN_H + 4, width: 150, transform: [{ rotate: '3deg' }] }]}>
            <WoodSign size="small" textStyleOverride={SMALL_SIGN_TEXT}>
              {title ? `${dog} · ${title}` : t('doorstep.dogLevel', { dog, level })}
            </WoodSign>
          </View>
          {showsTerritorySign && (
            <View pointerEvents="none" style={[styles.abs, { left: 6, top: layout.gateSignTop + GATE_SIGN_H + 4, width: 150, transform: [{ rotate: '-3deg' }] }]}>
              <WoodSign size="small" textStyleOverride={SMALL_SIGN_TEXT}>
                {t('world.territorySign', { n: formatNumber(Math.round(territoryIncomeRate)) })}
              </WoodSign>
            </View>
          )}
          {coopText && (
            <View
              pointerEvents="none"
              style={[styles.abs, { left: 6, top: layout.gateSignTop + GATE_SIGN_H + 4 + (showsTerritorySign ? 64 : 0), width: 190, alignItems: 'flex-start', transform: [{ rotate: '-2deg' }] }]}
            >
              <WoodSign size="small" textStyleOverride={SMALL_SIGN_TEXT} accessibilityLabel={coopText}>
                {coopText}
              </WoodSign>
            </View>
          )}
          <Pressable
            onPress={scrollToViertel}
            accessibilityRole="button"
            accessibilityLabel={t('world.toNeighbourhood')}
            style={[styles.hint, { top: layout.hintTop, height: HINT_H }]}
          >
            <Text style={[textStyle('hand'), styles.hintText]}>{`↑ ${t('world.toNeighbourhood')}`}</Text>
          </Pressable>
        </View>

        {/* ---- VIERTEL ---- */}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.layer, { top: layout.skyH, height: layout.viertelH + layout.fenceBottom + 120, zIndex: 1 }, parallax(VIERTEL_PARALLAX)]}
        >
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: material.linen }]} />
          <View style={styles.cloth}>
            <WorldPortrait
              homeRangeRepository={homeRangeRepository}
              onPress={onOpenMap}
              dog={dog}
              height={layout.viertelH - 72}
              showNeighbours
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
        />
      )}

      {cardItem && <NeighbourCard item={cardItem} lines={hood.linesFor(cardItem.id)} onClose={() => setCardBotId(null)} />}

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

/** The embedded Viertel: the existing portrait (not pannable), framed like stitched cloth; tap opens the full map. */
function WorldPortrait({
  homeRangeRepository,
  onPress,
  dog,
  height,
  showNeighbours,
}: {
  homeRangeRepository: HomeRangeRepository;
  onPress: () => void;
  dog: string;
  height: number;
  showNeighbours?: boolean;
}) {
  const [empty, setEmpty] = useState(false);
  return empty ? (
    <PaperNote style={styles.emptyNote}>
      <Text style={[textStyle('body'), styles.noteText]}>{t('doorstep.emptyRange', { dog })}</Text>
    </PaperNote>
  ) : (
    <View style={styles.clothFrame}>
      <TerritoryPortrait
        homeRangeRepository={homeRangeRepository}
        onPress={onPress}
        onEmptyChange={setEmpty}
        height={height}
        accessibilityLabel={t('world.neighbourhoodLabel')}
        showNeighbours={showNeighbours}
      />
    </View>
  );
}

/** Decor sprite by key; renders nothing while the PNG is missing. */
function ArtDecor({ art, style }: { art: ArtKey; style: React.ComponentProps<typeof DecorImage>['style'] }) {
  const source = artOr(art, null);
  return source ? <DecorImage source={source} resizeMode="contain" style={style} /> : null;
}

/** A small wrapped parcel drawn with Views (no art yet): kraft box, cream ribbon, a little bow. */
function Parcel() {
  return (
    <View style={styles.parcel}>
      <View style={styles.parcelRibbonV} />
      <View style={styles.parcelRibbonH} />
      <View style={styles.parcelBow} />
    </View>
  );
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
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mix(tokens.blue, '#FFFFFF', 0.7),
  },
  hintText: { color: material.inkGreen, fontSize: 20, lineHeight: 24 },
  backWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  cloth: { position: 'absolute', left: 12, right: 12, top: 24, bottom: 0 },
  clothFrame: {
    backgroundColor: material.linen,
    borderRadius: 16,
    padding: 8,
    ...stitch(3, material.yarn),
    overflow: 'hidden',
  },
  emptyNote: { alignSelf: 'stretch' },
  noteText: { color: material.ink },
  upgradeLabel: { alignItems: 'center' },
  upgradeTitle: { color: material.ink, textAlign: 'center' },
  upgradeNext: { color: material.muted, textAlign: 'center' },
  parcel: { width: 48, height: 38, borderRadius: 6, backgroundColor: mix(material.woodLight, material.pathBrown, 0.5), borderWidth: 2, borderColor: material.woodRim, borderBottomWidth: 4, borderBottomColor: material.woodDark, alignItems: 'center', justifyContent: 'center' },
  parcelRibbonV: { position: 'absolute', top: 0, bottom: 0, width: 8, backgroundColor: material.yarn },
  parcelRibbonH: { position: 'absolute', left: 0, right: 0, height: 7, backgroundColor: material.yarn },
  parcelBow: { position: 'absolute', top: -7, width: 16, height: 9, borderRadius: 6, backgroundColor: tokens.warm, borderWidth: 1, borderColor: material.woodDark },
  parcelSign: { marginBottom: 6 },
  updateButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' },
});
