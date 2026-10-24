// Default Buddy skin: chunky cartoon dog from SVG shapes. Faces RIGHT, sits.
// Geometry is authored in a 100x100 unit space drawn in the viewBox below
// (6 units of margin so tilted ears/hops never clip). Every part is a separate
// static <Svg>; BuddyAvatar moves the Views, never the SVG attributes.
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

import {
  BUDDY_PALETTE,
  BuddyAppearance,
  markingColourFor,
  noseColourFor,
} from './buddyAppearance';
import type { BuddyPivots, BuddySkin, PartRenderArgs } from './buddySkin';

const VIEW_MIN = -6;
const VIEW_SPAN = 112;
const OUTLINE = '#8B6F47'; // Dog brown
const BLUE = '#3498DB'; // Sky blue ("Zzz")
const GROUND = 90;
const SW = 2.2;

const toFraction = (u: number) => (u - VIEW_MIN) / VIEW_SPAN;

// Size changes proportions, not just px: small = big head / tiny body,
// large = broad body / slightly smaller head.
interface Proportions {
  bx: number;
  by: number;
  hs: number;
  ts: number;
}
function proportions(size: BuddyAppearance['size']): Proportions {
  if (size === 'small') return { bx: 0.84, by: 0.82, hs: 1.14, ts: 0.9 };
  if (size === 'large') return { bx: 1.12, by: 1.08, hs: 0.95, ts: 1.12 };
  return { bx: 1, by: 1, hs: 1, ts: 1 };
}

const NECK = { x: 56, y: 54 };
const TAIL_BASE = { x: 24, y: 78 };
const EAR_LEFT_BASE = { x: 50, y: 22 }; // near ear, back of head
const EAR_RIGHT_BASE = { x: 66, y: 20 }; // far ear

function bodyPoint(p: { x: number; y: number }, pr: Proportions) {
  return { x: 50 + (p.x - 50) * pr.bx, y: GROUND + (p.y - GROUND) * pr.by };
}
function headPoint(p: { x: number; y: number }, pr: Proportions) {
  const n = bodyPoint(NECK, pr);
  return { x: n.x + (p.x - NECK.x) * pr.hs, y: n.y + (p.y - NECK.y) * pr.hs };
}

function bodyTransform(pr: Proportions): string {
  return `translate(50 ${GROUND}) scale(${pr.bx} ${pr.by}) translate(-50 -${GROUND})`;
}
function headTransform(pr: Proportions): string {
  const n = bodyPoint(NECK, pr);
  return `translate(${n.x} ${n.y}) scale(${pr.hs}) translate(${-NECK.x} ${-NECK.y})`;
}

const styles = StyleSheet.create({
  svg: { position: 'absolute', left: 0, top: 0 },
  zzz: { position: 'absolute', color: BLUE, fontWeight: '700' },
});

function Canvas({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${VIEW_MIN} ${VIEW_MIN} ${VIEW_SPAN} ${VIEW_SPAN}`}
      style={styles.svg}
      pointerEvents="none"
    >
      {children}
    </Svg>
  );
}

function coatFill(a: BuddyAppearance): string {
  return a.fur ? a.fur.zones.back : BUDDY_PALETTE.coats[a.coat];
}
/** Near ear is charcoal on a tricolour dog; otherwise the coat. */
function earFill(a: BuddyAppearance): string {
  if (a.fur) return a.fur.zones.ears;
  return a.coat === 'tricolour' ? BUDDY_PALETTE.tricolourPatches.charcoal : coatFill(a);
}

// ---------- body ----------
function Body({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  const coat = coatFill(a);
  const accent = a.fur ? a.fur.zones.muzzle : BUDDY_PALETTE.accents[a.accentColour];
  const clipId = `bodyClip-${a.size}`;
  const sock = a.markings === 'socks' ? markingColourFor(a.coat, 'socks') : null;
  return (
    <Canvas size={size}>
      <G transform={bodyTransform(pr)}>
        <Defs>
          <ClipPath id={clipId}>
            <Ellipse cx={44} cy={68} rx={24} ry={22} />
            <Circle cx={34} cy={75} r={15} />
          </ClipPath>
        </Defs>
        {/* far front leg */}
        <Rect x={63} y={58} width={10} height={31} rx={5} fill={coat} stroke={OUTLINE} strokeWidth={SW} />
        {sock && <Rect x={64} y={79} width={8} height={9} fill={sock} />}
        <Ellipse cx={68} cy={88.3} rx={6.5} ry={3.6} fill={sock ?? coat} stroke={OUTLINE} strokeWidth={SW} />
        {/* torso + haunch */}
        <Ellipse cx={44} cy={68} rx={24} ry={22} fill={coat} stroke={OUTLINE} strokeWidth={SW} />
        <G clipPath={`url(#${clipId})`}>
          <Ellipse cx={61} cy={66} rx={8} ry={13} fill={accent} />
        </G>
        <Circle cx={34} cy={75} r={15} fill={coat} stroke={OUTLINE} strokeWidth={SW} />
        {a.coat === 'tricolour' && (
          <>
            <Ellipse cx={36} cy={52} rx={11} ry={7} fill={BUDDY_PALETTE.tricolourPatches.charcoal} clipPath={`url(#${clipId})`} />
            <Circle cx={31} cy={73} r={8} fill={BUDDY_PALETTE.tricolourPatches.ginger} />
          </>
        )}
        <Ellipse cx={46} cy={88.3} rx={10} ry={3.8} fill={sock ?? coat} stroke={OUTLINE} strokeWidth={SW} />
        {/* soft shading under the chin */}
        <Ellipse cx={52} cy={58} rx={9} ry={4} fill={OUTLINE} opacity={0.12} />
      </G>
    </Canvas>
  );
}

// ---------- near front leg ----------
function FrontLegs({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  const coat = coatFill(a);
  const sock = a.markings === 'socks' ? markingColourFor(a.coat, 'socks') : null;
  return (
    <Canvas size={size}>
      <G transform={bodyTransform(pr)}>
        <Rect x={53} y={57} width={10} height={32} rx={5} fill={coat} stroke={OUTLINE} strokeWidth={SW} />
        {sock && <Rect x={54} y={79} width={8} height={9} fill={sock} />}
        <Ellipse cx={58} cy={88.3} rx={6.5} ry={3.6} fill={sock ?? coat} stroke={OUTLINE} strokeWidth={SW} />
      </G>
    </Canvas>
  );
}

// ---------- tail ----------
function tailPath(style: BuddyAppearance['tailStyle']): { d: string; width: number } {
  switch (style) {
    case 'straight':
      return { d: 'M 24 78 Q 10 70 8 54', width: 7 };
    case 'stubby':
      return { d: 'M 24 78 L 16 71', width: 9.5 };
    case 'curly':
    default:
      return { d: 'M 24 78 Q 8 78 8 64 Q 8 52 18 52 Q 25 53 22 61', width: 7 };
  }
}
function Tail({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  const base = bodyPoint(TAIL_BASE, pr);
  const { d, width } = tailPath(a.tailStyle);
  const fill = a.fur ? a.fur.zones.tail : a.coat === 'tricolour' ? BUDDY_PALETTE.tricolourPatches.charcoal : coatFill(a);
  return (
    <Canvas size={size}>
      <G transform={`translate(${base.x} ${base.y}) scale(${pr.ts}) translate(${-TAIL_BASE.x} ${-TAIL_BASE.y})`}>
        <Path d={d} stroke={OUTLINE} strokeWidth={width + 3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={d} stroke={fill} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Canvas>
  );
}

// ---------- head ----------
function Head({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  const coat = coatFill(a);
  const accent = a.fur ? a.fur.zones.muzzle : BUDDY_PALETTE.accents[a.accentColour];
  const markCol = markingColourFor(a.coat, a.markings);
  const clipId = `headClip-${a.size}`;
  const nose = noseColourFor(a.coat);
  return (
    <Canvas size={size}>
      <G transform={headTransform(pr)}>
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={60} cy={36} r={20} />
          </ClipPath>
        </Defs>
        <Circle cx={60} cy={36} r={20} fill={coat} stroke={OUTLINE} strokeWidth={SW} />
        <G clipPath={`url(#${clipId})`}>
          {a.coat === 'tricolour' && (
            <Ellipse cx={50} cy={30} rx={12} ry={15} fill={BUDDY_PALETTE.tricolourPatches.ginger} />
          )}
          {a.markings === 'patch' && <Ellipse cx={52} cy={30} rx={11} ry={12} fill={markCol} />}
          {a.markings === 'mask' && <Ellipse cx={72} cy={37} rx={17} ry={14} fill={markCol} />}
        </G>
        <Circle cx={60} cy={36} r={20} fill="none" stroke={OUTLINE} strokeWidth={SW} />
        <Ellipse cx={74} cy={43} rx={11.5} ry={8.5} fill={accent} />
        <Circle cx={56} cy={43} r={4} fill={BUDDY_PALETTE.nose.pink} opacity={0.45} />
        <Ellipse cx={84.5} cy={39} rx={4.2} ry={3.2} fill={nose} />
        <Ellipse cx={83.6} cy={38} rx={1.2} ry={0.8} fill={BUDDY_PALETTE.accents.white} opacity={0.7} />
        <Path
          d="M 84 42 Q 84 47.5 78 47.5 Q 74 47.5 71.5 44.5"
          stroke={OUTLINE}
          strokeWidth={1.9}
          strokeLinecap="round"
          fill="none"
        />
      </G>
    </Canvas>
  );
}

function EyesOpen({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  const dark = BUDDY_PALETTE.nose.dark;
  const shine = BUDDY_PALETTE.accents.white;
  return (
    <Canvas size={size}>
      <G transform={headTransform(pr)}>
        <Circle cx={64} cy={32} r={4.2} fill={dark} />
        <Circle cx={65.4} cy={30.5} r={1.5} fill={shine} />
        <Circle cx={77} cy={31} r={3.4} fill={dark} />
        <Circle cx={78.1} cy={29.8} r={1.2} fill={shine} />
      </G>
    </Canvas>
  );
}

function EyesClosed({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  const coat = a.markings === 'patch' ? markingColourFor(a.coat, 'patch') : coatFill(a);
  return (
    <Canvas size={size}>
      <G transform={headTransform(pr)}>
        <Circle cx={64} cy={32} r={5.4} fill={coat} />
        <Circle cx={77} cy={31} r={4.6} fill={a.markings === 'mask' ? markingColourFor(a.coat, 'mask') : coatFill(a)} />
        <Path d="M 59.5 32 Q 64 36.5 68.5 32" stroke={OUTLINE} strokeWidth={1.9} strokeLinecap="round" fill="none" />
        <Path d="M 73 31 Q 77 34.8 81 31" stroke={OUTLINE} strokeWidth={1.9} strokeLinecap="round" fill="none" />
      </G>
    </Canvas>
  );
}

function MouthHappy({ appearance: a, size }: PartRenderArgs) {
  const pr = proportions(a.size);
  return (
    <Canvas size={size}>
      <G transform={headTransform(pr)}>
        <Path
          d="M 76 46.5 Q 75.5 57 81 56.5 Q 86 56 84.5 46.5 Z"
          fill={BUDDY_PALETTE.nose.pink}
          stroke={OUTLINE}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <Path d="M 80.3 48 L 80.3 53" stroke={OUTLINE} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
      </G>
    </Canvas>
  );
}

// ---------- ears ----------
function earPath(style: BuddyAppearance['earStyle'], near: boolean): string {
  if (near) {
    if (style === 'pointy') return 'M 44 26 L 46 6 L 60 20 Z';
    if (style === 'folded') return 'M 43 26 Q 40 9 53 8 Q 59 9 61 17 Q 52 15 55 26 Z';
    return 'M 50 19 Q 37 21 37 38 Q 37 51 46 49 Q 55 45 55 29 Z'; // floppy
  }
  if (style === 'pointy') return 'M 64 21 L 72 7 L 79 24 Z';
  if (style === 'folded') return 'M 64 21 Q 65 8 75 10 Q 80 14 76 19 Q 71 17 73 25 Z';
  return 'M 66 18 Q 77 18 78 31 Q 77 40 70 37 Q 64 33 64 25 Z'; // floppy
}
function Ear({ appearance: a, size, near }: PartRenderArgs & { near: boolean }) {
  const pr = proportions(a.size);
  const d = earPath(a.earStyle, near);
  return (
    <Canvas size={size}>
      <G transform={headTransform(pr)}>
        <Path d={d} fill={near ? earFill(a) : coatFill(a)} stroke={OUTLINE} strokeWidth={SW} strokeLinejoin="round" />
        <Path d={d} fill={OUTLINE} opacity={near ? 0.1 : 0.22} />
      </G>
    </Canvas>
  );
}

function Zzz({ size }: PartRenderArgs) {
  return <Text style={[styles.zzz, { fontSize: Math.max(12, Math.round(size * 0.16)) }]}>z</Text>;
}

export const vectorSkin: BuddySkin = {
  nativeFacing: 'right',
  groundY: toFraction(GROUND),
  pivots(a: BuddyAppearance): BuddyPivots {
    const pr = proportions(a.size);
    const f = (p: { x: number; y: number }) => ({ x: toFraction(p.x), y: toFraction(p.y) });
    return {
      head: f(bodyPoint(NECK, pr)),
      tail: f(bodyPoint(TAIL_BASE, pr)),
      earLeft: f(headPoint(EAR_LEFT_BASE, pr)),
      earRight: f(headPoint(EAR_RIGHT_BASE, pr)),
    };
  },
  parts: {
    body: (args) => <Body {...args} />,
    head: (args) => <Head {...args} />,
    earLeft: (args) => <Ear {...args} near />,
    earRight: (args) => <Ear {...args} near={false} />,
    tail: (args) => <Tail {...args} />,
    frontLegs: (args) => <FrontLegs {...args} />,
    eyesOpen: (args) => <EyesOpen {...args} />,
    eyesClosed: (args) => <EyesClosed {...args} />,
    mouthHappy: (args) => <MouthHappy {...args} />,
    zzz: (args) => <Zzz {...args} />,
  },
};
