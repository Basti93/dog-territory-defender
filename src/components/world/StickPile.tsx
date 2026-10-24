import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { artOr } from '../../art/artAssets';
import { stickDogOf } from '../../economy/sticks';
import type { ApiGift } from '../../sync/apiContract';
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
  /** Waiting gifts, newest first; the first one is what a tap fetches. At most three are drawn. */
  gifts: ApiGift[];
  left: number;
  top: number;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * What the neighbour dogs left in the Hof: each waiting stick lies there with that dog's own look (a small pile of up to
 * three), any other gift as a little wrapped parcel. One tap on the pile sends Buddy to fetch the front one. Nothing counts
 * or expires. Hidden entirely by the caller when nothing waits.
 */
export function StickPile({ gifts, left, top, accessibilityLabel, onPress }: StickPileProps) {
  const shown = gifts.slice(0, SHOWN);
  return (
    <Pressable
      testID="stick-pile"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.pile, { left, top, width: PILE_W, height: PILE_H }]}
    >
      {/* Drawn back to front so the newest (index 0) lies on top. */}
      {shown
        .map((gift, i) => ({ gift, slot: SLOTS[i] }))
        .reverse()
        .map(({ gift, slot }) => {
          const dog = stickDogOf(gift);
          const art = dog ? artOr(`stick-${dog}`, null) : null;
          return (
            <View key={gift.id} pointerEvents="none" style={[styles.item, { left: slot.x, top: slot.y, transform: [{ rotate: `${slot.rot}deg` }] }]}>
              {art ? <DecorImage source={art} resizeMode="contain" style={styles.sprite} /> : dog ? <View style={styles.plainStick} /> : <Parcel />}
            </View>
          );
        })}
    </Pressable>
  );
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
