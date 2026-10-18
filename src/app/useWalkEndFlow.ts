import { useEffect, useState } from 'react';
import { t } from '../i18n';
import type { FinishOutcome } from './useWalkSession';

/** The slice of useWalkSession the walk-end flow needs. */
export interface WalkEndSession {
  cancelWalk: () => Promise<void>;
  finishWalk: () => Promise<FinishOutcome>;
  /** Has the walk in flight gone anywhere (walkHasMovement)? */
  currentWalkHasMovement: () => boolean;
  /** A finish is running right now (auto-finish can start one while the discard question is open). */
  isFinishing: () => boolean;
  isTracking: boolean;
}

/** How long Buddy's line after an early end stays up if nobody taps it away. */
export const WALK_END_NOTE_MS = 8000;

/**
 * Ending a walk early, from the live map or from the scene's gate: Cancel (asks once, only if the walk has moved) and
 * Finish (a walk that went nowhere is discarded by the session; this just brings the player home with a gentle line).
 * Both land on the scene with one friendly Buddy line, never a guilt message.
 */
export function useWalkEndFlow(session: WalkEndSession, goDoorstep: () => void) {
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [walkEndNote, setWalkEndNote] = useState<{ key: number; text: string } | null>(null);

  // The question belongs to the running walk: if the walk ends by itself while it is open (auto-finish), it must not
  // pop up again over the next walk.
  useEffect(() => {
    if (!session.isTracking) setDiscardPromptOpen(false);
  }, [session.isTracking]);

  useEffect(() => {
    if (!walkEndNote) return;
    const timer = setTimeout(() => setWalkEndNote(null), WALK_END_NOTE_MS);
    return () => clearTimeout(timer);
  }, [walkEndNote]);

  const leaveEndedWalk = (line: string) => {
    goDoorstep();
    setWalkEndNote({ key: Date.now(), text: line });
  };

  /** "Verwerfen" (or a cancel without movement): stops the walk and drops it. Rewards, stats and walk count stay untouched. */
  const cancelWalkNow = async () => {
    setDiscardPromptOpen(false);
    // A finish that already started saves the walk (auto-finish fired while the question was open): don't pretend to discard it.
    if (session.isFinishing()) return;
    await session.cancelWalk();
    leaveEndedWalk(t('walk.cancelled.line'));
  };

  /** Both "abbrechen" links: no movement means nothing to lose, so no question. */
  const requestCancelWalk = () => {
    if (session.isFinishing()) return;
    if (session.currentWalkHasMovement()) setDiscardPromptOpen(true);
    else void cancelWalkNow();
  };

  const finishWalkNow = async () => {
    const outcome = await session.finishWalk();
    if (outcome === 'discarded') leaveEndedWalk(t('walk.noRoute.line'));
  };

  return {
    discardPromptOpen,
    walkEndNote,
    requestCancelWalk,
    cancelWalkNow,
    keepWalking: () => setDiscardPromptOpen(false),
    finishWalkNow,
  };
}
