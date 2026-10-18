import { material, mix, tokens } from '../../ui/theme';

// Real time of day for the scene's sky (konzept section 3, pillar 4: "time is felt, never pressure").
// The existing sky art is a daytime sky; the other phases lay a flat tint over it (no gradients).

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

/** Pure: which phase a local hour (0-23) belongs to. */
export function dayPhaseForHour(hour: number): DayPhase {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export interface SkyTint {
  phase: DayPhase;
  /** Flat colour laid over the sky art; null = leave the art as is (daytime). */
  color: string | null;
  opacity: number;
  /** Background behind the art (shows while the PNG loads and below the horizon strip). */
  base: string;
}

const NIGHT = mix(tokens.blue, tokens.text, 0.6);

export function skyTintForPhase(phase: DayPhase): SkyTint {
  switch (phase) {
    case 'morning':
      return { phase, color: material.skyEveningLight, opacity: 0.35, base: mix(tokens.blue, '#FFFFFF', 0.55) };
    case 'day':
      return { phase, color: null, opacity: 0, base: mix(tokens.blue, '#FFFFFF', 0.45) };
    case 'evening':
      return { phase, color: material.skyEvening, opacity: 0.55, base: material.skyEveningLight };
    case 'night':
      return { phase, color: NIGHT, opacity: 0.55, base: mix(tokens.blue, tokens.text, 0.35) };
  }
}

export function skyTintForDate(date: Date): SkyTint {
  return skyTintForPhase(dayPhaseForHour(date.getHours()));
}
