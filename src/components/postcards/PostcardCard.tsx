import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import type { BuddyAppearance } from '../../buddy/buddyAppearance';
import { postcardWords, type PostcardEntry } from '../../postcards/postcards';
import type { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import { material } from '../../ui';
import { t } from '../../i18n';
import { PostcardBack } from './PostcardBack';
import { PostcardCompany } from './PostcardCompany';
import { PostcardMap } from './PostcardMap';
import { POSTCARD_ASPECT } from './PostcardThumb';

export type PostcardSide = 'front' | 'back';

/** Half a turn each way; the face is swapped while the card stands edge-on. */
export const FLIP_HALF_MS = 160;
/** A horizontal drag at least this long flips the card (a tap flips it too). */
const SWIPE_PX = 36;

interface PostcardCardProps {
  entry: PostcardEntry;
  width: number;
  /** Which face is up. Controlled, so the Android back button can turn the card too. */
  side: PostcardSide;
  onFlip: () => void;
  homeRangeRepository: HomeRangeRepository;
  dog: string;
  territoryName: string | null;
  /** The corner the walk ran through (its name replaces the territory on the postmark), or null. */
  cornerName?: string | null;
  favourite: boolean;
  /** Our dog's look: it stands on the front of the card with the neighbours met. Omitted = no dogs on the card. */
  buddyAppearance?: BuddyAppearance;
}

/**
 * One open postcard. A tracked card has two faces (the trail on the patchwork, the handwritten back) and turns over
 * with rotateY, never an opacity fade, because the front is a WebView. The WebView stays mounted under the back
 * while the back is up (no reload when it turns again); the back is just paper and text, covering it.
 * A handwritten card (a logged walk) is the writing side only and does not turn.
 */
export function PostcardCard({ entry, width, side, onFlip, homeRangeRepository, dog, territoryName, cornerName, favourite, buddyAppearance }: PostcardCardProps) {
  const height = Math.round(width * POSTCARD_ASPECT);
  const twoSided = entry.kind === 'tracked';
  const words = postcardWords(entry, { dog, territoryName, cornerName });

  // `shown` trails `side` by half a turn: the card turns edge-on, swaps faces, then turns the rest of the way.
  const [shown, setShown] = useState<PostcardSide>(twoSided ? side : 'back');
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!twoSided || side === shown) return;
    Animated.timing(turn, { toValue: 1, duration: FLIP_HALF_MS, useNativeDriver: true }).start();
    const swap = setTimeout(() => {
      setShown(side);
      turn.setValue(-1);
      Animated.timing(turn, { toValue: 0, duration: FLIP_HALF_MS, useNativeDriver: true }).start();
    }, FLIP_HALF_MS);
    return () => {
      clearTimeout(swap);
      turn.stopAnimation();
    };
    // `shown` is deliberately not a dependency: it changes inside the effect's own timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, twoSided]);

  const rotateY = turn.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-90deg', '0deg', '90deg'] });

  // Swipes flip; taps are the Pressable underneath. The parent only claims a clearly horizontal drag.
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) >= SWIPE_PX) onFlipRef.current();
      },
    })
  ).current;

  return (
    <View style={{ width, height }} {...(twoSided ? pan.panHandlers : {})}>
      <Animated.View style={[styles.card, { width, height }, { transform: [{ perspective: 900 }, { rotateY }] }]} testID="postcard-card">
        <View style={styles.face}>
          {twoSided && (
            <View style={styles.picture} testID="postcard-front">
              <PostcardMap walk={entry.walk} homeRangeRepository={homeRangeRepository} />
              {buddyAppearance && <PostcardCompany appearance={buddyAppearance} metIds={entry.facts.metNeighbours} cardWidth={width} />}
            </View>
          )}
          {shown === 'back' && (
            <View style={StyleSheet.absoluteFill}>
              <PostcardBack words={words} stamped={favourite} />
            </View>
          )}
        </View>
      </Animated.View>
      {twoSided && (
        <Pressable
          onPress={onFlip}
          accessibilityRole="button"
          accessibilityLabel={t('album.flipLabel')}
          style={StyleSheet.absoluteFill}
          testID="postcard-flip"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: material.yarn,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: material.chalk,
    borderRadius: 10,
    overflow: 'hidden',
  },
  face: { flex: 1, padding: 8 },
  picture: { flex: 1, borderRadius: 4, overflow: 'hidden', backgroundColor: material.linen },
});
