import React from 'react';
import { StyleSheet, View } from 'react-native';

import { BENCH_CARD_COUNT, benchCards, type PostcardEntry } from '../../postcards/postcards';
import { PostcardThumb } from './PostcardThumb';

// The newest postcards fanned on the bench in the yard. Decoration only: no text, no counter, and the touch goes to the
// Album press area the scene already lays over the bench (these cards never take a touch themselves).

/** Left, top (px in the 140 x 140 bench box) and tilt of each card, oldest of the shown cards first; the newest lies on top. */
const FAN: ReadonlyArray<{ left: number; top: number; rotate: number }> = [
  { left: 20, top: 52, rotate: -11 },
  { left: 45, top: 47, rotate: 2 },
  { left: 70, top: 51, rotate: 10 },
];
const CARD_W = 46;

interface BenchPostcardsProps {
  /** Every postcard, newest first; only the newest few are drawn. */
  cards: readonly PostcardEntry[];
  favouriteId: string | null;
}

// memo: the scene re-renders often (animations, bowl), the cards only change when the loaded list does.
export const BenchPostcards = React.memo(function BenchPostcards({ cards, favouriteId }: BenchPostcardsProps) {
  const shown = benchCards(cards);
  if (shown.length === 0) return null;
  // Oldest first, so the newest is painted last (on top); with fewer than three the cards fill the fan's right-hand slots.
  const ordered = [...shown].reverse();
  const slots = FAN.slice(BENCH_CARD_COUNT - ordered.length);
  return (
    <View pointerEvents="none" style={styles.box} testID="bench-postcards" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {ordered.map((entry, i) => (
        <View key={entry.id} style={[styles.slot, { left: slots[i].left, top: slots[i].top }]}>
          <PostcardThumb entry={entry} width={CARD_W} rotate={slots[i].rotate} favourite={entry.id === favouriteId} testID={`bench-postcard-${entry.id}`} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 6, top: 0, width: 140, height: 140 },
  slot: { position: 'absolute' },
});
