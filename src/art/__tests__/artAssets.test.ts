import { artOr, buildingArt, buildingArtOrBest, hasArt } from '../artAssets';

describe('artAssets', () => {
  it('buildingArt builds the matching key', () => {
    expect(buildingArt('doghouse', 1)).toBe('doghouse-1');
    expect(buildingArt('bakery', 2)).toBe('bakery-2');
    expect(buildingArt('garden', 3)).toBe('garden-3');
  });

  it('buildingArt supports stages 4 and 5', () => {
    expect(buildingArt('doghouse', 4)).toBe('doghouse-4');
    expect(buildingArt('garden', 5)).toBe('garden-5');
  });

  it('buildingArtOrBest steps down to the newest registered stage', () => {
    expect(buildingArtOrBest('bakery', 2)).toBe('bakery-2');
    // stages 4 and 5 are not registered yet: falls back to 3 (update when the PNGs land)
    if (!hasArt('bakery-5')) expect(buildingArtOrBest('bakery', 5)).toBe('bakery-3');
    else expect(buildingArtOrBest('bakery', 5)).toBe('bakery-5');
  });

  it('artOr returns the registered sprite instead of the fallback', () => {
    expect(hasArt('icon-paw')).toBe(true);
    expect(artOr('icon-paw', 'placeholder')).not.toBe('placeholder');
  });
});
