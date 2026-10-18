import { FeedbackPrefsRepository } from '../storage/FeedbackPrefsRepository';
import { createSqliteFeedbackPrefsRepository } from '../storage/sqliteFeedbackPrefsRepository';
import { loadFeedbackPrefs } from './feedbackPrefs';
import { preloadSounds } from './sounds';

// App-wide singleton. Kept out of feedbackPrefs.ts so the (Jest-tested) prefs
// store never imports expo-sqlite. Created lazily: the factory opens the
// database, which must not happen as a side effect of importing this file.
let repository: FeedbackPrefsRepository | null = null;

export function getFeedbackPrefsRepository(): FeedbackPrefsRepository {
  if (!repository) repository = createSqliteFeedbackPrefsRepository();
  return repository;
}

/** Call once at app start (non-blocking; sound/haptics stay on until it resolves). */
export function loadFeedbackPrefsAtStartup(): void {
  loadFeedbackPrefs(getFeedbackPrefsRepository());
  preloadSounds().catch(() => {}); // non-blocking; failures are logged inside
}
