import { normalizeFeedbackPrefs } from '../FeedbackPrefsRepository';
import { createInMemoryFeedbackPrefsRepository } from '../inMemoryFeedbackPrefsRepository';

describe('FeedbackPrefsRepository contract', () => {
  it('defaults to sound, haptics and music on', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    expect(await repo.getPrefs()).toEqual({ sound: true, haptics: true, music: true });
  });

  it('round-trips and overwrites each flag independently', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await repo.savePrefs({ sound: false, haptics: true, music: true });
    expect(await repo.getPrefs()).toEqual({ sound: false, haptics: true, music: true });
    await repo.savePrefs({ sound: false, haptics: false, music: true });
    expect(await repo.getPrefs()).toEqual({ sound: false, haptics: false, music: true });
    await repo.savePrefs({ sound: true, haptics: false, music: false });
    expect(await repo.getPrefs()).toEqual({ sound: true, haptics: false, music: false });
  });

  it('treats anything but an explicit false as on (a backup without music stays on)', () => {
    expect(normalizeFeedbackPrefs(null)).toEqual({ sound: true, haptics: true, music: true });
    expect(normalizeFeedbackPrefs({ sound: 0, haptics: 'no' })).toEqual({ sound: true, haptics: true, music: true });
    expect(normalizeFeedbackPrefs({ sound: false, haptics: true })).toEqual({ sound: false, haptics: true, music: true });
  });
});
