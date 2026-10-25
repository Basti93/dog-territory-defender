import React, { useMemo, useState } from 'react';

import { t } from '../i18n';
import { usePostcards } from '../postcards/usePostcards';
import type { SettingsRepository } from '../storage/SettingsRepository';
import type { TerritoryRepository } from '../storage/TerritoryRepository';
import type { WalkRepository } from '../storage/WalkRepository';
import { Confetti, Header, Screen } from '../ui';
import { useWalkDiary } from '../walks/useWalkDiary';
import { WalkDiaryCard } from './WalkDiaryCard';

interface WalkDiaryScreenProps {
  walkRepository: WalkRepository;
  territoryRepository?: TerritoryRepository;
  /** Remembers which diary lines were already said (intro, longest walk). Optional: without it the diary shows, silently. */
  settingsRepository?: SettingsRepository;
  onClose: () => void;
}

/** Buddy's walk diary as its own screen (the notebook on the stump in the Hof opens it). Before 3 walks the card is the teaser. */
export function WalkDiaryScreen({ walkRepository, territoryRepository, settingsRepository, onClose }: WalkDiaryScreenProps) {
  const { cards, loaded } = usePostcards({ walkRepository, territoryRepository });
  const walks = useMemo(() => cards.map((c) => c.walk), [cards]);
  const { diary, showIntro, newLongest } = useWalkDiary(walks, loaded, settingsRepository);
  const [confettiDone, setConfettiDone] = useState(false);
  return (
    <>
      <Screen scroll backdrop="linen">
        <Header title={t('diary.screen.title')} icon="icon-walks" onBack={onClose} />
        {loaded ? <WalkDiaryCard diary={diary} showIntro={showIntro} newLongest={newLongest} showTitle={false} /> : null}
      </Screen>
      {newLongest && !confettiDone && <Confetti count={18} onDone={() => setConfettiDone(true)} />}
    </>
  );
}
