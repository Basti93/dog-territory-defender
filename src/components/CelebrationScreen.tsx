import React, { useEffect, useRef } from 'react';
import { Animated, Image, View, Text, StyleSheet, useWindowDimensions } from 'react-native';

import { artOr } from '../art/artAssets';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAvatar } from './buddy';
import {
  AnimatedNumber,
  ArtImage,
  Button,
  Card,
  Chip,
  Confetti,
  DecorImage,
  Screen,
  palette,
  spacing,
  textStyle,
} from '../ui';

import { BALANCE, BuildingKey } from '../economy/balanceConfig';
import { dogDisplayName, UpgradeTease } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId } from '../economy/personalStats';
import { CELL_M, NEW_GROUND_MIN_CELLS, streetsKnown } from '../utils/grid';
import { formatNumber, t, tPlural } from '../i18n';
import * as haptics from '../feedback/haptics';
import { play } from '../feedback/sounds';
import { MAX_COUNT_UP_MS } from '../ui/AnimatedNumber';
import { WEIRD_HEADLINE_KEYS, pickWeirdKey, weirdLevelUpLine } from './weirdCopy';

// Same keys DenScreen uses for its building cards.
const BUILDING_NAME_KEYS: Record<BuildingKey, string> = {
  doghouse: 'den.building.doghouse.name',
  bakery: 'den.building.bakery.name',
  sniffGarden: 'den.building.sniffGarden.name',
};

interface CelebrationScreenProps {
  /** This walk's real Home Range footprint (cellsPainted, see utils/grid.ts's paintedCells) — 0 for a manual log. */
  cellsPainted: number;
  /** False for a manually-logged walk (no real GPS trail, so no ground was actually painted) — swaps the title/area line for copy that doesn't claim ground that wasn't actually mapped. */
  hasTerritory: boolean;
  treatsEarned: number;
  tease: UpgradeTease | null;
  unlockedAchievements?: AchievementId[];
  leveledUpTo?: number | null;
  /** Buddy's treats-per-walk rate before/after this level-up — both required to render the level-up beat; null whenever leveledUpTo is null. See economy/walkRewards.ts. */
  oldTreatsPerWalk?: number | null;
  newTreatsPerWalk?: number | null;
  /** The one-away cliffhanger's milestone title, when it fires on this walk-close. See economy/milestones.ts — currently always null until milestone titles are game-master-authored. */
  cliffhangerTitle?: string | null;
  /** This walk's own New Ground cell count (see utils/grid.ts's newGroundCells) — the New Ground beat below fires when this reaches NEW_GROUND_MIN_CELLS. 0 for a manual log or a walk that only re-covered known ground. */
  newGroundCellCount?: number;
  /** The Home Range's Fresh Ground payout multiplier actually applied to this walk's treats (see economy/formulas.ts's bloomMultiplier). The Fresh Ground beat below is suppressed entirely below BALANCE.freshGround.displayThresholdMultiplier — design.md Decision 3's UI rule, not a display nicety (closes the fixed-loop-walker dead zone, FLAG 1). */
  bloomMultiplier?: number;
  /** The name of a Territory this walk just created, or `null` — docs/decisions/territories/design.md Decision 3/tasks.md task 6. Only ever set when the player already had at least one Territory before this walk (the very first-ever Territory is silent — "a second home" only reads as a discovery once there's a first to contrast it with). Never rendered alongside a rename control (renaming only ever happens from the Territory's own card, never here). */
  newTerritoryName?: string | null;
  /** The [survivor, absorbed] Territory names when this walk caused a merge, or `null` — docs/decisions/territories/design.md Decision 3. Framed as a positive event ("Buddy connected his two worlds!"), never a loss for the absorbed Territory. */
  mergedTerritoryNames?: [string, string] | null;
  dogName?: string | null;
  /** Buddy's look (buddy-comes-alive). */
  buddyAppearance: BuddyAppearance;
  /** Walk id; picks the headline variant so it stays the same across re-renders. */
  walkId?: string | null;
  onContinue: () => void;
}

// Game-master celebration headlines (fun review), in src/i18n as
// `celebration.headline.1` .. `.3`. {name} is the dog's name.
const HEADLINE_COUNT = 3;

/** Same walk id always gives the same headline. About 1 walk in 4 gets a sweet-weird line instead (`weird.headline.*`). */
export function pickCelebrationHeadline(walkId: string | null | undefined, dog: string): string {
  let hash = 0;
  for (const ch of walkId ?? '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const weird = pickWeirdKey(hash, WEIRD_HEADLINE_KEYS);
  if (weird) return t(weird, { dog, name: dog });
  return t(`celebration.headline.${(hash % HEADLINE_COUNT) + 1}`, { name: dog });
}

export function CelebrationScreen({
  cellsPainted,
  hasTerritory,
  treatsEarned,
  tease,
  unlockedAchievements = [],
  leveledUpTo = null,
  oldTreatsPerWalk = null,
  newTreatsPerWalk = null,
  cliffhangerTitle = null,
  newGroundCellCount = 0,
  bloomMultiplier = 1,
  newTerritoryName = null,
  mergedTerritoryNames = null,
  dogName = null,
  buddyAppearance,
  walkId = null,
  onContinue,
}: CelebrationScreenProps) {
  useEffect(() => {
    play('celebrate');
    haptics.success();
  }, []);
  const treatSoundPlayed = useRef(false);
  const playTreatSoundOnce = () => {
    if (treatSoundPlayed.current || treatsEarned <= 0) return;
    treatSoundPlayed.current = true;
    play('treat');
  };
  // Fallback if the count-up never reports done (e.g. it could not run): fires
  // just after the longest possible count-up. The once-guard prevents a double.
  useEffect(() => {
    if (treatsEarned <= 0) return;
    const id = setTimeout(playTreatSoundOnce, MAX_COUNT_UP_MS + 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatsEarned]);
  const burstArt = artOr('celebration-burst', null);
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!burstArt) return;
    // One-shot: scale 0.6 -> 1, opacity 0 -> 1 -> settles at 0.85.
    const anim = Animated.timing(burst, { toValue: 1, duration: 600, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [burst, burstArt]);

  const { width, height: windowHeight } = useWindowDimensions();
  const ground = artOr('yard-ground', null);
  const dog = dogDisplayName(dogName);
  const stageWidth = width * 1.2;
  // 3:2 ground, height capped at ~55% of the screen so the backdrop stays visible.
  const groundHeight = Math.min(stageWidth * (2 / 3), windowHeight * 0.55);
  const groundWidth = groundHeight * 1.5;

  return (
    <View style={styles.container}>
      {burstArt ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            {
              opacity: burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 0.85] }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        >
          <Image source={burstArt} resizeMode="contain" style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}

      <Screen scroll style={styles.screen} contentStyle={styles.content}>
        {/* Buddy on a grass strip. */}
        <View style={[styles.stage, { width: stageWidth }]}>
          {ground && (
            <DecorImage source={ground} resizeMode="contain" style={[styles.ground, { width: groundWidth, height: groundHeight }]} />
          )}
          <BuddyAvatar appearance={buddyAppearance} size={170} mood="excited" excitedSettleMs={null} name={dog} />
        </View>

        <Text style={[textStyle('display'), styles.title]}>
          {hasTerritory ? pickCelebrationHeadline(walkId, dog) : t('celebration.walkClaimed')}
        </Text>
        <Text style={[textStyle('body'), styles.area]}>
          {hasTerritory ? t('celebration.areaYours', { area: formatNumber(Math.round(cellsPainted * CELL_M * CELL_M)) }) : t('celebration.everyStep')}
        </Text>

        <Card tint="warm" style={styles.treatsCard}>
          <ArtImage art="icon-treat" size={48} />
          <AnimatedNumber from={0} value={treatsEarned} onDone={playTreatSoundOnce} format={(n) => t('celebration.treatsEarned', { count: formatNumber(n) })} style={textStyle('display')} />
        </Card>

        {/* Fresh Ground beat — suppressed below BALANCE.freshGround.displayThresholdMultiplier
            (design.md Decision 3's UI rule): a routine walk shows the treats total above with
            no multiplier line at all, not "×1.00," nothing. See
            docs/decisions/home-range-rewards/tasks.md task 3.2. */}
        {bloomMultiplier >= BALANCE.freshGround.displayThresholdMultiplier && (
          <Beat label={t('celebration.freshGround.label')}>
            {t('celebration.freshGround.body', { dog })}
          </Beat>
        )}

        {/* New Ground beat — fires once this walk's New Ground cell count clears the
            dilated-set-difference threshold (design.md Decision 5). See
            docs/decisions/home-range-rewards/tasks.md task 3.1. */}
        {newGroundCellCount >= NEW_GROUND_MIN_CELLS && (
          <Beat label={t('celebration.newGround.label')}>
            {tPlural('celebration.newGround.body', streetsKnown(newGroundCellCount), { dog })}
          </Beat>
        )}

        {/* New-territory discovery beat — fires only when this walk creates
            an ADDITIONAL territory beyond the player's first (the caller
            gates on hadExistingTerritoryBefore; the very first-ever
            territory is silent). Never offers a rename control here — see
            docs/decisions/territories/design.md's "renameable anytime via
            the territory's own card, never on this screen" rule.
            TODO(game-master copy pass): tasks.md's given copy doesn't yet
            interpolate the new territory's own name (newTerritoryName) —
            kept as a prop for whenever that copy is finalized. */}
        {newTerritoryName !== null && (
          <Beat label={t('celebration.newTerritory.label')} icon="icon-pin">{t('celebration.newTerritory.body', { dog })}</Beat>
        )}

        {/* Territory merge beat — always framed as a positive event, never a
            loss for the absorbed territory (design.md Decision 3).
            TODO(game-master copy pass): same interpolation note as above —
            mergedTerritoryNames is kept as a prop for the finalized copy. */}
        {mergedTerritoryNames !== null && (
          <Beat label={t('celebration.merge.label')} icon="icon-pin">{t('celebration.merge.body', { dog })}</Beat>
        )}

        {tease && (
          <Card tint="sky" style={styles.beatCard}>
            <View style={styles.teaseRow}>
              <ArtImage art="icon-den" size={40} />
              <View style={styles.beatText}>
                <Text style={[textStyle('small'), { color: palette.muted }]}>{t('den.nextUp')}</Text>
                <Text style={textStyle('h2')}>
                  {t(tease.affordable ? 'den.teaseAffordable' : 'den.tease', {
                    name: t(BUILDING_NAME_KEYS[tease.building]),
                    cost: formatNumber(tease.cost),
                  })}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {unlockedAchievements.length > 0 && (
          <Card tint="meadow" style={styles.beatCard}>
            <View style={styles.teaseRow}>
              <ArtImage art="icon-badge" size={40} />
              <View style={styles.beatText}>
                <Text style={[textStyle('small'), { color: palette.muted }]}>
                  {t(unlockedAchievements.length > 1 ? 'celebration.newBadges' : 'celebration.newBadge')}
                </Text>
                {unlockedAchievements.map((id) => (
                  <Text key={id} style={textStyle('h2')}>
                    🏅 {ACHIEVEMENTS[id].copyTitle}
                  </Text>
                ))}
              </View>
            </View>
          </Card>
        )}

        {leveledUpTo !== null && oldTreatsPerWalk !== null && newTreatsPerWalk !== null && (
          <Beat label={t('celebration.levelUp.label', { level: leveledUpTo })}>
            {/* Accepted verbatim copy shape (docs/decisions/virtual-dog-companion), numbers filled in. */}
            {t('celebration.levelUp.body', {
              dog,
              level: leveledUpTo,
              newCount: formatNumber(newTreatsPerWalk),
              oldCount: formatNumber(oldTreatsPerWalk),
            })}
            {(() => {
              const weird = weirdLevelUpLine(walkId);
              return weird ? `\n${weird}` : '';
            })()}
          </Beat>
        )}

        {cliffhangerTitle !== null && (
          // Accepted verbatim copy shape (docs/decisions/virtual-dog-companion), title filled in.
          <Beat label={t('celebration.cliffhanger.label')}>{t('celebration.cliffhanger.body', { title: cliffhangerTitle })}</Beat>
        )}

        <Button label={t('celebration.continue')} onPress={onContinue} style={styles.continueButton} />
      </Screen>

      {/* Gentle thank-you confetti: self-unmounts, never blocks touches. */}
      <Confetti />
    </View>
  );
}

/** One celebration beat: a small Chip label over the warm sentence, in a tinted card. */
function Beat({ label, icon, children }: { label: string; icon?: 'icon-pin'; children: React.ReactNode }) {
  return (
    <Card tint="meadow" style={styles.beatCard}>
      <Chip label={label} icon={icon} tint="warm" style={styles.beatChip} />
      <Text style={textStyle('body')}>{children}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  screen: { backgroundColor: 'transparent' },
  burst: { position: 'absolute', top: 40, alignSelf: 'center', width: 320, height: 320 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  // Fixed-height box so the grass strip sits under Buddy's paws.
  stage: { height: 210, alignItems: 'center', justifyContent: 'flex-end' },
  ground: { position: 'absolute', bottom: -spacing.xxl * 2 },
  title: { textAlign: 'center' },
  area: { color: palette.muted, textAlign: 'center' },
  treatsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
  beatCard: { alignSelf: 'stretch' },
  beatChip: { marginBottom: spacing.sm },
  teaseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  beatText: { flex: 1, gap: 2 },
  continueButton: { alignSelf: 'stretch', marginTop: spacing.md },
});
