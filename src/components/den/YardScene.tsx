import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance } from '../../buddy/buddyAppearance';
import { BuildingId, BuildingLevel, artOr, buildingArt } from '../../art/artAssets';
import { BuddyAvatar } from '../buddy';
import { BuddyMood } from '../buddy/buddyMood';
import { tokens } from '../../ui';

// The Den's yard scene (buddy-comes-alive, task 3.3): ground, the three
// buildings and Buddy. Presentation only; the parent owns all state.

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

interface YardBuilding {
  key: YardBuildingKey;
  level: number;
  color: string;
  lightColor: string;
}

interface YardSceneProps {
  appearance: BuddyAppearance;
  name: string;
  buildings: YardBuilding[];
  mood: BuddyMood;
  /** Building Buddy sniffs toward (cheapest affordable upgrade), or null. */
  curiousAbout: YardBuildingKey | null;
  /** Changes on every successful upgrade; `building` bounces and sparkles. */
  upgrade: { building: YardBuildingKey; n: number } | null;
}

// Capped so Buddy's top stays below the middle building's level badge (scene height 224).
const BUDDY_SIZE = 96;

export function YardScene({ appearance, name, buildings, mood, curiousAbout, upgrade }: YardSceneProps) {
  const groundArt = artOr('yard-ground', null);
  // Buddy looks toward the building he is curious about; right otherwise.
  const facing = curiousAbout === 'doghouse' ? 'left' : 'right';
  return (
    <View style={styles.scene}>
      {groundArt ? (
        <Image source={groundArt} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : (
        <View style={styles.ground} />
      )}
      <View style={styles.buildingRow}>
        {buildings.map((b) => (
          <BuildingSprite
            key={b.key}
            building={b}
            bounceN={upgrade && upgrade.building === b.key ? upgrade.n : 0}
          />
        ))}
      </View>
      <View style={styles.buddy} pointerEvents="box-none">
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
    </View>
  );
}

function BuildingSprite({ building, bounceN }: { building: YardBuilding; bounceN: number }) {
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

  const art = artOr(buildingArt(ART_ID[building.key], artTierForLevel(building.level)), null);

  return (
    <Animated.View style={[styles.sprite, { transform: [{ scale }] }]}>
      {art ? (
        <Image source={art} style={styles.spriteArt} resizeMode="contain" />
      ) : (
        <DrawnBuilding building={building} />
      )}
      <View style={[styles.badge, { borderColor: building.color }]}>
        <Text style={styles.badgeText}>Lv {building.level}</Text>
      </View>
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
    </Animated.View>
  );
}

// Simple rounded stand-ins until the pre-rendered sprites land.
function DrawnBuilding({ building }: { building: YardBuilding }) {
  const { key, color, lightColor } = building;
  if (key === 'doghouse') {
    return (
      <View style={styles.drawn}>
        <View style={[styles.roof, { backgroundColor: color }]} />
        <View style={[styles.body, { backgroundColor: lightColor, borderColor: color }]}>
          <View style={[styles.door, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }
  if (key === 'bakery') {
    return (
      <View style={styles.drawn}>
        <View style={styles.awning}>
          <View style={[styles.stripe, { backgroundColor: tokens.warm }]} />
          <View style={[styles.stripe, { backgroundColor: tokens.white }]} />
          <View style={[styles.stripe, { backgroundColor: tokens.warm }]} />
          <View style={[styles.stripe, { backgroundColor: tokens.white }]} />
        </View>
        <View style={[styles.body, { backgroundColor: lightColor, borderColor: color }]}>
          <View style={[styles.window, { backgroundColor: tokens.white }]} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.drawn, styles.bushRow]}>
      <View style={[styles.bush, { backgroundColor: lightColor, borderColor: color, width: 30, height: 30 }]} />
      <View style={[styles.bush, { backgroundColor: lightColor, borderColor: color, width: 38, height: 38 }]} />
      <View style={[styles.bush, { backgroundColor: lightColor, borderColor: color, width: 28, height: 28 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    height: 224,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: tokens.meadow,
    marginBottom: 16,
  },
  // Fallback for the 'yard-ground' sprite: a soft green strip at the bottom.
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: tokens.green,
    opacity: 0.3,
  },
  buildingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: 16,
    paddingHorizontal: 8,
  },
  buddy: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
  },
  sprite: { alignItems: 'center', width: 88 },
  spriteArt: { width: 72, height: 72 },
  drawn: { width: 72, height: 66, alignItems: 'center', justifyContent: 'flex-end' },
  roof: { width: 52, height: 22, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginBottom: -2 },
  body: { width: 52, height: 38, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'flex-end' },
  door: { width: 16, height: 20, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  window: { width: 20, height: 16, borderRadius: 6, marginBottom: 8 },
  awning: { flexDirection: 'row', width: 60, height: 14, borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden' },
  stripe: { flex: 1 },
  bushRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  bush: { borderRadius: 20, borderWidth: 2, marginHorizontal: -3 },
  badge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: tokens.white,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: tokens.text },
  sparkle: { position: 'absolute', top: 0, right: 8, fontSize: 18 },
});
