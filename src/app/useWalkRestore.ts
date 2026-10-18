import { useEffect, useRef } from 'react';

import type { AutoFinishState, WalkEndedBy } from './autoFinish';
import type { ActiveWalkRecorder } from './activeWalkRecorder';
import { decideWalkRestore, restoreAgeMinutes, walkFromSnapshot } from './restoreWalk';
import { stopWatchingLocation } from '../utils/gps';
import { log } from '../utils/log';
import type { Walk } from '../types';

/** The slice of useWalkSession the restore needs. */
export interface RestorableWalkSession {
  isBusy: () => boolean;
  resumeWalk: (walk: Walk, autoFinish: AutoFinishState) => Promise<boolean>;
  finishRestoredWalk: (walk: Walk, endedBy: WalkEndedBy) => Promise<boolean>;
}

export interface WalkRestoreDeps {
  activeWalk: ActiveWalkRecorder;
  /** Was this walk already saved as a finished walk? (A finish that crashed before clearing the mirror.) */
  isWalkSaved: (id: string) => Promise<boolean>;
  getAutoFinishEnabled: () => Promise<boolean>;
  session: RestorableWalkSession;
  /** A walk is live again: show the live map. */
  openMap: () => void;
  now?: () => number;
}

export type RestoreOutcome = 'none' | 'resumed' | 'finished' | 'discarded' | 'skipped';

/**
 * Decides and performs what happens to a stored walk at launch: resume it (and open the live map), finish it through
 * the normal path, or drop it quietly. Never creates a second walk: a session that is already busy, or a walk that was
 * already saved, is left alone.
 */
export async function restoreActiveWalk(deps: WalkRestoreDeps): Promise<RestoreOutcome> {
  const now = (deps.now ?? Date.now)();
  const snapshot = await deps.activeWalk.load();
  // The location task (Android foreground service, iOS blue pill) may have outlived a walk that is gone: stop it.
  const stopOrphanedTask = async () => {
    if (!deps.session.isBusy()) await stopWatchingLocation().catch(() => undefined);
  };
  if (!snapshot) {
    await stopOrphanedTask();
    return 'none';
  }
  if (deps.session.isBusy()) return 'skipped';

  const walk = walkFromSnapshot(snapshot);
  if (await deps.isWalkSaved(walk.id).catch(() => false)) {
    await deps.activeWalk.end();
    await stopOrphanedTask();
    log('WALK_RESTORE_DISCARDED', { id: walk.id, reason: 'already-saved' });
    return 'discarded';
  }

  const autoEnabled = await deps.getAutoFinishEnabled().catch(() => true);
  const decision = decideWalkRestore(walk, now, autoEnabled);
  const ageMin = restoreAgeMinutes(walk, now);

  if (decision.kind === 'discard') {
    await deps.activeWalk.end();
    await stopOrphanedTask();
    log('WALK_RESTORE_DISCARDED', { id: walk.id, points: walk.locations.length, ageMin });
    return 'discarded';
  }
  if (decision.kind === 'finish') {
    log('WALK_RESTORE_FINISHED', { id: walk.id, points: walk.locations.length, ageMin, reason: decision.reason });
    return (await deps.session.finishRestoredWalk(walk, decision.endedBy)) ? 'finished' : 'skipped';
  }
  const resumed = await deps.session.resumeWalk(walk, decision.autoFinish);
  if (!resumed) return 'skipped';
  log('WALK_RESTORED', { id: walk.id, points: walk.locations.length, ageMin });
  deps.openMap();
  return 'resumed';
}

/**
 * Runs restoreActiveWalk once per app launch, as soon as `enabled` (first-launch state loaded, so the dog's name is
 * known for the finish path). Called in App.tsx after useFirstLaunch.
 */
export function useWalkRestore(enabled: boolean, deps: Omit<WalkRestoreDeps, 'now'>) {
  const ranRef = useRef(false);
  useEffect(() => {
    if (!enabled || ranRef.current) return;
    ranRef.current = true;
    restoreActiveWalk(deps).catch((error) => log('WALK_RESTORE_ERROR', { error: String(error) }));
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
