import { HOME_NAV_STATE, MAX_BACK_STACK, NavState, navBack, navClose, navPush, Screen, screenAfterClose, screenKey } from '../navigation';

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
    expect(screenKey('den')).toBeNull(); // alias of the world scene, which hosts the portrait WebView
    expect(screenKey('map')).toBeNull();
    expect(screenKey('territories')).toBeNull();
  });

  it('gives every other screen a distinct FadeSlideIn key', () => {
    const keys = ALL_SCREENS.map(screenKey).filter((k): k is string => k !== null);
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('back stack', () => {
  const at = (screen: Screen, ...stack: Screen[]): NavState => ({ screen, stack });

  it('goTo pushes the screen it leaves; back returns to it', () => {
    let state = navPush(HOME_NAV_STATE, 'stats');
    state = navPush(state, 'settings');
    expect(state).toEqual(at('settings', 'doorstep', 'stats'));
    state = navBack(state)!;
    expect(state).toEqual(at('stats', 'doorstep'));
    expect(navBack(state)).toEqual(HOME_NAV_STATE);
  });

  it('Territories opened from the map returns to the map, then the Doorstep', () => {
    const state = navPush(navPush(HOME_NAV_STATE, 'map'), 'territories');
    const onMap = navBack(state)!;
    expect(onMap.screen).toBe('map');
    expect(navBack(onMap)).toEqual(HOME_NAV_STATE);
  });

  it('back on the Doorstep does nothing (the system default takes over)', () => {
    expect(navBack(HOME_NAV_STATE)).toBeNull();
  });

  it('goTo the Doorstep clears the stack; goTo the same screen is a no-op', () => {
    const deep = at('logMissedWalk', 'doorstep', 'settings');
    expect(navPush(deep, 'doorstep')).toEqual(HOME_NAV_STATE);
    expect(navPush(deep, 'logMissedWalk')).toBe(deep);
  });

  it('never stacks the same screen twice in a row', () => {
    const state = navPush(at('settings', 'doorstep', 'settings'), 'stats');
    expect(state.stack).toEqual(['doorstep', 'settings']);
  });

  it('caps the stack and drops the oldest', () => {
    let state = HOME_NAV_STATE;
    const hops: Screen[] = ['map', 'territories', 'history', 'settings', 'stats', 'debugLog', 'logMissedWalk'];
    for (let i = 0; i < 20; i++) state = navPush(state, hops[i % hops.length] === state.screen ? 'den' : hops[i % hops.length]);
    expect(state.stack.length).toBeLessThanOrEqual(MAX_BACK_STACK);
  });

  it('an empty stack on a non-home screen falls back to close semantics', () => {
    expect(navBack(at('territories'))).toEqual(at('map'));
    expect(navBack(at('settings'))).toEqual(HOME_NAV_STATE);
  });

  it('close keeps screenAfterClose and unwinds the stack to the target', () => {
    expect(navClose(at('territories', 'doorstep', 'map'))).toEqual(at('map', 'doorstep'));
    expect(navClose(at('settings', 'doorstep', 'stats'))).toEqual(HOME_NAV_STATE);
    // Territories opened from the Doorstep still closes to the map (today's behaviour).
    expect(navClose(at('territories', 'doorstep'))).toEqual(at('map', 'doorstep'));
  });
});
