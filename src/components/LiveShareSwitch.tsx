import React, { useEffect, useState } from 'react';
import { Switch } from 'react-native';

import { t, useLocale } from '../i18n';
import type { SettingsRepository } from '../storage/SettingsRepository';
import { material, PaperHint, PaperRow } from '../ui';

interface LiveShareSwitchProps {
  settingsRepository: Pick<SettingsRepository, 'getLiveShareEnabled' | 'saveLiveShareEnabled' | 'saveLiveSharePromptShown'>;
  /** The other household member's name; null falls back to "dein Haushalt". */
  partnerName: string | null;
}

/** Settings row "Runde live teilen" in the Household section. Default off. Render only while joined to a household. */
export function LiveShareSwitch({ settingsRepository, partnerName }: LiveShareSwitchProps) {
  useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    settingsRepository.getLiveShareEnabled().then(setEnabled, () => setEnabled(false));
  }, [settingsRepository]);
  return (
    <>
      <PaperRow
        title={t('liveShare.switch')}
        right={
          <Switch
            value={enabled ?? false}
            disabled={enabled === null}
            onValueChange={(v) => {
              setEnabled(v);
              // Choosing here is an answer too: the first-walk question must not come after it.
              void settingsRepository.saveLiveSharePromptShown(true);
              void settingsRepository.saveLiveShareEnabled(v);
            }}
            trackColor={{ true: material.inkGreen }}
          />
        }
      />
      <PaperHint>{t('liveShare.hint', { partner: partnerName ?? t('liveShare.partnerFallback') })}</PaperHint>
    </>
  );
}
