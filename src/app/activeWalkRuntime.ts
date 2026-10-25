import { AppState } from 'react-native';

import { setFixRecorder, stopWatchingLocation } from '../utils/gps';
import { createActiveWalkRecorder } from './activeWalkRecorder';
import { repos } from './repositories';
import { startStaleWalkWatchdog } from './staleWalkWatchdog';

/**
 * The one recorder of the walk in flight for the running app. Imported by App.tsx at module load, so it is wired even
 * when the OS starts the app headless just to deliver location fixes (nothing renders, but this module graph loads).
 */
export const activeWalkRecorder = createActiveWalkRecorder({ repo: repos.activeWalkRepository });
setFixRecorder((location) => activeWalkRecorder.addFix(location));

// Going to the background is when the OS may kill the app next: write what is buffered now.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') void activeWalkRecorder.flush();
});

startStaleWalkWatchdog({ recorder: activeWalkRecorder, stopTask: stopWatchingLocation });
