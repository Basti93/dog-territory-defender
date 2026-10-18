// The six Nachbarhunde: one data file (design Decision 17). Looks use ONLY ids from
// src/buddy/buddyAppearance.ts (a test pins that). Numbers that tuning touches live in
// src/economy/neighbourConfig.ts; this file is who they are and when they walk.
import type { EventKind, NeighbourLineKey } from '@game/sync/apiContract';

export type ArchetypeId = 'momo' | 'pfote' | 'bruno' | 'keks' | 'lotte' | 'nebel';

export interface WalkSlot {
  /** Stable key, part of the bot_schedules uniqueness. */
  slot: string;
  /** Local start time "HH:MM". */
  at: string;
  lengthM: number;
  /** Chance (0..1) the dog actually goes on a given day. */
  probability: number;
}

export interface Archetype {
  id: ArchetypeId;
  name: string;
  /** Buddy appearance ids. Nebel's "star" marking does not exist yet: `mask` is the placeholder. */
  appearance: { coat: string; markings: string; earStyle: string; tailStyle: string; size: string; accentColour: string };
  /** i18n key (the app owns the copy). */
  traitKey: string;
  quirk: string;
  /** 1-based week since introduction in which this dog starts walking and sending lines. */
  introWeek: number;
  slots: WalkSlot[];
  /** Walking speed, m/s. */
  speedMs: number;
  /** Where the synthetic home sits relative to the host anchor, metres. */
  homeBandM: [number, number];
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'momo',
    name: 'Momo',
    appearance: { coat: 'cream', markings: 'none', earStyle: 'floppy', tailStyle: 'curly', size: 'medium', accentColour: 'cream' },
    traitKey: 'neighbours.dog.momo.trait',
    quirk: 'greets the same lamppost',
    introWeek: 1,
    slots: [
      { slot: 'am', at: '07:30', lengthM: 1500, probability: 0.85 },
      { slot: 'pm', at: '17:00', lengthM: 1500, probability: 0.7 },
    ],
    speedMs: 1.3,
    homeBandM: [600, 1500],
  },
  {
    id: 'pfote',
    name: 'Pfote',
    appearance: { coat: 'golden', markings: 'none', earStyle: 'floppy', tailStyle: 'straight', size: 'large', accentColour: 'tan' },
    traitKey: 'neighbours.dog.pfote.trait',
    quirk: 'leaves sticks, sometimes the wrong one',
    introWeek: 1,
    slots: [{ slot: 'noon', at: '12:00', lengthM: 2000, probability: 0.8 }],
    speedMs: 1.4,
    homeBandM: [800, 2000],
  },
  {
    id: 'bruno',
    name: 'Bruno',
    // No "brindle" coat exists: ginger stands in.
    appearance: { coat: 'ginger', markings: 'none', earStyle: 'folded', tailStyle: 'stubby', size: 'large', accentColour: 'cream' },
    traitKey: 'neighbours.dog.bruno.trait',
    quirk: 'sends invitations',
    introWeek: 2,
    slots: [{ slot: 'canal', at: '18:00', lengthM: 3000, probability: 0.75 }],
    speedMs: 1.4,
    homeBandM: [1200, 2800],
  },
  {
    id: 'keks',
    name: 'Keks',
    appearance: { coat: 'white', markings: 'patch', earStyle: 'pointy', tailStyle: 'straight', size: 'small', accentColour: 'white' },
    traitKey: 'neighbours.dog.keks.trait',
    quirk: 'runs circles',
    introWeek: 3,
    slots: [
      { slot: 'dash1', at: '08:15', lengthM: 700, probability: 0.8 },
      { slot: 'dash2', at: '13:30', lengthM: 700, probability: 0.8 },
      { slot: 'dash3', at: '19:00', lengthM: 700, probability: 0.8 },
    ],
    speedMs: 1.7,
    homeBandM: [500, 1200],
  },
  {
    id: 'lotte',
    name: 'Lotte',
    appearance: { coat: 'chocolate', markings: 'none', earStyle: 'floppy', tailStyle: 'straight', size: 'small', accentColour: 'tan' },
    traitKey: 'neighbours.dog.lotte.trait',
    quirk: 'rates the view from benches',
    introWeek: 3,
    slots: [{ slot: 'bench', at: '10:00', lengthM: 1000, probability: 0.85 }],
    speedMs: 0.8,
    homeBandM: [500, 1500],
  },
  {
    id: 'nebel',
    name: 'Nebel',
    // "star" marking does not exist in BUDDY_MARKINGS yet: `mask` is the placeholder.
    appearance: { coat: 'grey', markings: 'mask', earStyle: 'pointy', tailStyle: 'curly', size: 'medium', accentColour: 'white' },
    traitKey: 'neighbours.dog.nebel.trait',
    quirk: 'waves at the moon, leaves a soggy sock now and then',
    introWeek: 4,
    slots: [
      { slot: 'dawn', at: '05:45', lengthM: 2000, probability: 0.5 },
      { slot: 'night', at: '22:00', lengthM: 2000, probability: 0.5 },
    ],
    speedMs: 1.2,
    homeBandM: [1000, 2500],
  },
] as const;

export const ARCHETYPE_BY_ID: Record<ArchetypeId, Archetype> = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a])) as Record<ArchetypeId, Archetype>;

/** The 12 lines (game-master copy lives in the app's i18n). `gift` marks lines that come with a gift. */
export interface LineDef {
  key: NeighbourLineKey;
  kind: EventKind;
  /** Which dog speaks; null = the whole neighbourhood. */
  bot: ArchetypeId | null;
  gift?: 'collar' | 'stick' | 'sock';
  /** Counts as the "first weird event" in W4. */
  weird?: boolean;
  /** Not drawn by the daily planner (emitted by other flows). */
  planned: boolean;
}

export const LINES: readonly LineDef[] = [
  { key: 'neighbours.line.sniffCorner', kind: 'neighbour.sniffed', bot: 'momo', planned: true },
  { key: 'neighbours.line.stickLeft', kind: 'neighbour.gift', bot: 'pfote', gift: 'stick', planned: true },
  { key: 'neighbours.line.mailboxLaps', kind: 'neighbour.sniffed', bot: 'keks', planned: true },
  { key: 'neighbours.line.benchRated', kind: 'neighbour.sniffed', bot: 'lotte', planned: true },
  { key: 'neighbours.line.invitation', kind: 'neighbour.invitation', bot: 'bruno', planned: true },
  { key: 'neighbours.line.followedPath', kind: 'neighbour.reaction', bot: 'momo', planned: false },
  { key: 'neighbours.line.coopDone', kind: 'coop.progress', bot: null, planned: false },
  { key: 'neighbours.line.collarGift', kind: 'neighbour.gift', bot: 'pfote', gift: 'collar', planned: true },
  { key: 'neighbours.line.wave', kind: 'neighbour.sniffed', bot: 'keks', planned: true },
  // Waits for the invitation-accept flow (Decision 22), which is not part of this slice.
  { key: 'neighbours.line.thanksCome', kind: 'neighbour.reaction', bot: 'bruno', planned: false },
  { key: 'neighbours.line.moonHello', kind: 'neighbour.sniffed', bot: 'nebel', weird: true, planned: true },
  { key: 'neighbours.line.sockLeft', kind: 'neighbour.gift', bot: 'nebel', gift: 'sock', weird: true, planned: true },
];

export const LINE_BY_KEY: Record<string, LineDef> = Object.fromEntries(LINES.map((l) => [l.key, l]));

/** Finite cosmetic catalog (design Decision 20). Art and names come from the app; the server only hands out ids. */
export const COSMETICS = {
  collar: ['collar-meadow', 'collar-sky', 'collar-blossom'],
  stick: ['stick-oak', 'stick-birch'],
  sock: ['sock-odd'],
  /** Exclusive after the dog was met three times. */
  exclusive: { pfote: 'stick-pfote', lotte: 'cushion-lotte' } as Partial<Record<ArchetypeId, string>>,
} as const;

/** Yard decorations earned by the Viertel-Runde, in order. */
export const YARD_DECORATIONS = ['yard-flowerbed', 'yard-herbs', 'yard-windchime', 'yard-pinwheel', 'yard-lanterns'] as const;
