import { AppState } from 'react-native';

import { createApiClient } from '../sync/apiClient';
import { createSyncEngine } from '../sync/syncEngine';
import { createPartnerHomecomingQueue } from '../sync/partnerHomecoming';
import { createPresenceSender } from '../sync/presenceSender';
import { createPresenceViewer } from '../sync/presenceViewer';
import { configureLogShipper } from '../utils/logShipper';
import { resolveHouseholdLines } from '../sync/householdEvents';
import type { PartnerWalkAdded } from '../sync/apply';
import { setFixObserver } from '../utils/gps';
import { repos } from './repositories';
import { updateCorners } from './updateCorners';

/** The one sync engine for the running app. Import this instead of building another. */
export const syncEngine = createSyncEngine({
  settings: repos.settingsRepository,
  sync: repos.syncRepository,
  walks: repos.walkRepository,
  homeRange: repos.homeRangeRepository,
  territories: repos.territoryRepository,
  denEconomy: repos.denEconomyRepository,
  buddyAppearance: repos.buddyAppearanceRepository,
  corners: repos.cornerRepository,
  stats: repos.personalStatsRepository,
  // The household's walks may complete a corner on this phone too (same ids as on the other one); the street lookup waits only briefly.
  afterWalksAdded: async () => {
    await updateCorners({ walkRepository: repos.walkRepository, cornerRepository: repos.cornerRepository, lookupWaitMs: 1500 });
  },
});

// Live presence of the household (M4 "Alex im Hof"): this phone's heartbeats while it walks, the foreground
// poller that watches the others, and the queue that turns "her walk ended + her walk arrived" into a mini homecoming.
// Sending is opt-in ("Runde live teilen", off until the player said yes) and is fed by the GPS layer itself, so beats
// continue with the screen off (see presenceSender.ts).
export const presenceSender = createPresenceSender({
  getIdentity: () => repos.settingsRepository.getSyncIdentity(),
  isEnabled: () => repos.settingsRepository.getLiveShareEnabled(),
  isBackground: () => AppState.currentState !== 'active',
});
setFixObserver((location) => presenceSender.addFix(location));
export const partnerHomecoming = createPartnerHomecomingQueue({
  syncNow: () => syncEngine.syncNow(),
  shown: {
    load: () => repos.settingsRepository.getShownPartnerWalkIds(),
    save: (ids) => repos.settingsRepository.saveShownPartnerWalkIds(ids),
  },
});

/** Sync brought partner walks: they complete a live "they are back" (presence ended + walk arrived) or, if we missed the live moment, become the late one. */
export function onPartnerWalks(walks: PartnerWalkAdded[]): void {
  partnerHomecoming.noteWalksAdded(walks);
  void partnerHomecoming.noteLateWalks(walks);
}
export const presenceViewer = createPresenceViewer({
  getIdentity: () => repos.settingsRepository.getSyncIdentity(),
  onWalkEnded: (walk) => partnerHomecoming.noteEnded(walk),
});

// Device log shipping (utils/logShipper.ts): uses the same identity (token, server URL) as sync.
configureLogShipper({
  getIdentity: () => repos.settingsRepository.getSyncIdentity(),
  isEnabled: () => repos.settingsRepository.getLogShippingEnabled(),
  setEnabled: (enabled) => repos.settingsRepository.saveLogShippingEnabled(enabled),
  send: async (identity, request) => {
    await createApiClient({ baseUrl: identity.serverUrl, token: identity.token }).uploadLogs(request);
  },
});

/** How long app open waits for the first sync before showing the Doorstep anyway. */
const LAUNCH_SYNC_BUDGET_MS = 2500;

/** Syncs at app open, but never makes the Doorstep wait longer than the budget (the sync keeps running in the background). */
export async function syncOnLaunch(): Promise<void> {
  const identity = await repos.settingsRepository.getSyncIdentity();
  if (!identity) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, LAUNCH_SYNC_BUDGET_MS);
  });
  try {
    await Promise.race([syncEngine.syncNow({ foreground: true }), budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Worded household news for the Doorstep (partner walks, a new member). Empty when not joined. */
export async function loadHouseholdLines(dogName: string | null): Promise<string[]> {
  const identity = await repos.settingsRepository.getSyncIdentity();
  if (!identity) return [];
  const [walks, state] = await Promise.all([repos.walkRepository.getWalks(), repos.syncRepository.getState()]);
  return resolveHouseholdLines({
    walks,
    myPlayerId: identity.playerId,
    dogName,
    lastMemberJoined: state.lastMemberJoined,
    players: state.players,
    now: Date.now(),
  });
}
