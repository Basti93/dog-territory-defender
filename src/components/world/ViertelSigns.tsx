import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '../../i18n';
import { WoodSign, material, textStyle } from '../../ui';
import { TERRITORY_TITLE_KEYS } from '../TerritoryCard';
import type { ViertelChromeData } from './useViertelChrome';

interface ViertelSignsProps {
  chrome: ViertelChromeData;
  /** Omitted = no "Reviere ›" sign. */
  onOpenTerritories?: () => void;
  /** Keeps the numbers sign this far above the bottom edge (the embedded band's hidden overscan). */
  bottomInset?: number;
}

/**
 * The Viertel's signs over the patchwork map (mockups/02-viertel.html): territory name + character title on a tilted
 * wood sign top left, "Reviere ›" top right, the household's own numbers on a paper sign at the bottom.
 * Overlay only: the container lets every touch through except the signs themselves. Hidden until the data has loaded.
 */
export function ViertelSigns({ chrome, onOpenTerritories, bottomInset = 0 }: ViertelSignsProps) {
  if (!chrome.loaded) return null;
  const { territory, statsParts } = chrome;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {territory && (
        <View pointerEvents="none" testID="viertel-territory-sign" style={styles.nameSign}>
          <WoodSign size="small" rotate={-2} accessibilityLabel={territory.title ? `${territory.name}, ${t(TERRITORY_TITLE_KEYS[territory.title])}` : territory.name} style={styles.nameFace}>
            <Text numberOfLines={1} style={[textStyle('sign'), styles.name]}>{territory.name}</Text>
            {territory.title && <Text style={[textStyle('min'), styles.title]}>{t(TERRITORY_TITLE_KEYS[territory.title])}</Text>}
          </WoodSign>
        </View>
      )}
      {onOpenTerritories && (
        <View pointerEvents="box-none" style={styles.territoriesSign}>
          <WoodSign size="small" onPress={onOpenTerritories} accessibilityLabel={t('viertel.territoriesLabel')} style={styles.paperFace} textStyleOverride={styles.smallText}>
            {t('viertel.territories')}
          </WoodSign>
        </View>
      )}
      {statsParts.length > 0 && (
        <View pointerEvents="none" testID="viertel-stats-sign" style={[styles.statsSign, { bottom: styles.statsSign.bottom + bottomInset }]}>
          <WoodSign size="small" accessibilityLabel={t('viertel.statsLabel', { stats: statsParts.join(', ') })} style={[styles.paperFace, styles.statsFace]}>
            <View style={styles.statsRow}>
              {statsParts.map((part) => (
                <Text key={part} style={[textStyle('small'), styles.statText]}>{part}</Text>
              ))}
            </View>
          </WoodSign>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  nameSign: { position: 'absolute', left: 12, top: 12, maxWidth: '62%', alignItems: 'flex-start' },
  nameFace: { paddingHorizontal: 12, paddingVertical: 5 },
  name: { fontSize: 20, lineHeight: 22, color: material.ink },
  title: { fontSize: 12, lineHeight: 14, color: material.ink, textAlign: 'center' },
  territoriesSign: { position: 'absolute', right: 12, top: 16 },
  paperFace: { backgroundColor: material.yarn },
  smallText: { fontSize: 14, lineHeight: 18 },
  statsSign: { position: 'absolute', left: 12, bottom: 14, alignItems: 'flex-start' },
  statsFace: { paddingVertical: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, justifyContent: 'center' },
  statText: { color: material.ink },
});
