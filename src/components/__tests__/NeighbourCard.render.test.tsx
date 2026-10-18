import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { setLocale, t } from '../../i18n';
import type { NearbyItem } from '../../sync/apiContract';
import { renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { NeighbourCard } from '../world/NeighbourCard';

const item: NearbyItem = {
  id: 'b1',
  kind: 'bot',
  generated: true,
  archetype: 'pfote',
  dogName: 'Pfote',
  appearance: { coat: 'golden', markings: 'none', earStyle: 'floppy', tailStyle: 'straight', size: 'large', accentColour: 'tan' },
  traitKey: 'neighbours.dog.pfote.trait',
  areaLabel: 'near',
  lastActiveBucket: 'today',
  metCount: 3,
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  setLocale('en');
});

describe('NeighbourCard', () => {
  it('shows name, trait, the "simulated" badge and the last lines, and no counts', async () => {
    const view = await renderScreen(<NeighbourCard item={item} lines={['Pfote left you a stick.', 'Pfote is waving at you from the corner.']} onClose={() => {}} />);
    expect(screen.getByText('Pfote')).toBeOnTheScreen();
    expect(screen.getByText(t('neighbours.dog.pfote.trait'))).toBeOnTheScreen();
    expect(screen.getByText('Neighbour dog · simulated')).toBeOnTheScreen();
    expect(screen.getByText('Pfote left you a stick.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Neighbour dog Pfote')).toBeOnTheScreen();
    expect(screen.queryByText(/\b3\b/)).toBeNull(); // metCount is never shown
    await unmountAndExpectNoTimers(view);
  });

  it('says "simuliert" in German, leaves out an unknown trait and an empty lines block, and closes', async () => {
    const onClose = jest.fn();
    const view = await renderScreen(<NeighbourCard item={{ ...item, traitKey: 'neighbours.dog.future.trait' }} lines={[]} onClose={onClose} />);
    setLocale('de');
    await view.rerender(<NeighbourCard item={{ ...item, traitKey: 'neighbours.dog.future.trait' }} lines={[]} onClose={onClose} />);
    expect(screen.getByText('Nachbarhund · simuliert')).toBeOnTheScreen();
    expect(screen.queryByText('neighbours.dog.future.trait')).toBeNull();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Fertig' })[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});
