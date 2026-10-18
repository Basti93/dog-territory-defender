import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../../test/render';
import { WoodSign, signCapInsets } from '../paper/WoodSign';
import { PaperNote } from '../paper/PaperNote';
import { SpeechBubble } from '../paper/SpeechBubble';
import { Postcard } from '../paper/Postcard';
import { stitch } from '../paper/Stitch';
import { material, type } from '../theme';
import { fonts, resolveFont } from '../fontMap';

describe('paper primitives', () => {
  it('WoodSign shows text and fires onPress', async () => {
    const onPress = jest.fn();
    await renderScreen(<WoodSign onPress={onPress}>Gassi gehen</WoodSign>);
    await fireEvent.press(screen.getByText('Gassi gehen'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('WoodSign renders the 9-slice sprite with capInsets scaled to the displayed size', async () => {
    const view = await renderScreen(<WoodSign size="medium">Post</WoodSign>);
    const withInsets = view.root.queryAll((n) => n.props.capInsets !== undefined);
    expect(withInsets.length).toBeGreaterThan(0);
    // medium: 48dp displayed / 192px sprite = 0.25 per px
    expect(signCapInsets('medium')).toEqual({ top: 5, left: 5, right: 5, bottom: 7 });
    expect(withInsets[0].props.capInsets).toEqual(signCapInsets('medium'));
  });
  it('PaperNote, SpeechBubble and Postcard render their text', async () => {
    await renderScreen(
      <>
        <PaperNote><Text>Zettel</Text></PaperNote>
        <SpeechBubble>Wuff!</SpeechBubble>
        <Postcard side="back" lines={['Dienstagnachmittag']} />
      </>,
    );
    for (const t of ['Zettel', 'Wuff!', 'Dienstagnachmittag']) expect(screen.getByText(t)).toBeTruthy();
  });
  it('stitch is a dashed yarn border', () => {
    expect(stitch()).toMatchObject({ borderStyle: 'dashed', borderColor: material.yarn });
  });
});

describe('redesign fonts', () => {
  it('maps sign/signLight/hand and falls back when not loaded', () => {
    expect(fonts.sign).toBe('Fredoka-Bold');
    expect(fonts.signLight).toBe('Fredoka-SemiBold');
    expect(fonts.hand).toBe('Caveat-SemiBold');
    expect(resolveFont('hand', () => false)).toBeUndefined();
    expect(type.sign).toMatchObject({ fontSize: 20, role: 'sign' });
    expect(type.hand.role).toBe('hand');
  });
});
