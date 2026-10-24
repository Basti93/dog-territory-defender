// Fur-zone skin: each Buddy piece is a stack of tinted flat masks + a shade overlay (+ untinted details).
// RN tintColor replaces RGB and keeps alpha, so the shading lives in its own black/white overlay layer.
// The stack sits inside the part's existing Animated view, so animation cost is unchanged.
import React from 'react';
import { Image, ImageSourcePropType, View, ViewStyle } from 'react-native';

import { BuddyAppearance, BuddyFur, FUR_ZONES, softenToClay } from './buddyAppearance';
import type { BuddyPart, PartRenderer } from './buddySkin';
import { ZONE_UNITS } from './zoneSources';

export interface ZoneLayer {
  source: ImageSourcePropType;
  /** Missing = draw as-is (shade, details). */
  tint?: string;
}

/** Zone unit (manifest name) that draws a Buddy part for this look; undefined = part not zone-drawn. */
export function zoneUnitName(part: BuddyPart, a: BuddyAppearance, fur: BuddyFur): string | undefined {
  switch (part) {
    case 'body':
      return 'body';
    case 'head':
      return fur.muzzle === 'medium' ? 'head' : `head-${fur.muzzle}`;
    case 'frontLegs':
      return 'front-legs';
    case 'frontLegsWalkA':
      return 'front-legs-walk-a';
    case 'frontLegsWalkB':
      return 'front-legs-walk-b';
    case 'earLeft':
      return `ear-left-${a.earStyle}`;
    case 'earRight':
      return `ear-right-${a.earStyle}`;
    case 'tail':
      return fur.furLength === 'fluffy' ? `tail-${a.tailStyle}-fluffy` : `tail-${a.tailStyle}`;
    case 'poseLying':
      return 'pose-lying';
    case 'fluff':
      return fur.furLength === 'short' ? undefined : `fluff-${fur.furLength}`;
    default:
      return undefined;
  }
}

/** Layers of one unit, bottom to top. A sub-zone whose colour equals the base colour is skipped (fewer bitmaps). */
export function zoneLayers(unitName: string, fur: BuddyFur): ZoneLayer[] {
  const unit = ZONE_UNITS[unitName];
  if (!unit) return [];
  const colour = (z: (typeof FUR_ZONES)[number]) => softenToClay(fur.zones[z]);
  const baseColour = colour(unit.base);
  const layers: ZoneLayer[] = [];
  const baseMask = unit.masks[unit.base];
  if (baseMask) layers.push({ source: baseMask, tint: baseColour });
  for (const z of FUR_ZONES) {
    const mask = unit.masks[z];
    if (z === unit.base || !mask || colour(z) === baseColour) continue;
    layers.push({ source: mask, tint: colour(z) });
  }
  if (unit.shade) layers.push({ source: unit.shade });
  if (unit.detail) layers.push({ source: unit.detail });
  return layers;
}

const ZONE_PARTS: BuddyPart[] = ['body', 'head', 'frontLegs', 'frontLegsWalkA', 'frontLegsWalkB', 'earLeft', 'earRight', 'tail', 'poseLying', 'fluff'];

/** Part renderers for the zone-drawn parts; merge over an image skin built from the common layers. */
export function zoneParts(
  a: BuddyAppearance,
  fur: BuddyFur,
  options: { scale: number; scaleOriginY: number }
): Partial<Record<BuddyPart, PartRenderer>> {
  const out: Partial<Record<BuddyPart, PartRenderer>> = {};
  for (const part of ZONE_PARTS) {
    const unit = zoneUnitName(part, a, fur);
    if (!unit) continue;
    const layers = zoneLayers(unit, fur);
    if (layers.length === 0) continue;
    out[part] = ({ size }) => {
      const shift = (options.scaleOriginY - 0.5) * size;
      const style: ViewStyle = {
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        // RN scales about the centre; shift so the scale pivots on the feet (same as createImageSkin).
        ...(options.scale === 1 ? {} : { transform: [{ translateY: shift }, { scale: options.scale }, { translateY: -shift }] }),
      };
      return React.createElement(
        View,
        { style, pointerEvents: 'none' },
        layers.map((l, i) =>
          React.createElement(Image, {
            key: i,
            source: l.source,
            resizeMode: 'contain',
            style: { position: 'absolute', left: 0, top: 0, width: size, height: size, ...(l.tint ? { tintColor: l.tint } : {}) },
          })
        )
      );
    };
  }
  return out;
}
