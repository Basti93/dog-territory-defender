// Applies server data to the local repositories (multiplayer-sync design.md
// Decisions 1, 3, 9). No network except the injected `fetchWalk`, no React.
// Every rule here is idempotent and order-independent, so replays and
// out-of-order batches are safe.
//
//  - walks:        insert if missing (route fetched on demand); a partner's walk
//                  NEVER re-runs rewards locally
//  - territories:  upsert (server name wins, counters max), removed ones dropped
//  - cells:        merge with max(visits), max(lastTracked/lastRefreshed), territoryId from server
//  - den state:    server wins when its revision is newer; local-only fields stay
//  - dog name:     server wins when it has one
//  - member.joined: remembered for a one-off Doorstep line
//  - member.updated: a rename; the new name replaces the old in sync state (Doorstep reads names from there)

import type { DenEconomyState } from '../economy/denEconomy';
import type { DenEconomyRepository } from '../storage/DenEconomyRepository';
import type { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { NEIGHBOUR_LINES_KEPT, type NeighbourLineEntry, type SyncRepository } from '../storage/SyncRepository';
import { setNearby } from './nearbyStore';
import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import type { Walk } from '../types';
import type { ApiCell, ApiDenState, ApiEvent, NearbyResponse, ApiTerritory, ApiWalkFull, ApiWalkMeta, SnapshotResponse } from './apiContract';

export interface ApplyRepos {
  walks: WalkRepository;
  homeRange: HomeRangeRepository;
  territories: TerritoryRepository;
  denEconomy: DenEconomyRepository;
  sync: SyncRepository;
}

export interface ApplyContext {
  /** This device's player; own events/walks are not "household news". */
  playerId: string;
  now: number;
  /** Fetches one full route (`GET /v1/walks/:id`). `null` = the server no longer has it (skipped). A thrown error aborts the apply; the cursor does not move, so the next sync retries. */
  fetchWalk: (id: string) => Promise<ApiWalkFull | null>;
}

export interface ApplyResult {
  /** The new local Den state when the server's was applied, else null. */
  denState: DenEconomyState | null;
  rangeChanged: boolean;
  walksAdded: number;
  /** Neighbour events arrived: the caller may refresh /v1/nearby. */
  neighbourEvents: boolean;
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

function toLocalWalk(full: ApiWalkFull, playerName: string | undefined): Walk {
  return {
    id: full.id,
    startTime: full.startTime,
    locations: full.locations,
    closed: full.closed,
    startSource: full.startSource,
    newGroundCellIds: full.newGroundCellIds,
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

  await repos.sync.saveState({
    players,
    ...(batch.memberJoined ? { lastMemberJoined: batch.memberJoined } : {}),
    ...(neighbourLines ? { neighbourLines } : {}),
  });

  return {
    denState: finalDen,
    rangeChanged: batch.cells.length > 0 || batch.reassigned.length > 0,
    walksAdded,
    neighbourEvents: batch.neighbourLines.length > 0,
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
    },
    repos,
    ctx,
    true
  );
  await repos.sync.saveState({ cursor: snapshot.seq });
  return result;
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
      case 'member.joined':
        batch.players[event.payload.player.id] = event.payload.player.displayName;
        if (event.payload.player.id !== ctx.playerId) {
          batch.memberJoined = { playerName: event.payload.player.displayName, at: event.createdAt, playerId: event.payload.player.id };
        }
        break;
      case 'member.updated':
        batch.players[event.payload.player.id] = event.payload.player.displayName;
        break;
      case 'neighbour.sniffed':
      case 'neighbour.gift':
      case 'neighbour.reaction':
      case 'neighbour.invitation':
      case 'coop.progress':
        batch.neighbourLines.push({
          line: event.payload.line,
          botName: event.payload.botName,
          params: event.payload.params,
          at: event.createdAt,
          seq: event.seq,
        });
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
