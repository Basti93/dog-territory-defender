// Pure Buddy mood + trick logic (design.md Decision 4). No React, no timers:
// the component owns timing, this file owns decisions.
import type { GreetingFlavor, SessionKind } from '../DoorstepScreen';
import { t } from '../../i18n';
import type { BuddySkin } from '../../buddy/buddySkin';

export type BuddyMood = 'idle' | 'happy' | 'excited' | 'sleepy' | 'curious';
export type BuddyTrick = 'sit' | 'stretch' | 'shake';

export const BUDDY_TRICKS: readonly BuddyTrick[] = ['sit', 'stretch', 'shake'];
export const TRICK_DELAY_MIN_MS = 12000;
export const TRICK_DELAY_MAX_MS = 25000;
export const SLEEPY_START_HOUR = 22; // inclusive
export const SLEEPY_END_HOUR = 6; // exclusive

export interface BuddyMoodInput {
  sessionKind: SessionKind;
  greetingFlavor: GreetingFlavor | null;
  /** Local hour 0-23. */
  hour: number;
  /** True when a Somewhere Wild line is in the away strip. */
  curious: boolean;
}

export interface BuddyMoodResult {
  /** Mood Buddy settles into. */
  mood: BuddyMood;
  /** True: play a one-off joyful `excited` greeting first (~3s), then `mood`. */
  playGreeting: boolean;
}

export function isSleepyHour(hour: number): boolean {
  return hour >= SLEEPY_START_HOUR || hour < SLEEPY_END_HOUR;
}

/**
 * Priority: long-absence greeting (excited once, never sleepy: coming back is
 * a delight, never a guilt signal) > sleepy (same-day reopen or 22:00-06:00)
 * > curious > idle. Transient happy/excited from taps/screens is applied by
 * the caller or BuddyAvatar, not here.
 */
export function resolveBuddyMood(input: BuddyMoodInput): BuddyMoodResult {
  const longAbsence = input.sessionKind === 'fresh-open' && input.greetingFlavor === 'long-absence';
  if (longAbsence) {
    return { mood: input.curious ? 'curious' : 'idle', playGreeting: true };
  }
  if (input.sessionKind === 'same-day-reopen' || isSleepyHour(input.hour)) {
    return { mood: 'sleepy', playGreeting: false };
  }
  return { mood: input.curious ? 'curious' : 'idle', playGreeting: false };
}

/** Never returns `previous`. rng is () => [0,1). */
export function pickTrick(rng: () => number, previous: BuddyTrick | null): BuddyTrick {
  const options = BUDDY_TRICKS.filter((t) => t !== previous);
  const index = Math.min(options.length - 1, Math.max(0, Math.floor(rng() * options.length)));
  return options[index];
}

/** 12000-25000 ms. */
export function nextTrickDelayMs(rng: () => number): number {
  const span = TRICK_DELAY_MAX_MS - TRICK_DELAY_MIN_MS;
  const r = Math.min(1, Math.max(0, rng()));
  return TRICK_DELAY_MIN_MS + Math.floor(r * span);
}

/** Random delay in [minMs, maxMs] for blinks, ear flicks, head tilts. */
export function randomDelayMs(rng: () => number, minMs: number, maxMs: number): number {
  const r = Math.min(1, Math.max(0, rng()));
  return minMs + Math.floor(r * (maxMs - minMs));
}

// Copy lives in src/i18n as `buddy.tapCaption.1` .. `.4` ({name} is the dog's name).
export const TAP_CAPTION_COUNT = 4;

export function tapCaption(tapIndex: number, name?: string | null): string {
  const n = ((tapIndex % TAP_CAPTION_COUNT) + TAP_CAPTION_COUNT) % TAP_CAPTION_COUNT;
  return t(`buddy.tapCaption.${n + 1}`, { name: name && name.trim() ? name.trim() : 'Buddy' });
}

/**
 * Which art a mood draws: the single `poseLying` sprite (sleepy, when the skin has one) or the
 * layered parts. Pure so it can be tested; BuddyAvatar uses it to decide what to mount.
 */
export function partsForMood(mood: BuddyMood, skin: Pick<BuddySkin, 'parts'>): 'lying' | 'layered' {
  return mood === 'sleepy' && skin.parts.poseLying ? 'lying' : 'layered';
}
