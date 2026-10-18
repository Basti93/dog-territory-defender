import { normalizeFeedbackPrefs } from '../FeedbackPrefsRepository';
import { createInMemoryFeedbackPrefsRepository } from '../inMemoryFeedbackPrefsRepository';

describe('FeedbackPrefsRepository contract', () => {
  it('defaults to sound and haptics on', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    expect(await repo.getPrefs()).toEqual({ sound: true, haptics: true });
  });

  it('round-trips and overwrites each flag independently', async () => {
    const repo = createInMemoryFeedbackPrefsRepository();
    await repo.savePrefs({ sound: false, haptics: true });
    expect(await repo.getPrefs()).toEqual({ sound: false, haptics: true });
    await repo.savePrefs({ sound: false, haptics: false });
    expect(await repo.getPrefs()).toEqual({ sound: false, haptics: false });
    await repo.savePrefs({ sound: true, haptics: false });
    expect(await repo.getPrefs()).toEqual({ sound: true, haptics: false });
  });

  it('treats anything but an explicit false as on', () => {
    expect(normalizeFeedbackPrefs(null)).toEqual({ sound: true, haptics: true });
    expect(normalizeFeedbackPrefs({ sound: 0, haptics: 'no' })).toEqual({ sound: true, haptics: true });
  });
});
