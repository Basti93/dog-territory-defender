import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { daypartPhrase, type PostcardEntry } from '../postcards/postcards';
import { usePostcards } from '../postcards/usePostcards';
import type { CornerRepository } from '../storage/CornerRepository';
import type { HomeRangeRepository } from '../storage/HomeRangeRepository';
import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import { EmptyState, Header, material, Screen, spacing, textStyle } from '../ui';
import { formatDate, t } from '../i18n';
import { useNeighbourhood } from '../sync/useNeighbourhood';
import { log } from '../utils/log';
import { BuddyLoading } from './BuddyLoading';
import { BuddyAvatar } from './buddy';
import { PostcardOverlay } from './postcards/PostcardOverlay';
import { PostcardThumb } from './postcards/PostcardThumb';
import { StickShelf } from './StickShelf';

interface AlbumScreenProps {
  buddyAppearance: BuddyAppearance;
  walkRepository: WalkRepository;
  homeRangeRepository: HomeRangeRepository;
  territoryRepository?: TerritoryRepository;
  /** Postmarks use a named corner's name when the walk ran through one. */
  cornerRepository?: CornerRepository;
  dogName: string | null;
  onClose: () => void;
  /** A card was taken away, i.e. its walk deleted locally. App.tsx uses it to tell the household (`walk.delete`); the Range keeps the ground either way. */
  onWalkDeleted?: (walkId: string) => void;
}

const COLUMNS = 2;
const GAP = spacing.lg;

/** A small fixed tilt per card (-2 to 2 degrees), the same every time for the same walk. */
function tiltFor(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ((hash % 5) - 2) * 0.9;
}

/**
 * The Album (what the bench opens): every postcard, newest first, in a calm grid. Tap a card to open it; it turns over
 * by tap or swipe. No counts, no comparisons, nothing to catch up on.
 */
export function AlbumScreen({ buddyAppearance, walkRepository, homeRangeRepository, territoryRepository, cornerRepository, dogName, onClose, onWalkDeleted }: AlbumScreenProps) {
  const { cards, loaded, favouriteId, forget } = usePostcards({ walkRepository, territoryRepository });
  const [openId, setOpenId] = useState<string | null>(null);
  // The Stock-Regal sits above the cards. It only appears once there are neighbour dogs (or a stick already hangs on it).
  const hood = useNeighbourhood(undefined);
  const shelf = hood.nearby.length > 0 || hood.shelf.some((s) => s.collected) ? <StickShelf slots={hood.shelf} /> : null;
  const { width } = useWindowDimensions();
  const thumbW = Math.floor((width - 2 * spacing.lg - GAP * (COLUMNS - 1)) / COLUMNS);
  const open = openId ? cards.find((c) => c.id === openId) ?? null : null;

  const remove = async (entry: PostcardEntry) => {
    try {
      await walkRepository.deleteWalk(entry.id);
    } catch (err) {
      // The card stays (nothing was deleted); no error tone, the player can simply try again.
      log('ALBUM_DELETE_ERROR', { error: String(err) });
      return;
    }
    onWalkDeleted?.(entry.id);
    setOpenId(null);
    forget(entry.id);
  };

  return (
    <View style={styles.root}>
      <Screen backdrop="linen">
        <Header title={t('album.title')} icon="icon-walks" onBack={onClose} />
        {!loaded ? (
          <BuddyLoading appearance={buddyAppearance} text={t('common.loading')} />
        ) : cards.length === 0 ? (
          <>
            {shelf}
            <EmptyState title={t('album.empty.title')} message={t('album.empty.message')}>
              <BuddyAvatar appearance={buddyAppearance} size={120} mood="idle" />
            </EmptyState>
          </>
        ) : (
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            numColumns={COLUMNS}
            ListHeaderComponent={shelf}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            windowSize={5}
            renderItem={({ item }) => {
              const when = item.kind === 'tracked' ? daypartPhrase(item.startTime) : formatDate(item.startTime, { weekday: 'long' });
              return (
                <Pressable
                  onPress={() => setOpenId(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('album.cardLabel', { when })}
                  style={[styles.cell, { width: thumbW }]}
                >
                  <PostcardThumb entry={item} width={thumbW} rotate={tiltFor(item.id)} favourite={item.id === favouriteId} testID="album-card" />
                  <Text style={[textStyle('hand'), styles.caption]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {formatDate(item.startTime, { day: 'numeric', month: 'short' })}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </Screen>
      {open && (
        <PostcardOverlay
          key={open.id}
          entry={open}
          favourite={open.id === favouriteId}
          dogName={dogName}
          buddyAppearance={buddyAppearance}
          homeRangeRepository={homeRangeRepository}
          territoryRepository={territoryRepository}
          cornerRepository={cornerRepository}
          onClose={() => setOpenId(null)}
          onRemove={remove}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { gap: GAP, marginBottom: spacing.lg },
  cell: { alignItems: 'center' },
  caption: { color: material.muted, marginTop: spacing.xs },
});
