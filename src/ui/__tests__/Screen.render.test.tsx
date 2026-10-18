import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { renderScreen, styleOf } from '../../test/render';
import { Screen } from '../Screen';

describe('Screen scroll', () => {
  it('gives the ScrollView flex: 1 and its content flexGrow (never flex) so iOS can scroll', async () => {
    const view = await renderScreen(
      <Screen scroll contentStyle={{ gap: 4 }}>
        <Text>hi</Text>
      </Screen>,
    );
    const scrollView = view.root.queryAll((n) => n.type === 'RCTScrollView')[0];
    expect(scrollView).toBeDefined();
    expect(styleOf(scrollView).flex).toBe(1);
    // The jest ScrollView mock keeps the content container style as a prop on the host node.
    const contentStyle = (StyleSheet.flatten(scrollView.props.contentContainerStyle) ?? {}) as Record<string, any>;
    expect(contentStyle.flexGrow).toBe(1);
    expect(contentStyle.flex).toBeUndefined();
    expect(contentStyle.gap).toBe(4);
  });
});
