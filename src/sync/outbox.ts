// Outbox helpers on top of SyncRepository (multiplayer-sync design.md
// Decision 9): enqueue walk uploads and economy commands with client ids, and
// the retry/backoff policy.

import type { BuddyAppearance } from '../buddy/buddyAppearance';
import type { BuildingKey, CommandBody, WalkUploadRequest } from './apiContract';
import { newClientId } from './ids';
import type { SyncRepository } from '../storage/SyncRepository';
import type { Walk } from '../types';

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** After this many failed attempts an item is dead-lettered (kept, never retried). */
export const MAX_ATTEMPTS = 8;

/** Delay before the next attempt, where `attempts` failures have happened: 5 s doubling up to 5 min. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/** Outcome of recording a failed attempt, so the engine and the tests share one rule. */
export function planFailure(
  attemptsSoFar: number,
  retryable: boolean,
  now: number
): { nextAttemptAt: number; deadAt: number | null } {
  const attempts = attemptsSoFar + 1;
  if (!retryable || attempts >= MAX_ATTEMPTS) return { nextAttemptAt: now, deadAt: now };
  return { nextAttemptAt: now + backoffDelayMs(attempts), deadAt: null };
}

/**
 * The walk's id is the idempotency key, so enqueueing the same walk twice is a no-op.
 * A manual log ("Log a walk we missed") goes up with no locations, plus the optional route it refreshed.
 */
export async function enqueueWalkUpload(
  sync: SyncRepository,
  walk: Walk,
  territoryNameHint: string | null,
  now: number
): Promise<void> {
  const payload: WalkUploadRequest = {
    id: walk.id,
    startTime: walk.startTime,
    startSource: walk.startSource,
    locations: walk.locations,
    ...(walk.startSource === 'manual-log' && walk.refreshedRouteWalkId ? { refreshRouteWalkId: walk.refreshedRouteWalkId } : {}),
    ...(territoryNameHint ? { territoryNameHint } : {}),
  };
  await sync.enqueue({ id: walk.id, kind: 'walk.upload', payload, createdAt: now });
}

export async function enqueueEconomyCommand(sync: SyncRepository, command: CommandBody, now: number): Promise<void> {
  await sync.enqueue({ id: newClientId(), kind: 'command', payload: command, createdAt: now });
}

export function renameCommand(name: string): CommandBody {
  return { kind: 'player.rename', name };
}

export function upgradeCommand(building: BuildingKey): CommandBody {
  return { kind: 'den.upgrade', building };
}

export function harvestCommand(at: number): CommandBody {
  return { kind: 'den.harvest', at: Math.round(at) };
}

export function buddyTapsCommand(taps: number, treats: number): CommandBody {
  return { kind: 'den.buddyTaps', taps, treats };
}

/** `ifUnset`: a seed from a phone that never saw the household's look; the server ignores it when one is stored. */
export function appearanceCommand(appearance: BuddyAppearance, ifUnset = false): CommandBody {
  return { kind: 'appearance.set', appearance: appearance as unknown as Record<string, unknown>, ...(ifUnset ? { ifUnset: true } : {}) };
}
