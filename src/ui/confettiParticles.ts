import { CONFETTI_COLORS } from './tokens';

export type Rng = () => number;

export interface ConfettiParticle {
  /** Horizontal start, 0..1 of container width. */
  x: number;
  color: string;
  /** ms before this piece starts falling. */
  delayMs: number;
  /** Fall time in ms. */
  durationMs: number;
  /** Sideways drift in px (negative = left). */
  driftPx: number;
  /** Total rotation in degrees. */
  rotateDeg: number;
  sizePx: number;
}

export const CONFETTI_DEFAULT_COUNT = 24;
export const CONFETTI_FALL_MS = 2000;
export const CONFETTI_MAX_DELAY_MS = 400;

/** Pure layout generator; inject a seeded `rng` for tests. Gentle: slow fall, small drift, slight spin. */
export function generateConfettiParticles(
  count: number = CONFETTI_DEFAULT_COUNT,
  rng: Rng = Math.random
): ConfettiParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 0.05 + rng() * 0.9,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delayMs: Math.floor(rng() * CONFETTI_MAX_DELAY_MS),
    durationMs: Math.round(CONFETTI_FALL_MS * (0.9 + rng() * 0.2)),
    driftPx: Math.round((rng() - 0.5) * 60),
    rotateDeg: Math.round(90 + rng() * 180),
    sizePx: 6 + Math.floor(rng() * 4),
  }));
}

/** Time until the last piece finishes. */
export function confettiTotalMs(particles: ConfettiParticle[]): number {
  return particles.reduce((m, p) => Math.max(m, p.delayMs + p.durationMs), 0);
}

/** Small deterministic rng (mulberry32) for tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
