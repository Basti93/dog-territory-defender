import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { BuddyAppearance } from '../../buddy/buddyAppearance';
import { neighboursOnCard, neighbourPortrait, ourDogPortrait } from '../../postcards/company';
import { BuddyAvatar } from '../buddy';

/**
 * The dogs standing at the bottom edge of a postcard's picture: the neighbours met on the walk (up to two, turned to
 * face our dog) on the left, our dog on the right looking back at them. No neighbours: our dog alone in the corner.
 * Pure decoration, never takes touches (the card flips underneath).
 */
export function PostcardCompany({ appearance, metIds, cardWidth }: { appearance: BuddyAppearance; metIds: readonly string[]; cardWidth: number }) {
  const dog = Math.round(cardWidth * 0.24);
  const neighbours = neighboursOnCard(metIds);
  const portrait = ourDogPortrait();
  return (
    <View style={styles.row} pointerEvents="none" testID="postcard-company">
      <View style={styles.neighbours}>
        {neighbours.map((n) => {
          const source = neighbourPortrait(n.id, n.pose);
          return source ? (
            <Image key={n.id} source={source} style={{ width: dog, height: dog, marginRight: -dog * 0.2, transform: [{ scaleX: -1 }] }} resizeMode="contain" testID={`postcard-neighbour-${n.id}`} />
          ) : null;
        })}
      </View>
      {portrait ? (
        <Image source={portrait} style={{ width: dog, height: dog }} resizeMode="contain" testID="postcard-our-dog" />
      ) : (
        <View testID="postcard-our-dog">
          <BuddyAvatar appearance={appearance} size={dog} facing="left" mood="idle" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 6, right: 6, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  neighbours: { flexDirection: 'row', alignItems: 'flex-end' },
});
