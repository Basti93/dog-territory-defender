// Render test for the animated Buddy. The "explicit size" test is the
// regression guard for the giant-Buddy bug: an Image with no width/height is
// measured from its intrinsic pixels and overflows the avatar box on device.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { BuddyAppearance, defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyImageSources } from '../../buddy/imageSkinSources';
import { imagesIn, renderScreen, styleOf, unmountAndExpectNoTimers } from '../../test/render';
import { BuddyAvatar } from '../buddy';

const SIZE = 120;

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function avatarRoot() {
  return screen.getByRole('button');
}

describe('BuddyAvatar', () => {
  it('renders its root at exactly the requested size', async () => {
    const view = await renderScreen(<BuddyAvatar appearance={defaultBuddyAppearance()} size={SIZE} />);
    const style = styleOf(avatarRoot());
    expect(style.width).toBe(SIZE);
    expect(style.height).toBe(SIZE);
    await unmountAndExpectNoTimers(view);
  });

  it.each<[string, Partial<BuddyAppearance>]>([
    ['default look', {}],
    ['small size (scaled parts)', { size: 'small' }],
    ['large size (scaled parts)', { size: 'large' }],
    ['with markings overlay', { markings: 'mask' }],
  ])('gives every Image part explicit width/height = size (%s)', async (_name, patch) => {
    const view = await renderScreen(<BuddyAvatar appearance={{ ...defaultBuddyAppearance(), ...patch }} size={SIZE} />);
    const images = imagesIn(avatarRoot());
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      const style = styleOf(image);
      expect(style.position).toBe('absolute');
      expect(style.width).toBe(SIZE);
      expect(style.height).toBe(SIZE);
    }
    await unmountAndExpectNoTimers(view);
  });

  it('shows the lying sprite instead of the layered parts when sleepy', async () => {
    const appearance = defaultBuddyAppearance();
    const sources = buddyImageSources(appearance);
    expect(sources.poseLying).toBeTruthy(); // the default skin must provide one for this test to mean anything

    const view = await renderScreen(<BuddyAvatar appearance={appearance} size={SIZE} mood="sleepy" />);
    const shown = imagesIn(avatarRoot()).map((image) => image.props.source);
    expect(shown).toContainEqual(sources.poseLying);
    expect(shown).not.toContainEqual(sources.body);
    expect(shown).not.toContainEqual(sources.head);
    for (const image of imagesIn(avatarRoot())) expect(styleOf(image).width).toBe(SIZE);
    await unmountAndExpectNoTimers(view);
  });

  it('shows the layered parts (no lying sprite) when idle', async () => {
    const appearance = defaultBuddyAppearance();
    const sources = buddyImageSources(appearance);
    const view = await renderScreen(<BuddyAvatar appearance={appearance} size={SIZE} mood="idle" />);
    const shown = imagesIn(avatarRoot()).map((image) => image.props.source);
    expect(shown).toContainEqual(sources.body);
    expect(shown).not.toContainEqual(sources.poseLying);
    await unmountAndExpectNoTimers(view);
  });

  it('calls onPress when tapped and still cleans up its tap timers', async () => {
    const onPress = jest.fn();
    const view = await renderScreen(<BuddyAvatar appearance={defaultBuddyAppearance()} size={SIZE} onPress={onPress} showCaption />);
    await fireEvent.press(avatarRoot());
    expect(onPress).toHaveBeenCalledTimes(1);
    // unmount while the happy reaction and caption timers are still pending
    await unmountAndExpectNoTimers(view);
  });

  it('leaves no timers behind after unmount in every mood', async () => {
    for (const mood of ['idle', 'happy', 'excited', 'sleepy', 'curious'] as const) {
      const view = await renderScreen(<BuddyAvatar appearance={defaultBuddyAppearance()} size={SIZE} mood={mood} />);
      await unmountAndExpectNoTimers(view);
    }
  });
});

describe('BuddyAvatar tap sound', () => {
  it('calls playBuddy on every tap', async () => {
    const sounds = require('../../feedback/sounds');
    const spy = jest.spyOn(sounds, 'playBuddy').mockImplementation(() => {});
    const view = await renderScreen(<BuddyAvatar appearance={defaultBuddyAppearance()} size={SIZE} />);
    await fireEvent.press(avatarRoot());
    await fireEvent.press(avatarRoot());
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    await unmountAndExpectNoTimers(view);
  });
});
