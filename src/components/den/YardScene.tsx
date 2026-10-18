import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyFeetInset } from '../../buddy/imageSkin';
import { BuildingId, BuildingLevel, artOr, buildingArtOrBest } from '../../art/artAssets';
import { BuddyMood } from '../buddy/buddyMood';
import { YardBuddy, YardBuddyGeometry } from './YardBuddy';
import { YardButterflies } from './YardButterflies';
import { BEHIND_DOGHOUSE_EXTRAS, YardExtras } from './YardExtras';
import type { WildExtraId } from './wildExtras';
import { SpotId, clampX } from './yardLife';
import { ArtImage, Badge, DecorImage, palette } from '../../ui';
import { t } from '../../i18n';

// The Den's yard scene: sky, a big grass stage, the three buildings and Buddy.
// Presentation only; the parent owns all state. It is the hero of the Den, so
// the buildings are large (stage 1 160px ... stage 5 300px).

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

/** Sprite box edge (px) per art stage. Sprites are square with transparent margins. */
export const STAGE_SIZE: Record<BuildingLevel, number> = { 1: 160, 2: 210, 3: 260, 4: 280, 5: 300 };

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
  doghouse: { cx: 0.5, baseTop: 0.6 },
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

/** Touch target in yard px, `bottom` measured up from the yard floor. */
export interface HitBox {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

/** A building's tap target covers only its tile: this share of the sprite width (centred) by this share of its height, standing on the tile base. */
const HIT_WIDTH_FRAC = 0.64;
const HIT_HEIGHT_FRAC = 0.3;

export interface YardLayout {
  sprites: Record<YardBuildingKey, LayoutBox>;
  /** Building tap targets. Never overlap Buddy's box (trimmed on the Buddy side), so his taps always win. */
  hits: Record<YardBuildingKey, HitBox>;
  buddy: LayoutBox;
  /** Badge boxes are BADGE_W x BADGE_H; `size` is unused (BADGE_W). */
  badges: Record<YardBuildingKey, LayoutBox>;
  ground: GroundBox;
}

/** If `hit` overlaps Buddy's box, cut it back horizontally on Buddy's side so the two never overlap. */
function trimAwayFrom(hit: HitBox, buddy: LayoutBox): void {
  const overlapsVertically = hit.bottom < buddy.bottom + buddy.size && hit.bottom + hit.height > buddy.bottom;
  const hitRight = hit.left + hit.width;
  const buddyRight = buddy.left + buddy.size;
  if (!overlapsVertically || hit.left >= buddyRight || hitRight <= buddy.left) return;
  const hitCentre = hit.left + hit.width / 2;
  if (hitCentre >= buddy.left + buddy.size / 2) {
    hit.width = hitRight - buddyRight;
    hit.left = buddyRight;
  } else {
    hit.width = buddy.left - hit.left;
  }
}

/** Pure geometry (px, `bottom` measured up from the yard floor) so it can be unit-tested. */
export function yardLayout(width: number, height: number, sizes: Record<YardBuildingKey, number>): YardLayout {
  const sprites = {} as Record<YardBuildingKey, LayoutBox>;
  const badges = {} as Record<YardBuildingKey, LayoutBox>;
  const hits = {} as Record<YardBuildingKey, HitBox>;
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
    const hitWidth = size * HIT_WIDTH_FRAC;
    hits[key] = {
      left: left + size / 2 - hitWidth / 2,
      bottom: bottom + (1 - SPRITE_BASE_FRAC) * size,
      width: hitWidth,
      height: size * HIT_HEIGHT_FRAC,
    };
    trimAwayFrom(hits[key], buddy);
  }
  return { sprites, hits, buddy, badges, ground: groundBox(width, height) };
}

/** Buddy stands this far to the inside of a side building's tile centre (clear of its level badge as far as the screen allows). */
export const SPOT_SIDE_OFFSET = 70;
/** Buddy's centre stays this far from the screen edges: his body stays on screen, over grass (the hill bleeds past both edges at the front line). */
export const WALK_EDGE_MARGIN = 52;

/** Pure: where Buddy may stand. Y never changes; he stays on the front ground line, below every tile base. */
export function yardWalkGeometry(layout: YardLayout, width: number): YardBuddyGeometry {
  const range = { min: WALK_EDGE_MARGIN, max: width - WALK_EDGE_MARGIN };
  const centers = {
    doghouse: layout.sprites.doghouse.left + layout.sprites.doghouse.size / 2,
    bakery: layout.sprites.bakery.left + layout.sprites.bakery.size / 2,
    sniffGarden: layout.sprites.sniffGarden.left + layout.sprites.sniffGarden.size / 2,
  };
  const baseCx = layout.buddy.left + layout.buddy.size / 2;
  const spots: Record<SpotId, number> = {
    front: clampX(baseCx, range),
    doghouse: clampX(centers.doghouse, range),
    bakery: clampX(centers.bakery - SPOT_SIDE_OFFSET, range),
    sniffGarden: clampX(centers.sniffGarden + SPOT_SIDE_OFFSET, range),
  };
  return { baseCx, bottom: layout.buddy.bottom, size: layout.buddy.size, spots, centers, range };
}

export interface YardBuilding {
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
  /** A Wild Extra to play now (rare cosmetic cameo); the scene reports when it has finished. */
  wildExtra?: { id: WildExtraId; onDone: () => void } | null;
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
  wildExtra = null,
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
  const [tap, setTap] = useState<{ building: YardBuildingKey; n: number } | null>(null);
  const gardenStage3 = (buildings.find((b) => b.key === 'sniffGarden')?.level ?? 0) >= ART_TIER_3_FROM_LEVEL;
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
      />
    );
  };
  const extraEl = wildExtra ? <YardExtras id={wildExtra.id} layout={layout} width={width} height={height} onDone={wildExtra.onDone} /> : null;
  const extraBehind = !!wildExtra && BEHIND_DOGHOUSE_EXTRAS.includes(wildExtra.id);
  const renderHit = (b: YardBuilding) => {
    const hit = layout.hits[b.key];
    return (
      <Pressable
        key={b.key}
        accessibilityRole="button"
        accessibilityLabel={t('den.showUpgrade', { name: t(BUILDING_NAME_KEY[b.key]) })}
        style={[styles.hit, { left: hit.left, bottom: hit.bottom, width: hit.width, height: hit.height }]}
        onPress={() => {
          setTap((prev) => ({ building: b.key, n: (prev?.n ?? 0) + 1 }));
          onSelectBuilding(b.key);
        }}
      />
    );
  };
  return (
    <View style={[styles.scene, { height }]}>
      {sky && <DecorImage source={sky} resizeMode="cover" style={StyleSheet.absoluteFillObject} />}
      {ground && (
        // Native ratio, contain (never crop the horizon); the hill bleeds past both side edges and the bottom.
        <DecorImage source={ground} resizeMode="contain" style={[styles.ground, { width: g.width, height: g.height, left: g.left, bottom: 0 }]} />
      )}
      {/* Touch layering (zIndex): sprites 0 (inert art), building hit boxes 1 (tile area only), Buddy 5, header overlay 10. */}
      {buildings.filter((b) => b.key !== 'doghouse').map(renderSprite)}
      <YardBuddy
        appearance={appearance}
        name={name}
        mood={mood}
        curiousFacing={facing}
        replayKey={upgrade?.n}
        geometry={yardWalkGeometry(layout, width)}
        butterflies={gardenStage3}
        tap={tap}
      />
      {extraBehind && extraEl}
      {buildings.filter((b) => b.key === 'doghouse').map(renderSprite)}
      {YARD_ORDER.map((k) => buildings.find((b) => b.key === k)).filter((b): b is YardBuilding => !!b).map(renderHit)}
      {gardenStage3 && <YardButterflies garden={layout.sprites.sniffGarden} />}
      {!extraBehind && extraEl}
      {/* Level badges sit above everything so none is ever hidden. */}
      {buildings.map((b) => {
        const box = layout.badges[b.key];
        return (
          <View key={b.key} pointerEvents="none" style={[styles.badgeWrap, { left: box.left, bottom: box.bottom }]}>
            <Badge label={`Lv ${b.level}`} tint="warm" />
          </View>
        );
      })}
      <View style={styles.overlay} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

export function BuildingSprite({
  building,
  size,
  left,
  bottom,
  bounceN,
}: {
  building: YardBuilding;
  size: number;
  left: number;
  bottom: number;
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
    <View style={[styles.sprite, { left, bottom, width: size, height: size }]} pointerEvents="none">
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
  scene: {
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: palette.skyTint,
  },
  ground: { position: 'absolute' },
  sprite: { position: 'absolute', zIndex: 0 },
  hit: { position: 'absolute', zIndex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  badgeWrap: { position: 'absolute', width: BADGE_W, height: BADGE_H, alignItems: 'center' },
  sparkle: { position: 'absolute', top: 0, right: 8, fontSize: 24 },
});
