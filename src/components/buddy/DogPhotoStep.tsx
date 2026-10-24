// The optional first step of the look picker: pick 1-5 photos of the dog (camera or gallery), agree once to the
// upload, wait calmly while the server reads the look. Every dead end is friendly ("pick the look yourself"), never
// an error tone. The preview Buddy above (owned by the picker) sniffs while `onAnalyzing(true)`.
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { DOG_PHOTO_MAX_PHOTOS, DogPhotoPort, DogPhotoResult } from '../../dogPhoto/dogPhoto';
import type { BuddyAppearance } from '../../buddy/buddyAppearance';
import { material, PressableScale, radii, spacing, TextLink, textStyle, WoodSign } from '../../ui';
import { t } from '../../i18n';

type Phase = 'pick' | 'consent' | 'analyzing' | 'sorry';

export interface DogPhotoStepProps {
  name: string;
  port: DogPhotoPort;
  onResult: (appearance: BuddyAppearance) => void;
  /** The player wants to choose the look by hand (or the photo path ended without a look). */
  onManual: () => void;
  onAnalyzing: (analyzing: boolean) => void;
}

export function DogPhotoStep({ name, port, onResult, onManual, onAnalyzing }: DogPhotoStepProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [sorry, setSorry] = useState<'failed' | 'limit'>('failed');

  const add = async (source: 'camera' | 'library') => {
    const room = DOG_PHOTO_MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const picked = await port.pick(source, room);
    if (picked.length > 0) setPhotos((prev) => [...prev, ...picked].slice(0, DOG_PHOTO_MAX_PHOTOS));
  };

  const analyze = async () => {
    setPhase('analyzing');
    onAnalyzing(true);
    let result: DogPhotoResult;
    try {
      result = await port.analyze(photos);
    } catch {
      result = { kind: 'failed' };
    }
    onAnalyzing(false);
    if (result.kind === 'ok') {
      setPhotos([]); // the photos leave memory as soon as they are used
      onResult(result.appearance);
      return;
    }
    setPhotos([]);
    setSorry(result.kind === 'limit' ? 'limit' : 'failed');
    setPhase('sorry');
  };

  const start = async () => {
    if (photos.length === 0) return;
    if (await port.hasConsent()) await analyze();
    else setPhase('consent');
  };

  const agree = async () => {
    await port.giveConsent();
    await analyze();
  };

  if (phase === 'consent') {
    return (
      <View style={styles.box}>
        <Text style={[textStyle('body'), styles.text]}>{t('buddy.photo.consent')}</Text>
        <WoodSign size="wide" onPress={agree} style={styles.primary}>
          {t('buddy.photo.consentOk')}
        </WoodSign>
        <TextLink label={t('buddy.photo.consentNo')} onPress={() => setPhase('pick')} />
      </View>
    );
  }
  if (phase === 'analyzing') {
    return (
      <View style={styles.box}>
        <Text style={[textStyle('sign'), styles.text]}>{t('buddy.photo.sniffing', { name })}</Text>
      </View>
    );
  }
  if (phase === 'sorry') {
    return (
      <View style={styles.box}>
        <Text style={[textStyle('sign'), styles.text]}>{t(sorry === 'limit' ? 'buddy.photo.limit' : 'buddy.photo.failed')}</Text>
        <WoodSign size="wide" onPress={onManual} style={styles.primary}>
          {t('buddy.photo.continue')}
        </WoodSign>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Text style={[textStyle('sign'), styles.text]}>{t('buddy.photo.intro', { name })}</Text>
      {photos.length > 0 && (
        <>
          <View style={styles.thumbs}>
            {photos.map((data, i) => (
              <PressableScale
                key={i}
                accessibilityLabel={t('buddy.photo.remove')}
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              >
                <Image source={{ uri: `data:image/jpeg;base64,${data}` }} style={styles.thumb} />
              </PressableScale>
            ))}
          </View>
          <Text style={[textStyle('body'), styles.text]}>
            {t('buddy.photo.count', { count: photos.length, max: DOG_PHOTO_MAX_PHOTOS })}
          </Text>
        </>
      )}
      {photos.length < DOG_PHOTO_MAX_PHOTOS && (
        <View style={styles.row}>
          <PressableScale onPress={() => void add('camera')} accessibilityLabel={t('buddy.photo.camera')} style={styles.chip}>
            <Text style={[textStyle('body'), styles.chipText]}>{t('buddy.photo.camera')}</Text>
          </PressableScale>
          <PressableScale onPress={() => void add('library')} accessibilityLabel={t('buddy.photo.gallery')} style={styles.chip}>
            <Text style={[textStyle('body'), styles.chipText]}>{t('buddy.photo.gallery')}</Text>
          </PressableScale>
        </View>
      )}
      {photos.length > 0 && (
        <WoodSign size="wide" onPress={() => void start()} style={styles.primary}>
          {t('buddy.photo.go')}
        </WoodSign>
      )}
      <TextLink label={t('buddy.photo.manual')} onPress={onManual} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  text: { color: material.ink, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: material.woodRim },
  chip: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: material.woodRim,
    backgroundColor: material.yarn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: material.ink },
  primary: { marginTop: spacing.md, minWidth: 200 },
});
