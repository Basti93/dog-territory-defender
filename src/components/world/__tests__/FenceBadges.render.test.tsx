import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { runBackActions, resetBackActions } from '../../../app/backStack';
import { ACHIEVEMENTS } from '../../../economy/personalStats';
import { formatDate, t } from '../../../i18n';
import { advance, flush, renderScreen, unmountAndExpectNoTimers } from '../../../test/render';
import { FenceBadges, FenceBadgesProps, SWING_MS } from '../FenceBadges';
import { FenceBadge, fenceBadgeList } from '../fencePlan';
import { sceneLayout } from '../sceneLayout';

const layout = sceneLayout(844, 390, 47);
const DATE = new Date(2026, 9, 11, 12, 0).getTime();
const badges: FenceBadge[] = fenceBadgeList([
  { id: 'first-steps', unlockedAt: DATE },
  { id: 'round-the-block', unlockedAt: DATE + 1000 },
  { id: 'moving-in', unlockedAt: DATE + 2000 },
]);

async function setup(over: Partial<FenceBadgesProps> = {}) {
  const view = await renderScreen(
    <FenceBadges badges={badges} hook={null} width={390} fenceBottom={layout.fenceBottom} hasTitle statusCount={0} {...over} />
  );
  await flush();
  return view;
}

beforeEach(() => {
  jest.useFakeTimers();
  resetBackActions();
});
afterEach(() => jest.useRealTimers());

describe('FenceBadges', () => {
  it('hangs one rosette per badge, each with its name as the label', async () => {
    const view = await setup();
    for (const b of badges) {
      expect(screen.getByTestId(`fence-badge-${b.id}`)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: t('world.fence.badgeLabel', { name: ACHIEVEMENTS[b.id].name }) })).toBeOnTheScreen();
    }
    expect(screen.queryByTestId('fence-hook')).toBeNull();
    expect(screen.queryByTestId('fence-sign')).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('draws nothing on an empty fence', async () => {
    const view = await setup({ badges: [] });
    expect(screen.queryByTestId(/^fence-badge-/)).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('a tap opens a sign with the name and the unlock date; Back closes it', async () => {
    const view = await setup();
    await fireEvent.press(screen.getByTestId('fence-badge-round-the-block'));
    expect(screen.getByTestId('fence-sign')).toBeOnTheScreen();
    expect(screen.getByText(ACHIEVEMENTS['round-the-block'].name)).toBeOnTheScreen();
    expect(screen.getByText(t('world.fence.earnedOn', { date: formatDate(DATE + 1000) }))).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('fence-badge-first-steps')); // another badge swaps the sign
    expect(screen.getByText(ACHIEVEMENTS['first-steps'].name)).toBeOnTheScreen();
    expect(screen.queryByText(ACHIEVEMENTS['round-the-block'].name)).toBeNull();

    await fireEvent.press(screen.getByTestId('fence-badge-first-steps')); // the same badge again closes it
    expect(screen.queryByTestId('fence-sign')).toBeNull();

    await fireEvent.press(screen.getByTestId('fence-badge-moving-in'));
    expect(screen.getByTestId('fence-sign')).toBeOnTheScreen();
    let handled = false;
    await act(async () => {
      handled = runBackActions();
    });
    expect(handled).toBe(true);
    expect(screen.queryByTestId('fence-sign')).toBeNull();
    expect(runBackActions()).toBe(false); // nothing left to close
    await unmountAndExpectNoTimers(view);
  });

  it('the empty hook is a silhouette with a tiny sign and no numbers at all', async () => {
    const view = await setup({ hook: { id: 'hundred-walks', family: 'walks' } });
    const hook = screen.getByTestId('fence-hook');
    expect(hook).toBeOnTheScreen();
    expect(screen.getByText(t('world.fence.hookSign'))).toBeOnTheScreen();
    expect(t('world.fence.hookSign')).not.toMatch(/\d/);
    expect(hook.props.accessibilityLabel).not.toMatch(/\d/);
    // Nothing else the hook adds to the screen contains a digit or the old "you're at" hint.
    expect(screen.queryByText(/\d/)).toBeNull();
    expect(screen.queryByText(/you're at/i)).toBeNull();
    expect(screen.queryByText(ACHIEVEMENTS['hundred-walks'].name)).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('badges still waiting for the homecoming stay off the fence; they come when revealed and swing once', async () => {
    const view = await setup({ hiddenIds: ['round-the-block'], swingIds: ['round-the-block'] });
    expect(screen.queryByTestId('fence-badge-round-the-block')).toBeNull();
    expect(screen.getByTestId('fence-badge-first-steps')).toBeOnTheScreen();
    await view.rerender(
      <FenceBadges badges={badges} hook={null} width={390} fenceBottom={layout.fenceBottom} hasTitle statusCount={0} hiddenIds={[]} swingIds={['round-the-block']} />
    );
    await flush();
    expect(screen.getByTestId('fence-badge-round-the-block')).toBeOnTheScreen();
    await advance(SWING_MS + 100);
    await unmountAndExpectNoTimers(view);
  });

  it('Back is not swallowed when the selected badge goes into hiding (nothing on screen to close)', async () => {
    const view = await setup();
    await fireEvent.press(screen.getByTestId('fence-badge-moving-in'));
    expect(screen.getByTestId('fence-sign')).toBeOnTheScreen();
    await view.rerender(
      <FenceBadges badges={badges} hook={null} width={390} fenceBottom={layout.fenceBottom} hasTitle statusCount={0} hiddenIds={['moving-in']} />
    );
    await flush();
    expect(screen.queryByTestId('fence-sign')).toBeNull();
    expect(runBackActions()).toBe(false);
    await unmountAndExpectNoTimers(view);
  });

  it('a hidden hook keeps its peg: the badges do not move when it appears or disappears', async () => {
    const pos = () => JSON.stringify(badges.map((b) => screen.getByTestId(`fence-badge-${b.id}`).parent?.props.style));
    const view = await setup({ hook: { id: 'hundred-walks', family: 'walks' }, hookHidden: true });
    expect(screen.queryByTestId('fence-hook')).toBeNull();
    const hidden = pos();
    await view.rerender(
      <FenceBadges badges={badges} hook={{ id: 'hundred-walks', family: 'walks' }} width={390} fenceBottom={layout.fenceBottom} hasTitle statusCount={0} />
    );
    await flush();
    expect(screen.getByTestId('fence-hook')).toBeOnTheScreen();
    expect(pos()).toBe(hidden);
    await unmountAndExpectNoTimers(view);
  });
});
