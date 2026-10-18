// Touch-reachability guards for the Doorstep (Buddy and the gear must stay tappable).
// RNTL's fireEvent.press walks up from the target and skips handlers behind
// pointerEvents="none"/"box-only" ancestors, but it does NOT model z-order
// overlap, so the structural test below is the guard against a decorative
// absolutely-positioned layer stealing touches on a real device.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { artAssets } from '../../art/artAssets';
import { t } from '../../i18n';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import type { TestInstance } from 'test-renderer';
import { flush, imagesIn, renderScreen } from '../../test/render';
import { DoorstepScreen } from '../DoorstepScreen';
import * as sounds from '../../feedback/sounds';

jest.mock('../../feedback/sounds', () => ({
  ...jest.requireActual('../../feedback/sounds'),
  play: jest.fn(),
  playBuddy: jest.fn(),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

async function setup() {
  const onOpenSettings = jest.fn();
  const view = await renderScreen(
    <DoorstepScreen
      dogName="Rex"
      treats={50}
      level={1}
      accruedDelta={0}
      pendingDenAchievements={[]}
      session={{ kind: 'fresh-open', greetingFlavor: 'first-open' }}
      greeting="Hello Rex!"
      awayStripLines={[]}
      denEconomyRepository={createInMemoryDenEconomyRepository()}
      homeRangeRepository={createInMemoryHomeRangeRepository()}
      walkRepository={createInMemoryWalkRepository()}
      buddyAppearance={defaultBuddyAppearance()}
      onStartWalk={jest.fn()}
      onOpenMap={jest.fn()}
      onOpenDen={jest.fn()}
      onOpenHistory={jest.fn()}
      onOpenStats={jest.fn()}
      onOpenDebugLog={jest.fn()}
      onOpenLogMissedWalk={jest.fn()}
      onOpenSettings={onOpenSettings}
    />
  );
  await screen.findByRole('button', { name: t('doorstep.startWalk') });
  await flush();
  return { view, onOpenSettings };
}

describe('Doorstep touch reachability', () => {
  it('pressing Buddy plays his sound', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Rex' }));
    expect(sounds.playBuddy).toHaveBeenCalledTimes(1);
  });

  it('the gear opens the menu and Settings is reachable', async () => {
    const { onOpenSettings } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('doorstep.moreOptions') }));
    await fireEvent.press(screen.getByText(t('menu.settings')));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('every Image on the Doorstep is inert to touches (pointerEvents none on it or an ancestor) unless inside a button', async () => {
    await setup();
    const images = imagesIn(screen.root);
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      let node: TestInstance | null = img;
      let verdict = 'reachable';
      while (node) {
        if (node.props.pointerEvents === 'none') {
          verdict = 'inert';
          break;
        }
        if (node.props.accessibilityRole === 'button') {
          verdict = 'inside-button';
          break;
        }
        node = node.parent;
      }
      expect(verdict).not.toBe('reachable');
    }
  });

  it('draws the grass hill as a tall decor box that reaches into the scene', async () => {
    await setup();
    const ground = imagesIn(screen.root).find((img) => img.props.source === artAssets['yard-ground']);
    expect(ground).toBeDefined();
    const box = StyleSheet.flatten(ground!.parent!.props.style);
    expect(box.height).toBeGreaterThan(100);
    // horizon (26% of the box) sits 60px above the scene bottom: box top is above the bottom edge, box bottom hangs below it
    expect(box.bottom).toBeLessThan(0);
    expect(box.bottom + box.height).toBeGreaterThan(60);
    expect(box.left).toBeLessThan(0);
  });
});
