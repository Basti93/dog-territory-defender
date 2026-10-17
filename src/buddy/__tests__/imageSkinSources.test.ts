import { BUDDY_COATS, BUDDY_EAR_STYLES, BUDDY_TAIL_STYLES, defaultBuddyAppearance } from '../buddyAppearance';
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

  it('falls back to defaults for unknown values', () => {
    const bad = { ...defaultBuddyAppearance(), coat: 'purple', earStyle: 'x', tailStyle: 'y' } as never;
    expect(buddyImageSources(bad)).toEqual(buddyImageSources(defaultBuddyAppearance()));
  });
});
