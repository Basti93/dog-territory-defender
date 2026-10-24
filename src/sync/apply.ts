// Applies server data to the local repositories (multiplayer-sync design.md
// Decisions 1, 3, 9). No network except the injected `fetchWalk`, no React.
// Every rule here is idempotent and order-independent, so replays and
// out-of-order batches are safe.
//
//  - walks:        insert if missing (route fetched on demand); a partner's walk
//                  NEVER re-runs rewards locally
//  - territories:  upsert (server name wins, counters max), removed ones dropped; a snapshot also drops local-only ones (reconcileTerritories)
//  - cells:        merge with max(visits), max(lastTracked/lastRefreshed), territoryId from server
//  - den state:    server wins when its revision is newer; local-only fields stay
//  - dog name:     server wins when it has one
//  - member.joined: remembered for a one-off Doorstep line
//  - member.updated: a rename; the new name replaces the old in sync state (Doorstep reads names from there)
//  - dog look:     the household's shared Buddy look (dogs.appearance + rev) replaces ours when its rev is newer, unless our own change is still in the outbox; rev 0 (import only) is adopted only by a phone still on the default look
//  - corners:      the household's names ("Unsere Ecken"): last writer wins, the server's name replaces ours unless
//                  our own rename of that corner is still waiting in the outbox

import { defaultBuddyAppearance, normalizeAppearance, validateAppearance, type BuddyAppearance } from '../buddy/buddyAppearance';
import type { DenEconomyState } from '../economy/denEconomy';
import type { BuddyAppearanceRepository } from '../storage/BuddyAppearanceRepository';
import type { CornerRepository } from '../storage/CornerRepository';
import type { DenEconomyRepository } from '../storage/DenEconomyRepository';
import type { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { NEIGHBOUR_LINES_KEPT, type NeighbourLineEntry, type SyncRepository } from '../storage/SyncRepository';
import { setNearby } from './neighbourhoodStore';
import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import type { Walk } from '../types';
import { walkDistanceMeters } from '../utils/geometry';
import type { ApiCell, ApiCorner, ApiDenState, ApiDogAppearance, ApiEvent, NearbyResponse, ApiTerritory, ApiWalkFull, ApiWalkMeta, CommandBody, SnapshotResponse } from './apiContract';

export interface ApplyRepos {
  walks: WalkRepository;
  homeRange: HomeRangeRepository;
  territories: TerritoryRepository;
  denEconomy: DenEconomyRepository;
  sync: SyncRepository;
  /** "Unsere Ecken". Omitted = corner names from the server are ignored (older tests). */
  corners?: CornerRepository;
  /** The local Buddy look. Omitted = the household's look is ignored (older tests). */
  buddyAppearance?: BuddyAppearanceRepository;
}

export interface ApplyContext {
  /** This device's player; own events/walks are not "household news". */
  playerId: string;
  now: number;
  /** Fetches one full route (`GET /v1/walks/:id`). `null` = the server no longer has it (skipped). A thrown error aborts the apply; the cursor does not move, so the next sync retries. */
  fetchWalk: (id: string) => Promise<ApiWalkFull | null>;
}

/** A walk by another household member that arrived in this apply (not one we already had). Feeds the mini homecoming. */
export interface PartnerWalkAdded {
  walkId: string;
  playerId: string;
  /** The partner's display name when known. */
  name: string | null;
  startTime: number;
  treatsEarned: number;
  newGroundCellCount: number;
  distanceMeters: number;
  /** A "log a missed walk" entry: it has no live moment, so it never gets a late homecoming. Absent = false. */
  manual?: boolean;
}

export interface ApplyResult {
  /** The new local Den state when the server's was applied, else null. */
  denState: DenEconomyState | null;
  rangeChanged: boolean;
  walksAdded: number;
  partnerWalks: PartnerWalkAdded[];
  /** Neighbour events arrived: the caller may refresh /v1/nearby. */
  neighbourEvents: boolean;
  /** A corner name from the household was stored: the Viertel signs should be read again. */
  cornersChanged: boolean;
  /** The household's look replaced ours (different from before): the caller refreshes what it shows. */
  appearance: BuddyAppearance | null;
}

interface Batch {
  walks: ApiWalkMeta[];
  deletedWalkIds: string[];
  cells: ApiCell[];
  reassigned: Array<{ from: string; to: string }>;
  territories: ApiTerritory[];
  removedTerritoryIds: string[];
  den: ApiDenState | null;
  dogName: string | null;
  players: Record<string, string>;
  memberJoined: { playerName: string; at: number; playerId: string } | null;
  neighbourLines: NeighbourLineEntry[];
  corners: ApiCorner[];
  dogAppearance: ApiDogAppearance | null;
}

/** Overlays the server-owned fields onto the local state; per-device fields (backfill flags, manual-log counters, cliffhanger) stay. */
export function mergeServerDenState(local: DenEconomyState, server: ApiDenState): DenEconomyState {
  return {
    ...local,
    treats: server.treats,
    doghouseLevel: server.doghouseLevel,
    bakeryLevel: server.bakeryLevel,
    sniffGardenLevel: server.sniffGardenLevel,
    lastTickAt: server.lastTickAt,
    xp: server.xp,
    level: server.level,
    // The reveal is one-way: either side having seen it is enough.
    territoryIncomeRevealed: local.territoryIncomeRevealed || server.territoryIncomeRevealed,
    // Absent from an older server: no pile, no taps counted.
    pile: server.pile ?? 0,
    tapDayKey: server.tapDayKey ?? null,
    tapCount: server.tapCount ?? 0,
  };
}

/** Applies a Den state if its revision is newer (or `force`). Used for pulls, snapshots and command/upload responses. */
export async function applyServerDenState(
  repos: Pick<ApplyRepos, 'denEconomy' | 'sync'>,
  server: ApiDenState,
  force = false
): Promise<DenEconomyState | null> {
  const { denRev } = await repos.sync.getState();
  if (!force && server.rev <= denRev) return null;
  const merged = mergeServerDenState(await repos.denEconomy.getState(), server);
  await repos.denEconomy.saveState(merged);
  await repos.sync.saveState({ denRev: Math.max(denRev, server.rev) });
  return merged;
}

function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  return !!a && a.length === b.length && a.every((id, i) => id === b[i]);
}

function toLocalWalk(full: ApiWalkFull, playerName: string | undefined): Walk {
  return {
    id: full.id,
    startTime: full.startTime,
    locations: full.locations,
    closed: full.closed,
    startSource: full.startSource,
    newGroundCellIds: full.newGroundCellIds,
    ...(full.metNeighbourIds?.length ? { metNeighbourIds: full.metNeighbourIds } : {}),
    ...(full.treatsEarned !== null ? { treatsEarned: full.treatsEarned } : {}),
    playerId: full.playerId,
    ...(playerName ? { playerName } : {}),
  };
}

async function applyBatch(batch: Batch, repos: ApplyRepos, ctx: ApplyContext, forceDen: boolean): Promise<ApplyResult> {
  const state = await repos.sync.getState();
  const players = { ...state.players, ...batch.players };

  // Territories first: cells reference them.
  if (batch.territories.length > 0) await repos.territories.upsertTerritories(batch.territories);
  for (const { from, to } of batch.reassigned) await repos.homeRange.reassignCellsToTerritory(from, to);
  if (batch.cells.length > 0) await repos.homeRange.mergeCells(batch.cells);
  if (batch.removedTerritoryIds.length > 0) await repos.territories.removeTerritories(batch.removedTerritoryIds);

  let walksAdded = 0;
  const partnerWalks: PartnerWalkAdded[] = [];
  const deletedIds = new Set(batch.deletedWalkIds);
  for (const meta of batch.walks) {
    if (deletedIds.has(meta.id)) continue;
    if (meta.deleted) {
      await repos.walks.deleteWalk(meta.id);
      continue;
    }
    const existing = await repos.walks.getWalk(meta.id);
    if (!existing) {
      const full = await ctx.fetchWalk(meta.id);
      if (!full) continue;
      await repos.walks.saveWalk(toLocalWalk(full, players[meta.playerId]));
      walksAdded += 1;
      if (meta.playerId !== ctx.playerId) {
        partnerWalks.push({
          walkId: full.id,
          playerId: meta.playerId,
          name: players[meta.playerId] ?? null,
          startTime: full.startTime,
          treatsEarned: full.treatsEarned ?? 0,
          newGroundCellCount: full.newGroundCellIds.length,
          distanceMeters: walkDistanceMeters(full),
          manual: full.startSource === 'manual-log',
        });
      }
    } else if (meta.metNeighbourIds?.length && !sameIds(existing.metNeighbourIds, meta.metNeighbourIds)) {
      const { syncedAt: _syncedAt, ...walk } = existing;
      await repos.walks.saveWalk({ ...walk, metNeighbourIds: meta.metNeighbourIds });
    }
    // The server has it either way (we sent it, or it sent it to us).
    if (!existing || existing.syncedAt === null) await repos.walks.markSynced(meta.id, ctx.now);
  }
  for (const id of batch.deletedWalkIds) await repos.walks.deleteWalk(id);

  const denState = batch.den ? await applyServerDenState(repos, batch.den, forceDen) : null;

  let finalDen = denState;
  if (batch.dogName) {
    const current = finalDen ?? (await repos.denEconomy.getState());
    if (current.dogName !== batch.dogName) {
      finalDen = { ...current, dogName: batch.dogName };
      await repos.denEconomy.saveState(finalDen);
    }
  }

  let neighbourLines = state.neighbourLines;
  if (batch.neighbourLines.length > 0) {
    const bySeq = new Map<number, NeighbourLineEntry>();
    for (const e of [...batch.neighbourLines, ...(state.neighbourLines ?? [])]) bySeq.set(e.seq, e); // replays are idempotent
    neighbourLines = [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, NEIGHBOUR_LINES_KEPT);
  }

  // Corner names, oldest first so the newest wins. Our own rename still in the outbox beats the server until it has been sent.
  let cornersChanged = false;
  if (batch.corners.length > 0 && repos.corners) {
    const waiting = new Set(
      (await repos.sync.getPending())
        .map((i) => i.payload as CommandBody)
        .filter((c) => c.kind === 'corner.name')
        .map((c) => (c as { cornerId: string }).cornerId)
    );
    for (const corner of batch.corners) {
      if (waiting.has(corner.id)) continue;
      await repos.corners.setName(corner.id, corner.name, corner.updatedBy, corner.updatedAt);
      cornersChanged = true;
    }
  }

  // The shared look: only a newer rev counts. Our own explicit change still in the outbox wins (its push will overwrite the server);
  // a waiting seed (ifUnset) does not, the server's look is the one it would lose to.
  let appearance: BuddyAppearance | null = null;
  const knownRev = state.appearanceRev ?? 0;
  if (batch.dogAppearance && repos.buddyAppearance && batch.dogAppearance.rev === 0) {
    // Nobody claimed the look yet (rev 0): the founding import's look is only a candidate. A phone still on the default look
    // takes it; a phone with a look of its own keeps it (and offers it to the household, see the engine). No rev is recorded.
    const stored = validateAppearance(batch.dogAppearance.appearance);
    const current = normalizeAppearance(await repos.buddyAppearance.getAppearance());
    if (stored && JSON.stringify(current) === JSON.stringify(defaultBuddyAppearance())) {
      await repos.buddyAppearance.saveAppearance(stored);
      appearance = stored;
    }
  } else if (batch.dogAppearance && repos.buddyAppearance && batch.dogAppearance.rev > knownRev) {
    const ownChangeWaiting = (await repos.sync.getPending()).some((i) => {
      const c = i.payload as CommandBody;
      return c.kind === 'appearance.set' && !c.ifUnset;
    });
    if (!ownChangeWaiting) {
      const incoming = normalizeAppearance(batch.dogAppearance.appearance);
      const current = await repos.buddyAppearance.getAppearance();
      await repos.buddyAppearance.saveAppearance(incoming);
      if (JSON.stringify(normalizeAppearance(current)) !== JSON.stringify(incoming)) appearance = incoming;
      await repos.sync.saveState({ appearanceRev: batch.dogAppearance.rev });
    }
  }

  await repos.sync.saveState({
    players,
    ...(batch.memberJoined ? { lastMemberJoined: batch.memberJoined } : {}),
    ...(neighbourLines ? { neighbourLines } : {}),
  });

  return {
    denState: finalDen,
    rangeChanged: batch.cells.length > 0 || batch.reassigned.length > 0,
    walksAdded,
    partnerWalks,
    neighbourEvents: batch.neighbourLines.length > 0,
    cornersChanged,
    appearance,
  };
}

export async function applySnapshot(snapshot: SnapshotResponse, repos: ApplyRepos, ctx: ApplyContext): Promise<ApplyResult> {
  const players: Record<string, string> = {};
  for (const p of snapshot.players) players[p.id] = p.displayName;
  const result = await applyBatch(
    {
      walks: snapshot.walks,
      deletedWalkIds: [],
      cells: snapshot.cells,
      reassigned: [],
      territories: snapshot.territories,
      removedTerritoryIds: [],
      den: snapshot.den,
      dogName: snapshot.dog.name,
      players,
      memberJoined: null,
      neighbourLines: [],
      corners: snapshot.corners ?? [],
      dogAppearance: snapshot.dog.appearanceRev !== undefined ? { appearance: snapshot.dog.appearance, rev: snapshot.dog.appearanceRev } : null,
    },
    repos,
    ctx,
    true
  );
  await reconcileTerritories(snapshot.territories, repos);
  await repos.sync.saveState({
    cursor: snapshot.seq,
    householdTimezone: snapshot.household.timezone,
    territoriesReconciled: true,
    // A server that predates the shared look sends no field at all: stay unsynced so the next snapshot after its update seeds it.
    ...(snapshot.dog.appearanceRev !== undefined ? { appearanceSynced: true } : {}),
  });
  return result;
}

/** Above this many (orphan cell x server cell) pairs the nearest-territory search gives up and uses the oldest server territory. */
const MAX_NEAREST_SEARCH_PAIRS = 5_000_000;

/**
 * A snapshot is the household server's complete truth: territories this phone made up on its own (before it joined, or
 * while a walk was still unsent) do not exist there and are dropped. Their cells that the server does not know move to
 * the nearest server territory. No server territories at all = nothing to compare with, nothing is touched.
 */
export async function reconcileTerritories(serverTerritories: ApiTerritory[], repos: Pick<ApplyRepos, 'territories' | 'homeRange'>): Promise<void> {
  if (serverTerritories.length === 0) return;
  const serverIds = new Set(serverTerritories.map((t) => t.id));
  const stale = (await repos.territories.getTerritories()).filter((t) => !serverIds.has(t.id));
  if (stale.length === 0) return;
  const staleIds = new Set(stale.map((t) => t.id));

  const allCells = await repos.homeRange.getCells();
  const orphans = allCells.filter((c) => c.territoryId !== null && staleIds.has(c.territoryId));
  const anchors = allCells.filter((c) => c.territoryId !== null && serverIds.has(c.territoryId));
  if (orphans.length > 0) {
    const oldest = [...serverTerritories].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))[0].id;
    const useNearest = orphans.length * anchors.length <= MAX_NEAREST_SEARCH_PAIRS;
    const byTarget = new Map<string, string[]>();
    for (const cell of orphans) {
      let target = oldest;
      if (useNearest) {
        let best = Infinity;
        for (const a of anchors) {
          const d = (a.ix - cell.ix) ** 2 + (a.iy - cell.iy) ** 2;
          if (d < best) {
            best = d;
            target = a.territoryId as string;
          }
        }
      }
      const list = byTarget.get(target) ?? [];
      list.push(`${cell.ix},${cell.iy}`);
      byTarget.set(target, list);
    }
    for (const [territoryId, cellIds] of byTarget) await repos.homeRange.assignTerritoryToCells(cellIds, territoryId);
  }
  await repos.territories.removeTerritories(stale.map((t) => t.id));
}

export async function applyEvents(
  events: ApiEvent[],
  cursor: number,
  repos: ApplyRepos,
  ctx: ApplyContext
): Promise<ApplyResult> {
  const batch: Batch = {
    walks: [],
    deletedWalkIds: [],
    cells: [],
    reassigned: [],
    territories: [],
    removedTerritoryIds: [],
    den: null,
    dogName: null,
    players: {},
    memberJoined: null,
    neighbourLines: [],
    corners: [],
    dogAppearance: null,
  };
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (const event of ordered) {
    switch (event.kind) {
      case 'walk.added':
        batch.walks.push(event.payload.walk);
        break;
      case 'walk.deleted':
        batch.deletedWalkIds.push(event.payload.walkId);
        break;
      case 'cells.changed':
        batch.cells.push(...event.payload.cells);
        batch.reassigned.push(...event.payload.reassigned);
        break;
      case 'territory.changed':
        batch.territories.push(...event.payload.upserted);
        batch.removedTerritoryIds.push(...event.payload.removedIds);
        break;
      case 'den.updated':
        if (!batch.den || event.payload.den.rev >= batch.den.rev) batch.den = event.payload.den;
        break;
      case 'dog.updated':
        batch.dogName = event.payload.dog.name;
        break;
      case 'dog.appearance':
        if (!batch.dogAppearance || event.payload.rev >= batch.dogAppearance.rev) batch.dogAppearance = event.payload;
        break;
      case 'member.joined':
        batch.players[event.payload.player.id] = event.payload.player.displayName;
        if (event.payload.player.id !== ctx.playerId) {
          batch.memberJoined = { playerName: event.payload.player.displayName, at: event.createdAt, playerId: event.payload.player.id };
        }
        break;
      case 'member.updated':
        batch.players[event.payload.player.id] = event.payload.player.displayName;
        break;
      case 'corner.updated':
        batch.corners.push(event.payload.corner);
        break;
      case 'neighbour.sniffed':
      case 'neighbour.gift':
      case 'neighbour.reaction':
      case 'neighbour.invitation':
      case 'coop.progress':
        batch.neighbourLines.push({
          line: event.payload.line,
          botName: event.payload.botName,
          botId: event.payload.botId,
          params: event.payload.params,
          at: event.createdAt,
          seq: event.seq,
        });
        break;
      default:
        // A kind this app does not know (the server is newer, see API_LEVEL): skip it. The cursor below still moves
        // past it, so one unknown event never blocks the feed.
        break;
    }
  }
  const result = await applyBatch(batch, repos, ctx, false);
  const state = await repos.sync.getState();
  await repos.sync.saveState({ cursor: Math.max(state.cursor, cursor, ordered.length ? ordered[ordered.length - 1].seq : 0) });
  return result;
}

/** Keeps the neighbours' dotted Ranges in memory for the map (no persistence yet; refetched each launch). */
export function applyNearby(response: NearbyResponse): void {
  setNearby(response.items);
}
