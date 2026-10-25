import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { artOr } from '../../art/artAssets';
import type { StickDogId } from '../../economy/sticks';
import { DecorImage, material, mix, tokens } from '../../ui';

export const PILE_W = 96;
export const PILE_H = 78;
const SPRITE = 72;
const SHOWN = 3;
/** Back-to-front pile layout: [front, middle, back] offsets in px and a small tilt each. */
const SLOTS = [
  { x: 14, y: 12, rot: -6 },
  { x: -2, y: 4, rot: 7 },
  { x: 22, y: -2, rot: -2 },
] as const;

interface StickPileProps {
  /** Dogs whose stick hangs on the shelf, most recent first; the first three are drawn. None = one plain stick. */
  dogs: readonly StickDogId[];
  left: number;
  top: number;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * The stick pile in the Hof: a few of the shelf's sticks lying by the doormat (each dog's own look). It is the one entry
 * to the Stock-Regal. Gifts never lie here any more: they arrive in the mailbox and Buddy carries them over.
 */
export function StickPile({ dogs, left, top, accessibilityLabel, onPress }: StickPileProps) {
  const shown = dogs.slice(0, SHOWN);
  return (
    <Pressable
      testID="stick-pile"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.pile, { left, top, width: PILE_W, height: PILE_H }]}
    >
      {shown.length === 0 ? (
        <View pointerEvents="none" style={[styles.item, { left: SLOTS[0].x, top: SLOTS[0].y, transform: [{ rotate: `${SLOTS[0].rot}deg` }] }]}>
          <View style={styles.plainStick} />
        </View>
      ) : (
        // Drawn back to front so the first (most recent) lies on top.
        shown
          .map((dog, i) => ({ dog, slot: SLOTS[i] }))
          .reverse()
          .map(({ dog, slot }) => {
            const art = artOr(`stick-${dog}`, null);
            return (
              <View key={dog} pointerEvents="none" style={[styles.item, { left: slot.x, top: slot.y, transform: [{ rotate: `${slot.rot}deg` }] }]}>
                {art ? <DecorImage source={art} resizeMode="contain" style={styles.sprite} /> : <View style={styles.plainStick} />}
              </View>
            );
          })
      )}
    </Pressable>
  );
}

/** A small wrapped parcel drawn with Views (no art yet): kraft box, cream ribbon, a little bow. */
export function Parcel() {
  return (
    <View style={styles.parcel}>
      <View style={styles.parcelRibbonV} />
      <View style={styles.parcelRibbonH} />
      <View style={styles.parcelBow} />
    </View>
  );
}

const styles = StyleSheet.create({
  pile: { position: 'absolute', zIndex: 1 },
  item: { position: 'absolute', width: SPRITE, height: SPRITE, alignItems: 'center', justifyContent: 'center' },
  sprite: { width: SPRITE, height: SPRITE },
  plainStick: { width: 56, height: 12, borderRadius: 6, backgroundColor: material.woodLight, borderWidth: 2, borderColor: material.woodRim },
  parcel: { width: 48, height: 38, borderRadius: 6, backgroundColor: mix(material.woodLight, material.pathBrown, 0.5), borderWidth: 2, borderColor: material.woodRim, borderBottomWidth: 4, borderBottomColor: material.woodDark, alignItems: 'center', justifyContent: 'center' },
  parcelRibbonV: { position: 'absolute', top: 0, bottom: 0, width: 8, backgroundColor: material.yarn },
  parcelRibbonH: { position: 'absolute', left: 0, right: 0, height: 7, backgroundColor: material.yarn },
  parcelBow: { position: 'absolute', top: -7, width: 16, height: 9, borderRadius: 6, backgroundColor: tokens.warm, borderWidth: 1, borderColor: material.woodDark },
});
