import { BUDDY_COATS, BUDDY_EAR_STYLES, BUDDY_MARKINGS, BUDDY_TAIL_STYLES, defaultBuddyAppearance } from '../buddyAppearance';
import { buddyImageSources } from '../imageSkinSources';

const ALL_PARTS = ['body', 'head', 'frontLegs', 'earLeft', 'earRight', 'tail', 'eyesOpen', 'eyesClosed', 'mouthHappy', 'zzz'];

describe('buddyImageSources', () => {
  it('resolves all 10 part sources for every coat x ear x tail', () => {
    for (const coat of BUDDY_COATS)
      for (const earStyle of BUDDY_EAR_STYLES)
        for (const tailStyle of BUDDY_TAIL_STYLES) {
          const s = buddyImageSources({ ...defaultBuddyAppearance(), coat, earStyle, tailStyle });
          for (const part of ALL_PARTS) expect((s as Record<string, unknown>)[part]).toBeTruthy();
        }
  });

  it('resolves markings for every coat x marking, and none for "none"', () => {
    for (const coat of BUDDY_COATS)
      for (const markings of BUDDY_MARKINGS) {
        const s = buddyImageSources({ ...defaultBuddyAppearance(), coat, markings }) as Record<string, unknown>;
        if (markings === 'none') expect(s.markings).toBeUndefined();
        else expect(s.markings).toBeTruthy();
      }
  });

  it('resolves poseLying and both walk frames for every coat', () => {
    for (const coat of BUDDY_COATS) {
      const s = buddyImageSources({ ...defaultBuddyAppearance(), coat }) as Record<string, unknown>;
      expect(s.poseLying).toBeTruthy();
      expect(s.frontLegsWalkA).toBeTruthy();
      expect(s.frontLegsWalkB).toBeTruthy();
    }
  });

  it('falls back to defaults for unknown values', () => {
    const bad = { ...defaultBuddyAppearance(), coat: 'purple', earStyle: 'x', tailStyle: 'y' } as never;
    expect(buddyImageSources(bad)).toEqual(buddyImageSources(defaultBuddyAppearance()));
  });
});
