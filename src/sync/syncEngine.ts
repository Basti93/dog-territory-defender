// Foreground-only household sync (multiplayer-sync design.md Decision 9).
// Order on every run: push the outbox oldest-first (stop at the first retryable
// failure), then pull. Pull is a snapshot when this phone has never synced,
// otherwise `GET /v1/events?after=cursor`. No background tasks, no long-poll in
// v1: callers trigger `syncNow` on app open, on return to foreground, after a
// walk is saved and from the manual "Sync now".
//
// The engine never throws from syncNow and never produces user-facing error
// copy: offline just means "later" (Buddy anti-guilt rule).

import type { DenEconomyState } from '../economy/denEconomy';
import type { DenEconomyRepository } from '../storage/DenEconomyRepository';
import type { HomeRangeRepository } from '../storage/HomeRangeRepository';
import type { SettingsRepository, SyncIdentity } from '../storage/SettingsRepository';
import type { SyncRepository } from '../storage/SyncRepository';
import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import { log } from '../utils/log';
import { ApiClient, ApiError, createApiClient, normalizeBaseUrl } from './apiClient';
import type { ApiDenState, CommandBody, CommandErrorCode, ImportRequest, SnapshotResponse, WalkUploadRequest } from './apiContract';
import { API_LIMITS } from './apiContract';
import { newClientId } from './ids';
import type { BuddyAppearanceRepository } from '../storage/BuddyAppearanceRepository';
import { INVITE_CODE_LENGTH } from './syncConfig';
import { applyNearby, applyEvents, ApplyContext, ApplyRepos, applyServerDenState, applySnapshot, ApplyResult } from './apply';
import { enqueueEconomyCommand, enqueueWalkUpload, planFailure, renameCommand } from './outbox';
import type { Walk } from '../types';

export interface SyncEngineDeps {
  settings: SettingsRepository;
  sync: SyncRepository;
  walks: WalkRepository;
  homeRange: HomeRangeRepository;
  territories: TerritoryRepository;
  denEconomy: DenEconomyRepository;
  /** Dog look for the founding import; optional (omitted = empty appearance). */
  buddyAppearance?: BuddyAppearanceRepository;
  /** Injected in tests. */
  createClient?: (baseUrl: string, token: string | null) => ApiClient;
  now?: () => number;
}

export interface SyncStatus {
  joined: boolean;
  playerName: string | null;
  householdName: string | null;
  serverUrl: string | null;
  lastSyncAt: number | null;
  /** Commands waiting to be sent. */
  pending: number;
  /** Commands that gave up (kept for inspection). */
  dead: number;
  busy: boolean;
  /** The server no longer accepts this phone's token. */
  unauthorized: boolean;
  /** The server refused a write with 426: the app needs an update. Changes stay queued; the Household section shows `household.updateNeeded`. */
  needsUpdate?: boolean;
}

export interface SyncCallbacks {
  /** The server's Den state was applied locally. */
  onDenChanged?: (state: DenEconomyState) => void;
  /** Home Range cells changed locally because of the server. */
  onRangeChanged?: () => void;
  /** Anything else that makes household news (new partner walks, a new member). */
  onHouseholdNews?: () => void;
  /** A command got ok:false (e.g. the partner spent the treats first). The caller shows a gentle line; state was already corrected silently. */
  onCommandRejected?: (error: CommandErrorCode) => void;
}

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-input' | 'invalid-code' | 'network' | 'server' };

export interface JoinInput {
  serverUrl: string;
  code: string;
  playerName: string;
  deviceLabel: string;
}

export interface SyncEngine {
  getStatus(): Promise<SyncStatus>;
  subscribe(listener: () => void): () => void;
  setCallbacks(callbacks: SyncCallbacks): void;
  join(input: JoinInput): Promise<JoinResult>;
  /** Clears the token and sync state; local game data stays. */
  leave(): Promise<void>;
  /** Queues an economy command (no-op when not joined) and kicks off a sync without waiting for it. */
  enqueueCommand(command: CommandBody): Promise<void>;
  /** Queues a finished tracked walk or a manual log for upload (no-op when not joined). */
  enqueueWalk(walk: Walk, territoryNameHint: string | null): Promise<void>;
  /**
   * Renames this player in the household: the new (trimmed, <= maxRenameLength) name is saved locally at once
   * and sent as `player.rename`. Returns false when not joined or the name is empty.
   */
  renamePlayer(name: string): Promise<boolean>;
  /** Queues `walk.delete` for a walk deleted from History (no-op when not joined). The server keeps the walk's cells. */
  enqueueWalkDelete(walkId: string): Promise<void>;
  /** Push then pull. Coalesces overlapping calls; never throws. `force` ignores retry backoff. */
  syncNow(options?: { force?: boolean }): Promise<void>;
}

/** Safety cap on pages per run; the rest arrives on the next sync. */
const MAX_EVENT_PAGES = 20;

function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const now = deps.now ?? Date.now;
  const makeClient = deps.createClient ?? ((baseUrl, token) => createApiClient({ baseUrl, token }));
  const applyRepos: ApplyRepos = {
    walks: deps.walks,
    homeRange: deps.homeRange,
    territories: deps.territories,
    denEconomy: deps.denEconomy,
    sync: deps.sync,
  };
  const listeners = new Set<() => void>();
  let callbacks: SyncCallbacks = {};
  let inFlight: Promise<void> | null = null;
  let runAgain = false;
  let busy = false;
  let unauthorized = false;

  const notify = () => listeners.forEach((l) => l());

  function reportApplied(result: ApplyResult) {
    if (result.denState) callbacks.onDenChanged?.(result.denState);
    if (result.rangeChanged) callbacks.onRangeChanged?.();
    if (result.walksAdded > 0) callbacks.onHouseholdNews?.();
  }

  async function noteServerTime(serverTime: number) {
    await deps.sync.saveState({ clockOffsetMs: serverTime - now() });
  }

  /** A write was accepted, so the server takes this app's level again (e.g. after an update). */
  async function clearNeedsUpdate() {
    if ((await deps.sync.getState()).needsUpdate) {
      await deps.sync.saveState({ needsUpdate: false });
      notify();
    }
  }

  /** Sends due outbox items in order. Returns true when the whole outbox is drained or dead-lettered. */
  async function push(client: ApiClient, force: boolean): Promise<boolean> {
    const items = await deps.sync.getPending();
    let lastDen: ApiDenState | null = null;
    let sentOne = false;
    for (const item of items) {
      if (!force && item.nextAttemptAt > now()) return false; // keep order: nothing may jump the queue
      try {
        if (item.kind === 'walk.upload') {
          const request = item.payload as WalkUploadRequest;
          const response = await client.uploadWalk(request);
          lastDen = response.den;
          await noteServerTime(response.serverTime);
          await deps.walks.markSynced(request.id, now());
        } else {
          const response = await client.command({ clientId: item.id, command: item.payload as CommandBody });
          lastDen = response.den;
          await noteServerTime(response.serverTime);
          if (!response.ok && response.error) callbacks.onCommandRejected?.(response.error);
          // ok:false (e.g. insufficient-treats) is a normal answer, not a failure: the item is done
          // and the server's Den state applied below is the silent correction.
        }
        await deps.sync.remove(item.id);
        if (!sentOne) {
          sentOne = true;
          await clearNeedsUpdate();
        }
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.kind === 'unauthorized') {
          unauthorized = true;
          return false;
        }
        if (err.kind === 'upgrade-required') {
          // Not the item's fault: keep it queued untouched (no attempt burned) and wait for an app update.
          await deps.sync.saveState({ needsUpdate: true });
          log('SYNC_UPDATE_NEEDED', { status: err.status, kind: item.kind });
          notify();
          return false;
        }
        const plan = planFailure(item.attempts, err.retryable, now());
        await deps.sync.recordFailure(item.id, err.message, plan.nextAttemptAt, plan.deadAt);
        log('SYNC_PUSH_FAILED', { id: item.id, kind: item.kind, error: err.message, dead: plan.deadAt !== null });
        if (plan.deadAt === null) return false; // will retry: stop here, keep order
        // dead-lettered (permanent rejection or too many attempts): keep going with the rest
      }
    }
    // Only the final response is applied: an earlier one would briefly undo
    // optimistic local changes that later queued commands already contain.
    if (lastDen) {
      const applied = await applyServerDenState(applyRepos, lastDen);
      if (applied) callbacks.onDenChanged?.(applied);
    }
    return true;
  }

  /** Local progress worth seeding a brand-new household with. */
  async function buildImport(importId: string): Promise<ImportRequest | null> {
    const [walks, cells, territories, den] = await Promise.all([
      deps.walks.getWalks(),
      deps.homeRange.getCells(),
      deps.territories.getTerritories(),
      deps.denEconomy.getState(),
    ]);
    const hasProgress = walks.length > 0 || cells.length > 0 || den.level > 1 || den.xp > 0;
    if (!hasProgress) return null;
    const appearance = deps.buddyAppearance ? await deps.buddyAppearance.getAppearance() : {};
    return {
      importId,
      // Newest first already; the server caps the count.
      walks: walks.slice(0, API_LIMITS.maxImportWalks).map((w) => ({
        id: w.id,
        startTime: w.startTime,
        startSource: w.startSource,
        closed: w.closed,
        locations: w.locations,
        ...(w.newGroundCellIds ? { newGroundCellIds: w.newGroundCellIds } : {}),
        ...(w.treatsEarned !== undefined ? { treatsEarned: w.treatsEarned } : {}),
      })),
      cells: cells.slice(0, API_LIMITS.maxImportCells),
      territories: territories.slice(0, API_LIMITS.maxImportTerritories),
      den: {
        treats: den.treats,
        doghouseLevel: den.doghouseLevel,
        bakeryLevel: den.bakeryLevel,
        sniffGardenLevel: den.sniffGardenLevel,
        lastTickAt: den.lastTickAt,
        xp: den.xp,
        level: den.level,
      },
      dog: { name: den.dogName, appearance: appearance as Record<string, unknown> },
    };
  }

  /**
   * First sync: load the snapshot; if the household is still empty and this
   * phone has progress, seed the household with it (founding import) and use
   * the import's snapshot. The importId is persisted BEFORE the call so a
   * retry replays instead of conflicting. 409 = someone else got there first:
   * skip silently and use the plain snapshot.
   */
  async function seedOrSnapshot(client: ApiClient): Promise<SnapshotResponse> {
    const snapshot = await client.snapshot();
    const empty = snapshot.walks.length === 0 && snapshot.den.rev === 0;
    const state = await deps.sync.getState();
    if (!empty) return snapshot; // already seeded (maybe by our own earlier attempt whose reply was lost)
    const importId = state.importId ?? newClientId();
    const request = await buildImport(importId);
    if (!request) return snapshot;
    await deps.sync.saveState({ importId });
    try {
      return await client.importHousehold(request);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return snapshot;
      throw err;
    }
  }

  let nearbyLoaded = false;

  async function pull(client: ApiClient, identity: SyncIdentity): Promise<void> {
    const state = await deps.sync.getState();
    const ctx: ApplyContext = {
      playerId: identity.playerId,
      now: now(),
      fetchWalk: async (id) => {
        try {
          return await client.getWalk(id);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }
      },
    };
    const needsSnapshot = state.cursor === 0 && state.lastSyncAt === null;
    // Neighbour Ranges live in memory only: fetch once per launch and again when neighbour events arrive. Best effort.
    const refreshNearby = async () => {
      try {
        applyNearby(await client.nearby());
        nearbyLoaded = true;
      } catch {
        // neighbours are optional; never fail a sync for them
      }
    };
    if (!needsSnapshot) {
      try {
        let cursor = state.cursor;
        for (let page = 0; page < MAX_EVENT_PAGES; page++) {
          const response = await client.events(cursor);
          await noteServerTime(response.serverTime);
          const applied = await applyEvents(response.events, response.cursor, applyRepos, ctx);
          reportApplied(applied);
          if (applied.neighbourEvents || !nearbyLoaded) await refreshNearby();
          cursor = response.cursor;
          if (!response.hasMore) break;
        }
        return;
      } catch (err) {
        // 410 Gone: our cursor is older than the server's retention. Fall through to a snapshot.
        if (!(err instanceof ApiError && err.kind === 'client' && err.status === 410)) throw err;
      }
    }
    const snapshot = await seedOrSnapshot(client);
    await noteServerTime(snapshot.serverTime);
    reportApplied(await applySnapshot(snapshot, applyRepos, ctx));
    await refreshNearby();
  }

  /** Another phone of the same player may have renamed them: keep this phone's identity name in step with sync state. */
  async function adoptServerName(identity: SyncIdentity): Promise<void> {
    const { players } = await deps.sync.getState();
    const serverName = players[identity.playerId];
    if (!serverName || serverName === identity.playerName) return;
    // Our own rename still waiting in the outbox wins until the server has it.
    const pendingRename = (await deps.sync.getPending()).some((i) => i.kind === 'command' && (i.payload as CommandBody).kind === 'player.rename');
    if (pendingRename) return;
    await deps.settings.saveSyncIdentity({ ...identity, playerName: serverName });
    notify();
  }

  async function runOnce(force: boolean): Promise<void> {
    const identity = await deps.settings.getSyncIdentity();
    if (!identity) return;
    const client = makeClient(identity.serverUrl, identity.token);
    try {
      unauthorized = false;
      const drained = await push(client, force);
      if (!drained) return;
      await pull(client, identity);
      await adoptServerName(identity);
      await deps.sync.saveState({ lastSyncAt: now() });
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'unauthorized') unauthorized = true;
      log('SYNC_RUN_FAILED', { error: String(err) });
    }
  }

  async function syncNow(options?: { force?: boolean }): Promise<void> {
    if (inFlight) {
      runAgain = true;
      return inFlight;
    }
    inFlight = (async () => {
      busy = true;
      notify();
      try {
        let force = options?.force ?? false;
        do {
          runAgain = false;
          await runOnce(force);
          force = false;
        } while (runAgain);
      } finally {
        busy = false;
        inFlight = null;
        notify();
      }
    })();
    return inFlight;
  }

  return {
    async getStatus() {
      const [identity, counts, state] = await Promise.all([deps.settings.getSyncIdentity(), deps.sync.counts(), deps.sync.getState()]);
      return {
        joined: identity !== null,
        playerName: identity?.playerName ?? null,
        householdName: identity?.householdName ?? null,
        serverUrl: identity?.serverUrl ?? null,
        lastSyncAt: state.lastSyncAt,
        pending: counts.pending,
        dead: counts.dead,
        busy,
        unauthorized,
        needsUpdate: state.needsUpdate === true,
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setCallbacks(next) {
      callbacks = next;
    },

    async join(input) {
      const code = normalizeInviteCode(input.code);
      const playerName = input.playerName.trim();
      const serverUrl = normalizeBaseUrl(input.serverUrl);
      if (code.length !== INVITE_CODE_LENGTH || playerName.length === 0 || !/^https?:\/\//i.test(serverUrl)) {
        return { ok: false, reason: 'invalid-input' };
      }
      try {
        const response = await makeClient(serverUrl, null).join({
          code,
          playerName,
          deviceLabel: input.deviceLabel,
          // Joining is the consent moment: the Settings dialog tells the player what a household shares.
          consent: true,
          timezone: deviceTimezone(),
        });
        await deps.sync.clear();
        await deps.settings.saveSyncIdentity({
          serverUrl,
          token: response.token,
          householdId: response.householdId,
          playerId: response.playerId,
          deviceId: response.deviceId,
          playerName,
          householdName: response.householdName,
        });
        unauthorized = false;
        notify();
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.kind === 'network' || err.kind === 'timeout') return { ok: false, reason: 'network' };
        if (err.kind === 'server') return { ok: false, reason: 'server' };
        return { ok: false, reason: 'invalid-code' };
      }
      // Initial snapshot (also retried by the next syncNow if this one fails).
      await syncNow({ force: true });
      return { ok: true };
    },

    async leave() {
      await deps.settings.saveSyncIdentity(null);
      await deps.sync.clear();
      unauthorized = false;
      notify();
    },

    async enqueueCommand(command) {
      const identity = await deps.settings.getSyncIdentity();
      if (!identity) return;
      await enqueueEconomyCommand(deps.sync, command, now());
      notify();
      void syncNow();
    },

    async enqueueWalk(walk, territoryNameHint) {
      const identity = await deps.settings.getSyncIdentity();
      if (!identity) return;
      await enqueueWalkUpload(deps.sync, walk, territoryNameHint, now());
      notify();
      void syncNow();
    },

    async renamePlayer(rawName) {
      const name = rawName.trim().slice(0, API_LIMITS.maxRenameLength).trim();
      const identity = await deps.settings.getSyncIdentity();
      if (!identity || name.length === 0) return false;
      const state = await deps.sync.getState();
      await deps.settings.saveSyncIdentity({ ...identity, playerName: name });
      await deps.sync.saveState({ players: { ...state.players, [identity.playerId]: name } });
      await enqueueEconomyCommand(deps.sync, renameCommand(name), now());
      notify();
      void syncNow();
      return true;
    },

    async enqueueWalkDelete(walkId) {
      const identity = await deps.settings.getSyncIdentity();
      if (!identity) return;
      await enqueueEconomyCommand(deps.sync, { kind: 'walk.delete', walkId }, now());
      notify();
      void syncNow();
    },

    syncNow,
  };
}
