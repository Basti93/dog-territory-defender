import { useEffect, useState } from 'react';

import type { SyncEngine, SyncStatus } from './syncEngine';

/** Live sync status for Settings. `null` while loading, or when there is no engine. */
export function useSyncStatus(engine: SyncEngine | undefined): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    const refresh = () => {
      engine
        .getStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    };
    refresh();
    const unsubscribe = engine.subscribe(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [engine]);

  return status;
}
