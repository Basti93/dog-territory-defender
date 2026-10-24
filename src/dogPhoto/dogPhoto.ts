// Dog photo look, app side, pure parts: photo sizing, and mapping the server's answer to what the picker shows.
// The picker never shows an error tone: every non-success is "pick the look yourself" (see buddy.photo.* copy).
import { validateAppearance, type BuddyAppearance } from '../buddy/buddyAppearance';
import { ApiError } from '../sync/apiClient';
import type { DogAnalyzeResponse } from '../sync/apiContract';

export const DOG_PHOTO_MAX_PHOTOS = 5;
/** Longest side after the resize; a re-encode also strips EXIF (GPS), which is why every photo goes through it. */
export const DOG_PHOTO_MAX_SIDE = 1024;
export const DOG_PHOTO_JPEG_QUALITY = 0.8;

/** Target size: scaled down to `maxSide` on the long side, never scaled up, aspect ratio kept. */
export function fitWithin(width: number, height: number, maxSide = DOG_PHOTO_MAX_SIDE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > 0) || long <= maxSide) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const scale = maxSide / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type DogPhotoResult =
  | { kind: 'ok'; appearance: BuddyAppearance }
  /** Server has no vision key (or the app is not joined): the photo entry is hidden next time. */
  | { kind: 'unavailable' }
  /** Day/month/cost limit: "enough sniffing for today". */
  | { kind: 'limit' }
  /** Not a readable dog, provider trouble, bad answer, or no network: all the same calm fallback. */
  | { kind: 'failed' };

export function resultFromResponse(response: DogAnalyzeResponse): DogPhotoResult {
  const appearance = validateAppearance(response.appearance);
  return appearance ? { kind: 'ok', appearance } : { kind: 'failed' };
}

export function resultFromError(err: unknown): DogPhotoResult {
  const code = err instanceof ApiError ? err.code : null;
  if (code === 'analysis_unavailable') return { kind: 'unavailable' };
  if (code === 'analysis_limit') return { kind: 'limit' };
  return { kind: 'failed' };
}

/** What the picker needs from the outside world; App/Settings wire it to the sync engine and the native pickers. */
export interface DogPhotoPort {
  /** Camera or gallery -> resized base64 JPEGs. [] = cancelled, no permission or nothing usable. */
  pick(source: 'camera' | 'library', remaining: number): Promise<string[]>;
  analyze(photos: string[]): Promise<DogPhotoResult>;
  hasConsent(): Promise<boolean>;
  giveConsent(): Promise<void>;
}
