import React from 'react';
import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';

import { renderScreen } from '../../test/render';
import { COMMIT_FRACTION, COMMIT_VELOCITY, EDGE_ZONE_PX, EdgeSwipeBack, isRightwardDrag, shouldCommitSwipe } from '../EdgeSwipeBack';

describe('swipe decisions', () => {
  it('commits past 35% of the width or on a fast fling, otherwise springs back', () => {
    expect(shouldCommitSwipe(400 * COMMIT_FRACTION + 1, 0, 400)).toBe(true);
    expect(shouldCommitSwipe(20, COMMIT_VELOCITY + 0.1, 400)).toBe(true);
    expect(shouldCommitSwipe(100, 0.2, 400)).toBe(false);
  });

  it('only a rightward, mostly horizontal drag starts the swipe', () => {
    expect(isRightwardDrag(30, 5)).toBe(true);
    expect(isRightwardDrag(30, 40)).toBe(false); // vertical scroll
    expect(isRightwardDrag(-30, 2)).toBe(false); // leftward
    expect(isRightwardDrag(2, 0)).toBe(false); // jitter
  });
});

describe('EdgeSwipeBack', () => {
  it('renders the content with a transparent edge strip above it when enabled', async () => {
    await renderScreen(
      <EdgeSwipeBack enabled onBack={() => {}}>
        <Text>content</Text>
      </EdgeSwipeBack>
    );
    expect(screen.getByText('content')).toBeOnTheScreen();
    const zone = screen.getByTestId('edge-swipe-zone');
    expect(zone.props.style).toMatchObject({ width: EDGE_ZONE_PX, position: 'absolute', left: 0 });
  });

  it('adds nothing when disabled (Android keeps the system gesture)', async () => {
    await renderScreen(
      <EdgeSwipeBack enabled={false} onBack={() => {}}>
        <Text>content</Text>
      </EdgeSwipeBack>
    );
    expect(screen.getByText('content')).toBeOnTheScreen();
    expect(screen.queryByTestId('edge-swipe-zone')).toBeNull();
  });
});
