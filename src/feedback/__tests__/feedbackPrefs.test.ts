import { getFeedbackPrefs, loadFeedbackPrefs, setFeedbackPrefs, shouldPlay, updateFeedbackPrefs } from '../feedbackPrefs';
import { createInMemoryFeedbackPrefsRepository } from '../../storage/inMemoryFeedbackPrefsRepository';

describe('shouldPlay', () => {
  it('gates sound and haptics independently', () => {
    expect(shouldPlay({ sound: true, haptics: false }, 'sound')).toBe(true);
    expect(shouldPlay({ sound: true, haptics: false }, 'haptic')).toBe(false);
    expect(shouldPlay({ sound: false, haptics: true }, 'sound')).toBe(false);
    expect(shouldPlay({ sound: false, haptics: true }, 'haptic')).toBe(true);
  });
});

describe('prefs store', () => {
  afterEach(() => setFeedbackPrefs({ sound: true, haptics: true }));

  it('defaults to both on', () => {
    expect(getFeedbackPrefs()).toEqual({ sound: true, haptics: true });
  });

  it('update applies immediately and persists', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await updateFeedbackPrefs(repo, { sound: false, haptics: true });
    expect(getFeedbackPrefs().sound).toBe(false);
    expect(await repo.getPrefs()).toEqual({ sound: false, haptics: true });
  });

  it('load picks up the saved value', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await repo.savePrefs({ sound: true, haptics: false });
    loadFeedbackPrefs(repo);
    await new Promise((r) => setTimeout(r, 0));
    expect(getFeedbackPrefs()).toEqual({ sound: true, haptics: false });
  });

  it('a toggle flipped before the load resolves is not overwritten by the stored value', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await repo.savePrefs({ sound: true, haptics: true });
    loadFeedbackPrefs(repo);
    await updateFeedbackPrefs(createInMemoryFeedbackPrefsRepository(), { sound: false, haptics: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(getFeedbackPrefs()).toEqual({ sound: false, haptics: true });
  });
});
