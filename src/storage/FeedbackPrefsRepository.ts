export interface FeedbackPrefs {
  sound: boolean;
  haptics: boolean;
}

export const DEFAULT_FEEDBACK_PREFS: FeedbackPrefs = { sound: true, haptics: true };

export interface FeedbackPrefsRepository {
  /** Never fails for "nothing saved": returns both on. */
  getPrefs(): Promise<FeedbackPrefs>;
  savePrefs(prefs: FeedbackPrefs): Promise<void>;
}

/** Anything that is not an explicit `false` stays on (the default). */
export function normalizeFeedbackPrefs(value: Partial<Record<keyof FeedbackPrefs, unknown>> | null | undefined): FeedbackPrefs {
  return { sound: value?.sound !== false, haptics: value?.haptics !== false };
}
