import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { normalizeAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import type { NearbyItem } from '../../sync/apiContract';
import { material, PaperNote, spacing, textStyle, WoodSign } from '../../ui';
import { BuddyAvatar } from '../buddy/BuddyAvatar';

export interface NeighbourCardProps {
  item: NearbyItem;
  /** The last two worded lines about this dog (newest first), already translated. */
  lines: string[];
  onClose: () => void;
}

const AVATAR_SIZE = 150;

/**
 * Profile sheet of a Nachbarhund (slice M3): the dog drawn with the same Buddy renderer from its look, its name, one
 * trait line, the small "Nachbarhund · simuliert" badge (the only place bots are labelled) and the last two things
 * it did. Deliberately no counts, no "met" numbers, nothing to compare. A modal over whichever screen opened it.
 */
export function NeighbourCard({ item, lines, onClose }: NeighbourCardProps) {
  const trait = t(item.traitKey);
  const hasTrait = trait !== item.traitKey;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('neighbours.card.close')} />
        <PaperNote style={styles.card} testID="neighbour-card">
          <View style={styles.avatar} accessibilityLabel={t('neighbours.card.label', { dog: item.dogName })} accessible>
            <BuddyAvatar appearance={normalizeAppearance(item.appearance)} size={AVATAR_SIZE} name={item.dogName} />
          </View>
          <Text style={[textStyle('signBig'), styles.name]} accessibilityRole="header">
            {item.dogName}
          </Text>
          {hasTrait && <Text style={[textStyle('body'), styles.trait]}>{trait}</Text>}
          <View style={styles.badge}>
            <WoodSign size="small" textStyleOverride={styles.badgeText} accessibilityLabel={t('neighbours.badge')}>
              {t('neighbours.badge')}
            </WoodSign>
          </View>
          {lines.length > 0 && (
            <View style={styles.lines}>
              {lines.map((line, i) => (
                <Text key={i} style={[textStyle('small'), styles.line]}>
                  {line}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.close}>
            <WoodSign size="medium" onPress={onClose} accessibilityLabel={t('neighbours.card.close')}>
              {t('neighbours.card.close')}
            </WoodSign>
          </View>
        </PaperNote>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(26, 42, 26, 0.4)' },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  avatar: { height: AVATAR_SIZE, width: AVATAR_SIZE },
  name: { color: material.ink, textAlign: 'center' },
  trait: { color: material.ink, textAlign: 'center' },
  badge: { marginTop: spacing.xs },
  badgeText: { fontSize: 14, lineHeight: 18 },
  lines: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.sm },
  line: { color: material.muted, textAlign: 'center' },
  close: { marginTop: spacing.md },
});
