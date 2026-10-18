import type { PresenceEntry } from '../apiContract';
import {
  clearPartnerPresence,
  getPartnerPresence,
  isPresenceFresh,
  pickPartnerWalk,
  PRESENCE_STALE_MS,
  setPartnerPresence,
} from '../presenceStore';

const entry = (over: Partial<PresenceEntry> = {}): PresenceEntry => ({
  playerId: 'p-alex',
  name: 'Alex',
  walkId: 'w1',
  startedAt: 1,
  points: [{ lat: 52, lon: 13, t: 1 }],
  updatedAt: 100_000,
  ...over,
});

afterEach(() => clearPartnerPresence());

describe('partner presence store', () => {
  it('shows a walk whose heartbeat is younger than 3 minutes and drops it silently after that', () => {
    setPartnerPresence([entry()], 100_000, 5_000_000);
    const [e] = getPartnerPresence();
    expect(isPresenceFresh(e, 5_000_000)).toBe(true);
    expect(isPresenceFresh(e, 5_000_000 + PRESENCE_STALE_MS)).toBe(true);
    expect(isPresenceFresh(e, 5_000_000 + PRESENCE_STALE_MS + 1)).toBe(false);
    expect(pickPartnerWalk(getPartnerPresence(), 5_000_000 + PRESENCE_STALE_MS + 1)).toBeNull();
  });

  it('counts the age the heartbeat already had when it arrived, without trusting the two clocks to agree', () => {
    // the server says the beat is 2.5 min old at delivery; the phone clock is far ahead of the server clock
    setPartnerPresence([entry({ updatedAt: 100_000 })], 100_000 + 150_000, 9_000_000_000);
    const [e] = getPartnerPresence();
    expect(isPresenceFresh(e, 9_000_000_000 + 29_000)).toBe(true);
    expect(isPresenceFresh(e, 9_000_000_000 + 31_000)).toBe(false);
  });

  it('a new heartbeat makes it fresh again; an unchanged one keeps counting from first arrival and keeps the same object', () => {
    setPartnerPresence([entry({ updatedAt: 100_000 })], 100_000, 1_000);
    const first = getPartnerPresence()[0];
    setPartnerPresence([entry({ updatedAt: 100_000 })], 160_000, 61_000); // same beat, a minute later
    expect(getPartnerPresence()[0]).toBe(first);
    expect(isPresenceFresh(first, 1_000 + PRESENCE_STALE_MS + 1)).toBe(false);
    setPartnerPresence([entry({ updatedAt: 250_000 })], 250_000, 151_000);
    expect(isPresenceFresh(getPartnerPresence()[0], 1_000 + PRESENCE_STALE_MS + 1)).toBe(true);
  });

  it('shows the freshest of several, and nothing when she is gone', () => {
    setPartnerPresence([entry({ walkId: 'old', updatedAt: 90_000 }), entry({ walkId: 'new', updatedAt: 99_000 })], 100_000, 0);
    expect(pickPartnerWalk(getPartnerPresence(), 0)?.walkId).toBe('new');
    setPartnerPresence([], 110_000, 10);
    expect(pickPartnerWalk(getPartnerPresence(), 10)).toBeNull();
  });
});
