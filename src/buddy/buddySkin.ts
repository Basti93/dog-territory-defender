// Skin interface for Buddy (skin-swappable rig). BuddyAvatar only positions
// and animates parts; a BuddySkin draws them. Ship: `vectorSkin` (SVG, default)
// and `createImageSkin` (painted PNG layers, see assets/buddy/README.md).
import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';

import { BuddyAppearance } from './buddyAppearance';
import { vectorSkin } from './vectorSkin';

export type BuddyPart =
  | 'body'
  | 'head'
  | 'earLeft'
  | 'earRight'
  | 'tail'
  | 'frontLegs'
  | 'eyesOpen'
  | 'eyesClosed'
  | 'mouthHappy'
  | 'zzz';

/** All parts share the SAME square canvas, so parts align when stacked. */
export interface PartBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PartRenderArgs {
  appearance: BuddyAppearance;
  /** Avatar edge length in px (= partBox.width). */
  size: number;
  partBox: PartBox;
}

export type PartRenderer = (args: PartRenderArgs) => React.ReactElement;

/** Point as a fraction (0..1) of the canvas, y down. */
export interface PivotPoint {
  x: number;
  y: number;
}

export interface BuddyPivots {
  head: PivotPoint; // neck
  tail: PivotPoint; // tail base
  earLeft: PivotPoint; // ear root
  earRight: PivotPoint; // ear root
}

export interface BuddySkin {
  /** Which way the artwork faces before any flipping. */
  nativeFacing: 'left' | 'right';
  /** Rotation pivots; may depend on appearance (e.g. size proportions). */
  pivots(appearance: BuddyAppearance): BuddyPivots;
  /** Ground line as a fraction of canvas height (used for squash pivot + shadow). */
  groundY: number;
  parts: Record<Exclude<BuddyPart, 'zzz'>, PartRenderer> & { zzz?: PartRenderer };
}

const FILL = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  mirrored: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, transform: [{ scaleX: -1 }] },
});

function mirrorPivot(p: PivotPoint): PivotPoint {
  return { x: 1 - p.x, y: p.y };
}

/** Flip a skin's facing: parts are wrapped in a scaleX -1 View, pivots mirrored. */
function mirrorSkin(skin: BuddySkin): BuddySkin {
  const wrap =
    (render: PartRenderer): PartRenderer =>
    (args) =>
      React.createElement(View, { style: FILL.mirrored, pointerEvents: 'none' }, render(args));
  const parts = {} as BuddySkin['parts'];
  (Object.keys(skin.parts) as BuddyPart[]).forEach((k) => {
    const r = skin.parts[k];
    if (r) parts[k] = k === 'zzz' ? r : wrap(r); // text must not be mirrored
  });
  return {
    nativeFacing: skin.nativeFacing === 'left' ? 'right' : 'left',
    groundY: skin.groundY,
    parts,
    pivots: (a) => {
      const p = skin.pivots(a);
      return {
        head: mirrorPivot(p.head),
        tail: mirrorPivot(p.tail),
        earLeft: mirrorPivot(p.earLeft),
        earRight: mirrorPivot(p.earRight),
      };
    },
  };
}

/**
 * Painted-PNG skin. Parts with a source render an <Image resizeMode="contain">
 * filling the shared canvas; others fall back to the vector part (mirrored to
 * face LEFT like the PNG art). Part names match assets/buddy/README.md.
 */
export function createImageSkin(
  sources: Partial<Record<BuddyPart, ImageSourcePropType>>,
  pivots?: Partial<BuddyPivots>
): BuddySkin {
  const fallback = mirrorSkin(vectorSkin); // faces left
  const parts = { ...fallback.parts } as BuddySkin['parts'];
  (Object.keys(sources) as BuddyPart[]).forEach((part) => {
    const source = sources[part];
    if (!source) return;
    parts[part] = () =>
      React.createElement(Image, { source, resizeMode: 'contain', style: FILL.fill });
  });
  return {
    nativeFacing: 'left',
    groundY: fallback.groundY,
    parts,
    pivots: (a) => ({ ...fallback.pivots(a), ...pivots }),
  };
}

export { vectorSkin };
