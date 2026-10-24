import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { artOr } from '../../art/artAssets';
import { DecorImage, tokens } from '../../ui';
import type { DecorItem, MeadowLayout, Patch } from './meadowDecor';

// Static, non-interactive meadow decor: one render, no animation, no per-frame work. Rendered behind the buildings (first in the
// layer) so sprites, tap areas and signs always sit on top. The Hof's own ground colour fades into the page colour at the top.

/** Token colour with an alpha (hex `#RRGGBB` + two alpha digits). */
const soft = (hex: string, alpha: number) => hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
const PATCH_TONE: Record<Patch['kind'], string> = {
  light: soft('#FFFFFF', 0.12),
  dark: soft(tokens.green, 0.1),
  path: soft(tokens.brown, 0.17), // worn earth
};

function DecorSprite({ item }: { item: DecorItem }) {
  const source = artOr(item.art, null);
  if (!source) return null;
  return (
    <DecorImage
      source={source}
      resizeMode="contain"
      style={{ position: 'absolute', left: item.left, top: item.top, width: item.width, height: item.height, transform: item.flip ? [{ scaleX: -1 }] : undefined }}
    />
  );
}

/** Static ground (fade, patches, paths) under everything; `hedges` stand behind the buildings. */
export const MeadowGround = memo(function MeadowGround({ layout, width, fromColor, toColor }: { layout: MeadowLayout; width: number; fromColor: string; toColor: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={layout.fadeH} style={styles.fade}>
        <Defs>
          <LinearGradient id="meadowFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fromColor} />
            <Stop offset="1" stopColor={toColor} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={layout.fadeH} fill="url(#meadowFade)" />
      </Svg>
      {layout.patches.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.cx - p.width / 2,
            top: p.cy - p.height / 2,
            width: p.width,
            height: p.height,
            borderRadius: p.height / 2 + p.width / 2,
            backgroundColor: PATCH_TONE[p.kind],
            transform: [{ rotate: `${p.rotateDeg}deg` }],
          }}
        />
      ))}
      {layout.hedges.map((h, i) => (
        <DecorSprite key={`h${i}`} item={h} />
      ))}
    </View>
  );
});

/** Flowers, tufts, stones, bushes and a tree, back to front. */
export const MeadowProps = memo(function MeadowProps({ items }: { items: DecorItem[] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((it, i) => (
        <DecorSprite key={i} item={it} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, top: 0 },
});
