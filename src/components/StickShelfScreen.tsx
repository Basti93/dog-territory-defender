import React from 'react';

import { t } from '../i18n';
import { useNeighbourhood } from '../sync/useNeighbourhood';
import { Header, Screen } from '../ui';
import { StickShelf } from './StickShelf';

/** The Stock-Regal as its own screen (the stick pile's sign in the Hof opens it). The shelf shows even before any neighbour dog is known: empty slots are soft silhouettes. */
export function StickShelfScreen({ onClose }: { onClose: () => void }) {
  const hood = useNeighbourhood(undefined);
  return (
    <Screen scroll backdrop="linen">
      <Header title={t('sticks.screen.title')} icon="icon-paw" onBack={onClose} />
      <StickShelf slots={hood.shelf} />
    </Screen>
  );
}
