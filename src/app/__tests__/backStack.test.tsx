import React from 'react';
import { BackHandler, Text } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderScreen } from '../../test/render';
import { registerBackAction, resetBackActions, resolveAppBack, runBackActions, useBackAction, useHardwareBack } from '../backStack';
import { Screen, useNavigation } from '../navigation';

beforeEach(resetBackActions);

describe('registry precedence', () => {
  it('asks the newest handler first; a modal beats the screen', () => {
    const calls: string[] = [];
    registerBackAction(() => void calls.push('screen'));
    registerBackAction(() => void calls.push('modal'));
    expect(runBackActions()).toBe(true);
    expect(calls).toEqual(['modal']);
  });

  it('a handler returning false passes the press down', () => {
    const calls: string[] = [];
    registerBackAction(() => void calls.push('screen'));
    registerBackAction(() => {
      calls.push('subview');
      return false;
    });
    expect(runBackActions()).toBe(true);
    expect(calls).toEqual(['subview', 'screen']);
  });

  it('is not consumed when nothing handles it (Android default: app to the background)', () => {
    registerBackAction(() => false);
    expect(runBackActions()).toBe(false);
  });

  it('an unregistered handler is gone', () => {
    const off = registerBackAction(() => true);
    off();
    expect(runBackActions()).toBe(false);
  });
});

describe('resolveAppBack', () => {
  const base = { firstLaunchDone: true, homecomingPlaying: false, screen: 'settings' as Screen, walkActive: false };

  it('the Doorstep returns default so Android backgrounds the app', () => {
    expect(resolveAppBack({ ...base, screen: 'doorstep' })).toBe('default');
  });
  it('a screen pops', () => {
    expect(resolveAppBack(base)).toBe('pop');
  });
  it('the live map with a walk running goes to the Doorstep (the walk is never touched)', () => {
    expect(resolveAppBack({ ...base, screen: 'map', walkActive: true })).toBe('doorstep');
    expect(resolveAppBack({ ...base, screen: 'map', walkActive: false })).toBe('pop');
  });
  it('a Heimkehr is not skippable', () => {
    expect(resolveAppBack({ ...base, screen: 'doorstep', homecomingPlaying: true })).toBe('consume');
  });
  it('the first-launch flow leaves back to its own handlers / the system', () => {
    expect(resolveAppBack({ ...base, firstLaunchDone: false })).toBe('default');
  });
});

// A miniature App: the real useNavigation + the same bottom handler wiring, text instead of screens.
function Harness({ onStartWalk }: { onStartWalk?: () => void }) {
  const nav = useNavigation();
  const [panel, setPanel] = React.useState(false);
  const walkActive = React.useRef(true);
  useBackAction(true, () => {
    switch (resolveAppBack({ firstLaunchDone: true, homecomingPlaying: false, screen: nav.screen, walkActive: walkActive.current })) {
      case 'default':
        return false;
      case 'doorstep':
        nav.goDoorstep();
        return true;
      default:
        return nav.back();
    }
  });
  useBackAction(panel, () => setPanel(false));
  useHardwareBack();
  return (
    <>
      <Text testID="screen">{nav.screen}</Text>
      <Text testID="panel">{panel ? 'open' : 'closed'}</Text>
      <Text onPress={() => nav.goTo('stats')}>to-stats</Text>
      <Text onPress={() => nav.goTo('settings')}>to-settings</Text>
      <Text onPress={() => nav.goTo('map')}>to-map</Text>
      <Text onPress={() => nav.goTo('territories')}>to-territories</Text>
      <Text onPress={() => setPanel(true)}>open-panel</Text>
      <Text onPress={onStartWalk}>start-walk</Text>
    </>
  );
}

describe('hardware back (render)', () => {
  let press: (() => boolean | null | undefined) | null = null;
  beforeEach(() => {
    press = null;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_name: string, cb: () => boolean) => {
      press = cb;
      return { remove: () => { press = null; } };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const tap = async (label: string) => {
    await fireEvent.press(screen.getByText(label));
  };
  const back = async () => {
    let result: unknown;
    await act(async () => {
      result = press!();
    });
    return result;
  };

  it('back from Settings (opened from Stats) returns to Stats, then the Doorstep, then is left to Android', async () => {
    await renderScreen(<Harness />);
    await tap('to-stats');
    await tap('to-settings');
    expect(screen.getByTestId('screen').props.children).toBe('settings');
    expect(await back()).toBe(true);
    expect(screen.getByTestId('screen').props.children).toBe('stats');
    expect(await back()).toBe(true);
    expect(screen.getByTestId('screen').props.children).toBe('doorstep');
    expect(await back()).toBe(false);
  });

  it('Territories from the map returns to the map, then the Doorstep', async () => {
    await renderScreen(<Harness />);
    await tap('to-map');
    await tap('to-territories');
    await back();
    expect(screen.getByTestId('screen').props.children).toBe('map');
    await back(); // the harness has an active walk: map -> Doorstep, nothing is cancelled
    expect(screen.getByTestId('screen').props.children).toBe('doorstep');
  });

  it('an open panel is closed before the screen changes', async () => {
    await renderScreen(<Harness />);
    await tap('to-settings');
    await tap('open-panel');
    await back();
    expect(screen.getByTestId('panel').props.children).toBe('closed');
    expect(screen.getByTestId('screen').props.children).toBe('settings');
    await back();
    expect(screen.getByTestId('screen').props.children).toBe('doorstep');
  });
});
