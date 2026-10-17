import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyFeetInset } from '../../buddy/imageSkin';
import { BuildingId, BuildingLevel, artOr, buildingArt } from '../../art/artAssets';
import { BuddyAvatar } from '../buddy';
import { BuddyMood } from '../buddy/buddyMood';
import { ArtImage, Badge, PressableScale, palette } from '../../ui';
import { t } from '../../i18n';

// The Den's yard scene: sky, a big grass stage, the three buildings and Buddy.
// Presentation only; the parent owns all state. It is the hero of the Den, so
// the buildings are large (stage 1 160px, stage 2 210px, stage 3 260px).

export type YardBuildingKey = 'doghouse' | 'bakery' | 'sniffGarden';

export const YARD_ORDER: YardBuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

const ART_ID: Record<YardBuildingKey, BuildingId> = { doghouse: 'doghouse', bakery: 'bakery', sniffGarden: 'garden' };

// Presentation-only mapping from real building level (up to 100) to the three
// art stages. Tuned by eye, not an economy number: change freely.
export const ART_TIER_2_FROM_LEVEL = 4;
export const ART_TIER_3_FROM_LEVEL = 10;

export function artTierForLevel(level: number): BuildingLevel {
  if (level >= ART_TIER_3_FROM_LEVEL) return 3;
  if (level >= ART_TIER_2_FROM_LEVEL) return 2;
  return 1;
}

/** Sprite box edge (px) per art stage. Sprites are square with transparent margins. */
export const STAGE_SIZE: Record<BuildingLevel, number> = { 1: 160, 2: 210, 3: 260 };

/** Yard height: ~48% of the screen, never so short that a stage-3 doghouse gets squashed. */
export const YARD_MIN_HEIGHT = 380;
export const YARD_MAX_HEIGHT = 440;
export function yardHeightFor(screenHeight: number): number {
  return Math.max(YARD_MIN_HEIGHT, Math.min(YARD_MAX_HEIGHT, Math.round(screenHeight * 0.48)));
}

const BUDDY_SIZE = 130;
// All vertical shares below are measured from the TOP of the yard (H = yard height).
// Buddy's FEET stand here; his box is lowered by buddyFeetInset so the empty canvas below his paws doesn't float him.
const BUDDY_FEET_TOP = 0.95;
const BUDDY_CX = 0.58; // front-centre, in the gap between the bakery and garden badges
/** Side buildings may hang this share of their own width past the screen edge (the hill bleeds off-screen too). */
const EDGE_OVERLAP = 0.1;
const BADGE_W = 72;
const BADGE_H = 28;
/** A building sprite's visual tile base sits at this share of the sprite height; the rest is transparent margin. */
const SPRITE_BASE_FRAC = 0.86;

// Where each building's TILE BASE stands: horizontal centre as a share of the yard width,
// and base line as a share of yard height from the top. All three are inside the grass.
const PLACEMENT: Record<YardBuildingKey, { cx: number; baseTop: number }> = {
  doghouse: { cx: 0.5, baseTop: 0.62 },
  bakery: { cx: 0.2, baseTop: 0.9 },
  sniffGarden: { cx: 0.8, baseTop: 0.9 },
};

// i18n keys (shared with DenScreen's building cards), resolved at render time.
const BUILDING_NAME_KEY: Record<YardBuildingKey, string> = {
  doghouse: 'den.building.doghouse.name',
  bakery: 'den.building.bakery.name',
  sniffGarden: 'den.building.sniffGarden.name',
};

/** yard-ground-wide.png is a 2:1 hill (2048x1024) filling everything under its horizon edge to edge; measured horizon peaks ~26% from the image top (centre), ~39% at the sides. */
export const GROUND_ASPECT = 2;
const GROUND_HORIZON_IN_IMAGE = 0.26;
/** Target horizon, share of yard height from the top (sky above). */
const GROUND_HORIZON_TOP = 0.4;
/** Ground is at least this much wider than the screen so its edges bleed off both sides. */
const GROUND_MIN_WIDTH_SHARE = 1.25;

export interface GroundBox {
  width: number;
  height: number;
  left: number;
  /** Image top, px from the yard top (its bottom edge is the yard bottom, or lower). */
  top: number;
  /** Horizon peak, px from the yard top. */
  horizonY: number;
}

/**
 * Hill geometry. Anchored to the yard bottom so no sky shows under it; sized so the horizon lands at
 * ~0.40H (a wider screen makes it taller, so the horizon rises a little). Contain-fit, never cropped.
 */
export function groundBox(width: number, height: number): GroundBox {
  const hForHorizon = (height * (1 - GROUND_HORIZON_TOP)) / (1 - GROUND_HORIZON_IN_IMAGE);
  const groundHeight = Math.max(hForHorizon, (width * GROUND_MIN_WIDTH_SHARE) / GROUND_ASPECT);
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

export interface YardLayout {
  sprites: Record<YardBuildingKey, LayoutBox>;
  buddy: LayoutBox;
  /** Badge boxes are BADGE_W x BADGE_H; `size` is unused (BADGE_W). */
  badges: Record<YardBuildingKey, LayoutBox>;
  ground: GroundBox;
}

/** Pure geometry (px, `bottom` measured up from the yard floor) so it can be unit-tested. */
export function yardLayout(width: number, height: number, sizes: Record<YardBuildingKey, number>): YardLayout {
  const sprites = {} as Record<YardBuildingKey, LayoutBox>;
  const badges = {} as Record<YardBuildingKey, LayoutBox>;
  const buddy: LayoutBox = { left: width * BUDDY_CX - BUDDY_SIZE / 2, bottom: height * (1 - BUDDY_FEET_TOP) - buddyFeetInset(BUDDY_SIZE), size: BUDDY_SIZE };
  for (const key of YARD_ORDER) {
    const size = sizes[key];
    const place = PLACEMENT[key];
    // Shift inward rather than clip off the screen edge.
    const overlap = key === 'doghouse' ? 0 : size * EDGE_OVERLAP;
    const left = Math.max(-overlap, Math.min(width - size + overlap, width * place.cx - size / 2));
    // box bottom is lowered by the transparent margin under the tile so the TILE BASE lands on baseTop
    const bottom = height * (1 - place.baseTop) - (1 - SPRITE_BASE_FRAC) * size;
    sprites[key] = { left, bottom, size };
    const badgeLeft = left + size / 2 - BADGE_W / 2;
    // The doghouse badge sits just above Buddy's box (on the doghouse's lower body), never on his head;
    // the side badges hang at their building's base, below Buddy's head height.
    // Under each tile; the side ones hang a little lower so they stay below Buddy's head height.
    // Under each tile. The doghouse badge would land on Buddy's head, so it never dips below his box top.
    const underTile = height * (1 - place.baseTop) - BADGE_H - 4;
    const badgeBottom = key === 'doghouse' ? Math.max(underTile + 12, buddy.bottom + buddy.size) : underTile;
    badges[key] = { left: badgeLeft, bottom: badgeBottom, size: BADGE_W };
  }
  return { sprites, buddy, badges, ground: groundBox(width, height) };
}

interface YardBuilding {
  key: YardBuildingKey;
  level: number;
}

interface YardSceneProps {
  appearance: BuddyAppearance;
  name: string;
  buildings: YardBuilding[];
  mood: BuddyMood;
  /** Building Buddy sniffs toward (tapped, else cheapest affordable upgrade), or null. */
  curiousAbout: YardBuildingKey | null;
  /** Changes on every successful upgrade; `building` bounces and sparkles. */
  upgrade: { building: YardBuildingKey; n: number } | null;
  /** Tap on a building (the screen scrolls to its upgrade card). */
  onSelectBuilding: (key: YardBuildingKey) => void;
  height: number;
  /** Overlay drawn on top of the scene (the Den header). */
  children?: React.ReactNode;
}

export function YardScene({
  appearance,
  name,
  buildings,
  mood,
  curiousAbout,
  upgrade,
  onSelectBuilding,
  height,
  children,
}: YardSceneProps) {
  const { width } = useWindowDimensions();
  const sky = artOr('doorstep-sky', null);
  const ground = artOr('yard-ground-wide', null);
  // Buddy looks toward the building he is curious about: bakery is on the left, the rest on the right.
  const facing = curiousAbout === 'bakery' ? 'left' : 'right';
  const sizes = {} as Record<YardBuildingKey, number>;
  for (const b of buildings) sizes[b.key] = STAGE_SIZE[artTierForLevel(b.level)];
  const layout = yardLayout(width, height, sizes);
  const g = layout.ground;
  const renderSprite = (b: YardBuilding) => {
    const box = layout.sprites[b.key];
    return (
      <BuildingSprite
        key={b.key}
        building={b}
        size={box.size}
        left={box.left}
        bottom={box.bottom}
        bounceN={upgrade && upgrade.building === b.key ? upgrade.n : 0}
        onPress={() => onSelectBuilding(b.key)}
      />
    );
  };
  return (
    <View style={[styles.scene, { height }]}>
      {sky && <Image source={sky} resizeMode="cover" style={StyleSheet.absoluteFillObject} />}
      {ground && (
        // Native ratio, contain (never crop the horizon); the hill bleeds past both side edges and the bottom.
        <Image source={ground} resizeMode="contain" style={[styles.ground, { width: g.width, height: g.height, left: g.left, top: g.top }]} />
      )}
      {/* Draw order: side buildings, Buddy, then the doghouse last so it stays tappable. */}
      {buildings.filter((b) => b.key !== 'doghouse').map(renderSprite)}
      <View style={[styles.buddy, { left: layout.buddy.left, bottom: layout.buddy.bottom }]} pointerEvents="box-none">
        <BuddyAvatar
          appearance={appearance}
          size={BUDDY_SIZE}
          replayKey={upgrade?.n}
          facing={facing}
          mood={mood}
          name={name}
          excitedSettleMs={null}
        />
      </View>
      {buildings.filter((b) => b.key === 'doghouse').map(renderSprite)}
      {/* Level badges sit above everything so none is ever hidden. */}
      {buildings.map((b) => {
        const box = layout.badges[b.key];
        return (
          <View key={b.key} pointerEvents="none" style={[styles.badgeWrap, { left: box.left, bottom: box.bottom }]}>
            <Badge label={`Lv ${b.level}`} tint="warm" />
          </View>
        );
      })}
      {children}
    </View>
  );
}

function BuildingSprite({
  building,
  size,
  left,
  bottom,
  bounceN,
  onPress,
}: {
  building: YardBuilding;
  size: number;
  left: number;
  bottom: number;
  bounceN: number;
  onPress: () => void;
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
    <View style={[styles.sprite, { left, bottom, width: size, height: size }]} pointerEvents="box-none">
      <Animated.View style={{ transform: [{ scale }] }}>
        <PressableScale onPress={onPress} accessibilityLabel={t('den.showUpgrade', { name: t(BUILDING_NAME_KEY[building.key]) })}>
          <ArtImage art={buildingArt(ART_ID[building.key], artTierForLevel(building.level))} size={size} />
        </PressableScale>
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
  scene: {
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: palette.skyTint,
  },
  ground: { position: 'absolute' },
  sprite: { position: 'absolute' },
  badgeWrap: { position: 'absolute', width: BADGE_W, height: BADGE_H, alignItems: 'center' },
  buddy: { position: 'absolute' },
  sparkle: { position: 'absolute', top: 0, right: 8, fontSize: 24 },
});
