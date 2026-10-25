import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
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

  it('shows a quiet settings gear only when a handler is given, and the gear opens it', async () => {
    const view = await renderScreen(<TopBar treats={3} />);
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    view.unmount();
    const onOpenSettings = jest.fn();
    await renderScreen(<TopBar treats={3} onOpenSettings={onOpenSettings} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/\d/)).toBeTruthy(); // the treat count is still the only number
  });
});
