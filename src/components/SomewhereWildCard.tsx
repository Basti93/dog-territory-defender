import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { palette, textStyle, tokens } from '../ui/theme';
import { dogDisplayName } from '../economy/denEconomy';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { TerritoryRepository } from '../storage/TerritoryRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { calendarDayGap } from '../utils/manualWalkLog';
import { cellCentre, cellKey, streetsKnown } from '../utils/grid';
import { resolveNewGroundSpot, resolveWildClusterLabel } from '../utils/streetLookup';
import { displayTerritoryName } from '../utils/territoryDisplayName';
import { wildestCluster } from '../utils/wildSpot';
import { formatDate, t, tPlural } from '../i18n';

// The "Somewhere Wild" card — docs/decisions/somewhere-wild/proposal.md
// and design.md. One warm sentence, tappable, never a count, never a
// dismiss button. Renders one of three states (New Ground takes priority
// over a wild cluster; most of the time, neither qualifies and this renders
// null) — see design.md's "Card copy, finalized by game-master" section for
// the exact copy implemented verbatim below.
//
// The state-resolution logic (evaluateSomewhereWild) is a plain exported
// async function, deliberately kept separate from the React component below
// it, so it can be exercised directly in tests the same way every other
// piece of game logic in this codebase is (no React renderer needed) — see
// src/components/__tests__/SomewhereWildCard.test.ts.

const NEW_GROUND_WINDOW_MS = 48 * 60 * 60 * 1000;

// Copy lives in src/i18n as `wild.cluster.1` .. `.4` ({place}, {dog}).
const WILD_CLUSTER_VARIANT_COUNT = 4;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** `today` | `yesterday` | `on {Weekday}` (localised) — design.md's card copy section; the 48h window can reach two calendar days back. */
export function dayPhrase(occurredAt: number, now: number): string {
  const daysAgo = calendarDayGap(occurredAt, now);
  if (daysAgo <= 0) return t('wild.today');
  if (daysAgo === 1) return t('wild.yesterday');
  return t('wild.onWeekday', { weekday: formatDate(occurredAt, { weekday: 'long' }) });
}

export interface SomewhereWildSpot {
  latitude: number;
  longitude: number;
}

export interface SomewhereWildCardState {
  text: string;
  spot: SomewhereWildSpot;
}

export interface EvaluateSomewhereWildDeps {
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  dogName: string | null;
  now: number;
  /** Optional so existing callers/tests that don't care about territory-aware copy (docs/decisions/territories) keep working unchanged — omitted means the wild-cluster copy always uses the raw street label. */
  territoryRepository?: TerritoryRepository;
}

/** Tracks the winning wild cluster's anchor across evaluations so the copy's variant only rotates when the spot itself moves — design.md's "stable within a session, fresh when the wild spot itself moves" rule. Unaffected by a New Ground card taking priority in a given cycle (that state doesn't use a variant). */
export interface WildClusterVariantState {
  anchorCellId: string | null;
  epoch: number;
}

export const INITIAL_WILD_CLUSTER_VARIANT_STATE: WildClusterVariantState = { anchorCellId: null, epoch: 0 };

export interface EvaluateSomewhereWildResult {
  card: SomewhereWildCardState | null;
  /** Persist this and pass it back in on the next call. */
  wildClusterVariantState: WildClusterVariantState;
}

/**
 * Resolves the current "Somewhere Wild" card state — priority 1: a
 * still-fresh (≤48h) New Ground discovery; priority 2: the single
 * most-worth-visiting wild cluster, if one qualifies and resolves to a real
 * place name; otherwise `card: null` (design.md's "neither state renders"
 * rule — never a placeholder).
 */
export async function evaluateSomewhereWild(
  deps: EvaluateSomewhereWildDeps,
  prevWildClusterVariantState: WildClusterVariantState = INITIAL_WILD_CLUSTER_VARIANT_STATE
): Promise<EvaluateSomewhereWildResult> {
  const { homeRangeRepository, walkRepository, dogName, now, territoryRepository } = deps;

  const event = await homeRangeRepository.getLastNewGroundEvent();
  if (event && now - event.occurredAt <= NEW_GROUND_WINDOW_MS) {
    const spot = await resolveNewGroundSpot(event, walkRepository);
    if (spot) {
      const dog = dogDisplayName(dogName);
      const n = streetsKnown(event.cellIds.length);
      const phrase = dayPhrase(event.occurredAt, now);
      const text = tPlural(spot.label ? 'wild.newGround.withLabel' : 'wild.newGround.noLabel', n, {
        dog,
        label: spot.label ?? '',
        when: phrase,
      });
      return {
        card: { text, spot: { latitude: spot.location.latitude, longitude: spot.location.longitude } },
        wildClusterVariantState: prevWildClusterVariantState,
      };
    }
    // No real location could be matched to this event (rare — see
    // resolveNewGroundSpot's doc comment) — fall through to the
    // wild-cluster state below rather than showing nothing this cycle.
  }

  const cells = await homeRangeRepository.getCells();
  const cluster = wildestCluster(cells, now);
  let nextVariantState = prevWildClusterVariantState;

  if (cluster) {
    nextVariantState =
      prevWildClusterVariantState.anchorCellId === cluster.anchorCellId
        ? prevWildClusterVariantState
        : { anchorCellId: cluster.anchorCellId, epoch: prevWildClusterVariantState.epoch + 1 };

    const label = await resolveWildClusterLabel(cluster, { walkRepository });
    if (label) {
      // docs/decisions/territories/design.md's "Somewhere Wild becomes
      // territory-aware" requirement: when the winning cluster's anchor
      // cell belongs to a named Territory, prefer that name over the raw
      // reverse-geocoded street label — still exactly one card app-wide,
      // never one per Territory.
      let place = label;
      if (territoryRepository) {
        const anchorCell = cells.find((c) => cellKey(c.ix, c.iy) === cluster.anchorCellId);
        if (anchorCell?.territoryId) {
          const territory = await territoryRepository.getTerritory(anchorCell.territoryId);
          if (territory) place = displayTerritoryName(territory.name);
        }
      }
      const variantIndex = hashString(`${cluster.anchorCellId}:${nextVariantState.epoch}`) % WILD_CLUSTER_VARIANT_COUNT;
      const text = t(`wild.cluster.${variantIndex + 1}`, { place, dog: dogDisplayName(dogName, false) });
      const [latitude, longitude] = cellCentre(cluster.anchor.ix, cluster.anchor.iy);
      return { card: { text, spot: { latitude, longitude } }, wildClusterVariantState: nextVariantState };
    }
    // Label resolution failed entirely — design.md Decision 3 Fix 2: no
    // orphaned marker/card when that happens.
  }

  return { card: null, wildClusterVariantState: nextVariantState };
}

// Decision 6: debounce foreground re-evaluation so a reverse-geocode network
// call doesn't fire on every rapid app-switch — recompute at most this often
// on a plain foreground transition. `refreshKey` (bumped by the caller right
// after Finish Walk paints new cells) bypasses this interval entirely, since
// that's the one moment the underlying data is known to have actually changed.
const MIN_FOREGROUND_RE_EVALUATE_INTERVAL_MS = 20 * 60 * 1000;

const COLORS = {
  warm: tokens.warm,
  text: tokens.text,
};

interface SomewhereWildCardProps {
  homeRangeRepository: HomeRangeRepository;
  walkRepository: WalkRepository;
  dogName: string | null;
  /** Optional — when supplied, a wild cluster inside a named Territory shows that Territory's name instead of the raw street label (docs/decisions/territories). Omitted keeps today's street-label-only behaviour. */
  territoryRepository?: TerritoryRepository;
  /** Bump to force an immediate re-evaluation (e.g. right after Finish Walk paints new cells) — mirrors MapView's own homeRangeRefreshKey convention. */
  refreshKey?: number;
  /** Called whenever the resolved spot changes (including to `null`) — the caller forwards this straight into MapView's SHOW_WILD_SPOT bridge message, so the marker and this card always agree on the same spot. */
  onSpotChange: (spot: SomewhereWildSpot | null) => void;
  /** Called when the card is tapped — always has a resolved spot, since there's nothing to tap when this renders null. The caller pans the map to it. */
  onTapSpot: (spot: SomewhereWildSpot) => void;
}

export function SomewhereWildCard({
  homeRangeRepository,
  walkRepository,
  dogName,
  territoryRepository,
  refreshKey,
  onSpotChange,
  onTapSpot,
}: SomewhereWildCardProps) {
  const [card, setCard] = useState<SomewhereWildCardState | null>(null);
  const lastEvaluatedAtRef = useRef(0);
  const wildClusterVariantStateRef = useRef<WildClusterVariantState>(INITIAL_WILD_CLUSTER_VARIANT_STATE);

  const evaluate = useCallback(async () => {
    lastEvaluatedAtRef.current = Date.now();
    const result = await evaluateSomewhereWild(
      { homeRangeRepository, walkRepository, dogName, now: Date.now(), territoryRepository },
      wildClusterVariantStateRef.current
    );
    wildClusterVariantStateRef.current = result.wildClusterVariantState;
    setCard(result.card);
  }, [homeRangeRepository, walkRepository, dogName, territoryRepository]);

  // Re-evaluate immediately whenever the caller signals the underlying data
  // changed (refreshKey), and once on mount.
  useEffect(() => {
    evaluate().catch(() => setCard(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluate, refreshKey]);

  // Foreground re-evaluation (design.md's "evaluated when the app returns to
  // the foreground" product behaviour), debounced per Decision 6.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (Date.now() - lastEvaluatedAtRef.current < MIN_FOREGROUND_RE_EVALUATE_INTERVAL_MS) return;
      evaluate().catch(() => setCard(null));
    });
    return () => subscription.remove();
  }, [evaluate]);

  useEffect(() => {
    onSpotChange(card?.spot ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  if (!card) return null;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onTapSpot(card.spot)} activeOpacity={0.8}>
      <Text style={[textStyle('body'), styles.icon]}>🌿</Text>
      <Text style={[textStyle('small'), styles.text]} numberOfLines={2}>
        {card.text}
      </Text>
    </TouchableOpacity>
  );
}

// Visual weight check (tasks.md 5.5, against visual-design/spec.md's Success
// Criteria — "the map remains the primary visual element with UI chrome
// fading into the background"): one line of text, one small icon, muted
// warm-accent-on-cream palette (no saturated fill), no animation, fixed
// small height — never competes with the map underneath it.
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.card,
    borderRadius: 24,
    borderLeftWidth: 6,
    borderLeftColor: COLORS.warm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    flex: 1,
    color: COLORS.text,
  },
});
