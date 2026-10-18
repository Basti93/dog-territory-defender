import { DEFAULT_FEEDBACK_PREFS, FeedbackPrefs, FeedbackPrefsRepository, normalizeFeedbackPrefs } from './FeedbackPrefsRepository';

export function createInMemoryFeedbackPrefsRepository(): FeedbackPrefsRepository {
  let prefs: FeedbackPrefs = { ...DEFAULT_FEEDBACK_PREFS };
  return {
    async getPrefs() {
      return { ...prefs };
    },
    async savePrefs(next) {
      prefs = normalizeFeedbackPrefs(next);
    },
  };
}
