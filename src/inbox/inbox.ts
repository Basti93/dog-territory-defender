// The Posteingang (mailbox in the Hof): things that arrive "from outside". Derived from existing sources, only two small
// lists are stored (InboxState). Pure: no React, no I/O. Calm by rule (docs/specs/pack-collection.md "Mailbox"): no counts,
// no ages, nothing expires, never "missed" or "unread".

import { t } from '../i18n';
import type { PostcardEntry } from '../postcards/postcards';
import type { ApiGift } from '../sync/apiContract';
import { wordNeighbourLine } from '../sync/householdEvents';
import type { NeighbourLineEntry } from '../storage/SyncRepository';

/** What is stored in the settings repository. */
export interface InboxState {
  /** Postcards the player chose "Später" for: off the bench until Buddy pulls them out of the box. */
  postponedPostcards: string[];
  /** New postcards Buddy already pulled out and put on the bench (a new card is in the box until it is here). */
  deliveredPostcards: string[];
  /** Keys of the notes Buddy already read out. */
  seenNotes: string[];
  /** Only notes newer than this (ms) arrive in the box, so lines from before the box existed do not pile up. 0 = not set yet. */
  notesFrom: number;
}

export const INBOX_STATE_NONE: InboxState = { postponedPostcards: [], deliveredPostcards: [], seenNotes: [], notesFrom: 0 };
/** The neighbour feed keeps 12 lines; the seen list only needs to outlive them. */
const SEEN_NOTES_KEPT = 60;
/** The bench window is 12 walks; the delivered list only needs to outlive it. */
const DELIVERED_KEPT = 60;

export function normalizeInboxState(value: unknown): InboxState {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof InboxState, unknown>>;
  const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.length > 0) : []);
  return {
    postponedPostcards: strings(v.postponedPostcards),
    deliveredPostcards: strings(v.deliveredPostcards).slice(-DELIVERED_KEPT),
    seenNotes: strings(v.seenNotes).slice(-SEEN_NOTES_KEPT),
    notesFrom: typeof v.notesFrom === 'number' && Number.isFinite(v.notesFrom) && v.notesFrom > 0 ? v.notesFrom : 0,
  };
}

export type InboxItem =
  | { kind: 'gift'; key: string; gift: ApiGift }
  | { kind: 'note'; key: string; /** The dog the note is from; null for the neighbourhood as a whole. */ from: string | null; text: string }
  | { kind: 'postcard'; key: string; entry: PostcardEntry };

/** Neighbour lines that are not notes: a gift line repeats the gift itself, an invitation names a time (nothing time-critical in the box). */
const NOT_A_NOTE = new Set(['neighbours.line.stickLeft', 'neighbours.line.collarGift', 'neighbours.line.sockLeft', 'neighbours.line.invitation']);

/**
 * A postcard is in the box when the player chose "Später" for it, or when it is a tracked walk that began after the box first
 * looked (`notesFrom`, same cutoff as the notes) and Buddy has not pulled it out yet. Cards from before stay on the bench;
 * a hand-written log is the player's own and goes straight to the bench.
 */
export function postcardIsInBox(state: InboxState, card: PostcardEntry): boolean {
  if (state.postponedPostcards.includes(card.id)) return true;
  return card.kind === 'tracked' && state.notesFrom > 0 && card.startTime > state.notesFrom && !state.deliveredPostcards.includes(card.id);
}

export interface InboxSources {
  /** Gifts still wrapped. */
  unopenedGifts: readonly ApiGift[];
  lines: readonly NeighbourLineEntry[] | undefined;
  /** Postcards the box can draw from (any order). */
  postcards: readonly PostcardEntry[];
  state: InboxState;
}

/**
 * Everything in the box, in the order Buddy pulls it out: stick gifts, then notes, then postcards waiting in the box, each group
 * newest first. A flag at the box means "this list is not empty"; nothing else about it is ever shown.
 */
export function deriveInbox({ unopenedGifts, lines, postcards, state }: InboxSources): InboxItem[] {
  const gifts = [...unopenedGifts].sort((a, b) => b.createdAt - a.createdAt).map((gift): InboxItem => ({ kind: 'gift', key: `gift-${gift.id}`, gift }));

  const seen = new Set(state.seenNotes);
  const notes: InboxItem[] = [];
  for (const entry of [...(lines ?? [])].sort((a, b) => b.seq - a.seq)) {
    const key = `neighbour-${entry.seq}`;
    if (NOT_A_NOTE.has(entry.line) || seen.has(key) || state.notesFrom === 0 || entry.at <= state.notesFrom) continue;
    const text = wordNeighbourLine(entry);
    if (text) notes.push({ kind: 'note', key, from: entry.botName, text });
  }

  const cards = postcards
    .filter((c) => postcardIsInBox(state, c))
    .sort((a, b) => b.startTime - a.startTime)
    .map((entry): InboxItem => ({ kind: 'postcard', key: `postcard-${entry.id}`, entry }));

  return [...gifts, ...notes, ...cards];
}

export const postponePostcard = (state: InboxState, id: string): InboxState =>
  state.postponedPostcards.includes(id)
    ? state
    : { ...state, postponedPostcards: [...state.postponedPostcards, id], deliveredPostcards: state.deliveredPostcards.filter((x) => x !== id) };

/** Buddy pulled the card out: it leaves the box (postponed or new) and is on the bench for good. */
export const releasePostcard = (state: InboxState, id: string): InboxState => ({
  ...state,
  postponedPostcards: state.postponedPostcards.filter((x) => x !== id),
  deliveredPostcards: state.deliveredPostcards.includes(id) ? state.deliveredPostcards : [...state.deliveredPostcards, id].slice(-DELIVERED_KEPT),
});

export const markNoteSeen = (state: InboxState, key: string): InboxState =>
  state.seenNotes.includes(key) ? state : { ...state, seenNotes: [...state.seenNotes, key].slice(-SEEN_NOTES_KEPT) };

/** "Ein Zettel am Zaun: '...'"; the line already names the dog, so the frame does not (the neighbourhood's own notes have no dog). */
export function noteLine(item: Extract<InboxItem, { kind: 'note' }>): string {
  return item.from ? t('inbox.note', { text: item.text }) : t('inbox.noteViertel', { text: item.text });
}

export const EMPTY_LINE_COUNT = 3;

/** One of the three empty-box lines; the caller passes a rising counter so they rotate. */
export const emptyBoxLine = (turn: number): string => t(`inbox.empty.${(Math.abs(Math.trunc(turn)) % EMPTY_LINE_COUNT) + 1}`);
