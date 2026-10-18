import { getFeedbackPrefs, loadFeedbackPrefs, setFeedbackPrefs, shouldPlay, shouldPlayNow, updateFeedbackPrefs } from '../feedbackPrefs';
import { createInMemoryFeedbackPrefsRepository } from '../../storage/inMemoryFeedbackPrefsRepository';

describe('shouldPlay', () => {
  it('gates sound and haptics independently', () => {
    expect(shouldPlay({ sound: true, haptics: false, music: true }, 'sound')).toBe(true);
    expect(shouldPlay({ sound: true, haptics: false, music: true }, 'haptic')).toBe(false);
    expect(shouldPlay({ sound: false, haptics: true, music: true }, 'sound')).toBe(false);
    expect(shouldPlay({ sound: false, haptics: true, music: true }, 'haptic')).toBe(true);
  });
});

describe('shouldPlayNow', () => {
  const on = { sound: true, haptics: true, music: true };
  it('plays only in the foreground with sound on', () => {
    expect(shouldPlayNow('active', on)).toBe(true);
    expect(shouldPlayNow('background', on)).toBe(false);
    expect(shouldPlayNow('inactive', on)).toBe(false);
    expect(shouldPlayNow(undefined, on)).toBe(false);
    expect(shouldPlayNow('active', { ...on, sound: false })).toBe(false);
  });
});

describe('prefs store', () => {
  afterEach(() => setFeedbackPrefs({ sound: true, haptics: true, music: true }));

  it('defaults to everything on', () => {
    expect(getFeedbackPrefs()).toEqual({ sound: true, haptics: true, music: true });
  });

  it('music flag round-trips through update and load', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await updateFeedbackPrefs(repo, { sound: true, haptics: true, music: false });
    expect(getFeedbackPrefs().music).toBe(false);
    setFeedbackPrefs({ sound: true, haptics: true, music: true });
    loadFeedbackPrefs(repo);
    await new Promise((r) => setTimeout(r, 0));
    expect(getFeedbackPrefs().music).toBe(false);
  });

  it('update applies immediately and persists', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await updateFeedbackPrefs(repo, { sound: false, haptics: true, music: true });
    expect(getFeedbackPrefs().sound).toBe(false);
    expect(await repo.getPrefs()).toEqual({ sound: false, haptics: true, music: true });
  });

  it('load picks up the saved value', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await repo.savePrefs({ sound: true, haptics: false, music: true });
    loadFeedbackPrefs(repo);
    await new Promise((r) => setTimeout(r, 0));
    expect(getFeedbackPrefs()).toEqual({ sound: true, haptics: false, music: true });
  });

  it('a toggle flipped before the load resolves is not overwritten by the stored value', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await repo.savePrefs({ sound: true, haptics: true, music: true });
    loadFeedbackPrefs(repo);
    await updateFeedbackPrefs(createInMemoryFeedbackPrefsRepository(), { sound: false, haptics: true, music: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(getFeedbackPrefs()).toEqual({ sound: false, haptics: true, music: true });
  });
});
