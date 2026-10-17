import {
  BUDDY_COATS,
  BUDDY_PALETTE,
  defaultBuddyAppearance,
  markingColourFor,
  noseColourFor,
} from '../buddyAppearance';

describe('buddyAppearance', () => {
  it('default is golden/none/floppy/curly/medium/cream', () => {
    expect(defaultBuddyAppearance()).toEqual({
      coat: 'golden',
      markings: 'none',
      earStyle: 'floppy',
      tailStyle: 'curly',
      size: 'medium',
      accentColour: 'cream',
    });
  });

  it('chocolate gets the brown nose, others dark', () => {
    expect(noseColourFor('chocolate')).toBe(BUDDY_PALETTE.nose.brown);
    for (const c of BUDDY_COATS.filter((x) => x !== 'chocolate')) {
      expect(noseColourFor(c)).toBe(BUDDY_PALETTE.nose.dark);
    }
  });

  it('marking colour differs from the coat', () => {
    for (const c of BUDDY_COATS) {
      expect(markingColourFor(c, 'patch')).not.toBe(BUDDY_PALETTE.coats[c]);
    }
  });
});
