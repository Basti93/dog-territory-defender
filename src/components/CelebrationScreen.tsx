import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAvatar } from './buddy';
import { AnimatedNumber, Confetti, PressableScale } from '../ui';

import { BALANCE, BuildingKey } from '../economy/balanceConfig';
import { dogDisplayName, UpgradeTease } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId } from '../economy/personalStats';
import { CELL_M, NEW_GROUND_MIN_CELLS, streetsKnown } from '../utils/grid';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  brown: '#8B6F47',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

const BUILDING_NAMES: Record<BuildingKey, string> = {
  doghouse: 'Doghouse',
  bakery: 'Treat Bakery',
  sniffGarden: 'Sniff Garden',
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
  /** The name of a Territory this walk just created, or `null` — openspec/changes/territories/design.md Decision 3/tasks.md task 6. Only ever set when the player already had at least one Territory before this walk (the very first-ever Territory is silent — "a second home" only reads as a discovery once there's a first to contrast it with). Never rendered alongside a rename control (renaming only ever happens from the Territory's own card, never here). */
  newTerritoryName?: string | null;
  /** The [survivor, absorbed] Territory names when this walk caused a merge, or `null` — openspec/changes/territories/design.md Decision 3. Framed as a positive event ("Buddy connected his two worlds!"), never a loss for the absorbed Territory. */
  mergedTerritoryNames?: [string, string] | null;
  dogName?: string | null;
  /** Buddy's look (buddy-comes-alive). */
  buddyAppearance: BuddyAppearance;
  /** Walk id; picks the headline variant so it stays the same across re-renders. */
  walkId?: string | null;
  onContinue: () => void;
}

// Game-master celebration headlines (fun review). {name} is the dog's name.
const HEADLINES = [
  '{name} claimed a new corner of the neighbourhood!',
  'What a walk! {name} is thrilled.',
  'Tails up, you two did it.',
];

/** Same walk id always gives the same headline. */
export function pickCelebrationHeadline(walkId: string | null | undefined, dog: string): string {
  let hash = 0;
  for (const ch of walkId ?? '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return HEADLINES[hash % HEADLINES.length].replace('{name}', dog);
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
  return (
    <View style={styles.container}>
      {/* Gentle thank-you confetti: self-unmounts, never blocks touches. */}
      <Confetti />

      <ScrollView contentContainerStyle={styles.content}>
        <BuddyAvatar appearance={buddyAppearance} size={140} mood="excited" excitedSettleMs={null} name={dogDisplayName(dogName)} />
        <Text style={styles.title}>
          {hasTerritory ? pickCelebrationHeadline(walkId, dogDisplayName(dogName)) : 'Walk claimed! 🌱'}
        </Text>
        <Text style={styles.area}>
          {hasTerritory ? `${(cellsPainted * CELL_M * CELL_M).toFixed(0)} m² is now yours` : 'Every step of it is yours'}
        </Text>

        <View style={styles.treatsRow}>
          <AnimatedNumber from={0} value={treatsEarned} format={(n) => `+${n} treats`} style={styles.treatsEarned} />
        </View>

        {/* Fresh Ground beat — suppressed below BALANCE.freshGround.displayThresholdMultiplier
            (design.md Decision 3's UI rule): a routine walk shows the treats total above with
            no multiplier line at all, not "×1.00," nothing. See
            openspec/changes/home-range-rewards/tasks.md task 3.2. */}
        {bloomMultiplier >= BALANCE.freshGround.displayThresholdMultiplier && (
          <View style={styles.levelBox}>
            <Text style={styles.levelText}>
              That ground had gone lovely and wild again — {dogDisplayName(dogName)} brought home extra treats for it.
            </Text>
          </View>
        )}

        {/* New Ground beat — fires once this walk's New Ground cell count clears the
            dilated-set-difference threshold (design.md Decision 5). See
            openspec/changes/home-range-rewards/tasks.md task 3.1. */}
        {newGroundCellCount >= NEW_GROUND_MIN_CELLS && (
          <View style={styles.levelBox}>
            <Text style={styles.levelText}>
              New ground! {dogDisplayName(dogName)} learned {streetsKnown(newGroundCellCount)} new street
              {streetsKnown(newGroundCellCount) === 1 ? '' : 's'} today.
            </Text>
          </View>
        )}

        {/* New-territory discovery beat — fires only when this walk creates
            an ADDITIONAL territory beyond the player's first (the caller
            gates on hadExistingTerritoryBefore; the very first-ever
            territory is silent). Never offers a rename control here — see
            openspec/changes/territories/design.md's "renameable anytime via
            the territory's own card, never on this screen" rule.
            TODO(game-master copy pass): tasks.md's given copy doesn't yet
            interpolate the new territory's own name (newTerritoryName) —
            kept as a prop for whenever that copy is finalized. */}
        {newTerritoryName !== null && (
          <View style={styles.levelBox}>
            <Text style={styles.levelText}>A new territory! {dogDisplayName(dogName)} found a second home.</Text>
          </View>
        )}

        {/* Territory merge beat — always framed as a positive event, never a
            loss for the absorbed territory (design.md Decision 3).
            TODO(game-master copy pass): same interpolation note as above —
            mergedTerritoryNames is kept as a prop for the finalized copy. */}
        {mergedTerritoryNames !== null && (
          <View style={styles.levelBox}>
            <Text style={styles.levelText}>{dogDisplayName(dogName)} connected his two worlds!</Text>
          </View>
        )}

        {tease && (
          <View style={styles.teaseBox}>
            <Text style={styles.teaseLabel}>Next up in the Den</Text>
            <Text style={styles.teaseText}>
              {BUILDING_NAMES[tease.building]} — {tease.cost} treats
              {tease.affordable ? ' (you can afford it now!)' : ''}
            </Text>
          </View>
        )}

        {unlockedAchievements.length > 0 && (
          <View style={styles.badgeBox}>
            <Text style={styles.badgeLabel}>New badge{unlockedAchievements.length > 1 ? 's' : ''}!</Text>
            {unlockedAchievements.map((id) => (
              <Text key={id} style={styles.badgeText}>
                🏅 {ACHIEVEMENTS[id].copyTitle}
              </Text>
            ))}
          </View>
        )}

        {leveledUpTo !== null && oldTreatsPerWalk !== null && newTreatsPerWalk !== null && (
          <View style={styles.levelBox}>
            {/* Accepted verbatim copy shape (openspec/changes/virtual-dog-companion), numbers filled in. */}
            <Text style={styles.levelText}>
              {dogDisplayName(dogName)} reached Level {leveledUpTo} — he brings home {newTreatsPerWalk} treats a walk
              now, up from {oldTreatsPerWalk}
            </Text>
          </View>
        )}

        {cliffhangerTitle !== null && (
          <View style={styles.levelBox}>
            {/* Accepted verbatim copy shape (openspec/changes/virtual-dog-companion), title filled in. */}
            <Text style={styles.levelText}>One more walk and he's a {cliffhangerTitle}</Text>
          </View>
        )}

        <PressableScale style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueButtonText}>Nice walk! 🐾</Text>
        </PressableScale>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 16,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  area: {
    fontSize: 16,
    color: COLORS.muted,
    marginTop: 8,
  },
  treatsRow: {
    marginTop: 24,
  },
  treatsEarned: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.warm,
  },
  teaseBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
  },
  teaseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teaseText: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
    textAlign: 'center',
  },
  badgeBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EAF7EE',
    alignItems: 'center',
    gap: 2,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  levelBox: {
    marginTop: 12,
  },
  levelText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: COLORS.green,
  },
  continueButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
