import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import type { ApiGift } from '../sync/apiContract';
import { giftThing } from '../sync/neighbourhood';
import { material, PaperRow, PaperSection, spacing, textStyle, WoodSign } from '../ui';

interface GiftsSectionProps {
  /** Parcels still wrapped, newest first. */
  gifts: ApiGift[];
  /** The gentle line after the last open (kept on the sheet until the screen closes). */
  line: string | null;
  onOpen: (gift: ApiGift) => Promise<void>;
  first?: boolean;
}

/**
 * "Geschenke" at the top of the Post list (slice M3): each parcel a neighbour dog left, with an "Öffnen" sign. Cosmetics
 * are only named for now (no art yet). Nothing counts, nothing expires, no reminder: a parcel just waits.
 */
export function GiftsSection({ gifts, line, onOpen, first }: GiftsSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (gifts.length === 0 && !line) return null;
  const open = async (gift: ApiGift) => {
    if (busyId) return;
    setBusyId(gift.id);
    try {
      await onOpen(gift);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <PaperSection title={t('neighbours.gift.title')} first={first}>
      {line && (
        <View style={styles.line}>
          <Text style={[textStyle('body'), styles.lineText]}>{line}</Text>
        </View>
      )}
      {gifts.map((gift) => {
        const thing = giftThing(gift);
        return (
          <PaperRow
            key={gift.id}
            title={thing}
            subtitle={t('neighbours.gift.from', { bot: gift.botName })}
            right={
              <WoodSign
                size="small"
                disabled={busyId !== null}
                onPress={() => void open(gift)}
                accessibilityLabel={t('neighbours.gift.openLabel', { bot: gift.botName, thing })}
              >
                {t('neighbours.gift.open')}
              </WoodSign>
            }
          />
        );
      })}
    </PaperSection>
  );
}

const styles = StyleSheet.create({
  line: { paddingVertical: spacing.xs },
  lineText: { color: material.inkGreen },
});
