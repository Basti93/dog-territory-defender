import { useEffect, useRef } from 'react';

import type { AutoFinishState, WalkEndedBy } from './autoFinish';
import type { ActiveWalkRecorder } from './activeWalkRecorder';
import type { RestoreGate } from './restoreGate';
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
  /** Settled when the restore is over, so a walk start that arrived meanwhile can go on (restoreGate.ts). */
  gate: RestoreGate;
  now?: () => number;
}

export type RestoreOutcome = 'none' | 'resumed' | 'finished' | 'discarded' | 'skipped';

/** What WALK_RESTORE_CHECK says was decided. */
type RestoreCheckDecision = 'none' | 'busy' | 'already-saved' | 'discard' | 'finish' | 'resume';

/**
 * Decides and performs what happens to a stored walk at launch: resume it (and open the live map), finish it through
 * the normal path, or drop it quietly. Never creates a second walk: a session that is already busy, or a walk that was
 * already saved, is left alone.
 */
export async function restoreActiveWalk(deps: Omit<WalkRestoreDeps, 'gate'>): Promise<RestoreOutcome> {
  const startedAt = Date.now();
  const now = (deps.now ?? Date.now)();
  // One line per launch, whatever happens: "found nothing" must be distinguishable from "never ran" in the server logs.
  const check = (decision: RestoreCheckDecision, found: boolean, points: number, ageMin: number | null) =>
    log('WALK_RESTORE_CHECK', { found, points, ageMin, decision, ms: Date.now() - startedAt });
  const snapshot = await deps.activeWalk.load();
  // The location task (Android foreground service, iOS blue pill) may have outlived a walk that is gone: stop it.
  const stopOrphanedTask = async () => {
    if (!deps.session.isBusy()) await stopWatchingLocation().catch(() => undefined);
  };
  if (!snapshot) {
    check('none', false, 0, null);
    await stopOrphanedTask();
    return 'none';
  }
  const walk = walkFromSnapshot(snapshot);
  const ageMin = restoreAgeMinutes(walk, now);
  if (deps.session.isBusy()) {
    check('busy', true, walk.locations.length, ageMin);
    return 'skipped';
  }

  if (await deps.isWalkSaved(walk.id).catch(() => false)) {
    check('already-saved', true, walk.locations.length, ageMin);
    await deps.activeWalk.end();
    await stopOrphanedTask();
    log('WALK_RESTORE_DISCARDED', { id: walk.id, reason: 'already-saved' });
    return 'discarded';
  }

  const autoEnabled = await deps.getAutoFinishEnabled().catch(() => true);
  const decision = decideWalkRestore(walk, now, autoEnabled);

  if (decision.kind === 'discard') {
    check('discard', true, walk.locations.length, ageMin);
    await deps.activeWalk.end();
    await stopOrphanedTask();
    log('WALK_RESTORE_DISCARDED', { id: walk.id, points: walk.locations.length, ageMin });
    return 'discarded';
  }
  if (decision.kind === 'finish') {
    check('finish', true, walk.locations.length, ageMin);
    log('WALK_RESTORE_FINISHED', { id: walk.id, points: walk.locations.length, ageMin, reason: decision.reason });
    return (await deps.session.finishRestoredWalk(walk, decision.endedBy)) ? 'finished' : 'skipped';
  }
  check('resume', true, walk.locations.length, ageMin);
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
    restoreActiveWalk(deps)
      .then((outcome) => deps.gate.settle(outcome))
      .catch((error) => {
        log('WALK_RESTORE_ERROR', { error: String(error) });
        deps.gate.settle('error');
      });
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
