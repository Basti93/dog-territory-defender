import React from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { flush, renderScreen } from '../../test/render';
import { SettingsScreen } from '../SettingsScreen';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

// Guards the "endless whitespace" Android bug: nothing inside the scroll content may size from a
// percentage of an auto-height parent, and nothing may carry a huge fixed height.
describe('SettingsScreen scroll content layout', () => {
  it('has no percentage heights, no unbounded minHeight, and the linen tile has an explicit size', async () => {
    await renderScreen(
      <SettingsScreen
        onClose={() => {}}
        notificationRepository={createInMemoryNotificationRepository()}
        walkRepository={createInMemoryWalkRepository()}
        dogName="Rex"
        buddyAppearance={defaultBuddyAppearance()}
        walkActive={false}
        onSaveAppearance={jest.fn()}
        onOpenStats={() => {}}
        onOpenLogMissedWalk={() => {}}
        onOpenDebugLog={() => {}}
        localePreference="en"
        onChangeLocalePreference={() => {}}
        about={{ versionLabel: 'v', onCheck: async () => 'current' }}
      />,
    );
    await screen.findByText(t('post.reminders'));
    await flush();

    const scroll = screen.root.queryAll((n) => n.type === 'RCTScrollView')[0];
    expect(scroll).toBeDefined();
    const offenders: string[] = [];
    for (const node of scroll.queryAll(() => true)) {
      const style = (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
      const absolute = style.position === 'absolute';
      for (const key of ['height', 'minHeight', 'maxHeight'] as const) {
        const v = style[key];
        if (typeof v === 'string' && v.endsWith('%') && !absolute) offenders.push(`${String(node.type)} ${key}=${v}`);
        if (typeof v === 'number' && v > 2000) offenders.push(`${String(node.type)} ${key}=${v}`);
      }
      // An Image in the flow must not be a percentage-sized one either.
      if (node.type === 'Image') {
        for (const key of ['width', 'height'] as const) {
          const v = style[key];
          if (typeof v === 'string' && v.endsWith('%')) offenders.push(`Image ${key}=${v}`);
        }
      }
    }
    expect(offenders).toEqual([]);

    const linen = screen.root.queryAll((n) => n.props?.testID === 'screen-linen')[0];
    const linenStyle = StyleSheet.flatten(linen.props.style) as Record<string, unknown>;
    expect(typeof linenStyle.width).toBe('number');
    expect(typeof linenStyle.height).toBe('number');
    // Backdrop is a sibling of the ScrollView, not inside it.
    expect(scroll.queryAll((n) => n.props?.testID === 'screen-linen')).toHaveLength(0);
  });
});
