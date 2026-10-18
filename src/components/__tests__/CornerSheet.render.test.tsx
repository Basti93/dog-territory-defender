import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { setLocale, t } from '../../i18n';
import { createInMemoryCornerRepository } from '../../storage/inMemoryCornerRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { DAY_MS, trackedWalk, TUESDAY_AFTERNOON } from '../../test/postcardFixtures';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { cellForLocation } from '../../utils/grid';
import { CornerSheet } from '../world/CornerSheet';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  setLocale('en');
});

// A corner on the fixture walks' path (they all run east from 52.5 / 13.4).
const spot = cellForLocation(52.5, 13.4 + 60 * 0.00004);
const ID = `${spot.ix},${spot.iy}`;

async function setup(opts: { name?: string | null; street?: string | null; nameBy?: string | null; namer?: string | null; walks?: number } = {}) {
  const cornerRepository = createInMemoryCornerRepository();
  await cornerRepository.addCorners([{ id: ID, ix: spot.ix, iy: spot.iy, createdAt: 1, walkId: 'w0' }]);
  if (opts.street) await cornerRepository.setStreet(ID, opts.street);
  if (opts.name) await cornerRepository.setName(ID, opts.name, opts.nameBy ?? null, 5);
  const walkRepository = createInMemoryWalkRepository();
  for (let i = 0; i < (opts.walks ?? 5); i++) await walkRepository.saveWalk(trackedWalk(`w${i}`, { startTime: TUESDAY_AFTERNOON - i * DAY_MS }));
  await walkRepository.saveWalk(trackedWalk('far', { locations: trackedWalk('x').locations.map((l) => ({ ...l, latitude: 48.1, longitude: 11.5 + (l.longitude - 13.4) })) }));
  const onRename = jest.fn(async () => undefined);
  const onClose = jest.fn();
  const view = await renderScreen(
    <CornerSheet
      cornerId={ID}
      cornerRepository={cornerRepository}
      walkRepository={walkRepository}
      buddyAppearance={defaultBuddyAppearance()}
      onRename={onRename}
      namedByOther={async () => opts.namer ?? null}
      onClose={onClose}
    />
  );
  await flush();
  return { view, onRename, onClose, cornerRepository };
}

describe('CornerSheet', () => {
  it('shows the auto-name, Buddy resting, and the newest three postcards from walks that ran through the corner', async () => {
    const { view } = await setup({ street: 'Lindenstraße' });
    expect(screen.getByTestId('corner-sheet-title').props.children).toBe('Lindenstraße corner');
    expect(screen.getByTestId('corner-sheet-pose')).toBeOnTheScreen();
    expect(screen.getByText(t('corner.sheet.postcards'))).toBeOnTheScreen();
    expect(screen.getAllByTestId('corner-sheet-card')).toHaveLength(3); // five walks pass, the far one does not, the newest three show
    await unmountAndExpectNoTimers(view);
  });

  it('is never blank: the neutral line when nothing is known', async () => {
    const { view } = await setup();
    expect(screen.getByTestId('corner-sheet-title').props.children).toBe(t('corner.name.fallback'));
    await unmountAndExpectNoTimers(view);
  });

  it('renames: trimmed name goes to onRename and the sheet closes reporting a change; the save sign waits for a new name', async () => {
    const { view, onRename, onClose } = await setup({ name: 'Kiosk-Ecke' });
    expect(screen.getByTestId('corner-sheet-input').props.value).toBe('Kiosk-Ecke');
    await fireEvent.press(screen.getByTestId('corner-sheet-save')); // unchanged: nothing happens
    expect(onRename).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('corner-sheet-input'), '  Unsere Bank ');
    await fireEvent.press(screen.getByTestId('corner-sheet-save'));
    await flush();
    expect(onRename).toHaveBeenCalledWith(ID, 'Unsere Bank');
    expect(onClose).toHaveBeenCalledWith(true);
    await unmountAndExpectNoTimers(view);
  });

  it('limits the name to 24 characters and refuses a blank one', async () => {
    const { view, onRename } = await setup();
    expect(screen.getByTestId('corner-sheet-input').props.maxLength).toBe(24);
    await fireEvent.changeText(screen.getByTestId('corner-sheet-input'), '    ');
    await fireEvent.press(screen.getByTestId('corner-sheet-save'));
    expect(onRename).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('says "Name von Lisa" only when the other member wrote the name', async () => {
    const other = await setup({ name: 'Bank am Park', nameBy: 'p-lisa', namer: 'Lisa' });
    expect(screen.getByText(t('corner.sheet.namedBy', { member: 'Lisa' }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(other.view);

    const own = await setup({ name: 'Bank am Park', nameBy: 'p-me', namer: null });
    expect(screen.queryByText(/Named by/)).toBeNull();
    await unmountAndExpectNoTimers(own.view);
  });

  it('closes without a change when nothing was saved', async () => {
    const { view, onClose } = await setup({ name: 'Kiosk-Ecke' });
    await fireEvent.press(screen.getByTestId('corner-sheet-close'));
    expect(onClose).toHaveBeenCalledWith(false);
    await unmountAndExpectNoTimers(view);
  });
});
