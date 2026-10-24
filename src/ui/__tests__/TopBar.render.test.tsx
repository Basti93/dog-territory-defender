import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderScreen } from '../../test/render';
import { TopBar } from '../TopBar';

describe('TopBar', () => {
  it('shows the floored treat count with a plain label', async () => {
    await renderScreen(<TopBar treats={12.7} />);
    expect(screen.getByLabelText('Treats: 12')).toBeTruthy();
  });

  it('is a button only when a handler is given', async () => {
    await renderScreen(<TopBar treats={3} onPressTreats={() => undefined} label="Bowl" />);
    expect(screen.getByRole('button', { name: 'Bowl' })).toBeTruthy();
  });
});
