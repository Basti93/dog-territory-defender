import { Screen, screenAfterClose, screenKey } from '../navigation';

const ALL_SCREENS: Screen[] = ['doorstep', 'map', 'territories', 'history', 'den', 'debugLog', 'settings', 'stats', 'logMissedWalk'];

describe('screenAfterClose', () => {
  it('returns Territories to the map', () => {
    expect(screenAfterClose('territories')).toBe('map');
  });

  it('returns every other screen to the Doorstep', () => {
    for (const screen of ALL_SCREENS.filter((s) => s !== 'territories')) {
      expect(screenAfterClose(screen)).toBe('doorstep');
    }
  });
});

describe('screenKey', () => {
  it('never fades WebView-hosting screens', () => {
    expect(screenKey('doorstep')).toBeNull();
    expect(screenKey('map')).toBeNull();
    expect(screenKey('territories')).toBeNull();
  });

  it('gives every other screen a distinct FadeSlideIn key', () => {
    const keys = ALL_SCREENS.map(screenKey).filter((k): k is string => k !== null);
    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
