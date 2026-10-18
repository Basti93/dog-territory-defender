import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { material, tokens } from '../../ui';
import { trailDrawing } from '../../postcards/trailPath';
import type { PostcardEntry } from '../../postcards/postcards';

// A postcard as a small static paper card (bench and Album grid): cream paper, chalk edge with a heavier lower edge
// (clay depth, same idea as the wood signs), the trail drawn as a tiny polyline on linen. No WebView, no map.

export const POSTCARD_ASPECT = 2 / 3;

interface PostcardThumbProps {
  entry: PostcardEntry;
  width: number;
  /** Tilt in degrees. */
  rotate?: number;
  /** Buddy's favourite: a small paw stamp in the corner. */
  favourite?: boolean;
  testID?: string;
}

export function PostcardThumb({ entry, width, rotate = 0, favourite = false, testID }: PostcardThumbProps) {
  const height = Math.round(width * POSTCARD_ASPECT);
  const pad = Math.max(2, Math.round(width * 0.06));
  const innerW = width - 2 * pad - 3;
  const innerH = height - 2 * pad - 4;
  const scale = width / 100;
  return (
    <View
      testID={testID}
      style={[styles.paper, { width, height, borderRadius: Math.max(2, 4 * scale), transform: [{ rotate: `${rotate}deg` }] }]}
    >
      <View style={[styles.picture, { margin: pad - 1, borderRadius: Math.max(1, 2 * scale) }]}>
        {entry.kind === 'tracked' ? (
          <TrailThumb locations={entry.walk.locations} width={innerW} height={innerH} />
        ) : (
          <WritingThumb width={innerW} height={innerH} />
        )}
      </View>
      {favourite && (
        <View style={[styles.stamp, { right: Math.max(1, 2 * scale), bottom: Math.max(1, 2 * scale) }]} testID={testID ? `${testID}-stamp` : undefined}>
          <PawStamp size={Math.min(26, Math.max(12, Math.round(width * 0.3)))} />
        </View>
      )}
    </View>
  );
}

function TrailThumb({ locations, width, height }: { locations: PostcardEntry['walk']['locations']; width: number; height: number }) {
  const scale = width / 100;
  const drawing = useMemo(() => trailDrawing(locations, width, height, Math.max(3, 8 * scale)), [locations, width, height, scale]);
  return (
    <>
      {/* A felt patch under the trail, the patchwork look in miniature. */}
      <View
        style={{
          position: 'absolute',
          left: width * 0.1,
          right: width * 0.1,
          top: height * 0.1,
          bottom: height * 0.1,
          borderRadius: Math.max(2, 3 * scale),
          backgroundColor: material.feltUsual,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: material.yarn,
        }}
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {drawing.paths.map((d, i) => (
          <Path key={`bed${i}`} d={d} fill="none" stroke={material.pathBrown} strokeWidth={Math.max(1.6, 3.4 * scale)} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {drawing.paths.map((d, i) => (
          <Path
            key={`paw${i}`}
            d={d}
            fill="none"
            stroke={tokens.brown}
            strokeWidth={Math.max(0.8, 1.2 * scale)}
            strokeDasharray={`0.1 ${Math.max(3, 5 * scale)}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {drawing.start && <Ellipse cx={drawing.start.x} cy={drawing.start.y} rx={Math.max(1.6, 3 * scale)} ry={Math.max(1.6, 3 * scale)} fill={tokens.green} stroke={material.yarn} strokeWidth={1} />}
      </Svg>
    </>
  );
}

/** A card with no route (a logged walk): a little stamp and handwriting lines, as on the bench mockup. */
function WritingThumb({ width, height }: { width: number; height: number }) {
  const scale = width / 100;
  const line = { height: Math.max(1.5, 2 * scale), borderRadius: 2, backgroundColor: material.chalk, opacity: 0.8 } as const;
  return (
    <View style={{ flex: 1, flexDirection: 'row', padding: Math.max(3, 8 * scale), gap: Math.max(3, 6 * scale) }}>
      <View style={{ width: width * 0.26, height: height * 0.36, borderRadius: Math.max(1, 2 * scale), backgroundColor: material.feltUsual }} />
      <View style={{ flex: 1, justifyContent: 'center', gap: Math.max(3, 7 * scale) }}>
        <View style={line} />
        <View style={[line, { width: '80%' }]} />
        <View style={[line, { width: '90%' }]} />
      </View>
    </View>
  );
}

/** Buddy's paw stamp: green ink, a little crooked. */
export function PawStamp({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate: '-14deg' }] }}>
      <Ellipse cx="12" cy="16" rx="6" ry="4.6" fill={material.inkGreen} />
      <Ellipse cx="5.2" cy="10.2" rx="2.1" ry="2.8" fill={material.inkGreen} />
      <Ellipse cx="9.4" cy="5.8" rx="2.2" ry="3" fill={material.inkGreen} />
      <Ellipse cx="14.6" cy="5.8" rx="2.2" ry="3" fill={material.inkGreen} />
      <Ellipse cx="18.8" cy="10.2" rx="2.1" ry="2.8" fill={material.inkGreen} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: material.yarn,
    borderWidth: 1.5,
    borderBottomWidth: 3,
    borderColor: material.chalk,
    overflow: 'hidden',
  },
  picture: { flex: 1, backgroundColor: material.linen, overflow: 'hidden' },
  stamp: { position: 'absolute', opacity: 0.9 },
});
