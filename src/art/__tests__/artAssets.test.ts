import { artOr, buildingArt, hasArt } from '../artAssets';

describe('artAssets', () => {
  it('buildingArt builds the matching key', () => {
    expect(buildingArt('doghouse', 1)).toBe('doghouse-1');
    expect(buildingArt('bakery', 2)).toBe('bakery-2');
    expect(buildingArt('garden', 3)).toBe('garden-3');
  });

  it('artOr returns the registered sprite instead of the fallback', () => {
    expect(hasArt('icon-paw')).toBe(true);
    expect(artOr('icon-paw', 'placeholder')).not.toBe('placeholder');
  });
});
