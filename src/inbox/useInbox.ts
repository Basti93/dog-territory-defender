import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLocale } from '../i18n';
import { buildPostcards, type PostcardEntry } from '../postcards/postcards';
import type { SettingsRepository } from '../storage/SettingsRepository';
import type { NeighbourLineEntry } from '../storage/SyncRepository';
import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import type { ApiGift } from '../sync/apiContract';
import { deriveInbox, INBOX_STATE_NONE, InboxItem, InboxState, markNoteSeen, postcardIsInBox, postponePostcard, releasePostcard } from './inbox';

export interface Inbox {
  /** What is in the box now, in pull order. Empty until the stored lists are read (the flag never flashes). */
  items: InboxItem[];
  /** Ids of the postcards waiting in the box (postponed or not yet delivered): the bench leaves these out. Empty until the state is read. */
  inBoxIds: ReadonlySet<string>;
  /** "Später" on the postcard reveal: the card goes into the box and leaves the bench. */
  postpone: (cardId: string) => void;
  /** Buddy pulled the postcard out: it is on the bench again. */
  release: (cardId: string) => void;
  /** Buddy read the note out. */
  markNoteSeen: (key: string) => void;
}

interface Options {
  settingsRepository?: SettingsRepository;
  walkRepository: WalkRepository;
  territoryRepository?: TerritoryRepository;
  unopenedGifts: readonly ApiGift[];
  lines: readonly NeighbourLineEntry[] | undefined;
  /** The postcards the scene already loaded (the bench window). A postponed card older than that is loaded here. */
  cards: readonly PostcardEntry[];
}

/** The mailbox's contents, derived from gifts, neighbour lines and postcards plus the two small stored lists (see inbox.ts). */
export function useInbox({ settingsRepository, walkRepository, territoryRepository, unopenedGifts, lines, cards }: Options): Inbox {
  const locale = useLocale();
  const [state, setState] = useState<InboxState | null>(null);
  const stateRef = useRef<InboxState | null>(null);
  const [olderCards, setOlderCards] = useState<PostcardEntry[]>([]);

  const commit = useCallback(
    (next: InboxState) => {
      stateRef.current = next;
      setState(next);
      void settingsRepository?.saveInboxState(next).catch(() => undefined);
    },
    [settingsRepository]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = settingsRepository ? await settingsRepository.getInboxState().catch(() => INBOX_STATE_NONE) : INBOX_STATE_NONE;
      if (!alive) return;
      // First look: lines from before the box existed stay where they were; only later ones arrive.
      if (stored.notesFrom === 0) commit({ ...stored, notesFrom: Date.now() });
      else {
        stateRef.current = stored;
        setState(stored);
      }
    })();
    return () => {
      alive = false;
    };
  }, [settingsRepository, commit]);

  const postponed = state?.postponedPostcards;
  useEffect(() => {
    if (!postponed || postponed.length === 0) return;
    const have = new Set(cards.map((c) => c.id));
    if (postponed.every((id) => have.has(id))) {
      setOlderCards((prev) => (prev.length ? [] : prev));
      return;
    }
    let alive = true;
    (async () => {
      const [walks, territories] = await Promise.all([walkRepository.getWalks(), territoryRepository ? territoryRepository.getTerritories() : Promise.resolve([])]);
      const wanted = new Set(postponed);
      if (alive) setOlderCards(buildPostcards(walks, territories).filter((c) => wanted.has(c.id) && !have.has(c.id)));
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [postponed, cards, walkRepository, territoryRepository]);

  const items = useMemo(
    () => (state ? deriveInbox({ unopenedGifts, lines, postcards: [...cards, ...olderCards], state }) : []),
    // `locale`: the notes are worded with t().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, unopenedGifts, lines, cards, olderCards, locale]
  );
  const inBoxIds = useMemo(() => new Set(state ? cards.filter((c) => postcardIsInBox(state, c)).map((c) => c.id) : []), [state, cards]);

  const postpone = useCallback((id: string) => stateRef.current && commit(postponePostcard(stateRef.current, id)), [commit]);
  const release = useCallback((id: string) => stateRef.current && commit(releasePostcard(stateRef.current, id)), [commit]);
  const seeNote = useCallback((key: string) => stateRef.current && commit(markNoteSeen(stateRef.current, key)), [commit]);
  return { items, inBoxIds, postpone, release, markNoteSeen: seeNote };
}
