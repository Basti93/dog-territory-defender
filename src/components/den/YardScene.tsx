import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { BuildingId, BuildingLevel, buildingArtOrBest } from '../../art/artAssets';
import type { YardBuddyGeometry } from './YardBuddy';
import { SpotId, clampX } from './yardLife';
import { ArtImage } from '../../ui';

// Yard (Hof) layout maths (ground box, Buddy's walk geometry), the one building size and the BuildingSprite, used by the
// WorldScene. Buildings stand on their own page; the Hof has Buddy, bench, bowl and mailbox.

export type YardBuildingKey = 'doghouse' | 'bakery' | 'sniffGarden';

export const YARD_ORDER: YardBuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

const ART_ID: Record<YardBuildingKey, BuildingId> = { doghouse: 'doghouse', bakery: 'bakery', sniffGarden: 'garden' };

// Presentation-only mapping from real building level (up to 100) to the five
// art stages. Tuned by eye, not an economy number: change freely.
export const ART_TIER_2_FROM_LEVEL = 4;
export const ART_TIER_3_FROM_LEVEL = 10;
export const ART_TIER_4_FROM_LEVEL = 20;
export const ART_TIER_5_FROM_LEVEL = 35;

export function artTierForLevel(level: number): BuildingLevel {
  if (level >= ART_TIER_5_FROM_LEVEL) return 5;
  if (level >= ART_TIER_4_FROM_LEVEL) return 4;
  if (level >= ART_TIER_3_FROM_LEVEL) return 3;
  if (level >= ART_TIER_2_FROM_LEVEL) return 2;
  return 1;
}

/**
 * One world scale for every building sprite (all families and stages): the sprite canvas is square, BUILDING_SIZE pt wide.
 * The art is rendered with one shared scale (scripts/blender BUILDING_SCALE), so a stage-5 house is bigger than a stage-1
 * hut by its own geometry, not by a per-stage display size. Widest sprite = 86% of the canvas (garden stage 4): two per row fit a 390 pt page.
 */
export const BUILDING_SIZE = 206;
/** Every sprite's ground point (footprint centre) sits at this canvas fraction (x 0.5, y 0.69): a building stands on `ground - (1 - 0.69) * size` as its bottom edge. */
export const SPRITE_GROUND_Y_FRAC = 0.69;

/** Yard height: ~48% of the screen, never so short that the gate and Buddy get squashed. */
export const YARD_MIN_HEIGHT = 380;
export const YARD_MAX_HEIGHT = 440;

/** yard-ground-wide.png is a 2:1 hill (2048x1024) filling everything under its horizon edge to edge; measured horizon peaks ~26% from the image top (centre), ~39% at the sides. */
export const GROUND_ASPECT = 2;
export const GROUND_HORIZON_IN_IMAGE = 0.26;
/** Grass box height as a share of yard height: grass fills the lower ~60% (horizon ~0.42H), the box reaches higher because the image top is sky-transparent. */
const GROUND_HEIGHT_SHARE = 0.78;
/** Ground is at least this much wider than the screen so its edges bleed off both sides. */
const GROUND_MIN_WIDTH_SHARE = 1.25;

export interface GroundBox {
  width: number;
  height: number;
  left: number;
  /** Image top, px from the yard top. The box bottom is exactly the yard bottom. */
  top: number;
  /** Horizon peak, px from the yard top. */
  horizonY: number;
}

/**
 * Hill geometry. Box is exactly 2:1 (matches the image, so `contain` letterboxes nothing), anchored to the
 * yard bottom, centred horizontally, bleeding past both sides.
 */
export function groundBox(width: number, height: number): GroundBox {
  const groundHeight = Math.max(height * GROUND_HEIGHT_SHARE, (width * GROUND_MIN_WIDTH_SHARE) / GROUND_ASPECT);
  const groundWidth = groundHeight * GROUND_ASPECT;
  const top = height - groundHeight;
  return {
    width: groundWidth,
    height: groundHeight,
    left: (width - groundWidth) / 2,
    top,
    horizonY: top + GROUND_HORIZON_IN_IMAGE * groundHeight,
  };
}

export interface LayoutBox {
  left: number;
  bottom: number;
  size: number;
}

/** Fixed Hof points the Wild Extras play at (the buildings live on their own page now). All in px from the yard top / left. */
export interface ExtraAnchors {
  daisyCx: number;
  duckBaseY: number;
  fireflyCx: number;
  teaCx: number;
  teaBaseY: number;
}

/** The Hof (yard) geometry: Buddy's resting box (`bottom` measured up from the yard floor), the hill and the Extras' anchors. */
export interface YardLayout {
  buddy: LayoutBox;
  ground: GroundBox;
  extras: ExtraAnchors;
}

/** Buddy stands this far from the screen edges at the bench / mailbox spots. */
export const SPOT_EDGE_OFFSET = 90;
/** Buddy's centre stays this far from the screen edges: his body stays on screen, over grass (the hill bleeds past both edges at the front line). */
export const WALK_EDGE_MARGIN = 52;

/**
 * Pure: where Buddy may stand. Y never changes. `front` is the middle, above the bowl; `bench` and `mailbox` are the
 * left and right ends of the bottom row's props.
 */
export function yardWalkGeometry(layout: YardLayout, width: number): YardBuddyGeometry {
  const range = { min: WALK_EDGE_MARGIN, max: width - WALK_EDGE_MARGIN };
  const baseCx = layout.buddy.left + layout.buddy.size / 2;
  const spots: Record<SpotId, number> = {
    front: clampX(baseCx, range),
    bench: clampX(SPOT_EDGE_OFFSET, range),
    mailbox: clampX(width - SPOT_EDGE_OFFSET, range),
  };
  return { baseCx, bottom: layout.buddy.bottom, size: layout.buddy.size, spots, range };
}

export interface YardBuilding {
  key: YardBuildingKey;
  level: number;
}

export function BuildingSprite({
  building,
  size,
  left,
  top,
  bounceN,
}: {
  building: YardBuilding;
  size: number;
  left: number;
  top: number;
  bounceN: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (bounceN === 0) return;
    scale.setValue(1);
    sparkle.setValue(0);
    const anim = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.15, duration: 140, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }),
      ]),
      Animated.timing(sparkle, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [bounceN, scale, sparkle]);

  return (
    <View style={[styles.sprite, { left, top, width: size, height: size }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale }] }}>
        <ArtImage art={buildingArtOrBest(ART_ID[building.key], artTierForLevel(building.level))} size={size} />
      </Animated.View>
      <Animated.Text
        pointerEvents="none"
        style={[
          styles.sparkle,
          {
            opacity: sparkle.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }],
          },
        ]}
      >
        ✨
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sprite: { position: 'absolute', zIndex: 0 },
  sparkle: { position: 'absolute', top: 0, right: 8, fontSize: 24 },
});
