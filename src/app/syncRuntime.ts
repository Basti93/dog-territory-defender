import { createSyncEngine } from '../sync/syncEngine';
import { resolveHouseholdLines } from '../sync/householdEvents';
import { repos } from './repositories';

/** The one sync engine for the running app. Import this instead of building another. */
export const syncEngine = createSyncEngine({
  settings: repos.settingsRepository,
  sync: repos.syncRepository,
  walks: repos.walkRepository,
  homeRange: repos.homeRangeRepository,
  territories: repos.territoryRepository,
  denEconomy: repos.denEconomyRepository,
  buddyAppearance: repos.buddyAppearanceRepository,
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
    await Promise.race([syncEngine.syncNow(), budget]);
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
