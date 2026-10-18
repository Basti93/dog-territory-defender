import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyImageSources } from '../../buddy/imageSkinSources';
import { CORNER_CONFIG } from '../../economy/corners';
import { t, useLocale } from '../../i18n';
import { buildPostcards, type PostcardEntry } from '../../postcards/postcards';
import type { CornerRepository, StoredCorner } from '../../storage/CornerRepository';
import type { WalkRepository } from '../../storage/WalkRepository';
import { material, PaperNote, spacing, textStyle, WoodSign } from '../../ui';
import { cornersTouchedBy } from '../../utils/cornerDetection';
import { cleanCornerName, cornerDisplayName } from '../../utils/cornerName';
import { BuddyAvatar } from '../buddy/BuddyAvatar';
import { PostcardThumb } from '../postcards/PostcardThumb';

/** How many postcards from the corner the sheet shows (the newest). */
export const CORNER_SHEET_CARDS = 3;
const POSE_SIZE = 130;
const THUMB_W = 84;

/** What a screen needs to show corners and let the player name them: the store, the rename (local + household) and who wrote a name. */
export interface CornerTools {
  repository: CornerRepository;
  /** Saves the name on this phone and queues it for the household (last writer wins). */
  rename: (cornerId: string, name: string) => Promise<void> | void;
  /** The display name of the member who wrote a name when that is another member; null for the own name or an unknown writer. */
  namedByOther: (playerId: string | null) => Promise<string | null>;
}

export interface CornerSheetProps {
  cornerId: string;
  cornerRepository: CornerRepository;
  walkRepository: WalkRepository;
  buddyAppearance: BuddyAppearance;
  /** Saves the name on this phone and queues it for the household (last writer wins). */
  onRename: (cornerId: string, name: string) => Promise<void> | void;
  /** The display name of the member who wrote the current name when that is another member; null for the own name or an unknown writer. */
  namedByOther: (playerId: string | null) => Promise<string | null>;
  /** `changed`: a name was saved, so the signs should be read again. */
  onClose: (changed: boolean) => void;
}

/**
 * The sheet behind a corner sign ("Unsere Ecken", konzept section 3): the corner's name to change, Buddy resting on
 * the spot, and the postcards of the walks that ran through it. One paper note over whatever screen opened it.
 * Warm and quiet: no counters, nothing about who named more corners; "Name von Alex" only when the other member wrote the name.
 */
export function CornerSheet({ cornerId, cornerRepository, walkRepository, buddyAppearance, onRename, namedByOther, onClose }: CornerSheetProps) {
  useLocale();
  const [corner, setCorner] = useState<StoredCorner | null>(null);
  const [cards, setCards] = useState<PostcardEntry[]>([]);
  const [namer, setNamer] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  // Android does not lift a centred Modal above the keyboard (iOS does, via the padding behaviour): with the keyboard up
  // the Buddy pose and the postcards step aside so the field and the buttons keep their place on a short screen.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const found = (await cornerRepository.getCorners()).find((c) => c.id === cornerId) ?? null;
      if (!alive) return;
      setCorner(found);
      setDraft(found?.name ?? '');
      if (found?.nameBy) {
        const other = await namedByOther(found.nameBy);
        if (alive) setNamer(other);
      }
      if (!found) return;
      const walks = (await walkRepository.getWalks()).filter((w) => cornersTouchedBy(w, [found]).length > 0);
      if (alive) setCards(buildPostcards(walks, []).filter((c) => c.kind === 'tracked').slice(0, CORNER_SHEET_CARDS));
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cornerId, cornerRepository, walkRepository, namedByOther]);

  const title = corner ? cornerDisplayName(corner) : t('corner.name.fallback');
  const cleaned = cleanCornerName(draft);
  const canSave = cleaned !== null && cleaned !== (corner?.name ?? null);
  const lyingSource = useMemo(() => buddyImageSources(buddyAppearance).poseLying as ImageSourcePropType | undefined, [buddyAppearance]);

  const save = async () => {
    if (!cleaned || !canSave) return;
    try {
      await onRename(cornerId, cleaned);
    } catch {
      return; // the name could not be kept on this phone: the sheet stays open and the player can try again
    }
    setSaved(true);
    onClose(true);
  };
  const close = () => onClose(saved);

  return (
    <Modal transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('corner.sheet.close')} />
        <PaperNote style={styles.card} testID="corner-sheet">
          {!keyboardUp && (
            <View style={styles.pose} accessibilityLabel={t('corner.sheet.label', { name: title })} accessible>
              {lyingSource ? (
                <Image source={lyingSource} resizeMode="contain" style={styles.poseImage} testID="corner-sheet-pose" />
              ) : (
                <BuddyAvatar appearance={buddyAppearance} size={POSE_SIZE} mood="idle" />
              )}
            </View>
          )}
          <Text style={[textStyle('signBig'), styles.title]} accessibilityRole="header" testID="corner-sheet-title">
            {title}
          </Text>
          {namer && <Text style={[textStyle('hand'), styles.namer]}>{t('corner.sheet.namedBy', { member: namer })}</Text>}
          <TextInput
            style={[textStyle('body'), styles.input]}
            value={draft}
            onChangeText={setDraft}
            placeholder={title}
            placeholderTextColor={material.muted}
            maxLength={CORNER_CONFIG.nameMaxLength}
            accessibilityLabel={t('corner.sheet.nameLabel')}
            returnKeyType="done"
            onSubmitEditing={save}
            testID="corner-sheet-input"
          />
          {cards.length > 0 && !keyboardUp && (
            <View style={styles.cards}>
              <Text style={[textStyle('small'), styles.cardsLabel]}>{t('corner.sheet.postcards')}</Text>
              <View style={styles.cardRow}>
                {cards.map((entry, i) => (
                  <PostcardThumb key={entry.id} entry={entry} width={THUMB_W} rotate={(i - 1) * 3} testID="corner-sheet-card" />
                ))}
              </View>
            </View>
          )}
          <View style={styles.actions}>
            <WoodSign size="medium" onPress={save} disabled={!canSave} accessibilityLabel={t('corner.sheet.save')} testID="corner-sheet-save">
              {t('corner.sheet.save')}
            </WoodSign>
            <WoodSign size="medium" onPress={close} accessibilityLabel={t('corner.sheet.close')} testID="corner-sheet-close">
              {t('corner.sheet.close')}
            </WoodSign>
          </View>
        </PaperNote>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(26, 42, 26, 0.4)' },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  pose: { height: POSE_SIZE, width: POSE_SIZE + 40 },
  poseImage: { width: '100%', height: '100%' },
  title: { color: material.ink, textAlign: 'center' },
  namer: { color: material.muted, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    textAlign: 'center',
    color: material.ink,
    borderBottomWidth: 2,
    borderBottomColor: material.woodRim,
    paddingVertical: 6,
    minHeight: 44,
    flexShrink: 0, // with the keyboard up the window is shorter; the field must not be squeezed to nothing
    lineHeight: undefined, // a fixed lineHeight clips text inside a TextInput
  },
  cards: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  cardsLabel: { color: material.muted },
  cardRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
