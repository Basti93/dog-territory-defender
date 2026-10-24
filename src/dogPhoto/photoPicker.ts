// Native side of the dog photo step: camera or gallery (expo-image-picker), then every photo is resized to
// DOG_PHOTO_MAX_SIDE and re-encoded as JPEG (expo-image-manipulator). The re-encode drops EXIF (GPS, time).
// Photos are only ever held as base64 strings in memory; nothing is written to our storage.
// Needs the 0.3.0 dev-client build (native modules); the pure parts live in dogPhoto.ts.
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { log } from '../utils/log';
import { DOG_PHOTO_JPEG_QUALITY, fitWithin } from './dogPhoto';

async function toUploadJpeg(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  const { width, height } = fitWithin(asset.width, asset.height);
  const result = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width, height } }], {
    compress: DOG_PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return result.base64 ?? null;
}

/** Resized base64 JPEGs. [] when cancelled, permission is denied or nothing could be read (never throws). */
export async function pickDogPhotos(source: 'camera' | 'library', remaining: number): Promise<string[]> {
  try {
    let picked: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return [];
      picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    } else {
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 1,
      });
    }
    if (picked.canceled) return [];
    const photos: string[] = [];
    for (const asset of picked.assets.slice(0, remaining)) {
      const base64 = await toUploadJpeg(asset);
      if (base64) photos.push(base64);
    }
    return photos;
  } catch (err) {
    log('DOG_PHOTO_PICK_ERROR', { error: String(err) });
    return [];
  }
}
