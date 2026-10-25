import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { artOr } from '../art/artAssets';
import { t } from '../i18n';
import type { ShelfSlot } from '../sync/neighbourhood';
import { material, radii, spacing, textStyle } from '../ui';

interface StickShelfProps {
  slots: ShelfSlot[];
}

/**
 * The Stock-Regal: one slot per neighbour dog, each with that dog's own stick once Buddy has fetched one. Empty slots are soft
 * silhouettes. No counts, no "x of 6", nothing to catch up on; a second stick of the same dog changes nothing.
 */
export function StickShelf({ slots }: StickShelfProps) {
  return (
    <View style={styles.shelf} testID="stick-shelf">
      <Text style={[textStyle('small'), styles.hint]}>{t('neighbours.shelf.hint')}</Text>
      <View style={styles.grid}>
        {slots.map((slot) => {
          const art = artOr(`stick-${slot.id}`, null);
          return (
            <View
              key={slot.id}
              style={styles.slot}
              accessible
              accessibilityLabel={slot.collected ? t('neighbours.shelf.slotLabel', { bot: slot.name }) : t('neighbours.shelf.emptyLabel')}
              testID={slot.collected ? 'stick-slot-full' : 'stick-slot-empty'}
            >
              <View style={styles.board}>
                {art ? (
                  <Image
                    source={art}
                    resizeMode="contain"
                    style={[styles.sprite, !slot.collected && styles.silhouette]}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                ) : null}
              </View>
              <Text style={[textStyle('hand'), styles.name]} numberOfLines={1}>
                {slot.collected ? slot.name : ' '}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: {
    backgroundColor: material.yarn,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: material.chalk,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  hint: { color: material.muted, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  slot: { width: '31%', alignItems: 'center' },
  // The "shelf board" each stick lies on: a wooden strip along the bottom of the slot.
  board: { width: '100%', aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5, borderBottomColor: material.woodRim },
  sprite: { width: '100%', height: '100%' },
  silhouette: { tintColor: material.woodDark, opacity: 0.16 },
  name: { color: material.ink, marginTop: spacing.xs },
});
