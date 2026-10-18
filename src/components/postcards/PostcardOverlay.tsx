import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useBackAction } from '../../app/backStack';
import { dogDisplayName } from '../../economy/denEconomy';
import { daypartPhrase, territoryNameForWalk, type PostcardEntry } from '../../postcards/postcards';
import type { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import type { TerritoryRepository } from '../../storage/TerritoryRepository';
import { Header, material, Screen, spacing, textStyle, TextLink } from '../../ui';
import { formatDate, t } from '../../i18n';
import { PostcardCard, type PostcardSide } from './PostcardCard';

interface PostcardOverlayProps {
  entry: PostcardEntry;
  favourite: boolean;
  dogName: string | null;
  homeRangeRepository: HomeRangeRepository;
  territoryRepository?: TerritoryRepository;
  onClose: () => void;
  /** The player took this card away (the walk record is deleted by the caller). */
  onRemove: (entry: PostcardEntry) => void;
}

const MAX_CARD_W = 440;

/**
 * One card, big, over the Album. Android back (and the iOS edge swipe) turn a flipped card face-up first, then close it.
 * Holds the only WebView of the Album, mounted while a tracked card is open.
 */
export function PostcardOverlay({ entry, favourite, dogName, homeRangeRepository, territoryRepository, onClose, onRemove }: PostcardOverlayProps) {
  const { width } = useWindowDimensions();
  const [side, setSide] = useState<PostcardSide>('front');
  const [territoryName, setTerritoryName] = useState<string | null>(null);
  const twoSided = entry.kind === 'tracked';

  useBackAction(true, () => {
    if (twoSided && side === 'back') setSide('front');
    else onClose();
    return true;
  });

  useEffect(() => {
    if (!twoSided) return;
    let alive = true;
    (async () => {
      const [cells, territories] = await Promise.all([homeRangeRepository.getCells(), territoryRepository ? territoryRepository.getTerritories() : Promise.resolve([])]);
      if (alive) setTerritoryName(territoryNameForWalk(entry.walk, cells, territories));
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [entry, twoSided, homeRangeRepository, territoryRepository]);

  const confirmRemove = () => {
    Alert.alert(t('history.deleteTitle'), t('history.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('history.delete'), style: 'destructive', onPress: () => onRemove(entry) },
    ]);
  };

  const title = entry.kind === 'tracked' ? daypartPhrase(entry.startTime) : formatDate(entry.startTime, { weekday: 'long' });
  return (
    <View style={StyleSheet.absoluteFill} testID="postcard-overlay">
      <Screen backdrop="linen">
        <Header title={title} icon="icon-walks" onBack={onClose} />
        <View style={styles.center}>
          <PostcardCard
            entry={entry}
            width={Math.min(width - 2 * spacing.lg, MAX_CARD_W)}
            side={side}
            onFlip={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
            homeRangeRepository={homeRangeRepository}
            dog={dogDisplayName(dogName)}
            territoryName={territoryName}
            favourite={favourite}
          />
          {twoSided && <Text style={[textStyle('hand'), styles.hint]}>{t('album.flipHint')}</Text>}
        </View>
        <View style={styles.footer}>
          <TextLink label={t('album.remove')} onPress={confirmRemove} style={styles.removeLink} textStyleOverride={[textStyle('small'), { color: material.muted }]} />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: material.muted, marginTop: spacing.lg },
  footer: { alignItems: 'center' },
  removeLink: { alignSelf: 'center' },
});
