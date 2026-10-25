import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { resetNeighbourhood, setNeighbourhood } from '../../sync/neighbourhoodStore';
import { flush, renderScreen } from '../../test/render';
import { StickShelfScreen } from '../StickShelfScreen';

afterEach(resetNeighbourhood);

const stick = (id: string, botName: string, cosmeticId: string, openedAt: number | null) => ({ id, botId: `b-${id}`, botName, cosmeticId, sprinkleTreats: null, createdAt: 1, openedAt });

describe('Stick shelf screen (Stock-Regal)', () => {
  it('shows the empty shelf (soft slots) without neighbour dogs, with a title and back', async () => {
    const onClose = jest.fn();
    await renderScreen(<StickShelfScreen onClose={onClose} />);
    await flush();
    expect(screen.getByText(t('sticks.screen.title'))).toBeOnTheScreen();
    expect(screen.getByTestId('stick-shelf')).toBeOnTheScreen();
    expect(screen.getAllByTestId('stick-slot-empty')).toHaveLength(6);
    await fireEvent.press(screen.getByRole('button', { name: t('common.back') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows one slot per dog: fetched sticks by name (also the old oak id), the rest as soft empty slots, no counts', async () => {
    setNeighbourhood({
      gifts: [stick('g1', 'Pfote', 'stick-oak', 5), stick('g2', 'Pfote', 'stick-pfote', 6), stick('g3', 'Keks', 'stick-keks', 7), stick('g4', 'Momo', 'stick-momo', null)],
    });
    await renderScreen(<StickShelfScreen onClose={jest.fn()} />);
    await flush();
    expect(screen.getAllByTestId('stick-slot-full')).toHaveLength(2); // Pfote (twice = once) and Keks; Momo's still lies in the yard
    expect(screen.getAllByTestId('stick-slot-empty')).toHaveLength(4);
    expect(screen.getByLabelText('Stick from Pfote')).toBeOnTheScreen();
    expect(screen.queryByText(/\d+ ?(\/|of) ?6/)).toBeNull();
  });
});
