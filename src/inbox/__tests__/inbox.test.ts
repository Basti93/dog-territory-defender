import { t } from '../../i18n';
import { buildPostcards } from '../../postcards/postcards';
import type { NeighbourLineEntry } from '../../storage/SyncRepository';
import type { ApiGift } from '../../sync/apiContract';
import { trackedWalk, TUESDAY_AFTERNOON, DAY_MS } from '../../test/postcardFixtures';
import { deriveInbox, emptyBoxLine, INBOX_STATE_NONE, markNoteSeen, noteLine, normalizeInboxState, postponePostcard, releasePostcard } from '../inbox';

const gift = (id: string, createdAt: number): ApiGift => ({ id, botId: 'b', botName: 'Momo', cosmeticId: 'stick-momo', sprinkleTreats: null, createdAt, openedAt: null });
const line = (seq: number, over: Partial<NeighbourLineEntry> = {}): NeighbourLineEntry => ({
  line: 'neighbours.line.sniffCorner',
  botName: 'Momo',
  botId: 'b',
  params: {},
  at: 1000 + seq,
  seq,
  ...over,
});
const cards = buildPostcards([trackedWalk('old', { startTime: TUESDAY_AFTERNOON }), trackedWalk('new', { startTime: TUESDAY_AFTERNOON + DAY_MS })], []);
const state = { ...INBOX_STATE_NONE, notesFrom: 500 };
/** The box first looked after both cards: they are old, so they stay on the bench. */
const afterCards = { ...INBOX_STATE_NONE, notesFrom: TUESDAY_AFTERNOON + 5 * DAY_MS };

describe('deriveInbox', () => {
  it('is empty when nothing came from outside', () => {
    expect(deriveInbox({ unopenedGifts: [], lines: [], postcards: cards, state: afterCards })).toEqual([]);
  });

  it('orders gifts, then notes, then postponed postcards, each newest first', () => {
    const items = deriveInbox({
      unopenedGifts: [gift('a', 1), gift('b', 2)],
      lines: [line(1), line(2)],
      postcards: cards,
      state: { ...afterCards, notesFrom: 500, postponedPostcards: ['old', 'new'] },
    });
    expect(items.map((i) => i.key)).toEqual(['gift-b', 'gift-a', 'neighbour-2', 'neighbour-1', 'postcard-new', 'postcard-old']);
  });

  it('leaves out seen notes, lines from before the box, gift and time-bound lines, and never expires the rest', () => {
    const old = line(9, { at: 400 });
    const seen = line(8);
    const stickLine = line(7, { line: 'neighbours.line.stickLeft' });
    const invitation = line(6, { line: 'neighbours.line.invitation', params: { at: '16:00' } });
    const unknown = line(5, { line: 'neighbours.line.fromTheFuture' });
    const ancient = line(4, { at: 501 }); // days ago in a real run: still there
    const items = deriveInbox({ unopenedGifts: [], lines: [old, seen, stickLine, invitation, unknown, ancient], postcards: [], state: { ...state, seenNotes: ['neighbour-8'] } });
    expect(items.map((i) => i.key)).toEqual(['neighbour-4']);
  });

  it('shows no notes until the first look has set notesFrom', () => {
    expect(deriveInbox({ unopenedGifts: [], lines: [line(1)], postcards: [], state: INBOX_STATE_NONE })).toEqual([]);
  });

  it('only postponed postcards are in the box when every card is older than the first look', () => {
    const items = deriveInbox({ unopenedGifts: [], lines: [], postcards: cards, state: postponePostcard(afterCards, 'old') });
    expect(items.map((i) => i.key)).toEqual(['postcard-old']);
  });

  it('a new tracked card arrives in the box, newest first, until Buddy delivered it; older and hand-written cards stay on the bench', () => {
    const mid = { ...INBOX_STATE_NONE, notesFrom: TUESDAY_AFTERNOON + 1 };
    expect(deriveInbox({ unopenedGifts: [], lines: [], postcards: cards, state: mid }).map((i) => i.key)).toEqual(['postcard-new']);
    const both = { ...INBOX_STATE_NONE, notesFrom: 500 };
    expect(deriveInbox({ unopenedGifts: [], lines: [], postcards: cards, state: both }).map((i) => i.key)).toEqual(['postcard-new', 'postcard-old']);
    expect(deriveInbox({ unopenedGifts: [], lines: [], postcards: cards, state: releasePostcard(both, 'new') }).map((i) => i.key)).toEqual(['postcard-old']);
    expect(deriveInbox({ unopenedGifts: [], lines: [], postcards: cards, state: INBOX_STATE_NONE })).toEqual([]); // before the first look
    const written = buildPostcards([{ ...trackedWalk('log', { startTime: TUESDAY_AFTERNOON + 9 * DAY_MS }), startSource: 'manual-log' as const }], []);
    expect(deriveInbox({ unopenedGifts: [], lines: [], postcards: written, state: both })).toEqual([]);
  });
});

describe('inbox state', () => {
  it('postpones once, releases, and marks notes seen without growing forever', () => {
    let s = postponePostcard(postponePostcard(state, 'a'), 'a');
    expect(s.postponedPostcards).toEqual(['a']);
    s = releasePostcard(s, 'a');
    expect(s.postponedPostcards).toEqual([]);
    expect(s.deliveredPostcards).toEqual(['a']);
    expect(postponePostcard(s, 'a').deliveredPostcards).toEqual([]); // a later "Später" puts it back in the box
    for (let i = 0; i < 100; i += 1) s = markNoteSeen(s, `neighbour-${i}`);
    expect(s.seenNotes.length).toBeLessThanOrEqual(60);
    expect(s.seenNotes[s.seenNotes.length - 1]).toBe('neighbour-99');
  });

  it('reads garbage as the empty state', () => {
    expect(normalizeInboxState(null)).toEqual(INBOX_STATE_NONE);
    expect(normalizeInboxState({ postponedPostcards: ['x', 3], seenNotes: 'no', notesFrom: 'soon' })).toEqual({ postponedPostcards: ['x'], deliveredPostcards: [], seenNotes: [], notesFrom: 0 });
  });
});

describe('inbox words', () => {
  it('rotates through the three empty-box lines', () => {
    const lines = [0, 1, 2, 3].map(emptyBoxLine);
    expect(new Set(lines.slice(0, 3)).size).toBe(3);
    expect(lines[3]).toBe(lines[0]);
    lines.forEach((l) => expect(l).not.toMatch(/inbox\./));
  });

  it('words a note with the dog, or as the neighbourhood', () => {
    const [note] = deriveInbox({ unopenedGifts: [], lines: [line(1)], postcards: [], state });
    expect(note.kind === 'note' && noteLine(note)).toBe(t('inbox.note', { text: 'Momo had a good sniff at your corner today.' }));
    const [coop] = deriveInbox({ unopenedGifts: [], lines: [line(2, { line: 'neighbours.line.coopDone', botName: null, botId: null, params: { km: 40 } })], postcards: [], state });
    expect(coop.kind === 'note' && noteLine(coop)).toContain('40 km');
  });
});

describe('inbox copy (anti-guilt)', () => {
  it.each([['de'], ['en']])('has no counts, ages or guilt words in the %s mailbox lines', (lang) => {
    const dict = (require(`../../i18n/${lang}`) as { default: Record<string, string> }).default;
    const keys = Object.keys(dict).filter((k) => k.startsWith('inbox.'));
    expect(keys.length).toBeGreaterThan(10);
    keys.forEach((k) => {
      expect(dict[k]).not.toMatch(/verpasst|ungelesen|missed|unread|wartet|waiting|\d/i);
    });
  });
});
