import React from 'react';
import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';

import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { isoDay, queueWalkTrigger, resetWildExtrasSession } from '../den/wildExtras';
import { useWildExtra } from '../den/useWildExtra';

beforeEach(() => {
  jest.useFakeTimers();
  resetWildExtrasSession();
});
afterEach(() => jest.useRealTimers());

function Probe({ repo }: { repo?: ReturnType<typeof createInMemorySettingsRepository> }) {
  const { active, onDone, playLevelUp } = useWildExtra({ settingsRepository: repo, sessionKind: 'same-day-reopen', rng: () => 0.99 });
  return (
    <>
      <Text testID="active">{active ?? 'none'}</Text>
      <Text testID="done" onPress={onDone}>done</Text>
      <Text testID="level" onPress={playLevelUp}>level</Text>
    </>
  );
}

describe('useWildExtra', () => {
  it('plays nothing without a settings repository', async () => {
    queueWalkTrigger(null, true);
    const view = await renderScreen(<Probe />);
    await flush();
    expect(screen.getByTestId('active')).toHaveTextContent('none');
    await unmountAndExpectNoTimers(view);
  });

  it('plays the pending level-up extra on mount and remembers today', async () => {
    const repo = createInMemorySettingsRepository();
    queueWalkTrigger(null, true);
    const view = await renderScreen(<Probe repo={repo} />);
    await flush();
    expect(screen.getByTestId('active')).toHaveTextContent('level-up-fireflies');
    expect((await repo.getWildExtrasLastShown())['level-up-fireflies']).toBe(isoDay(Date.now()));
    await unmountAndExpectNoTimers(view);
  });

  it('does not play the same extra again in the same session (second Den visit)', async () => {
    const repo = createInMemorySettingsRepository();
    queueWalkTrigger(null, true);
    const first = await renderScreen(<Probe repo={repo} />);
    await flush();
    await first.unmount();
    queueWalkTrigger(null, true);
    await renderScreen(<Probe repo={repo} />);
    await flush();
    expect(screen.getByTestId('active')).toHaveTextContent('none');
  });
});
