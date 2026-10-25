import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { artOr } from '../../art/artAssets';
import { stickDogOf } from '../../economy/sticks';
import type { InboxItem } from '../../inbox/inbox';
import { t } from '../../i18n';
import { DecorImage, PaperNote, TextLink, material, spacing, textStyle, tokens } from '../../ui';
import { PostcardThumb } from '../postcards/PostcardThumb';
import { Parcel } from './StickPile';

/** How long an item's unwrap beat runs before a tap pulls the next one (a tap during the beat skips it). */
export const UNWRAP_MS = 2000;

const FLAG_ORIGIN = { x: 88, y: 64 };
const FLAG_ARM_H = 30;

/**
 * The raised flag on the mailbox: the one and only cue that something is inside. A gentle wiggle, no number, no badge, the
 * same for one item or nine. Drawn over the mailbox art, whose own small flag is the hinge. Rendered only while raised.
 */
export function MailboxFlag({ boxRight, boxTop }: { boxRight: number; boxTop: number }) {
  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.delay(1800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [wiggle]);
  const rotate = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  return (
    <Animated.View
      testID="mailbox-flag"
      pointerEvents="none"
      style={[
        styles.flagArm,
        // The mailbox art is a 130 px box at `right: boxRight`; the hinge sits at FLAG_ORIGIN inside it.
        { right: boxRight + 130 - FLAG_ORIGIN.x - 2, top: boxTop + FLAG_ORIGIN.y - FLAG_ARM_H, transform: [{ rotate }] },
      ]}
    >
      <View style={styles.flagBanner} />
    </Animated.View>
  );
}

interface InboxUnwrapProps {
  item: InboxItem;
  /** Top of the touch area (below the status bar). */
  top: number;
  bottom: number;
  /** Words for a note. */
  noteText?: string;
  /** Tap after the beat: Buddy pulls the next one. */
  onAdvance: () => void;
  /** "Später": stop here; whatever is left stays in the box, silently. */
  onLater: () => void;
}

/**
 * One item out of the box, shown for a short unwrap beat (~2 s, tap to skip) before a tap pulls the next. Buddy's line comes
 * from the scene's speech bubble. Nothing here counts what is left.
 */
export function InboxUnwrap({ item, top, bottom, noteText, onAdvance, onLater }: InboxUnwrapProps) {
  const [settled, setSettled] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setSettled(false);
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
    const id = setTimeout(() => setSettled(true), UNWRAP_MS);
    return () => {
      clearTimeout(id);
      pop.stopAnimation();
    };
  }, [item.key, pop]);

  const press = () => {
    if (!settled) {
      pop.stopAnimation();
      pop.setValue(1);
      setSettled(true);
    } else onAdvance();
  };
  return (
    <View style={[styles.overlay, { top, bottom }]} pointerEvents="box-none" testID="inbox-unwrap">
      <Pressable style={StyleSheet.absoluteFill} onPress={press} accessibilityRole="button" accessibilityLabel={t('inbox.nextLabel')} testID="inbox-next" />
      <Animated.View pointerEvents="none" style={[styles.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
        <Treasure item={item} noteText={noteText} />
      </Animated.View>
      <View style={styles.later} pointerEvents="box-none">
        <TextLink label={t('inbox.later')} onPress={onLater} textStyleOverride={[textStyle('small'), { color: material.ink }]} />
      </View>
    </View>
  );
}

function Treasure({ item, noteText }: { item: InboxItem; noteText?: string }) {
  if (item.kind === 'postcard') return <PostcardThumb entry={item.entry} width={240} rotate={-4} />;
  if (item.kind === 'note') {
    return (
      <PaperNote style={styles.note}>
        <Text style={[textStyle('small'), styles.noteText]}>{noteText ?? item.text}</Text>
      </PaperNote>
    );
  }
  const dog = stickDogOf(item.gift);
  const art = dog ? artOr(`stick-${dog}`, null) : null;
  if (art) return <DecorImage source={art} resizeMode="contain" style={styles.stick} />;
  return dog ? <View style={styles.plainStick} /> : <Parcel />;
}

const styles = StyleSheet.create({
  flagArm: { position: 'absolute', width: 4, height: FLAG_ARM_H, borderRadius: 2, backgroundColor: material.woodDark, zIndex: 2, transformOrigin: 'bottom center' },
  flagBanner: { position: 'absolute', left: 3, top: 0, width: 18, height: 12, borderRadius: 3, backgroundColor: tokens.warm, borderWidth: 1, borderColor: material.woodDark },
  overlay: { position: 'absolute', left: 0, right: 0, zIndex: 5, alignItems: 'center', justifyContent: 'center' },
  card: { maxWidth: 260, alignItems: 'center', justifyContent: 'center' },
  note: { maxWidth: 260, transform: [{ rotate: '-2deg' }] },
  noteText: { color: material.ink },
  stick: { width: 140, height: 140 },
  plainStick: { width: 96, height: 18, borderRadius: 9, backgroundColor: material.woodLight, borderWidth: 2, borderColor: material.woodRim },
  later: { position: 'absolute', bottom: spacing.lg, alignSelf: 'center' },
});
